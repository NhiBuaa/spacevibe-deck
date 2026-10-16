# Usage details page

- **Started:** 2026-10-14
- **Status:** implemented in part (2026-10-16). The frame, the per-repo scanner and the
  2026-10-15 cover decisions are merged ([#50](https://github.com/mxrsv/spacevibe-deck/pull/50));
  the repository tiles, the palette and the dock overview are merged
  ([#49](https://github.com/mxrsv/spacevibe-deck/pull/49)); the one-background rule is
  [#51](https://github.com/mxrsv/spacevibe-deck/pull/51). Not frozen: wiring the tiles into the
  page is not on `origin/main` yet, and Windows is unverified. The dock layout and the details
  Totals and Models (R8) are built on `feat/usage-dock-layout` and approved by eye (2026-10-16),
  not yet merged.
- **Plans:** [page frame](../plans/2026-10-14-usage-page-frame.md),
  [scanner by repo](../plans/2026-10-14-usage-scanner-by-repo.md),
  [page content](../plans/2026-10-14-usage-page-content.md) and
  [dock layout](../plans/2026-10-15-usage-dock-layout.md) (all gitignored, primary checkout).

## Goal

The dock's Usage tab stays a compact summary. A second, larger surface opens from it and shows
usage in more detail, including usage per repository.

## Requirements

1. **R1. Dock stays a summary.** The dock Usage tab keeps today's overview and gains one
   "Details" entry that opens the page.
2. **R2. The page opens like t3code's Usage page.** It takes over the content area, the rail
   stays visible, Back and Escape return. (Reference: `pingdotgg/t3code`, MIT, ideas only, no code
   copied.) Amended by the owner on 2026-10-15: the page also covers the docked panel and the
   stage strip, going full-bleed like Settings; while covered the dock is inert.
3. **R3. Technical approach A (owner, 2026-10-14).** The page is an overlay that covers the
   stage and leaves the rail uncovered, built on Settings' mechanism. Terminal panes are never
   unmounted or hidden by CSS, so PTY ownership, tabs and layout are untouched. Approach B (swap
   the main view and hide panes) was rejected: it touches R4 seams and risks resizing hidden
   panes.
4. **R4. One command id.** Opening the page is an `ACTION_REGISTRY` action, so the menu,
   shortcut and Details link share it.
5. **R5. Usage per repository.** The scanner records the working directory of each usage bucket
   so the page can group by repository.
6. **R6. No new data leaves the machine.** Paths enter the renderer through IPC only; they are
   not sent to telemetry or the backend.
7. **R7. One background (owner, 2026-10-15).** The navigation rail is the only surface with a
   colour of its own; the page, Settings, the stage and the dock share the stage background.
8. **R8. Details adds Totals and Models (owner, 2026-10-16).** This reopens the 2026-10-15
   decision that the page shows repository tiles and no agent or model list. The page gains
   **Totals** (processed, cached and uncached input, output, cache savings) and a **Models** table
   (cost, share, tokens) before the repository tiles, both following the cost period. The dock
   stays a summary: it leads with remaining allowance, then the cost figure and per-agent cards.
   Layout is DL-16.1, 16.9 and 16.10.

## Acceptance criteria

- Details opens the page from the dock, the menu and the shortcut; Escape and Back close it and
  return focus to where it came from.
- The dock tab and the page never freeze each other's data when one closes.
- No pane is unmounted, and no PTY receives a resize while the page opens or closes.
- Per-repository totals sum to the machine-wide total shown today.
- On the details page, Totals and Models follow the selected period; model shares sum to 100.0%,
  and an unpriced model shows `—` rather than zero.

## Constraints from history (owner decisions already made)

- Usage was a full-window screen (`50dc7639`, 2026-08), moved into the dock on 2026-08-16.
- `31c74765` removed the Daily and Breakdown views and their aggregation helpers, keeping the
  overview only. The details page is the owner reintroducing detail on purpose; its content
  session should read that commit's message before re-adding a breakdown.
- DL §15 (a Part II pattern, replaceable by an eye-reviewed redesign): a page of measured
  numbers is a read-only table; absent values show an em dash, not zero.

## Out of scope

- Per-day detail for a selected timeline column, a legend that hides agents, Cost by type or
  speed, and a cache-savings multiplier (deferred, owner decides).
- URL routing, history stack or deep links.
