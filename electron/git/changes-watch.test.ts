import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PathOutsideWorkspaceError } from "../fs/path-guard";
import {
  CLASSIFY_BUDGET_MS,
  createChangesWatchRegistry,
  EMIT_INTERVAL_MS,
  MAX_WINDOW_PATHS,
  keepsRootGitPath,
  type ChangesWatchFs,
} from "./changes-watch";
import type { IgnoreAnswer, IgnoreClassifier } from "./ignore-classifier";

/**
 * The registry over a FAKE watcher: which events count, how they throttle and
 * what is released. Whether `fs.watch` fires is a platform question; the E2E
 * pass on macOS answers it.
 */
let base: string;
let plain: string;
let worktree: string;
let gitDirOutside: string;

beforeAll(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "deck-changes-watch-")));
  plain = path.join(base, "plain");
  fs.mkdirSync(path.join(plain, ".git"), { recursive: true });
  const main = path.join(base, "main-repo");
  gitDirOutside = path.join(main, ".git", "worktrees", "wt");
  fs.mkdirSync(gitDirOutside, { recursive: true });
  worktree = path.join(base, "wt");
  fs.mkdirSync(worktree);
  fs.writeFileSync(path.join(worktree, ".git"), `gitdir: ${gitDirOutside}\n`);
});

