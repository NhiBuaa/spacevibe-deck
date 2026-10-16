/**
 * Where focus stands relative to the diff column, and how it leaves
 * (plan 2026-10-10-diff-column, D4, D13).
 *
 * The column marks its root with `DIFF_COLUMN_ATTR`; everything that needs to
 * know "is focus in the column" asks the DOM, synchronously. Monaco's own focus
 * tracker lags a macrotask behind, which `FileEditor` documents.
 */
import { signal } from "@preact/signals";
import { diffSelection, type DiffSelectionStore } from "./diff-selection";

/** The attribute on the column's root element. */
export const DIFF_COLUMN_ATTR = "data-diff-column";

/** Whether `document.activeElement` is the column or anything inside it. */
export function focusInDiffColumn(): boolean {
  const active = document.activeElement;
  return active !== null && active.closest(`[${DIFF_COLUMN_ATTR}]`) !== null;
}

/**
 * Set when a press asks the column to take focus; the column clears it once it
 * has answered. Answered once, so a remount nobody pressed for (the dock
 * coming back) does not take focus from a pane.
 */
export const diffFocusRequested = signal(false);

export function requestDiffFocus(): void {
  diffFocusRequested.value = true;
}

/** The Changes row for a path. Compared by `dataset`, not by a selector, so a
 * path needs no escaping. */
function rowFor(path: string): HTMLElement | null {
  for (const row of document.querySelectorAll<HTMLElement>(".changes-row")) {
    if (row.dataset.path === path) {
      return row;
    }
  }
  return null;
}

/**
 * Closes the column and returns focus to the row of the file it was showing,
 * else the row that opened it, when either is still on screen. Focus only moves
 * when it was inside the column: a close triggered from elsewhere (the Files
 * chip, the dock) must not steal it.
 */
export function closeDiffColumn(store: DiffSelectionStore = diffSelection()): void {
  const hadFocus = focusInDiffColumn();
  const closed = store.close();
  if (hadFocus && closed !== null) {
    (rowFor(closed.path) ?? rowFor(closed.origin))?.focus();
  }
}
