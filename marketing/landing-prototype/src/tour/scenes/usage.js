/**
 * The token usage dashboard — the data the Watch chapter's usage widget reads.
 *
 * Usage has three views — Overview, Daily, Breakdown
 * (`src/ui/usage/usage-views.ts:34-48`) — and the widget draws OVERVIEW: the
 * range selector belongs to it alone
 * (`src/ui/usage/sections/overview-section.tsx:246`), and it has no table.
 * Overview holds the display figure and its asterisk, a footnote, the range
 * selector and one row per agent; the widget draws those and invents no screen
 * that exists nowhere in the app.
 */

/**
 * Range labels verbatim from `src/ui/usage/usage-ranges.ts:29-44`. `All` is
 * the active one because `DEFAULT_USAGE_RANGE` is `all` (:47) — a resting
 * Usage tab is showing the whole recorded history, so that is the state the
 * figure above belongs to.
 */
export const RANGES = ["Today", "7 days", "30 days", "All"];

/**
 * The display figure and the two lines that qualify it, all three verbatim in
 * form from the app.
 *
 * `TOTAL` carries no asterisk of its own: the app writes
 * `${formatUsd(total)}*` into the figure and the footnote answers it, so the
 * two are one sentence split across two lines rather than two claims. The
 * footnote is the default of `OverviewSection`'s four — a priced total with no
 * unpriced models.
 *
 * Overview also prints an estimate note, `ESTIMATE_NOTE`
 * (`src/ui/usage/usage-format.ts:53`) resolved against `PRICING_SNAPSHOT_DATE`
 * (`src/lib/usage-pricing-snapshot.ts:28`); the widget leaves it out.
 */
export const TOTAL = "$13,372.98";
export const FOOTNOTE = "* if billed at full API rate";

/**
 * Exactly two rows — and they are not a sample of a longer list.
 * `USAGE_AGENT_LABEL` (`src/ui/usage/usage-format.ts:42-45`) covers `claude`
 * and `codex` and nothing else, because those are the two corpora the scanner
 * reads; the widget's own copy claims exactly that coverage. The labels are
 * that table's, so the drawing and the app cannot disagree about what the tool
 * is called.
 *
 * The figures are consistent by construction: the two amounts sum to `TOTAL`
 * and the two shares sum to 100.0, which is what `largestRemainderShares`
 * (`overview-section.tsx:73-100`) guarantees on real data. A reader who adds
 * the column up is entitled to get the number at the top.
 *
 * `share` is a datum rather than a style, so it rides the markup as `--share`
 * — the same reason the app sets that width inline. The COLOUR is deliberately
 * not here: the stylesheet keys it off `data-agent`, the way the other widgets
 * leave `state` to be painted by CSS instead of carrying tokens themselves.
 * The app's own mapping is `dotColor(agent)` (`src/lib/process-info.ts:22-33`):
 * claude is the theme magenta, codex the theme green.
 */
export const AGENTS = [
  {
    id: "claude",
    label: "Claude Code",
    amount: "$5,509.67",
    share: "41.2",
    tokens: "1.2B",
  },
  {
    id: "codex",
    label: "Codex",
    amount: "$7,863.31",
    share: "58.8",
    tokens: "2.4B",
  },
];
