/**
 * The Changes list's read: what the checkout changed against `HEAD`.
 *
 * One snapshot per call — status, numstat and the untracked files' line counts
 * merged in main — so the renderer never holds two replies that can disagree
 * (plan 2026-10-10-changes-list, C1). Never rejects: every failure is a typed
 * reply the Explorer prints on its status line.
 *
 * Read-only by construction (CHG5). Every spawn carries `--no-optional-locks`:
 * a plain `git status` rewrites `.git/index`, which wakes the very watcher that
 * asked for the read and loops. The only verbs here and in `head-file.ts` are
 * `config` (read only), `ls-files`, `check-attr`, `rev-parse`, `status`, `diff`,
 * `hash-object` without `-w`, and `cat-file` (`-s`, `blob`) for the diff
 * column's `HEAD` side.
 */
import { execFile } from "node:child_process";
import { open, stat } from "node:fs/promises";
import path from "node:path";
import { looksBinary, MAX_EDITABLE_BYTES } from "../../src/files/file-content";
import { resolveInsideRoot, resolveRoot } from "../fs/path-guard";

/** Per git command. Status walks the tree, so a cold cache on a large
 * repository passes `git_branch`'s 4 s; this is `worktree.ts`'s inspect bound. */
export const GIT_TIMEOUT_MS = 10_000;
/** About 100k status records. */
export const GIT_MAX_BUFFER = 16 * 1024 * 1024;
export const MAX_ENTRIES = 500;
export const MAX_UNTRACKED_COUNTED = 200;

export type ChangeStatus = "modified" | "added" | "deleted" | "renamed" | "untracked";

export interface ChangeEntry {
  /** Relative to the requested root, with `/` separators. */
  readonly path: string;
  readonly status: ChangeStatus;
  /** Root-relative old path of a rename, when it lies inside the root. */
  readonly oldPath: string | null;
  readonly added: number;
  readonly removed: number;
  /** A binary file says so instead of counting. */
  readonly binary: boolean;
  /** False for an untracked file git does not count and Deck did not either. */
  readonly counted: boolean;
}

export interface ChangesSnapshot {
  readonly kind: "changes";
  /** Branch name; null when detached. */
  readonly branch: string | null;
  readonly detached: boolean;
  /** Abbreviated commit id, present when detached. */
  readonly oid: string | null;
  /** No commit yet: the comparison is the empty tree. */
  readonly initial: boolean;
  readonly entries: readonly ChangeEntry[];
  /** Entries beyond the cap that are not in `entries`. */
  readonly omitted: number;
  readonly totals: { readonly added: number; readonly removed: number };
}

export type ChangesFailureKind =
  "not-repository" | "git-missing" | "timeout" | "overflow" | "failed";

export interface ChangesFailure {
  readonly kind: ChangesFailureKind;
  readonly message: string;
}

export type ChangesReply = ChangesSnapshot | ChangesFailure;

export type GitRun<Out = string> =
  | { readonly ok: true; readonly stdout: Out }
  | {
      readonly ok: false;
      readonly kind: ChangesFailureKind;
      readonly stderr: string;
      /** The process exit status, when git ran and exited non-zero. */
      readonly exitCode?: number;
    };

/** Injectable so tests reach the timeout, overflow and missing-git paths. */
export type GitRunner<Out = string> = (
  args: readonly string[],
  input?: string,
) => Promise<GitRun<Out>>;

/** The runner in buffer mode: stdout as bytes, for a blob that may not be UTF-8. */
export type GitBufferRunner = GitRunner<Buffer>;

/** What `git rev-parse --local-env-vars` lists. A caller that inherited one of
 * these (a hook, the pre-push suite) would point every spawn at someone else's
 * repository. */
const LOCAL_GIT_ENV = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_COMMON_DIR",
  "GIT_CONFIG",
  "GIT_CONFIG_COUNT",
  "GIT_CONFIG_PARAMETERS",
  "GIT_DIR",
  "GIT_GRAFT_FILE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_OBJECT_DIRECTORY",
  "GIT_PREFIX",
  "GIT_REPLACE_REF_BASE",
  "GIT_SHALLOW_FILE",
  "GIT_WORK_TREE",
];

function cleanEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of LOCAL_GIT_ENV) {
    delete env[name];
  }
  // Errors classify in any locale; nothing may prompt.
  env.LC_ALL = "C";
  env.LANG = "C";
  env.GIT_TERMINAL_PROMPT = "0";
  return env;
}

