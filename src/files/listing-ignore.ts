/**
 * Asks the host which of a listing's entries git ignores (IGN10, IGN11, IGN15).
 *
 * The tree must not hang on git: the answer is raced against a short budget,
 * and a listing that outruns it is shown with the verdict it already had. The
 * late answer is handed to a callback, which the controller applies only while
 * that listing is still the current one.
 *
 * A verdict is a set of ignored names, `null` when git gave no answer (the tree
 * then uses its fixed list), or `undefined` while an answer is still in flight.
 * A failed query is never an error the user sees.
 */
import type { FileClient } from "./file-client";
import type { DirEntry } from "./file-tree";

/** How long a listing waits for git before it shows with the previous verdict. */
export const LISTING_IGNORE_BUDGET_MS = 300;

/** The host rejects a batch past this many names, so the tree does not send one. */
export const LISTING_IGNORE_NAME_CAP = 10_000;

/** The verdict for one listing. See the module comment for the three values. */
export type ListingVerdict = ReadonlySet<string> | null | undefined;

/** `.git` is never shown, so it is never asked about. */
const NEVER_ASKED = ".git";

async function query(
  client: FileClient,
  root: string,
  directory: string,
  names: readonly string[],
): Promise<ReadonlySet<string> | null> {
  if (client.ignoredNames === undefined) {
    return null;
  }
  try {
    const reply = await client.ignoredNames(root, directory, names);
    return reply.kind === "classified" ? new Set(reply.ignored) : null;
  } catch (error: unknown) {
    console.debug(`Deck: no ignore verdict for ${directory}`, error);
    return null;
  }
}

/**
 * Resolve one listing's verdict within the budget. A verdict that arrives later
 * goes to `onLate`, and this call resolves `undefined` ("keep what you had").
 */
export async function listingVerdict(
  client: FileClient,
  root: string,
  directory: string,
  entries: readonly DirEntry[],
  onLate: (verdict: ReadonlySet<string> | null) => void,
): Promise<ListingVerdict> {
  const names = entries.map((entry) => entry.name).filter((name) => name !== NEVER_ASKED);
  if (client.ignoredNames === undefined || names.length > LISTING_IGNORE_NAME_CAP) {
    return null;
  }
  if (names.length === 0) {
    return new Set();
  }
  const answer = query(client, root, directory, names);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budget = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), LISTING_IGNORE_BUDGET_MS);
  });
  const first = await Promise.race([answer, budget]);
  clearTimeout(timer);
  if (first === undefined) {
    void answer.then(onLate);
  }
  return first;
}
