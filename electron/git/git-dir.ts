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

function locate(start: string): { top: string; gitDir: string } | null {
  let directory = start;
  for (;;) {
    const candidate = path.join(directory, ".git");
    try {
      const info = nodeFs.statSync(candidate);
      if (info.isDirectory()) {
        return { top: directory, gitDir: candidate };
      }
      const pointer = /^gitdir:\s*(.+)\s*$/m.exec(nodeFs.readFileSync(candidate, "utf8"));
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
  try {
    const pointer = nodeFs.readFileSync(path.join(found.gitDir, "commondir"), "utf8").trim();
    if (pointer.length > 0) {
      commonDir = path.resolve(found.gitDir, pointer);
    }
  } catch {
    // Not a linked worktree.
  }
  return { top: found.top, gitDir: found.gitDir, commonDir };
}
