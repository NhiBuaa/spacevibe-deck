/**
 * The tree model (plan T4): what a directory listing looks like once sorted,
 * filtered and flattened for a virtualized list.
 *
 * Pure — no host, no DOM, no Monaco. Nothing here knows what renders it, which
 * is what lets Phase 1 survive an editor-engine change (plan §0.3).
 */

export interface DirEntry {
  /**
   * Leaf name as the filesystem reports it. Real casing, never lowercased:
   * DL-4.1's lowercase rule governs chrome labels the app authors, and a file
   * name is data the app reports.
   */
  readonly name: string;
  /** Absolute path, already canonicalized by the host's path guard. */
  readonly path: string;
  readonly directory: boolean;
  /**
   * A symlink whose target resolves outside the workspace root. It renders as
   * a leaf and does not open (spec §3.1) — the host answers this, because only
   * the host can `realpath`.
   */
  readonly outOfRoot: boolean;
}

/** Never shown, under any toggle: `.git` is huge and meaningless in an editor. */
export const ALWAYS_HIDDEN: ReadonlySet<string> = new Set([".git"]);

/**
 * What counts as ignored in a listing git gave no verdict for (not a
 * repository, git missing, a timeout, a host without the channel). Where git
 * does answer, its verdict replaces this list entirely, so a tracked `dist/`
 * is shown.
 */
export const FALLBACK_IGNORED: ReadonlySet<string> = new Set(["node_modules", "dist", "target"]);

/** Dot-entries, revealed by the "show hidden" toggle and nothing else. */
export function isHidden(name: string): boolean {
  return name.startsWith(".");
}

/**
 * Git's verdicts, per directory path: the entry names it ignores. A directory
 * with no verdict is one git gave no answer for, and uses `FALLBACK_IGNORED`.
 */
export type IgnoreVerdicts = ReadonlyMap<string, ReadonlySet<string>>;

/** How one directory's entries are filtered by the ignore toggle. */
export interface IgnoreFilter {
  /** Git's verdict for the directory, or undefined for the fallback list. */
  readonly ignored: ReadonlySet<string> | undefined;
  readonly showIgnored: boolean;
}

/** No verdict and the toggle off: the fixed-list behaviour. */
export const FALLBACK_FILTER: IgnoreFilter = { ignored: undefined, showIgnored: false };

/** Whether `name` is ignored under `verdict`, or under the fallback without one. */
export function isIgnoredName(name: string, verdict: ReadonlySet<string> | undefined): boolean {
  return verdict === undefined ? FALLBACK_IGNORED.has(name) : verdict.has(name);
}

/**
 * Whether an entry survives the filters. Each applies on its own (IGN12): an
 * ignored `.env.local` needs both toggles. `ALWAYS_HIDDEN` wins over both.
 */
export function isVisible(
  entry: DirEntry,
  showHidden: boolean,
  ignore: IgnoreFilter = FALLBACK_FILTER,
): boolean {
  if (ALWAYS_HIDDEN.has(entry.name)) {
    return false;
  }
  if (!showHidden && isHidden(entry.name)) {
    return false;
  }
  return ignore.showIgnored || !isIgnoredName(entry.name, ignore.ignored);
}

/**
 * Directories first, then files, each alphabetical case-insensitive.
 *
 * `localeCompare` with `sensitivity: "base"` puts `README` next to `readme`
 * instead of in a separate ASCII block, which is what "case-insensitive"
 * actually means to someone scanning the column.
 *
 * The tie-break is a plain code-unit compare, NOT a second `localeCompare`:
 * which case ICU ranks first varies by ICU version, so a locale-aware
 * tie-break would make the row order depend on the Node build. Code units are
 * arbitrary but identical everywhere, which is what a total, stable order
 * needs to be.
 */
export function sortEntries(entries: readonly DirEntry[]): DirEntry[] {
  return [...entries].sort((a, b) => {
    if (a.directory !== b.directory) {
      return a.directory ? -1 : 1;
    }
    const insensitive = a.name.localeCompare(b.name, undefined, {
      sensitivity: "base",
    });
    if (insensitive !== 0) {
      return insensitive;
    }
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
  });
}

/** Sorted, filtered listing of one directory. */
export function visibleEntries(
  entries: readonly DirEntry[],
  showHidden: boolean,
  ignore: IgnoreFilter = FALLBACK_FILTER,
): DirEntry[] {
  return sortEntries(entries.filter((entry) => isVisible(entry, showHidden, ignore)));
}

