// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FileClient, IgnoredNamesResult } from "./file-client";
import { createFileSurfaceController } from "./file-surface-controller";
import { LISTING_IGNORE_BUDGET_MS } from "./listing-ignore";
import {
  activeWorkspace,
  explorerStatus,
  fileSurfaces,
  listingErrorsFor,
  resetFileSurfaces,
  surfaceFor,
} from "./file-surface-store";
import type { DirEntry } from "./file-tree";

const ROOT = "/r";

const entry = (name: string, directory = false): DirEntry => ({
  name,
  path: `${ROOT}/${name}`,
  directory,
  outOfRoot: false,
});

type Ask = FileClient["ignoredNames"];

/** A client whose listing is fixed and whose ignore query is the test's. */
function setup(ignoredNames?: Ask, names: readonly string[] = ["coverage", "src", "a.ts"]) {
  const client: FileClient = {
    async listDir() {
      return names.map((name) => entry(name));
    },
    async readFile() {
      return { kind: "refused", reason: "gone" };
    },
    async writeFile(_root, path, text) {
      return { path, mtimeMs: 0, size: text.length };
    },
    async statFiles() {
      return [];
    },
    async watchPaths() {},
    async setDirtyFiles() {},
    async createEntry(_root, parent, name) {
      return { path: `${parent}/${name}` };
    },
    async listenFileChanged() {
      return () => {};
    },
    ...(ignoredNames === undefined ? {} : { ignoredNames }),
  };
  const controller = createFileSurfaceController({ client });
  activeWorkspace.value = ROOT;
  return { controller };
}

const classified = (...ignored: string[]): IgnoredNamesResult => ({ kind: "classified", ignored });

beforeEach(() => {
  vi.useFakeTimers();
  resetFileSurfaces();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("a listing and git's verdict (IGN15)", () => {
  it("lands as ONE store write when the answer is inside the budget", async () => {
    const { controller } = setup(async () => classified("coverage"));
    let writes = 0;
    const stop = fileSurfaces.subscribe(() => {
      writes += 1;
    });
    writes = 0;

    await controller.ensureListing(ROOT, ROOT);
    stop();

    expect(writes).toBe(1);
    expect([...(surfaceFor(ROOT).verdicts.get(ROOT) ?? [])]).toEqual(["coverage"]);
    expect(surfaceFor(ROOT).listings.get(ROOT)).toHaveLength(3);
  });

  it("shows the listing at the budget and applies a late answer when it lands", async () => {
    let answer!: (reply: IgnoredNamesResult) => void;
    const { controller } = setup(
      () =>
        new Promise<IgnoredNamesResult>((resolve) => {
          answer = resolve;
        }),
    );

    const loading = controller.ensureListing(ROOT, ROOT);
    await vi.advanceTimersByTimeAsync(LISTING_IGNORE_BUDGET_MS);
    await loading;
    expect(surfaceFor(ROOT).listings.has(ROOT)).toBe(true);
    expect(surfaceFor(ROOT).verdicts.has(ROOT)).toBe(false);

    answer(classified("coverage"));
    await vi.advanceTimersByTimeAsync(0);
    expect([...(surfaceFor(ROOT).verdicts.get(ROOT) ?? [])]).toEqual(["coverage"]);
  });

  it("drops a late answer once the directory has been listed again", async () => {
    const answers: ((reply: IgnoredNamesResult) => void)[] = [];
    const { controller } = setup(
      () =>
        new Promise<IgnoredNamesResult>((resolve) => {
          answers.push(resolve);
        }),
    );

    const first = controller.ensureListing(ROOT, ROOT);
    await vi.advanceTimersByTimeAsync(LISTING_IGNORE_BUDGET_MS);
    await first;
    const second = controller.ensureListing(ROOT, ROOT);
    controller.refreshTree(ROOT);
    await vi.advanceTimersByTimeAsync(LISTING_IGNORE_BUDGET_MS);
    await second;

    answers[0](classified("stale"));
    await vi.advanceTimersByTimeAsync(0);
    expect(surfaceFor(ROOT).verdicts.has(ROOT)).toBe(false);
  });
});

describe("no answer from git (IGN11)", () => {
  it("keeps the fallback when the host has no channel", async () => {
    const { controller } = setup();
    await controller.ensureListing(ROOT, ROOT);
    expect(surfaceFor(ROOT).listings.has(ROOT)).toBe(true);
    expect(surfaceFor(ROOT).verdicts.size).toBe(0);
  });

  it("keeps the fallback and stays quiet when the call rejects", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    const { controller } = setup(async () => {
      throw new Error("boom");
    });
    await controller.ensureListing(ROOT, ROOT);
    expect(surfaceFor(ROOT).verdicts.size).toBe(0);
    expect(explorerStatus.value).toBeNull();
    expect(listingErrorsFor(ROOT).size).toBe(0);
    debug.mockRestore();
  });

  it("keeps the fallback when git reports unavailable", async () => {
    const { controller } = setup(async () => ({ kind: "unavailable", reason: "not a repository" }));
    await controller.ensureListing(ROOT, ROOT);
    expect(surfaceFor(ROOT).verdicts.size).toBe(0);
    expect(explorerStatus.value).toBeNull();
  });
});

describe("creating an ignored name (IGN17)", () => {
  it("turns Show ignored files on and says so", async () => {
    const { controller } = setup(async () => classified("debug.log"), ["debug.log"]);
    await controller.createEntry(ROOT, ROOT, "debug.log", "directory");

    expect(surfaceFor(ROOT).showIgnored).toBe(true);
    expect(surfaceFor(ROOT).showHidden).toBe(false);
    expect(explorerStatus.value).toEqual({
      workspacePath: ROOT,
      text: "Showing ignored files so debug.log is visible.",
      failed: false,
    });
  });

  it("names both filters when both had to turn on", async () => {
    const { controller } = setup(async () => classified(".env.local"), [".env.local"]);
    await controller.createEntry(ROOT, ROOT, ".env.local", "directory");

    expect(surfaceFor(ROOT).showHidden).toBe(true);
    expect(surfaceFor(ROOT).showIgnored).toBe(true);
    expect(explorerStatus.value?.text).toBe(
      "Showing hidden and ignored files so .env.local is visible.",
    );
  });

  it("leaves the toggle alone for a name git does not ignore", async () => {
    const { controller } = setup(async () => classified("debug.log"), ["notes.md"]);
    await controller.createEntry(ROOT, ROOT, "notes.md", "directory");

    expect(surfaceFor(ROOT).showIgnored).toBe(false);
    expect(explorerStatus.value).toBeNull();
  });
});
