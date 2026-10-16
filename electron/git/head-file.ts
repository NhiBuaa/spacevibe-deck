/**
 * The diff column's `HEAD` side: one file as the last commit holds it
 * (plan 2026-10-10-diff-column, D8).
 *
 * The working side is `read_file`; this is the other half of the comparison.
 * The blob is looked up as `HEAD:./<path>`, relative to the requested root, so a
 * workspace below its repository's top level needs no prefix and a tree lookup
 * never follows a symlink out. Its size is asked first with `cat-file -s` and the
 * bytes are read only under `MAX_EDITABLE_BYTES`, so a large blob is never pulled
 * into the main process to be refused. The bytes then go through the same
 * `readFileContent` verdicts as the working side, which keeps binary, encoding and
 * line-ending handling identical on both sides.
 *
 * Read-only like `changes.ts` (CHG5): `cat-file` with `-s` or `blob` and nothing
 * else — never `--filters` or `--textconv`, which would run a repository's own
 * commands. Never rejects: every failure is a typed reply.
 */
import path from "node:path";
import {
  MAX_EDITABLE_BYTES,
  readFileContent,
  type Eol,
  type FileEncoding,
} from "../../src/files/file-content";
import { resolveRoot } from "../fs/path-guard";
import { failure, runnerFor, type ChangesFailure, type GitBufferRunner } from "./changes";

/** `path-guard.ts` caps a path at this and does not export it; this task keeps
 * that file untouched, so the figure is repeated. */
const MAX_PATH_BYTES = 32_768;

/** What git says when `HEAD` has no such file: a missing path, a path that exists
 * only on disk, and a branch with no commit yet. All three mean "not in `HEAD`". */
const NOT_IN_HEAD =
  /does not exist in 'HEAD'|exists on disk, but not in 'HEAD'|invalid object name 'HEAD'|Not a valid object name HEAD/i;

export type HeadFileReply =
  | {
      readonly kind: "ok";
      readonly content: string;
      readonly eol: Eol;
      readonly encoding: FileEncoding;
      readonly bytes: number;
      readonly mixedEol: boolean;
    }
  | { readonly kind: "too-large"; readonly bytes: number }
  | { readonly kind: "refused"; readonly reason: string }
  | { readonly kind: "absent" }
  | ChangesFailure;

export interface ReadHeadFileDeps {
  readonly run?: GitBufferRunner;
}

function failed(message: string): ChangesFailure {
  return { kind: "failed", message };
}

/** Root-relative with `/`, as `ChangeEntry.path` carries it. Lexical, like the
 * deleted-entry rule in `changes.ts`: the file may no longer exist to resolve. */
function isRootRelative(target: unknown): target is string {
  return (
    typeof target === "string" &&
    target.length > 0 &&
    target.length <= MAX_PATH_BYTES &&
    !target.includes("\0") &&
    !path.posix.isAbsolute(target) &&
    !path.win32.isAbsolute(target) &&
    !target.split(/[\\/]/).includes("..")
  );
}

export async function readHeadFile(
  root: string,
  target: string,
  deps: ReadHeadFileDeps = {},
): Promise<HeadFileReply> {
  try {
    return await read(root, target, deps);
  } catch (error) {
    return failed(error instanceof Error ? error.message : "Could not read the file at HEAD");
  }
}

async function read(root: string, target: string, deps: ReadHeadFileDeps): Promise<HeadFileReply> {
  if (!isRootRelative(target)) {
    return failed("That path is not inside the workspace folder");
  }
  const canonical = resolveRoot(root);
  if (canonical === null) {
    return failed("The workspace folder cannot be read");
  }
  const run = deps.run ?? runnerFor(canonical, "buffer");
  const object = `HEAD:./${target}`;

  const size = await run(["cat-file", "-s", object]);
  if (!size.ok) {
    return size.kind === "failed" && NOT_IN_HEAD.test(size.stderr)
      ? { kind: "absent" }
      : failure(size);
  }
  const declared = Number(size.stdout.toString("utf8").trim());
  if (!Number.isSafeInteger(declared) || declared < 0) {
    return failed("git reported an unreadable size for this file");
  }
  if (declared > MAX_EDITABLE_BYTES) {
    return { kind: "too-large", bytes: declared };
  }

  const blob = await run(["cat-file", "blob", object]);
  if (!blob.ok) {
    return failure(blob);
  }
  // A commit between the two calls can swap the blob for a larger one.
  if (blob.stdout.length > MAX_EDITABLE_BYTES) {
    return { kind: "too-large", bytes: blob.stdout.length };
  }
  const verdict = readFileContent(new Uint8Array(blob.stdout));
  if (verdict.kind === "refused") {
    return { kind: "refused", reason: verdict.reason };
  }
  const { content, eol, encoding, bytes, mixedEol } = verdict.file;
  return { kind: "ok", content, eol, encoding, bytes, mixedEol };
}