/** A directory the user may walk into. A symlink out of the root is a leaf. */
export function canExpand(entry: DirEntry): boolean {
  return entry.directory && !entry.outOfRoot;
}

/** One rendered row. `depth` is the indent level, 0 for a root child. */
export interface TreeRow {
  readonly path: string;
  readonly name: string;
  readonly directory: boolean;
  readonly depth: number;
  readonly expanded: boolean;
  readonly outOfRoot: boolean;
  /** Ignored by git (or the fallback list) and shown because the toggle is on. */
  readonly ignored: boolean;
}

/** Listings the panel has loaded, keyed by directory path. */
export type Listings = ReadonlyMap<string, readonly DirEntry[]>;

/**
 * Last segment of an absolute path, honouring both separators — the root row's
 * name. Not `baseName` from `src/lib/path-name.ts`: this module is the tree
 * MODEL and imports nothing, which is what keeps it assertable with no host.
 */
function rootName(root: string): string {
  const cut = Math.max(root.lastIndexOf("/"), root.lastIndexOf("\\"));
  return cut === -1 || cut === root.length - 1 ? root : root.slice(cut + 1);
}

/** What the ignore toggle needs to filter every listing. */
export interface IgnoreView {
  readonly verdicts: IgnoreVerdicts;
  readonly showIgnored: boolean;
}

/**
 * The flat row list a virtual list renders: a depth-first walk that descends
 * only into expanded directories whose listing has already arrived.
 *
 * An expanded directory with no listing yet contributes its own row and no
 * children — loading is the caller's job, and a tree that reordered itself when
 * a listing landed would move rows under the pointer.
 */
export function flattenTree(
  root: string,
  listings: Listings,
  expanded: ReadonlySet<string>,
  showHidden: boolean,
  // The root's own expansion (design §3.3). It CANNOT be folded into
  // `expanded`, which already means "this child directory is open" — an empty
  // set is a fully collapsed tree whose root is still open, and there is no
  // spelling of that set which says "the root is shut".
  rootExpanded: boolean,
  // Without it every listing uses the fallback list and the toggle is off.
  ignoreView?: IgnoreView,
): TreeRow[] {
  const rows: TreeRow[] = [];
  // A directory is walked at most once. A symlink cycle wholly inside the root
  // would otherwise loop forever, and the out-of-root guard cannot catch it:
  // both ends of that link are legal paths.
  const walked = new Set<string>();
  const walk = (directory: string, depth: number): void => {
    if (walked.has(directory)) {
      return;
    }
    walked.add(directory);
    const verdict = ignoreView?.verdicts.get(directory);
    const filter: IgnoreFilter = {
      ignored: verdict,
      showIgnored: ignoreView?.showIgnored ?? false,
    };
    for (const entry of visibleEntries(listings.get(directory) ?? [], showHidden, filter)) {
      const open = canExpand(entry) && expanded.has(entry.path);
      rows.push({
        path: entry.path,
        name: entry.name,
        directory: entry.directory,
        depth,
        expanded: open,
        outOfRoot: entry.outOfRoot,
        ignored: isIgnoredName(entry.name, verdict),
      });
      if (open) {
        walk(entry.path, depth + 1);
      }
    }
  };
  // Design §3.1: the root is a TreeRow like any other, never separate DOM above
  // the scroller — the spacer height, the window, the roving tabindex,
  // `scrollIntoView` and every arrow key are all index arithmetic over THIS
  // array, and a row outside it makes all five disagree with the screen.
  rows.push({
    path: root,
    name: rootName(root),
    directory: true,
    depth: 0,
    expanded: rootExpanded,
    outOfRoot: false,
    ignored: false,
  });
  if (rootExpanded) {
    walk(root, 1);
  }
  return rows;
}

/** Toggle one directory's expansion, returning a new set. */
export function toggleExpanded(expanded: ReadonlySet<string>, path: string): Set<string> {
  const next = new Set(expanded);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  return next;
}

/**
 * Directories whose contents are on screen: the root plus every expanded
 * directory that is itself reachable.
 *
 * This is exactly the watch scope (spec §5) and exactly the set of listings
 * worth loading — one answer, so the two can never disagree about which
 * directories matter.
 */
export function openDirectories(rows: readonly TreeRow[], root: string): string[] {
  // Deduplicated since the root became a row: an expanded root row carries
  // `expanded: true`, so the naive concatenation named the root twice — a
  // duplicated `list_dir` on every Refresh and a duplicate in the watch set.
  return [...new Set([root, ...rows.filter((row) => row.expanded).map((row) => row.path)])];
}
