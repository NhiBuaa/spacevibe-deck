import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StoreRegistry } from "../store";
import { registerStore } from "./register-store";
import { Store } from "../../src/host/store-host";

const handlers = vi.hoisted(() => new Map<string, (event: unknown, payload: unknown) => unknown>());
vi.mock("electron", () => ({
  ipcMain: {
    handle: (name: string, handler: (event: unknown, payload: unknown) => unknown) =>
      handlers.set(name, handler),
  },
}));
vi.mock("../../src/host/bridge", () => ({
  invoke: async (name: string, payload: unknown) => {
    const handler = handlers.get(name);
    if (!handler) throw new Error(`Missing IPC handler: ${name}`);
    return structuredClone(await handler({}, structuredClone(payload)));
  },
}));

let root: string;
let stores: StoreRegistry;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "deck-session-index-"));
  stores = new StoreRegistry(root);
  handlers.clear();
  registerStore({ stores, windows: new Map(), emitTo: () => true });
});
afterEach(async () => {
  await stores.saveAll();
  await rm(root, { recursive: true, force: true });
});

describe("session index across renderer/store IPC", () => {
  it("finds concurrent window writes without a renderer-maintained label index", async () => {
    const [first, second] = await Promise.all([
      Store.load("session.json"),
      Store.load("session.json"),
    ]);
    await Promise.all([
      first.set("window:main", { savedAt: 1 }),
      second.set("window:deck-1", { savedAt: 2 }),
    ]);
    expect(await first.get("windowLabels")).toEqual(["main", "deck-1"]);
    await Promise.all([first.delete("window:main"), second.set("window:deck-2", { savedAt: 3 })]);
    expect(await second.get("windowLabels")).toEqual(["deck-1", "deck-2"]);
  });

  it("recovers records omitted by a stale legacy index and ignores phantom labels", async () => {
    await writeFile(
      join(root, "session.json"),
      JSON.stringify({
        windowLabels: ["missing"],
        "window:main": { savedAt: 1 },
        "window:deck-1": { savedAt: 2 },
        archive: {},
      }),
    );
    const store = await Store.load("session.json");
    expect(await store.get("windowLabels")).toEqual(["main", "deck-1"]);
  });

  it("leaves the same key in other stores unchanged", async () => {
    const store = await Store.load("settings.json");
    await store.set("windowLabels", ["ordinary-value"]);
    expect(await store.get("windowLabels")).toEqual(["ordinary-value"]);
  });
});