/** Text mode by default; `"buffer"` keeps stdout as bytes. Same environment,
 * bounds and failure classification either way. */
export function runnerFor(root: string): GitRunner;
export function runnerFor(root: string, mode: "buffer"): GitBufferRunner;
export function runnerFor(root: string, mode?: "buffer"): GitRunner<string | Buffer> {
  const env = cleanEnv();
  const encoding = mode === "buffer" ? "buffer" : "utf8";
  return (args, input) =>
    new Promise((resolve) => {
      const child = execFile(
        "git",
        ["--no-optional-locks", "-c", "core.fsmonitor=false", "-C", root, ...args],
        {
          encoding,
          timeout: GIT_TIMEOUT_MS,
          maxBuffer: GIT_MAX_BUFFER,
          windowsHide: true,
          env,
        },
        (error, stdout, rawStderr) => {
          if (error === null) {
            resolve({ ok: true, stdout });
            return;
          }
          const stderr = rawStderr.toString();
          const code = (error as NodeJS.ErrnoException).code;
          const exitCode = typeof code === "number" ? code : undefined;
          if (code === "ENOENT") {
            resolve({ ok: false, kind: "git-missing", stderr: "" });
          } else if (code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") {
            resolve({ ok: false, kind: "overflow", stderr: "" });
          } else if (error.killed === true) {
            resolve({ ok: false, kind: "timeout", stderr: "" });
          } else if (/not a git repository/i.test(stderr)) {
            resolve({ ok: false, kind: "not-repository", stderr, exitCode });
          } else {
            resolve({ ok: false, kind: "failed", stderr, exitCode });
          }
        },
      );
      // A failed spawn leaves no stdin to end; the callback already reports it.
      child.stdin?.on("error", () => {});
      child.stdin?.end(input ?? "");
    });
}

const MESSAGES: Readonly<Record<Exclude<ChangesFailureKind, "failed">, string>> = {
  "not-repository": "Not a git repository",
  "git-missing": "Git is not installed or not on PATH",
  timeout: `git took longer than ${GIT_TIMEOUT_MS / 1000} s to answer`,
  overflow: "The change list is too large to read",
};

export function failure(run: Extract<GitRun, { ok: false }>): ChangesFailure {
  if (run.kind !== "failed") {
    return { kind: run.kind, message: MESSAGES[run.kind] };
  }
  const first = run.stderr.split("\n").find((line) => line.trim().length > 0);
  return { kind: "failed", message: first?.trim() ?? "git could not read this checkout" };
}

interface StatusRecord {
  readonly status: ChangeStatus;
  /** Top-level-relative, as git prints it. */
  readonly path: string;
  readonly oldPath: string | null;
}

interface StatusHeader {
  oid: string | null;
  head: string | null;
  initial: boolean;
}

function classify(xy: string): ChangeStatus {
  if (xy.includes("D")) {
    return "deleted";
  }
  if (xy.includes("A") || xy.includes("C")) {
    return "added";
  }
  return "modified";
}

/**
 * Total over its input: an unrecognised record costs itself, never the list.
 * `-z` separates records with NUL and puts a rename's old path in the next one.
 */
export function parseStatus(stdout: string): {
  readonly header: StatusHeader;
  readonly records: readonly StatusRecord[];
} {
  const header: StatusHeader = { oid: null, head: null, initial: false };
  const records: StatusRecord[] = [];
  const parts = stdout.split("\0");
  for (let index = 0; index < parts.length; index += 1) {
    const record = parts[index];
    if (record.length === 0) {
      continue;
    }
    if (record.startsWith("# ")) {
      const [key, ...rest] = record.slice(2).split(" ");
      const value = rest.join(" ");
      if (key === "branch.oid") {
        header.initial = value === "(initial)";
        header.oid = header.initial ? null : value;
      } else if (key === "branch.head") {
        header.head = value;
      }
    } else if (record.startsWith("1 ")) {
      const fields = record.split(" ");
      const entryPath = fields.slice(8).join(" ");
      if (fields.length >= 9 && entryPath.length > 0) {
        records.push({ status: classify(fields[1]), path: entryPath, oldPath: null });
      }
    } else if (record.startsWith("2 ")) {
      const fields = record.split(" ");
      const entryPath = fields.slice(9).join(" ");
      // The old path is its own NUL-terminated record, consumed either way.
      const oldPath = parts[index + 1] ?? "";
      index += 1;
      if (fields.length >= 10 && entryPath.length > 0) {
        const copy = fields[8].startsWith("C");
        records.push({
          status: copy ? "added" : "renamed",
          path: entryPath,
          oldPath: copy || oldPath.length === 0 ? null : oldPath,
        });
      }
    } else if (record.startsWith("u ")) {
      const fields = record.split(" ");
      const entryPath = fields.slice(10).join(" ");
      if (fields.length >= 11 && entryPath.length > 0) {
        records.push({ status: "modified", path: entryPath, oldPath: null });
      }
    } else if (record.startsWith("? ")) {
      records.push({ status: "untracked", path: record.slice(2), oldPath: null });
    }
    // `! ` (ignored) and anything unknown: skipped.
  }
  return { header, records };
}

