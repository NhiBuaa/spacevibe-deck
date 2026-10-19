/**
 * What tells the Changes list to read again (plan 2026-10-10-changes-list, C3).
 *
 * Two watches per window, held only while the list is shown and the window is
 * visible, with Node's built-in `fs.watch` and no library:
 *
 *  - **Recursive on the root**, macOS and Windows only. Linux's implementation
 *    walks every directory, and Deck does not ship there. Under the root's own
 *    `.git/` only `index`, `HEAD`, `packed-refs` and `refs/**` count; `objects/`,
 *    `logs/`, `worktrees/` and `*.lock` are the noise a commit makes.
 *  - **Non-recursive on the git directory** when it lies outside the root. A
 *    linked worktree keeps its index and HEAD in `<repo>/.git/worktrees/<name>`,
 *    which no root watch sees (measured 2026-10-10: a commit there produced zero
 *    events under its root), and Deck opens worktrees as tabs. Only `index` and
 *    `HEAD` count there. Platforms without a recursive watch use it for the
 *    root's own `.git` as well.
 *
 * An event only says "read again": at most one per 100 ms per window, trailing,
 * so a burst of 5,000 writes is one message. Scheduling belongs to the renderer.
 *
 * With a classifier, a window whose every path git ignores emits nothing
 * (spec 2026-10-19-ignore-aware-explorer, IGN5-IGN7): an install or a build
 * writing only ignored output no longer makes the list read once a second. The
 * paths that always emit are the ones the classifier cannot judge, `.git` state
 * and `info/exclude`, and the git-directory watch. Every other doubt fails
 * open: an error, 500 ms without an answer, a window of over 10,000 paths, or a
 * classification still running for this sender emits as it did before.
 *
 * `git status` is run with `--no-optional-locks` for a reason this module
 * depends on: a plain status rewrites `.git/index`, which this very watch would
 * report, which would read again.
 */
import nodeFs from "node:fs";
import path from "node:path";
import { PathOutsideWorkspaceError, resolveRoot } from "../fs/path-guard";
import { findGitDir } from "./git-dir";
import type { IgnoreAnswer, IgnoreClassifier } from "./ignore-classifier";

export const EMIT_INTERVAL_MS = 100;
/** How long a window waits for git's verdict before it emits anyway. */
export const CLASSIFY_BUDGET_MS = 500;
/** Distinct paths one window hands the classifier; past it the window emits. */
export const MAX_WINDOW_PATHS = 10_000;

export interface ChangesWatchFs {
  watch(
    target: string,
    options: { readonly recursive: boolean },
    listener: (event: string, filename: string | null) => void,
    onError: (error: unknown) => void,
  ): { close(): void };
}

const nodeChangesFs: ChangesWatchFs = {
  watch(target, options, listener, onError) {
    const watcher = nodeFs.watch(
      target,
      { persistent: false, recursive: options.recursive },
      (event, filename) => listener(event, typeof filename === "string" ? filename : null),
    );
    // EMFILE and ENOSPC can arrive as an event on the watcher after it was
    // created, not as a throw from `watch`.
    watcher.on("error", onError);
    return watcher;
  },
};

export interface ChangesWatchOptions {
  readonly emit: (sender: number, root: string) => void;
  readonly io?: ChangesWatchFs;
  /** Recursive watching exists here. Defaults to macOS and Windows. */
  readonly recursive?: boolean;
  readonly log?: (message: string) => void;
  /** Without one every kept event emits, as before. */
  readonly classifier?: IgnoreClassifier;
}

export interface ChangesWatchRegistry {
  /** Replace one sender's watched checkout; `null` releases. Throws
   * `PathOutsideWorkspaceError` for a root that does not resolve. */
  replace(sender: number, root: string | null): void;
  release(sender: number): void;
  dispose(): void;
  /** Directories currently watched for a sender, sorted. Tests and diagnostics. */
  watched(sender: number): string[];
}

interface SenderWatch {
  readonly closers: Array<() => void>;
  readonly directories: string[];
  timer: ReturnType<typeof setTimeout> | null;
  /** Root-relative paths of the open window, to classify when it closes. */
  paths: Set<string>;
  /** The open window holds a path that emits without being classified. */
  force: boolean;
  /** The open window outgrew `MAX_WINDOW_PATHS`. */
  capped: boolean;
  /** A classification for this sender has not settled yet. */
  classifying: boolean;
}

/** Whether an event emits unconditionally (`true`), is dropped (`false`), or
 * stands for the root-relative path git must judge (a string). */
type Route = boolean | string;

/** Whether a path under the root's `.git/` can change what status says. */
export function keepsRootGitPath(inside: readonly string[]): boolean {
  if (inside.length === 0) {
    // The `.git` entry itself.
    return false;
  }
  const [first, ...rest] = inside;
  if (rest.length === 0) {
    return first === "index" || first === "HEAD" || first === "packed-refs";
  }
  if (first === "info") {
    // A new ignore rule changes what is listed, though no tracked file moved.
    return rest.length === 1 && rest[0] === "exclude";
  }
  return first === "refs" && !inside[inside.length - 1].endsWith(".lock");
}

/** `.gitignore` is judged by the directory it governs: git reads none inside an
 * ignored directory. A root-level one governs the root, which is never ignored. */
