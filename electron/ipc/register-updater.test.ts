import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerUpdater } from "./register-updater";
import { WindowCoordinator } from "../coordinator";
import { MainDirtyRegistry } from "../dirty-registry";
import { censusFor } from "../quit-flow";
import { confirmUpdateInstall } from "../../src/updater/electron-updater-adapter";

const mocks = vi.hoisted(() => ({
  root: "",
  handlers: new Map<string, (event: unknown, payload?: unknown) => unknown>(),
  events: new Map<string, (error?: Error) => void>(),
  ask: vi.fn(),
  updater: {
    on: vi.fn(),
    setFeedURL: vi.fn(),
    checkForUpdates: vi.fn(),
    downloadUpdate: vi.fn(),
    quitAndInstall: vi.fn(),
    logger: null as null | { error(value: unknown): void },
  },
}));
vi.mock("electron", () => ({
  app: { isPackaged: true, getVersion: () => "1.2.0", getPath: () => mocks.root },
  ipcMain: {
    handle: (name: string, callback: (event: unknown, payload?: unknown) => unknown) =>
      mocks.handlers.set(name, callback),
  },
}));
vi.mock("electron-updater", () => ({ autoUpdater: mocks.updater }));
vi.mock("../../src/host/bridge", () => ({
  invoke: async (name: string, payload?: unknown) => {
    const handler = mocks.handlers.get(name);
    if (!handler) throw new Error(`Missing handler: ${name}`);
    return structuredClone(await handler({}, payload));
  },
}));
vi.mock("../../src/host/dialog-host", () => ({ ask: mocks.ask }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.root = mkdtempSync(join(tmpdir(), "deck-updater-ipc-"));
  mocks.handlers.clear();
  mocks.events.clear();
  mocks.updater.on.mockImplementation((name, callback) => mocks.events.set(name, callback));
  mocks.updater.checkForUpdates.mockResolvedValue({
    isUpdateAvailable: true,
    updateInfo: { version: "1.2.1" },
  });
  mocks.updater.downloadUpdate.mockResolvedValue([]);
  vi.stubGlobal("__deckHost", {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(mocks.root, { recursive: true, force: true });
});

function invoke(name: string, payload?: unknown): unknown {
  const handler = mocks.handlers.get(name);
  if (!handler) throw new Error(`Missing handler: ${name}`);
  return handler(null, payload);
}
function setup() {
  return registerUpdater({
    labelOf: () => "main",
    prepareForInstall: async () => {},
    countOutcome: () => {},
    census: async () => null,
  });
}

describe("updater IPC diagnostics", () => {
  it("carries peer-window panes and unsaved files through IPC into the existing dialog", async () => {
    const coordinator = new WindowCoordinator(() => {});
    coordinator.register(11, "peer");
    coordinator.beginTransfer("peer", 11);
    const dirty = new MainDirtyRegistry();
    dirty.replace("peer", ["/peer/unsaved.ts"]);
    const inspect = vi.fn(async (ids: readonly number[]) =>
      ids.map((id) => ({
        id,
        processId: null,
        cwd: "/peer",
        process: "claude",
        kind: "agent" as const,
        agent: "claude",
      })),
    );
    registerUpdater({
      labelOf: () => "main",
      prepareForInstall: async () => {},
      countOutcome: () => {},
      census: async () => censusFor(0, await inspect(coordinator.allPanes()), dirty.all()),
    });
    mocks.ask.mockResolvedValue(false);

    await expect(confirmUpdateInstall()).resolves.toBe(false);
    expect(inspect).toHaveBeenCalledWith([11]);
    expect(mocks.ask).toHaveBeenCalledWith(
      expect.stringMatching(/claude.*unsaved\.ts/s),
      expect.objectContaining({ title: "Install Deck Update", okLabel: "Install & Restart" }),
    );
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();

    mocks.ask.mockResolvedValue(true);
    await expect(confirmUpdateInstall()).resolves.toBe(true);
  });

  it("reads the main-owned install census and refuses an unavailable census", async () => {
    const census = vi.fn().mockResolvedValue({
      requestId: 0,
      busyProcesses: ["claude"],
      busyPanes: 1,
      fullyNamed: true,
      dirtyFiles: ["/peer/unsaved.ts"],
    });
    registerUpdater({
      labelOf: () => "main",
      prepareForInstall: async () => {},
      countOutcome: () => {},
      census,
    });
    await expect(invoke("update_census")).resolves.toMatchObject({
      busyPanes: 1,
      dirtyFiles: ["/peer/unsaved.ts"],
    });
    census.mockResolvedValue(null);
    await expect(invoke("update_census")).resolves.toBeNull();
    expect(mocks.updater.quitAndInstall).not.toHaveBeenCalled();
  });

  it("always returns unsupported for update check and never contacts autoUpdater", async () => {
    setup();
    const result = await invoke("update_check");
    expect(result).toEqual({ status: "unsupported" });
    expect(mocks.updater.checkForUpdates).not.toHaveBeenCalled();
    expect(mocks.updater.setFeedURL).not.toHaveBeenCalled();
  });

  it("handles local error reports safely", async () => {
    setup();
    invoke("update_report_error", {
      operation: "install",
      name: "Error",
      message: "Could not record attempt",
    });
    const content = readFileSync(join(mocks.root, "updater.log"), "utf8");
    expect(content).toContain("Could not record attempt");
    expect(() => invoke("update_report_error", { operation: "shell", message: "invalid" })).toThrow(
      "Invalid updater log operation",
    );
  });
});
