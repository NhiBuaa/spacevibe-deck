/**
 * Where the diff column stands (plan 2026-10-10-diff-column, D2): docked left of
 * the dock, or folded over it. Pure, so the table is a test.
 *
 * Docked takes half the stage's room beside the dock, so the grid keeps the
 * other half; at two panes of the default font that leaves about 25 columns
 * each, above opencode's 20-column wedge. Below the minimum the column lies
 * over the Explorer and the grid keeps its width. Every width change resizes
 * each pane's PTY, so nothing here is animated or dragged.
 */

import { signal } from "@preact/signals";

/** Narrowest docked column, and the room below which it folds. */
export const MIN_DOCKED_WIDTH = 400;
/** Widest docked column; past this a diff gains nothing but blank space. */
export const MAX_DOCKED_WIDTH = 960;

export type DiffColumnLayout =
  | { readonly kind: "docked"; readonly width: number }
  /** Over the Explorer, under the dock's tab row, at the dock's own width. */
  | { readonly kind: "folded" };

/**
 * @param stageWidth The `.stage` element's width: the window less the navigation
 * sidebar.
 * @param dockWidth The dock's live width.
 */
export function diffColumnLayout(stageWidth: number, dockWidth: number): DiffColumnLayout {
  const half = Math.floor((stageWidth - dockWidth) / 2);
  return half >= MIN_DOCKED_WIDTH
    ? { kind: "docked", width: Math.min(MAX_DOCKED_WIDTH, half) }
    : { kind: "folded" };
}

/** What the stage's right inset gains: the docked column, nothing when folded. */
export function diffColumnInsetFor(layout: DiffColumnLayout): number {
  return layout.kind === "docked" ? layout.width : 0;
}

/**
 * The stage's extra right inset, in px: the open column's width while docked, 0
 * while folded or closed. `App` adds it to the dock's width, so the grid's panes
 * refit around the column the way they do around the dock. Window-scoped (R5);
 * the open column is its only writer.
 */
export const diffColumnInset = signal(0);

export function publishDiffColumnInset(inset: number): void {
  diffColumnInset.value = inset;
}

/**
 * Whether the open column lies folded over the Explorer, and so over the
 * document panel. `App` closes it before a document takes the keyboard there,
 * and the column closes itself when it folds over one that already has it, so
 * nobody types into a file they cannot see. The open column is its only writer.
 */
export const diffColumnFolded = signal(false);