function rootRoute(inside: string[], classified: boolean): Route {
  if (inside[0] === ".git") {
    return keepsRootGitPath(inside.slice(1));
  }
  if (!classified) {
    return true;
  }
  if (inside[inside.length - 1] === ".gitignore") {
    return inside.length === 1 ? true : inside.slice(0, -1).join("/");
  }
  return inside.join("/");
}

/** The classifier's answer, or an `unavailable` one when it is not in time. */
function raceBudget(answer: Promise<IgnoreAnswer>): Promise<IgnoreAnswer> {
  return new Promise((resolve) => {
    const timer = setTimeout(
      () => resolve({ kind: "unavailable", reason: "timeout" }),
      CLASSIFY_BUDGET_MS,
    );
    void answer.then((value) => {
      clearTimeout(timer);
      resolve(value);
    });
  });
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function createChangesWatchRegistry(options: ChangesWatchOptions): ChangesWatchRegistry {
  const io = options.io ?? nodeChangesFs;
  const recursive =
    options.recursive ?? (process.platform === "darwin" || process.platform === "win32");
  const log = options.log ?? ((message: string) => console.warn(message));
  const senders = new Map<number, SenderWatch>();
  const logged = new Set<string>();

  const logOnce = (key: string, message: string) => {
    if (!logged.has(key)) {
      logged.add(key);
      log(message);
    }
  };

  function closeSender(sender: number): void {
    const state = senders.get(sender);
    if (state === undefined) {
      return;
    }
    senders.delete(sender);
    if (state.timer !== null) {
      clearTimeout(state.timer);
    }
    for (const close of state.closers) {
      try {
        close();
      } catch {
        // Already closed by the platform.
      }
    }
  }

  return {
    replace(sender, root) {
      closeSender(sender);
      if (root === null) {
        return;
      }
      const canonical = resolveRoot(root);
      if (canonical === null) {
        throw new PathOutsideWorkspaceError(root);
      }
      const state: SenderWatch = {
        closers: [],
        directories: [],
        timer: null,
        paths: new Set(),
        force: false,
        capped: false,
        classifying: false,
      };
      senders.set(sender, state);

      const emitIfCurrent = () => {
        if (senders.get(sender) === state) {
          options.emit(sender, root);
        }
      };

      /** Close the window: emit, or ask git first when every path might be ignored. */
      const settle = () => {
        const { paths, force, capped } = state;
        state.paths = new Set();
        state.force = false;
        state.capped = false;
        if (senders.get(sender) !== state) {
          return;
        }
        const classifier = options.classifier;
        if (classifier === undefined || force || paths.size === 0) {
          emitIfCurrent();
          return;
        }
        if (state.classifying) {
          emitIfCurrent();
          return;
        }
        state.classifying = true;
        const answer = classifier
          .classify(canonical, canonical, [...paths])
          .catch((): IgnoreAnswer => ({ kind: "unavailable", reason: "failed" }))
          .finally(() => {
            state.classifying = false;
          });
        if (capped) {
          // Too big to judge in time; the answer still teaches the cache.
          emitIfCurrent();
          return;
        }
        void raceBudget(answer).then((verdict) => {
          if (
            verdict.kind !== "classified" ||
            [...paths].some((entry) => !verdict.ignored.has(entry))
          ) {
            emitIfCurrent();
          }
        });
      };

      const touch = (path: string | null, always: boolean) => {
        if (always) {
          state.force = true;
        } else if (path !== null) {
          if (state.paths.size < MAX_WINDOW_PATHS) {
            state.paths.add(path);
          } else if (!state.paths.has(path)) {
            state.capped = true;
          }
        }
        if (state.timer === null) {
          state.timer = setTimeout(() => {
            state.timer = null;
            settle();
          }, EMIT_INTERVAL_MS);
        }
      };

      const open = (target: string, isRecursive: boolean, route: (inside: string[]) => Route) => {
        try {
          const watcher = io.watch(
            target,
            { recursive: isRecursive },
            (_event, filename) => {
              // A platform that cannot say what moved counts as a change.
              if (filename === null) {
                touch(null, true);
                return;
              }
              const inside = filename.split(/[\\/]+/).filter((part) => part.length > 0);
              const routed = inside.length === 0 ? true : route(inside);
              if (routed !== false) {
                touch(typeof routed === "string" ? routed : null, routed === true);
              }
            },
            (error) => logOnce(target, `changes watch on ${target} failed: ${String(error)}`),
          );
          state.closers.push(() => watcher.close());
          state.directories.push(target);
        } catch (error) {
          // EMFILE, ENOSPC, a vanished root: no watch is the correct degradation.
          // Focus, turn end and Refresh still read.
          logOnce(target, `changes watch on ${target} unavailable: ${String(error)}`);
        }
      };

      const gitDir = findGitDir(canonical);
      const gitInsideRoot = gitDir !== null && isInside(canonical, gitDir);
      if (recursive) {
        open(canonical, true, (inside) => rootRoute(inside, options.classifier !== undefined));
      }
      if (gitDir !== null && (!gitInsideRoot || !recursive)) {
        open(
          gitDir,
          false,
          (inside) => inside.length === 1 && (inside[0] === "index" || inside[0] === "HEAD"),
        );
      }
    },
    release(sender) {
      closeSender(sender);
    },
    dispose() {
      for (const sender of [...senders.keys()]) {
        closeSender(sender);
      }
    },
    watched(sender) {
      return [...(senders.get(sender)?.directories ?? [])].sort();
    },
  };
}
