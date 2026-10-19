/**
 * `ignored_paths`: which entries of one directory git's ignore rules cover
 * (spec 2026-10-19-ignore-aware-explorer, IGN19).
 *
 * The renderer names a directory and the entry names it listed there; names are
 * single segments relative to `directory`, so the guard realpaths once per call
 * rather than once per entry and no name can leave the directory. Git runs with
 * the canonical directory as its working directory, so the realpath'd row paths
 * and the root key the renderer holds never meet. A git failure never rejects:
 * it is the `unavailable` reply, and the tree falls back to its fixed list.
 */
import { sharedIgnoreClassifier, type IgnoreClassifier } from "../git/ignore-classifier";
import { assertInsideRoot, resolveRoot } from "./path-guard";

/** Upper bound on one batch: a 10,000-entry directory is normal, more is not. */
export const MAX_IGNORED_NAMES = 10_000;

export class MalformedIgnoredNamesError extends Error {
  constructor(message: string) {
    super(`ignored_paths: ${message}`);
    this.name = "MalformedIgnoredNamesError";
  }
}

export class TooManyIgnoredNamesError extends Error {
  constructor(count: number) {
    super(`ignored_paths: ${count} names exceeds the ${MAX_IGNORED_NAMES} limit.`);
    this.name = "TooManyIgnoredNamesError";
  }
}

export type IgnoredNamesReply =
  | { readonly kind: "classified"; readonly ignored: string[] }
  | { readonly kind: "unavailable"; readonly reason: string };

function isSegment(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    name !== "." &&
    name !== ".." &&
    !name.includes("\0") &&
    !name.includes("/") &&
    !(process.platform === "win32" && name.includes("\\"))
  );
}

export async function ignoredNames(
  root: string,
  directory: string,
  names: readonly string[],
  classifier: IgnoreClassifier = sharedIgnoreClassifier(),
): Promise<IgnoredNamesReply> {
  const canonicalDirectory = assertInsideRoot(root, directory);
  if (!Array.isArray(names)) {
    throw new MalformedIgnoredNamesError("names must be an array of single path segments.");
  }
  if (names.length > MAX_IGNORED_NAMES) {
    throw new TooManyIgnoredNamesError(names.length);
  }
  if (!names.every(isSegment)) {
    throw new MalformedIgnoredNamesError("names must be an array of single path segments.");
  }
  // `assertInsideRoot` already proved the root resolves.
  const canonicalRoot = resolveRoot(root) ?? root;
  const answer = await classifier.classify(canonicalRoot, canonicalDirectory, names);
  if (answer.kind === "unavailable") {
    return answer;
  }
  return { kind: "classified", ignored: [...answer.ignored] };
}
