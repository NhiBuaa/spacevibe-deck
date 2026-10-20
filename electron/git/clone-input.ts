/**
 * Main-side validation of a clone request. The renderer already checked the same
 * things for its own feedback, but it is not the trust boundary: every field is
 * re-checked here before a path is built or a process spawned.
 */
import path from "node:path";
import type { CloneStartRequest } from "../../src/lib/clone-contract";
import { parseGithubRepository, type GithubRepository } from "../../src/lib/github-repository";

const MAX_NAME_BYTES = 255;
const MAX_PATH_CHARS = 4096;
// eslint-disable-next-line no-control-regex -- control characters are exactly what is rejected
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const WINDOWS_FORBIDDEN = /[<>:"|?*]/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

export interface ValidatedClone {
  readonly remoteUrl: string;
  /** The parent as the user chose it, normalised; the folder is created inside it. */
  readonly parent: string;
  readonly name: string;
  /** `parent/name`: the one path git writes to. */
  readonly destination: string;
}

/** A single, plain path segment the user may create inside a folder. */
export function isSafeFolderName(name: unknown, platform: NodeJS.Platform): name is string {
  if (typeof name !== "string" || name === "" || name !== name.trim()) {
    return false;
  }
  if (name === "." || name === ".." || name.startsWith(".")) {
    return false;
  }
  if (name.includes("/") || name.includes("\\") || CONTROL_CHARS.test(name)) {
    return false;
  }
  if (Buffer.byteLength(name) > MAX_NAME_BYTES) {
    return false;
  }
  if (platform === "win32") {
    return !WINDOWS_FORBIDDEN.test(name) && !name.endsWith(".") && !WINDOWS_RESERVED.test(name);
  }
  return true;
}

export function validateCloneRequest(
  request: CloneStartRequest,
  platform: NodeJS.Platform,
  parseRepository: (input: string) => GithubRepository | null = parseGithubRepository,
): ValidatedClone | null {
  const { requestId, repository, parent, name } = request;
  if (typeof requestId !== "string" || requestId === "" || typeof repository !== "string") {
    return null;
  }
  const remote = parseRepository(repository);
  if (remote === null || remote.remoteUrl.startsWith("-")) {
    return null;
  }
  if (
    typeof parent !== "string" ||
    parent.length > MAX_PATH_CHARS ||
    CONTROL_CHARS.test(parent) ||
    !path.isAbsolute(parent) ||
    !isSafeFolderName(name, platform)
  ) {
    return null;
  }
  const normalisedParent = path.resolve(parent);
  return {
    remoteUrl: remote.remoteUrl,
    parent: normalisedParent,
    name,
    destination: path.join(normalisedParent, name),
  };
}
