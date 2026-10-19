/**
 * Which paths git's own ignore rules cover (spec 2026-10-19-ignore-aware-explorer
 * IGN1-IGN4). One question, asked with `git check-ignore --stdin -z`, so the
 * Changes watch and the Explorer tree agree with `git status` without a
 * matcher library.
 *
 * Read-only: `check-ignore` is the only verb, and like every spawn here it runs
 * with `--no-optional-locks`. Never rejects; an answer git cannot give is
 * `unavailable` and each caller falls back to what it did before.
 *
 * The cache keeps its verdicts only while the files they depend on are
 * unchanged: every `.gitignore` from the checkout's top down, `info/exclude`
 * and `index`. The index counts because git's answer depends on what is
 * tracked: a force-added file under an ignored directory is not ignored.
 */
import nodeFs from "node:fs";
import path from "node:path";
import { findCheckout, type Checkout } from "./git-dir";
import { runnerFor, type GitRunner } from "./changes";

export const MAX_CACHED_VERDICTS = 20_000;
export const MAX_REMEMBERED_DIRECTORIES = 256;
/** Roots and stamped files; both maps are cleared wholesale past these. */
export const MAX_REMEMBERED_ROOTS = 256;
export const MAX_STAMPED_FILES = 8_192;
const MAX_STALE_RETRIES = 3;

export type IgnoreAnswer =
  | { readonly kind: "classified"; readonly ignored: ReadonlySet<string> }
  | { readonly kind: "unavailable"; readonly reason: string };

export interface IgnoreClassifier {
  /** `paths` are relative to `directory`, which lies inside `root`; both are
   * canonical. `ignored` holds the inputs git ignores, spelled as given. */
  classify(root: string, directory: string, paths: readonly string[]): Promise<IgnoreAnswer>;
}

export interface IgnoreClassifierDeps {
  readonly runnerFor?: (cwd: string) => GitRunner;
}

interface Normalized {
  /** The input as given. */
  readonly input: string;
  /** What is sent to git: `/` separators, no `.` segments, a nested `.git`
   * replaced by the directory holding it. Null when nothing may be sent. */
  readonly effective: string | null;
}

function normalize(input: string): Normalized {
  if (typeof input !== "string" || input.length === 0 || input.includes("\0")) {
    return { input, effective: null };
  }
  // A backslash separates only on Windows; elsewhere it is part of a name.
  const separators = process.platform === "win32" ? /[\\/]+/ : /\/+/;
  const parts = input.split(separators).filter((part) => part.length > 0 && part !== ".");
  const git = parts.indexOf(".git");
  const kept = git === -1 ? parts : parts.slice(0, git);
  if (
    kept.length === 0 ||
    kept.includes("..") ||
    path.isAbsolute(input) ||
    (process.platform === "win32" && /^[A-Za-z]:/.test(input))
  ) {
    return { input, effective: null };
  }
  return { input, effective: kept.join("/") };
}

/** `a/b/c` -> `a`, `a/b`. */
function ancestorsOf(relative: string): string[] {
  const parts = relative.split("/");
  const result: string[] = [];
  for (let end = 1; end < parts.length; end += 1) {
    result.push(parts.slice(0, end).join("/"));
  }
  return result;
}

function stampOf(file: string): string {
  try {
    const info = nodeFs.statSync(file);
    return `${info.size}:${info.mtimeMs}:${info.ctimeMs}:${info.ino}`;
  } catch {
    return "absent";
  }
}

/** Ignored when git reported it or any directory above it. */
function verdictIn(found: ReadonlySet<string>, relative: string): boolean {
  return found.has(relative) || ancestorsOf(relative).some((ancestor) => found.has(ancestor));
}

function unavailable(reason: string): IgnoreAnswer {
  return { kind: "unavailable", reason };
}

