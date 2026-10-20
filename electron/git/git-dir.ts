/**
 * Where a directory's git metadata lives, read from the files git itself
 * leaves: no spawn. Shared by the Changes watch (which git directory to watch)
 * and the ignore classifier (which files its cache must stamp).
 */
import nodeFs from "node:fs";
import path from "node:path";

export interface Checkout {
  /** The directory holding the `.git` entry. */
  readonly top: string;
  /** The git directory that governs `top`; per worktree for a linked one. */
  readonly gitDir: string;
  /** Where `info/exclude` and the shared config live: `gitDir` unless a
   * linked worktree points elsewhere with `commondir`. */
  readonly commonDir: string;
}

// Git pointer files contain one path, not repository data. Bound the actual
// descriptor read so a file growing after fstat cannot allocate without limit.
const MAX_POINTER_BYTES = 32_768;

function readPointer(file: string): string | null {
  const { O_RDONLY, O_NONBLOCK, O_NOFOLLOW } = nodeFs.constants;
  const flags = O_RDONLY | (process.platform === "win32" ? 0 : O_NONBLOCK | O_NOFOLLOW);
  let fd: number | undefined;
  try {
    fd = nodeFs.openSync(file, flags);
    const info = nodeFs.fstatSync(fd);
    if (!info.isFile() || info.size > MAX_POINTER_BYTES) return null;
    const bytes = Buffer.alloc(MAX_POINTER_BYTES + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = nodeFs.readSync(fd, bytes, length, bytes.length - length, length);
      if (count === 0) break;
      length += count;
    }
    return length > MAX_POINTER_BYTES ? null : bytes.toString("utf8", 0, length);
  } catch {
    return null;
  } finally {
    if (fd !== undefined) nodeFs.closeSync(fd);
  }
}

function locate(start: string): { top: string; gitDir: string } | null {
  let directory = start;
  for (;;) {
    const candidate = path.join(directory, ".git");
    try {
      const info = nodeFs.lstatSync(candidate);
      if (info.isDirectory()) {
        return { top: directory, gitDir: candidate };
      }
      if (!info.isFile()) return null;
      const pointer = /^gitdir:\s*(.+)\s*$/m.exec(readPointer(candidate) ?? "");
      if (pointer !== null) {
        return { top: directory, gitDir: path.resolve(directory, pointer[1]) };
      }
      return null;
    } catch {
      // No `.git` here; keep walking up.
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}

/** The git directory that governs `root`: its own `.git`, or the nearest
 * ancestor's, following a linked worktree's `gitdir:` pointer. */
export function findGitDir(root: string): string | null {
  return locate(root)?.gitDir ?? null;
}

/** The nearest checkout at or above `directory`, or null when none is found. */
export function findCheckout(directory: string): Checkout | null {
  const found = locate(directory);
  if (found === null) {
    return null;
  }
  let commonDir = found.gitDir;
  const pointer = readPointer(path.join(found.gitDir, "commondir"))?.trim();
  if (pointer) {
    commonDir = path.resolve(found.gitDir, pointer);
  }
  return { top: found.top, gitDir: found.gitDir, commonDir };
}
