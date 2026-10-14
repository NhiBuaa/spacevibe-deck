/**
 * cwd → repository root, for grouping usage by repository.
 *
 * The answer is persisted by the caller and never recomputed, so "not a
 * repository" has to be proven, not inferred: git exits 128 for a missing
 * directory, a non-repository, an unknown flag (git < 2.31 rejects
 * `--path-format`) and `safe.directory` alike, and the macOS `xcrun` shim
 * fails the same way when the Command Line Tools are absent. Only a directory
 * that is gone, or git's own "not a git repository" message, is `none`;
 * everything else is `retry`.
 *
 * Worktrees fold into their repository: the common dir is the SAME for the
 * main checkout and every linked worktree, and a subdirectory climbs to the
 * repository that contains it (owner, 2026-10-14) — unlike the rail, which
 * names only a checkout's own root. `worktrees.ts`'s `git()` is not reused
 * because it folds every failure into null, which cannot tell a timeout from
 * a non-repository.
 */
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import path from "node:path";
import type { FileRecord } from "./model";

/** How long one `git rev-parse` gets before its answer counts as transient. Matches `worktrees.ts`. */
export const REPO_RESOLVE_TIMEOUT_MS = 4000;

/**
 * How long a cwd whose resolution failed transiently waits before git is
 * asked again. In memory only: a broken git costs one spawn per cwd per
 * window instead of one per 5 s poll.
 */
export const REPO_RETRY_BACKOFF_MS = 10 * 60 * 1000;

/** Concurrent `git rev-parse` children while resolving new cwds. */
export const REPO_RESOLVE_CONCURRENCY = 4;

export type RepoAnswer =
  | { readonly kind: "repo"; readonly root: string }
  /** Definitively not inside a repository; safe to persist. */
  | { readonly kind: "none" }
  /** Could not tell this time; never persisted. */
  | { readonly kind: "retry" };

export type ResolveRepo = (cwd: string) => Promise<RepoAnswer>;

/** Locale-pinned so the stderr match below holds on every system. */
const NOT_A_REPOSITORY = "fatal: not a git repository";
const GIT_NOT_A_REPOSITORY_EXIT = 128;
/** One path line; anything larger is not an answer to this question. */
const GIT_MAX_BUFFER = 64 * 1024;
/** Inherited, any of these points every cwd at one repository. */
const SCRUBBED_ENV = ["GIT_DIR", "GIT_WORK_TREE", "GIT_COMMON_DIR", "GIT_INDEX_FILE"] as const;

/**
 * The repository root for an absolute `--git-common-dir`: the parent of a
 * `.git` directory (a normal repository and every linked worktree of it),
 * otherwise the common dir itself (a bare repository, a submodule's
 * `.git/modules/<name>`).
 */
export function repoRootOf(commonDir: string): string {
  const flavour = commonDir.includes("\\") ? path.win32 : path.posix;
  const trimmed = commonDir.replace(/[\\/]+$/, "");
  return flavour.basename(trimmed) === ".git" ? flavour.dirname(trimmed) : trimmed;
}

function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, LC_ALL: "C", LANG: "C" };
  for (const key of SCRUBBED_ENV) {
    delete env[key];
  }
  return env;
}

async function directoryState(cwd: string): Promise<"directory" | "gone" | "unknown"> {
  try {
    return (await stat(cwd)).isDirectory() ? "directory" : "gone";
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return code === "ENOENT" || code === "ENOTDIR" ? "gone" : "unknown";
  }
}

/** One uncached resolution. Never rejects. */
export async function resolveWithGit(cwd: string): Promise<RepoAnswer> {
  const state = await directoryState(cwd);
  if (state === "gone") {
    return { kind: "none" };
  }
  if (state === "unknown") {
    return { kind: "retry" };
  }
  return new Promise((resolve) => {
    execFile(
      "git",
      ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      {
        encoding: "utf8",
        timeout: REPO_RESOLVE_TIMEOUT_MS,
        maxBuffer: GIT_MAX_BUFFER,
        env: gitEnv(),
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error !== null) {
          const definitive =
            error.code === GIT_NOT_A_REPOSITORY_EXIT && stderr.startsWith(NOT_A_REPOSITORY);
          resolve(definitive ? { kind: "none" } : { kind: "retry" });
          return;
        }
        const commonDir = stdout.split("\n")[0]?.trim() ?? "";
        resolve(
          commonDir.length > 0 ? { kind: "repo", root: repoRootOf(commonDir) } : { kind: "retry" },
        );
      },
    );
  });
}

export interface RepoResolverOptions {
  readonly now?: () => number;
  readonly resolve?: ResolveRepo;
}

/**
 * The resolver the service uses: `resolveWithGit` behind an in-memory
 * backoff, so a cwd that answered `retry` is not asked again for
 * `REPO_RETRY_BACKOFF_MS` — a missing or broken git costs one spawn per cwd
 * per window, not one per poll.
 */
export function createRepoResolver(options: RepoResolverOptions = {}): ResolveRepo {
  const now = options.now ?? (() => Date.now());
  const resolve = options.resolve ?? resolveWithGit;
  const retryAfter = new Map<string, number>();
  return async (cwd) => {
    const waitUntil = retryAfter.get(cwd);
    if (waitUntil !== undefined && now() < waitUntil) {
      return { kind: "retry" };
    }
    const answer = await resolve(cwd);
    if (answer.kind === "retry") {
      retryAfter.set(cwd, now() + REPO_RETRY_BACKOFF_MS);
    } else {
      retryAfter.delete(cwd);
    }
    return answer;
  };
}

function referencedCwds(files: Map<string, FileRecord>): string[] {
  const cwds = new Set<string>();
  for (const record of files.values()) {
    for (const contribution of [...record.entries.values(), ...record.totals]) {
      if (contribution.cwd !== null) {
        cwds.add(contribution.cwd);
      }
    }
  }
  return [...cwds].sort();
}

/**
 * The repository map for this pass: every stored answer carried forward
 * untouched (never recomputed — a removed worktree keeps its repository),
 * every new cwd resolved after the file pass with bounded concurrency, and
 * cwds no record references any more dropped. A `retry` answer is left out,
 * so the cwd ships raw and is asked again on a later pass.
 */
export async function resolveRepos(
  files: Map<string, FileRecord>,
  previous: Map<string, string | null>,
  resolveRepo: ResolveRepo,
): Promise<Map<string, string | null>> {
  const cwds = referencedCwds(files);
  const answers = new Map<string, string | null>();
  const pending = cwds.filter((cwd) => {
    const stored = previous.get(cwd);
    if (stored !== undefined) {
      answers.set(cwd, stored);
      return false;
    }
    return true;
  });
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < pending.length) {
      const cwd = pending[next];
      next += 1;
      const answer = await resolveRepo(cwd);
      if (answer.kind === "repo") {
        answers.set(cwd, answer.root);
      } else if (answer.kind === "none") {
        answers.set(cwd, null);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(REPO_RESOLVE_CONCURRENCY, pending.length) }, worker),
  );
  return new Map(cwds.flatMap((cwd) => (answers.has(cwd) ? [[cwd, answers.get(cwd)!]] : [])));
}

export function reposEqual(
  left: Map<string, string | null>,
  right: Map<string, string | null>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const [cwd, root] of left) {
    if (right.get(cwd) !== root || !right.has(cwd)) {
      return false;
    }
  }
  return true;
}