interface Numstat {
  readonly added: number;
  readonly removed: number;
  readonly binary: boolean;
}

/** `-z` numstat: `A\tR\tpath\0`, or `A\tR\t\0old\0new\0` for a rename. Keyed by
 * the new path. */
export function parseNumstat(stdout: string): ReadonlyMap<string, Numstat> {
  const map = new Map<string, Numstat>();
  const parts = stdout.split("\0");
  for (let index = 0; index < parts.length; index += 1) {
    const match = /^(\d+|-)\t(\d+|-)\t(.*)$/s.exec(parts[index]);
    if (match === null) {
      continue;
    }
    const binary = match[1] === "-";
    let target = match[3];
    if (target.length === 0) {
      target = parts[index + 2] ?? "";
      index += 2;
    }
    if (target.length > 0) {
      map.set(target, {
        added: binary ? 0 : Number(match[1]),
        removed: binary ? 0 : Number(match[2]),
        binary,
      });
    }
  }
  return map;
}

/** Lines in `bytes`, counting an unterminated last line. */
export function countLines(bytes: Uint8Array): number {
  if (bytes.length === 0) {
    return 0;
  }
  let lines = 0;
  for (const byte of bytes) {
    if (byte === 0x0a) {
      lines += 1;
    }
  }
  return bytes[bytes.length - 1] === 0x0a ? lines : lines + 1;
}

type UntrackedCount =
  | { readonly kind: "counted"; readonly lines: number }
  | { readonly kind: "binary" }
  | { readonly kind: "uncounted" };

async function countUntracked(file: string): Promise<UntrackedCount> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > MAX_EDITABLE_BYTES) {
      return { kind: "uncounted" };
    }
    const handle = await open(file, "r");
    try {
      const bytes = new Uint8Array(info.size);
      const { bytesRead } = await handle.read(bytes, 0, info.size, 0);
      const read = bytes.subarray(0, bytesRead);
      return looksBinary(read) ? { kind: "binary" } : { kind: "counted", lines: countLines(read) };
    } finally {
      await handle.close();
    }
  } catch {
    return { kind: "uncounted" };
  }
}

function insideRoot(prefix: string, topLevelPath: string): string | null {
  return topLevelPath.startsWith(prefix) ? topLevelPath.slice(prefix.length) : null;
}

export interface ReadChangesDeps {
  readonly run?: GitRunner;
}

export async function readChanges(root: string, deps: ReadChangesDeps = {}): Promise<ChangesReply> {
  try {
    return await read(root, deps);
  } catch (error) {
    return {
      kind: "failed",
      message: error instanceof Error ? error.message : "Could not read the changes",
    };
  }
}

