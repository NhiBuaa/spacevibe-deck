/**
 * Fake data for the diff column's gallery frames (plan 2026-10-10-diff-column,
 * Task 4).
 *
 * One checkout of five entries and the file text each frame diffs. The text is
 * real TypeScript and a few lines of Markdown, so the eye can judge syntax colour
 * on top of the wash. Counts are computed from the text, not typed, so a header
 * never claims a number its own diff contradicts. Never imported by shipping
 * code (R7).
 */
import type { ChangeEntry, ChangesSnapshot } from "../../host/git-changes-host";

const SELECTION_BEFORE = `/**
 * The diff column's selection: which changed file is open (spec DIFF1).
 *
 * Window-scoped like every module store here (R5), so a second window keeps
 * its own column and nothing is shared across them.
 */
import { signal } from "@preact/signals";
import type { ChangeEntry } from "../../host/git-changes-host";

export interface DiffSelection {
  readonly root: string;
  readonly path: string;
}

export const diffSelection = signal<DiffSelection | null>(null);

export function openDiff(root: string, path: string): void {
  diffSelection.value = { root, path };
}

export function closeDiff(): void {
  diffSelection.value = null;
}

/**
 * Whether the selected file is still in the list. A failed read keeps the last
 * snapshot, so only a fresh list can say the file left it.
 */
export function stillChanged(
  selection: DiffSelection,
  entries: readonly ChangeEntry[],
): boolean {
  return entries.some((entry) => entry.path === selection.path);
}

/** True when the entry lies outside the selection's root. */
export function isOutside(selection: DiffSelection, entry: ChangeEntry): boolean {
  return entry.path.startsWith("../") || entry.path.startsWith(selection.root);
}

/** The entry after or before the selected one, wrapping at the ends. */
export function neighbour(
  entries: readonly ChangeEntry[],
  path: string,
  step: 1 | -1,
): ChangeEntry | null {
  const index = entries.findIndex((entry) => entry.path === path);
  if (index === -1 || entries.length === 0) {
    return null;
  }
  return entries[(index + step + entries.length) % entries.length] ?? null;
}
`;

const SELECTION_AFTER = `/**
 * The diff column's selection: which changed file is open (spec DIFF1).
 *
 * Window-scoped like every module store here (R5), so a second window keeps
 * its own column and nothing is shared across them.
 */
import { signal } from "@preact/signals";
import type { ChangeEntry } from "../../host/git-changes-host";

export interface DiffSelection {
  readonly root: string;
  readonly path: string;
  /** The list row to hand focus back to when the column closes (DIFF1). */
  readonly returnTo: string | null;
}

export const diffSelection = signal<DiffSelection | null>(null);

export function openDiff(root: string, path: string, returnTo: string | null = path): void {
  diffSelection.value = { root, path, returnTo };
}

export function closeDiff(): void {
  diffSelection.value = null;
}

/** The selected file's place in the list ("2/5"), or null once it left it. */
export function position(entries: readonly ChangeEntry[], path: string): string | null {
  const index = entries.findIndex((entry) => entry.path === path);
  return index === -1 ? null : \`\${index + 1}/\${entries.length}\`;
}

/**
 * Whether the selected file is still in the list. A failed read keeps the last
 * snapshot, so only a fresh list can say the file left it.
 */
export function stillChanged(
  selection: DiffSelection,
  entries: readonly ChangeEntry[],
): boolean {
  return entries.some((entry) => entry.path === selection.path);
}

/** True when the entry lies outside the selection's root. */
export function isOutside(selection: DiffSelection, entry: ChangeEntry): boolean {
  return entry.path.startsWith("../") || entry.path.startsWith(selection.root);
}

/** The entry after or before the selected one; the ends stop (D5). */
export function neighbour(
  entries: readonly ChangeEntry[],
  path: string,
  step: 1 | -1,
): ChangeEntry | null {
  const index = entries.findIndex((entry) => entry.path === path);
  if (index === -1) {
    return null;
  }
  return entries[index + step] ?? null;
}
`;

const LAYOUT_AFTER = `/**
 * Where the diff column stands for a given window (D2).
 *
 * Pure: the column's width is half the space left of the dock, so the grid
 * always keeps the other half. Under MIN_DOCKED_COLUMN it folds over the
 * Explorer and the grid keeps its width.
 */
export const MIN_DOCKED_COLUMN = 400;
export const MAX_DOCKED_COLUMN = 960;

export type DiffColumnLayout =
  | { readonly kind: "docked"; readonly width: number }
  | { readonly kind: "folded" };

export function diffColumnLayout(stageWidth: number, dockWidth: number): DiffColumnLayout {
  const half = Math.floor((stageWidth - dockWidth) / 2);
  if (half < MIN_DOCKED_COLUMN) {
    return { kind: "folded" };
  }
  return { kind: "docked", width: Math.min(half, MAX_DOCKED_COLUMN) };
}
`;

