/**
 * Which Changes entry the diff column shows (plan 2026-10-10-diff-column, D4,
 * D7): the selection, and what the list's last reply says about it.
 *
 * The selection is only `root`, `path` and the row that opened it. What the
 * entry is, where it stands (`2/5`) and its neighbours are derived from the
 * controller's `state`, so the column never keeps a second copy of the list.
 * "No longer changed" is derived from a fresh snapshot of the same root and
 * nothing else: a failure reply keeps the old snapshot but proves nothing, and
 * the empty state of a hidden list says nothing about the file.
 */
import { batch, computed, signal, type ReadonlySignal } from "@preact/signals";
import type { ChangeEntry } from "../../host/git-changes-host";
import { changesController, type ChangesState } from "./changes-controller";

export interface DiffSelection {
  readonly root: string;
  /** Root-relative with `/`, as `ChangeEntry.path`. */
  readonly path: string;
  /** The row whose press opened the column; focus returns here on close.
   * Stepping to another file moves `path`, not `origin`. */
  readonly origin: string;
}

interface Neighbours {
  readonly previous: ChangeEntry | null;
  readonly next: ChangeEntry | null;
}

export type DiffView =
  /** No fresh snapshot of the selection's root: nothing to say yet. */
  | { readonly kind: "unknown" }
  | ({
      readonly kind: "entry";
      readonly entry: ChangeEntry;
      /** An unborn branch: the column reads no `HEAD` side. */
      readonly initial: boolean;
      /** 1-based, so the header prints `position/total`. */
      readonly position: number;
      readonly total: number;
    } & Neighbours)
  /** A fresh snapshot of the same root no longer lists the path. */
  | ({ readonly kind: "gone"; readonly total: number } & Neighbours);

const UNKNOWN: DiffView = { kind: "unknown" };

function indexOfPath(state: ChangesState, selection: DiffSelection): number {
  if (state.root !== selection.root || state.snapshot === null) {
    return -1;
  }
  return state.snapshot.entries.findIndex((entry) => entry.path === selection.path);
}

/**
 * `anchor` is the index the path last held; it only places the neighbours of a
 * path that has left the list, so the previous and next arrows keep moving from where the file was.
 */
export function deriveDiffView(
  selection: DiffSelection,
  state: ChangesState,
  anchor: number | null,
): DiffView {
  const snapshot = state.root === selection.root ? state.snapshot : null;
  if (snapshot === null) {
    return UNKNOWN;
  }
  const { entries } = snapshot;
  const index = indexOfPath(state, selection);
  if (index >= 0) {
    return {
      kind: "entry",
      entry: entries[index],
      initial: snapshot.initial,
      position: index + 1,
      total: entries.length,
      previous: entries[index - 1] ?? null,
      next: entries[index + 1] ?? null,
    };
  }
  if (state.failure !== null) {
    // The snapshot is the last good one, not a fresh one.
    return UNKNOWN;
  }
  if (anchor === null) {
    return {
      kind: "gone",
      total: entries.length,
      previous: entries[entries.length - 1] ?? null,
      next: entries[0] ?? null,
    };
  }
  return {
    kind: "gone",
    total: entries.length,
    previous: entries[Math.min(anchor, entries.length) - 1] ?? null,
    next: entries[anchor] ?? null,
  };
}

export interface DiffSelectionStore {
  readonly selection: ReadonlySignal<DiffSelection | null>;
  /** Null while the column is closed. */
  readonly view: ReadonlySignal<DiffView | null>;
  /** Opens the column on a row, or swaps its file; the row becomes the origin. */
  open(root: string, path: string): void;
  /** Closes the column; returns what was open, so the caller can refocus its origin row. */
  close(): DiffSelection | null;
  /** Moves to the neighbouring file; false at an end or while the position is unknown. */
  step(direction: "next" | "previous"): boolean;
  dispose(): void;
}

export function createDiffSelection(source: ReadonlySignal<ChangesState>): DiffSelectionStore {
  const selection = signal<DiffSelection | null>(null);
  const anchor = signal<number | null>(null);

  const track = (): void => {
    const current = selection.peek();
    const index = current === null ? -1 : indexOfPath(source.peek(), current);
    if (index >= 0) {
      anchor.value = index;
    }
  };
  const stopTracking = source.subscribe(track);

  const view = computed<DiffView | null>(() => {
    const current = selection.value;
    return current === null ? null : deriveDiffView(current, source.value, anchor.value);
  });

  return {
    selection,
    view,
    open(root, path) {
      batch(() => {
        selection.value = { root, path, origin: path };
        anchor.value = null;
        track();
      });
    },
    close() {
      const closed = selection.peek();
      batch(() => {
        selection.value = null;
        anchor.value = null;
      });
      return closed;
    },
    step(direction) {
      const current = view.peek();
      const open = selection.peek();
      const target =
        current === null || current.kind === "unknown" || open === null ? null : current[direction];
      if (target === null || open === null) {
        return false;
      }
      batch(() => {
        selection.value = { ...open, path: target.path };
        track();
      });
      return true;
    },
    dispose: stopTracking,
  };
}

let shared: DiffSelectionStore | null = null;

/** The window's one selection, over the shared Changes controller. Window-scoped (R5). */
export function diffSelection(): DiffSelectionStore {
  shared ??= createDiffSelection(changesController().state);
  return shared;
}