async function read(root: string, deps: ReadChangesDeps): Promise<ChangesReply> {
  const canonical = resolveRoot(root);
  if (canonical === null) {
    return { kind: "failed", message: "The workspace folder cannot be read" };
  }
  const run = deps.run ?? runnerFor(canonical);

  const probe = await run(["rev-parse", "--show-toplevel", "--absolute-git-dir", "--show-prefix"]);
  if (!probe.ok) {
    return failure(probe);
  }
  // Three lines; the prefix is empty at the top level, so keep the blank one.
  const prefix = (probe.stdout.split("\n")[2] ?? "").trim();

  // Status/diff can run clean/process filters even with --no-ext-diff and
  // --no-textconv. Refuse rather than show misleading raw-byte changes (LFS,
  // for example). Read includes and keep the final value of each setting.
  // This preflight is not a sandbox against concurrent config/attribute mutation.
  const filters = await run([
    "config",
    "--includes",
    "--null",
    "--get-regexp",
    "^filter\\..*\\.(clean|process)$",
  ]);
  if (!filters.ok && filters.exitCode !== 1) {
    return failure(filters);
  }
  if (filters.ok) {
    const effective = new Map<string, string>();
    for (const entry of filters.stdout.split("\0")) {
      const separator = entry.indexOf("\n");
      if (separator >= 0) {
        effective.set(entry.slice(0, separator), entry.slice(separator + 1));
      }
    }
    const executable = new Set(
      [...effective]
        .filter(([, value]) => value.trim().length > 0)
        .map(([key]) => key.slice(7, key.lastIndexOf("."))),
    );
    if (executable.size > 0) {
      // Status refreshes the entire index, including paths above a workspace
      // subfolder. Relative names from ls-files also work with check-attr.
      const tracked = await run(["ls-files", "-z", "--cached", "--", ":/"]);
      if (!tracked.ok) return failure(tracked);
      const attributes = await run(["check-attr", "-z", "--stdin", "filter"], tracked.stdout);
      if (!attributes.ok) return failure(attributes);
      const values = attributes.stdout.split("\0");
      for (let index = 2; index < values.length; index += 3) {
        if (executable.has(values[index])) {
          return {
            kind: "failed",
            message:
              "Changes cannot be read safely because tracked files use executable Git filters.",
          };
        }
      }
    }
  }

  const status = await run([
    "status",
    "--porcelain=v2",
    "-z",
    "--branch",
    "--untracked-files=all",
    "--ignore-submodules=dirty",
    "--",
    ".",
  ]);
  if (!status.ok) {
    return failure(status);
  }
  const { header, records } = parseStatus(status.stdout);

  let base = "HEAD";
  if (header.initial) {
    const tree = await run(["hash-object", "-t", "tree", "--stdin"], "");
    if (!tree.ok) {
      return failure(tree);
    }
    base = tree.stdout.trim();
  }
  const numstat = await run([
    "diff",
    "--numstat",
    "-z",
    "--no-ext-diff",
    "--no-textconv",
    "--no-color",
    "--ignore-submodules=dirty",
    base,
    "--",
    ".",
  ]);
  if (!numstat.ok) {
    return failure(numstat);
  }
  const counts = parseNumstat(numstat.stdout);

  let totalAdded = 0;
  let totalRemoved = 0;
  for (const value of counts.values()) {
    totalAdded += value.added;
    totalRemoved += value.removed;
  }

  const entries: ChangeEntry[] = [];
  let untrackedCounted = 0;
  let consumed = 0;
  for (const record of records) {
    if (entries.length >= MAX_ENTRIES) {
      break;
    }
    consumed += 1;
    const relative = insideRoot(prefix, record.path);
    if (relative === null) {
      continue;
    }
    // A deleted file no longer exists, which `resolveInsideRoot` refuses; its
    // containment is lexical. Everything else must resolve inside the root.
    const absolute = path.join(canonical, relative);
    if (record.status === "deleted") {
      if (relative.split("/").includes("..")) {
        continue;
      }
    } else if (resolveInsideRoot(canonical, absolute) === null) {
      continue;
    }
    const oldRelative = record.oldPath === null ? null : insideRoot(prefix, record.oldPath);

    let added = 0;
    let removed = 0;
    let binary = false;
    let counted = true;
    if (record.status === "untracked") {
      if (untrackedCounted >= MAX_UNTRACKED_COUNTED) {
        counted = false;
      } else {
        untrackedCounted += 1;
        const result = await countUntracked(absolute);
        if (result.kind === "counted") {
          added = result.lines;
          totalAdded += result.lines;
        } else if (result.kind === "binary") {
          binary = true;
        } else {
          counted = false;
        }
      }
    } else {
      const known = counts.get(record.path);
      if (known === undefined) {
        counted = false;
      } else {
        ({ added, removed, binary } = known);
      }
    }
    entries.push({
      path: relative,
      status: record.status,
      oldPath: oldRelative,
      added,
      removed,
      binary,
      counted,
    });
  }

  const detached = header.head === "(detached)";
  return {
    kind: "changes",
    branch: detached || header.head === null ? null : header.head,
    detached,
    oid: detached && header.oid !== null ? header.oid.slice(0, 7) : null,
    initial: header.initial,
    entries,
    omitted: records.length - consumed,
    totals: { added: totalAdded, removed: totalRemoved },
  };
}