const GATE_BEFORE = `#!/usr/bin/env node
// Retired by the pre-push hook: it ran the whole suite before every push.
import { execFileSync } from "node:child_process";

const STEPS = [
  ["npx", ["oxlint", "--quiet"]],
  ["npx", ["prettier", "--check", "."]],
  ["npm", ["test"]],
];

for (const [command, args] of STEPS) {
  console.log(\`> \${command} \${args.join(" ")}\`);
  try {
    execFileSync(command, args, { stdio: "inherit" });
  } catch {
    console.error("gate failed");
    process.exit(1);
  }
}
`;

const DOC_BEFORE = `# File surface

The Explorer lists the folder it is rooted at and opens a file beside the list.

## Changes list

The list reads \`git status\` and \`git diff --numstat\`, bounded to ten seconds and
sixteen MiB. Nothing it runs writes to the repository.

Pressing a row opens the working copy of the file.
`;

const DOC_AFTER = `# File surface

The Explorer lists the folder it is rooted at and opens a file beside the list.

## Changes list

The list reads \`git status\`, \`git diff --numstat\` and, for the diff column,
\`git cat-file\`, bounded to ten seconds and sixteen MiB. Nothing it runs writes
to the repository.

Pressing a row opens that file's diff against \`HEAD\`.
`;

/** One file's two sides. `null` is an empty side (added, deleted). */
export interface SidePair {
  readonly original: string | null;
  readonly modified: string | null;
}

export const SIDES = {
  selection: { original: SELECTION_BEFORE, modified: SELECTION_AFTER },
  layout: { original: null, modified: LAYOUT_AFTER },
  gate: { original: GATE_BEFORE, modified: null },
  doc: { original: DOC_BEFORE, modified: DOC_AFTER },
} as const satisfies Record<string, SidePair>;

/** Added and removed line counts by longest common subsequence — what git's numstat prints. */
function lineCounts(side: SidePair): { added: number; removed: number } {
  const before = side.original === null ? [] : side.original.trimEnd().split("\n");
  const after = side.modified === null ? [] : side.modified.trimEnd().split("\n");
  const table = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0),
  );
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      table[i][j] =
        before[i] === after[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const common = table[0][0];
  return { added: after.length - common, removed: before.length - common };
}

const entry = (over: Partial<ChangeEntry> & Pick<ChangeEntry, "path">): ChangeEntry => ({
  status: "modified",
  oldPath: null,
  added: 0,
  removed: 0,
  binary: false,
  counted: true,
  ...over,
});

const withCounts = (side: SidePair, over: Partial<ChangeEntry> & Pick<ChangeEntry, "path">) =>
  entry({ ...lineCounts(side), ...over });

export const SELECTION_PATH = "src/files/changes/diff-selection.ts";

/** The checkout of the plan: modified x2, added, deleted, renamed. */
export const ENTRIES: readonly ChangeEntry[] = [
  entry({ path: "src/files/ui/changes-list.tsx", added: 18, removed: 6 }),
  withCounts(SIDES.selection, { path: SELECTION_PATH }),
  withCounts(SIDES.layout, { path: "src/files/changes/diff-layout.ts", status: "added" }),
  withCounts(SIDES.doc, {
    path: "docs/internals/file-surface.md",
    status: "renamed",
    oldPath: "docs/internals/file-surface-old.md",
  }),
  withCounts(SIDES.gate, { path: "scripts/old-gate.mjs", status: "deleted" }),
];

/** Entries that exist only for the DIFF4 strip. */
export const BINARY_ENTRY = entry({ path: "public/brand/mark.png", binary: true });
export const LARGE_ENTRY = entry({
  path: "data/leaderboard-snapshot.json",
  added: 4096,
  removed: 4090,
});

export const SNAPSHOT: ChangesSnapshot = {
  kind: "changes",
  branch: "feat/diff-column",
  detached: false,
  oid: null,
  initial: false,
  entries: ENTRIES,
  omitted: 0,
  totals: {
    added: ENTRIES.reduce((sum, item) => sum + item.added, 0),
    removed: ENTRIES.reduce((sum, item) => sum + item.removed, 0),
  },
};
