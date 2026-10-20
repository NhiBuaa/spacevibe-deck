import fs from "node:fs/promises";
import path from "node:path";
import { resolveRoot } from "./path-guard";

/** Only OS-backed existing folders and regular files can supply a workspace. */
export async function droppedWorkspaceRoot(target: unknown): Promise<string | null> {
  if (typeof target !== "string") return null;
  const canonical = resolveRoot(target);
  if (canonical === null) return null;
  const entry = await fs.stat(canonical).catch(() => null);
  if (entry?.isDirectory()) return canonical;
  if (!entry?.isFile()) return null;
  // Use the dropped file's containing directory, including when the file is a symlink.
  return resolveRoot(path.dirname(target));
}