export function createIgnoreClassifier(deps: IgnoreClassifierDeps = {}): IgnoreClassifier {
  const makeRunner = deps.runnerFor ?? ((cwd: string) => runnerFor(cwd));
  let verdicts = new Map<string, boolean>();
  let directories = new Set<string>();
  let roots = new Map<string, boolean>();
  let stamps = new Map<string, string>();
  /** Bumped on every reset: a call that started before one must not write. */
  let generation = 0;

  /** Entries are scoped by the governing git directory: a nested repository
   * that is not a submodule has rules of its own. */
  const keyOf = (scope: string, absolute: string) => `${scope}\0${absolute}`;

  function reset(): void {
    generation += 1;
    verdicts = new Map();
    directories = new Set();
    roots = new Map();
    stamps = new Map();
  }

  /** Clear everything when a file a verdict depends on changed; true if it did. */
  function validate(checkout: Checkout, chainDirs: ReadonlySet<string>): boolean {
    const files = new Set<string>([
      path.join(checkout.commonDir, "info", "exclude"),
      path.join(checkout.gitDir, "index"),
    ]);
    for (const directory of chainDirs) {
      let current = directory;
      while (current === checkout.top || current.startsWith(checkout.top + path.sep)) {
        files.add(path.join(current, ".gitignore"));
        if (current === checkout.top) {
          break;
        }
        current = path.dirname(current);
      }
    }
    const fresh = new Map<string, string>();
    let changed = false;
    for (const file of files) {
      const stamp = stampOf(file);
      fresh.set(file, stamp);
      const known = stamps.get(file);
      if (known !== undefined && known !== stamp) {
        changed = true;
      }
    }
    if (changed) {
      reset();
    }
    if (stamps.size + fresh.size > MAX_STAMPED_FILES) {
      reset();
      changed = true;
    }
    for (const [file, stamp] of fresh) {
      stamps.set(file, stamp);
    }
    return changed;
  }

  /** The nearest remembered ignored directory above `absolute`, if any. */
  function rememberedAbove(scope: string, absolute: string): string | null {
    let current = path.dirname(absolute);
    for (;;) {
      if (directories.has(keyOf(scope, current))) {
        return current;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        return null;
      }
      current = parent;
    }
  }

  async function checkRoot(
    root: string,
    checkout: Checkout | null,
    started: number,
  ): Promise<string | null> {
    const remember = (ignored: boolean) => {
      if (checkout === null || started !== generation) {
        return;
      }
      if (roots.size >= MAX_REMEMBERED_ROOTS) {
        roots = new Map();
      }
      roots.set(root, ignored);
    };
    if (checkout !== null && checkout.top === root) {
      return null;
    }
    const cached = checkout === null ? undefined : roots.get(root);
    if (cached !== undefined) {
      return cached ? "ignored-root" : null;
    }
    const run = await makeRunner(root)(["check-ignore", "--stdin", "-z"], ".\0");
    if (run.ok) {
      remember(true);
      return "ignored-root";
    }
    if (run.kind === "failed" && run.exitCode === 1) {
      remember(false);
      return null;
    }
    return run.kind;
  }

  function remember(
    scope: string,
    directory: string,
    batch: readonly string[],
    found: ReadonlySet<string>,
  ) {
    if (verdicts.size + batch.length > MAX_CACHED_VERDICTS) {
      verdicts = new Map();
    }
    const asAncestor = new Set(batch.flatMap(ancestorsOf));
    for (const relative of batch) {
      const absolute = keyOf(scope, path.join(directory, relative));
      const ignored = verdictIn(found, relative);
      verdicts.set(absolute, ignored);
      if (ignored && asAncestor.has(relative)) {
        if (directories.size >= MAX_REMEMBERED_DIRECTORIES) {
          directories = new Set();
        }
        directories.add(absolute);
      }
    }
  }

  /** What the cache cannot answer yet, and the directories whose `.gitignore`
   * the answer depends on. */
  function plan(scope: string | null, directory: string, entries: readonly Normalized[]) {
    const chain = new Set<string>([directory]);
    const unknown = new Set<string>();
    for (const { effective } of entries) {
      if (effective === null) {
        continue;
      }
      const absolute = path.join(directory, effective);
      const above = scope === null ? null : rememberedAbove(scope, absolute);
      if (above !== null) {
        chain.add(path.dirname(above));
        continue;
      }
      chain.add(path.dirname(absolute));
      if (scope === null || !verdicts.has(keyOf(scope, absolute))) {
        unknown.add(effective);
        for (const ancestor of ancestorsOf(effective)) {
          if (scope === null || !verdicts.has(keyOf(scope, path.join(directory, ancestor)))) {
            unknown.add(ancestor);
          }
        }
      }
    }
    return { chain, unknown };
  }

  /** One attempt; `stale` when a rule changed while git was running. */
  async function attempt(
    root: string,
    directory: string,
    paths: readonly string[],
  ): Promise<IgnoreAnswer | "stale"> {
    const checkout = findCheckout(directory);
    const scope = checkout?.gitDir ?? null;
    const entries = paths.map(normalize);
    let planned = plan(scope, directory, entries);
    if (checkout !== null && validate(checkout, planned.chain)) {
      // The cache this plan was made against is gone; plan against the empty one.
      planned = plan(scope, directory, entries);
      validate(checkout, planned.chain);
    }
    const started = generation;
    const rootProblem = await checkRoot(root, checkout, started);
    if (started !== generation) {
      return "stale";
    }
    if (rootProblem !== null) {
      return unavailable(rootProblem);
    }
    const known = new Map<string, boolean>();
    for (const { effective } of entries) {
      if (effective !== null && !planned.unknown.has(effective) && scope !== null) {
        const absolute = path.join(directory, effective);
        known.set(
          effective,
          rememberedAbove(scope, absolute) !== null ||
            verdicts.get(keyOf(scope, absolute)) === true,
        );
      }
    }
    const batch = [...planned.unknown];
    let found: ReadonlySet<string> = new Set();
    if (batch.length > 0) {
      // `./` keeps git from reading a name such as `:secret` as pathspec magic.
      const result = await makeRunner(directory)(
        ["check-ignore", "--stdin", "-z"],
        `${batch.map((entry) => `./${entry}`).join("\0")}\0`,
      );
      if (started !== generation) {
        return "stale";
      }
      if (result.ok) {
        found = new Set(
          result.stdout
            .split("\0")
            .filter((entry) => entry.length > 0)
            .map((entry) => (entry.startsWith("./") ? entry.slice(2) : entry)),
        );
      } else if (!(result.kind === "failed" && result.exitCode === 1)) {
        return unavailable(result.kind);
      }
      if (scope !== null) {
        remember(scope, directory, batch, found);
      }
    }
    const ignored = new Set<string>();
    for (const { input, effective } of entries) {
      if (effective !== null && (known.get(effective) ?? verdictIn(found, effective))) {
        ignored.add(input);
      }
    }
    return { kind: "classified", ignored };
  }

  async function classify(root: string, directory: string, paths: readonly string[]) {
    for (let tries = 0; tries < MAX_STALE_RETRIES; tries += 1) {
      const answer = await attempt(root, directory, paths);
      if (answer !== "stale") {
        return answer;
      }
    }
    // The rules kept moving; whoever asked fails open.
    return unavailable("changing");
  }

  return {
    async classify(root, directory, paths) {
      try {
        return await classify(root, directory, paths);
      } catch (error) {
        return unavailable(String(error));
      }
    },
  };
}

let shared: IgnoreClassifier | null = null;

/** The one classifier the Changes watch and the Explorer share (plan P3). */
export function sharedIgnoreClassifier(): IgnoreClassifier {
  shared ??= createIgnoreClassifier();
  return shared;
}