afterAll(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

afterEach(() => {
  vi.useRealTimers();
});

interface FakeWatcher {
  readonly target: string;
  readonly recursive: boolean;
  closed: boolean;
  fire(filename: string | null): void;
  fail(error: unknown): void;
}

function fakeIo(): { io: ChangesWatchFs; watchers: FakeWatcher[] } {
  const watchers: FakeWatcher[] = [];
  const io: ChangesWatchFs = {
    watch(target, options, listener, onError) {
      const watcher: FakeWatcher = {
        target,
        recursive: options.recursive,
        closed: false,
        fire: (filename) => listener("rename", filename),
        fail: onError,
      };
      watchers.push(watcher);
      return {
        close() {
          watcher.closed = true;
        },
      };
    },
  };
  return { io, watchers };
}

function setup(recursive = true, classifier?: IgnoreClassifier) {
  const { io, watchers } = fakeIo();
  const emit = vi.fn();
  const log = vi.fn();
  const registry = createChangesWatchRegistry({ emit, io, recursive, log, classifier });
  return { registry, watchers, emit, log };
}

const settle = () => vi.advanceTimersByTime(EMIT_INTERVAL_MS + 1);

describe("which watches open", () => {
  it("opens one recursive watch on a checkout whose .git is inside it", () => {
    const { registry, watchers } = setup();
    registry.replace(1, plain);
    expect(watchers.map((w) => [w.target, w.recursive])).toEqual([[plain, true]]);
  });

  it("adds a non-recursive watch on a git directory outside the root", () => {
    const { registry, watchers } = setup();
    registry.replace(1, worktree);
    expect(watchers.map((w) => [w.target, w.recursive])).toEqual([
      [worktree, true],
      [gitDirOutside, false],
    ]);
  });

  it("watches the root's own .git instead when recursion is unavailable", () => {
    const { registry, watchers } = setup(false);
    registry.replace(1, plain);
    expect(watchers.map((w) => [w.target, w.recursive])).toEqual([
      [path.join(plain, ".git"), false],
    ]);
  });

  it("replaces: closes the old watches, and null or release closes them too", () => {
    const { registry, watchers } = setup();
    registry.replace(1, plain);
    registry.replace(1, worktree);
    expect(watchers[0].closed).toBe(true);
    expect(registry.watched(1)).toEqual([worktree, gitDirOutside].sort());
    registry.replace(1, null);
    expect(watchers.every((w) => w.closed)).toBe(true);
    expect(registry.watched(1)).toEqual([]);
    registry.replace(2, plain);
    registry.release(2);
    expect(watchers[watchers.length - 1].closed).toBe(true);
  });

  it("keeps senders apart", () => {
    const { registry, watchers } = setup();
    registry.replace(1, plain);
    registry.replace(2, plain);
    registry.release(1);
    expect(watchers[0].closed).toBe(true);
    expect(watchers[1].closed).toBe(false);
  });

  it("throws for a root that does not resolve", () => {
    const { registry } = setup();
    expect(() => registry.replace(1, path.join(base, "missing"))).toThrow(
      PathOutsideWorkspaceError,
    );
  });

  it("degrades to no watch, logged once, when fs.watch throws", () => {
    const emit = vi.fn();
    const log = vi.fn();
    const io: ChangesWatchFs = {
      watch() {
        throw Object.assign(new Error("too many open files"), { code: "EMFILE" });
      },
    };
    const registry = createChangesWatchRegistry({ emit, io, recursive: true, log });
    registry.replace(1, plain);
    registry.replace(1, plain);
    expect(registry.watched(1)).toEqual([]);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("logs a watcher error event once", () => {
    const { registry, watchers, log } = setup();
    registry.replace(1, plain);
    watchers[0].fail(new Error("ENOSPC"));
    watchers[0].fail(new Error("ENOSPC"));
    expect(log).toHaveBeenCalledTimes(1);
  });
});

describe("which events count", () => {
  const cases: ReadonlyArray<readonly [string, string | null, boolean]> = [
    ["a source file", "src/app.ts", true],
    ["a root-level file", "README.md", true],
    ["an unknown filename", null, true],
    ["the index", ".git/index", true],
    ["HEAD", ".git/HEAD", true],
    ["packed-refs", ".git/packed-refs", true],
    ["a branch ref", ".git/refs/heads/feat", true],
    ["the index lock", ".git/index.lock", false],
    ["a ref lock", ".git/refs/heads/feat.lock", false],
    ["objects", ".git/objects/ab/cdef", false],
    ["logs", ".git/logs/HEAD", false],
    ["worktrees", ".git/worktrees/wt/index", false],
    ["the .git entry itself", ".git", false],
    ["a Windows separator", "src\\app.ts", true],
  ];
  it.each(cases)("%s", (_name, filename, counts) => {
    vi.useFakeTimers();
    const { registry, watchers, emit } = setup();
    registry.replace(1, plain);
    watchers[0].fire(filename);
    settle();
    expect(emit).toHaveBeenCalledTimes(counts ? 1 : 0);
  });

  it("keeps only index and HEAD from a git directory outside the root", () => {
    vi.useFakeTimers();
    const { registry, watchers, emit } = setup();
    registry.replace(1, worktree);
    const gitWatch = watchers[1];
    for (const filename of ["objects", "index.lock", "logs", "refs", "worktrees"]) {
      gitWatch.fire(filename);
    }
    settle();
    expect(emit).not.toHaveBeenCalled();
    gitWatch.fire("index");
    settle();
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(1, worktree);
    gitWatch.fire("HEAD");
    settle();
    expect(emit).toHaveBeenCalledTimes(2);
  });
});

describe("throttle", () => {
  it("emits once for 5,000 events inside 100 ms", () => {
    vi.useFakeTimers();
    const { registry, watchers, emit } = setup();
    registry.replace(1, plain);
    for (let index = 0; index < 5000; index += 1) {
      watchers[0].fire(`node_modules/p${index}/index.js`);
    }
    vi.advanceTimersByTime(EMIT_INTERVAL_MS - 1);
    expect(emit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(emit).toHaveBeenCalledTimes(1);
    watchers[0].fire("a.ts");
    settle();
    expect(emit).toHaveBeenCalledTimes(2);
  });

  it("drops a pending emit when the sender is released", () => {
    vi.useFakeTimers();
    const { registry, watchers, emit } = setup();
    registry.replace(1, plain);
    watchers[0].fire("a.ts");
    registry.release(1);
    settle();
    expect(emit).not.toHaveBeenCalled();
  });
});

/** A classifier that calls `answer` for each window. */
function fakeClassifier(answer: (paths: readonly string[]) => Promise<IgnoreAnswer>) {
  const classify = vi.fn((_root: string, _directory: string, paths: readonly string[]) =>
    answer(paths),
  );
  return { classifier: { classify } satisfies IgnoreClassifier, classify };
}

const ignoring = (...ignored: string[]) =>
  fakeClassifier(async () => ({ kind: "classified", ignored: new Set(ignored) }));

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

describe("with a classifier", () => {
  it("emits nothing for a window of ignored paths, with one classification", async () => {
    vi.useFakeTimers();
    const names = Array.from({ length: 5_000 }, (_, i) => `node_modules/p${i}/index.js`);
    const { classifier, classify } = ignoring(...names);
    const { registry, watchers, emit } = setup(true, classifier);
    registry.replace(1, plain);
    for (const name of names) {
      watchers[0].fire(name);
    }
    await tick(EMIT_INTERVAL_MS + 1);
    expect(classify).toHaveBeenCalledTimes(1);
    expect(classify.mock.calls[0][2]).toHaveLength(5_000);
    expect(classify.mock.calls[0][0]).toBe(plain);
    expect(emit).not.toHaveBeenCalled();
  });

  it("emits once when one path among thousands is not ignored", async () => {
    vi.useFakeTimers();
    const names = Array.from({ length: 5_000 }, (_, i) => `node_modules/p${i}.js`);
    const { classifier } = ignoring(...names);
    const { registry, watchers, emit } = setup(true, classifier);
    registry.replace(1, plain);
    for (const name of names) {
      watchers[0].fire(name);
    }
    watchers[0].fire("src/app.ts");
    await tick(EMIT_INTERVAL_MS + 1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(1, plain);
  });

  it("emits for the always-emit paths without a classifier call", async () => {
    vi.useFakeTimers();
    const { classifier, classify } = ignoring();
    const { registry, watchers, emit } = setup(true, classifier);
    registry.replace(1, worktree);
    for (const fire of [
      () => watchers[0].fire(null),
      () => watchers[0].fire(".git/index"),
      () => watchers[0].fire(".git/info/exclude"),
      () => watchers[0].fire(".gitignore"),
      () => watchers[1].fire("HEAD"),
    ]) {
      emit.mockClear();
      fire();
      await tick(EMIT_INTERVAL_MS + 1);
      expect(emit).toHaveBeenCalledTimes(1);
    }
    expect(classify).not.toHaveBeenCalled();
  });

  it("still drops .git noise that never counted", async () => {
    vi.useFakeTimers();
    const { classifier, classify } = ignoring();
    const { registry, watchers, emit } = setup(true, classifier);
    registry.replace(1, plain);
    watchers[0].fire(".git/objects/ab/cdef");
    watchers[0].fire(".git/index.lock");
    await tick(EMIT_INTERVAL_MS + 1);
    expect(emit).not.toHaveBeenCalled();
    expect(classify).not.toHaveBeenCalled();
  });

  it("judges a nested .gitignore by the directory it governs", async () => {
    vi.useFakeTimers();
    const { classifier, classify } = ignoring("node_modules/dep");
    const { registry, watchers, emit } = setup(true, classifier);
    registry.replace(1, plain);
    watchers[0].fire("node_modules/dep/.gitignore");
    await tick(EMIT_INTERVAL_MS + 1);
    expect(classify.mock.calls[0][2]).toEqual(["node_modules/dep"]);
    expect(emit).not.toHaveBeenCalled();
    watchers[0].fire("src/.gitignore");
    await tick(EMIT_INTERVAL_MS + 1);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("hands a path inside a nested .git on to the classifier", async () => {
    vi.useFakeTimers();
    const { classifier, classify } = ignoring("node_modules/dep/.git/HEAD");
    const { registry, watchers, emit } = setup(true, classifier);
    registry.replace(1, plain);
    watchers[0].fire("node_modules/dep/.git/HEAD");
    await tick(EMIT_INTERVAL_MS + 1);
    expect(classify.mock.calls[0][2]).toEqual(["node_modules/dep/.git/HEAD"]);
    expect(emit).not.toHaveBeenCalled();
  });

  it("fails open when the classifier is unavailable or throws", async () => {
    vi.useFakeTimers();
    for (const answer of [
      async (): Promise<IgnoreAnswer> => ({ kind: "unavailable", reason: "failed" }),
      async (): Promise<IgnoreAnswer> => {
        throw new Error("boom");
      },
    ]) {
      const { classifier } = fakeClassifier(answer);
      const { registry, watchers, emit } = setup(true, classifier);
      registry.replace(1, plain);
      watchers[0].fire("dist/a.js");
      await tick(EMIT_INTERVAL_MS + 1);
      expect(emit).toHaveBeenCalledTimes(1);
    }
  });

  it("emits by 600 ms when the classifier never answers", async () => {
    vi.useFakeTimers();
    const { classifier } = fakeClassifier(() => new Promise(() => {}));
    const { registry, watchers, emit } = setup(true, classifier);
    registry.replace(1, plain);
    watchers[0].fire("dist/a.js");
    await tick(EMIT_INTERVAL_MS + CLASSIFY_BUDGET_MS - 1);
    expect(emit).not.toHaveBeenCalled();
    await tick(2);
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it("emits a window of over 10,000 paths at once, and still classifies it", async () => {
    vi.useFakeTimers();
    const { classifier, classify } = ignoring();
    const { registry, watchers, emit } = setup(true, classifier);
    registry.replace(1, plain);
    for (let i = 0; i <= MAX_WINDOW_PATHS; i += 1) {
      watchers[0].fire(`node_modules/f${i}`);
    }
    await tick(EMIT_INTERVAL_MS + 1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(classify.mock.calls[0][2]).toHaveLength(MAX_WINDOW_PATHS);
  });

  it("emits at once while a classification for the sender is still running", async () => {
    vi.useFakeTimers();
    const { classifier, classify } = fakeClassifier(() => new Promise(() => {}));
    const { registry, watchers, emit } = setup(true, classifier);
    registry.replace(1, plain);
    watchers[0].fire("dist/a.js");
    await tick(EMIT_INTERVAL_MS + 1);
    watchers[0].fire("dist/b.js");
    await tick(EMIT_INTERVAL_MS + 1);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(classify).toHaveBeenCalledTimes(1);
  });

  it("drops a late answer for a released sender", async () => {
    vi.useFakeTimers();
    let answer!: (value: IgnoreAnswer) => void;
    const { classifier } = fakeClassifier(() => new Promise((resolve) => (answer = resolve)));
    const { registry, watchers, emit } = setup(true, classifier);
    registry.replace(1, plain);
    watchers[0].fire("dist/a.js");
    await tick(EMIT_INTERVAL_MS + 1);
    registry.release(1);
    answer({ kind: "unavailable", reason: "failed" });
    await tick(CLASSIFY_BUDGET_MS + 1);
    expect(emit).not.toHaveBeenCalled();
  });

  it("starts a fresh window after an all-ignored one", async () => {
    vi.useFakeTimers();
    const { classifier } = ignoring("dist/a.js");
    const { registry, watchers, emit } = setup(true, classifier);
    registry.replace(1, plain);
    watchers[0].fire("dist/a.js");
    await tick(EMIT_INTERVAL_MS + 1);
    watchers[0].fire("src/b.ts");
    await tick(EMIT_INTERVAL_MS + 1);
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

describe("helpers", () => {
  it("keepsRootGitPath", () => {
    expect(keepsRootGitPath([])).toBe(false);
    expect(keepsRootGitPath(["index"])).toBe(true);
    expect(keepsRootGitPath(["refs", "tags", "v1"])).toBe(true);
    expect(keepsRootGitPath(["objects", "pack"])).toBe(false);
    expect(keepsRootGitPath(["info", "exclude"])).toBe(true);
    expect(keepsRootGitPath(["info", "refs"])).toBe(false);
  });
});
