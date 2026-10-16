import { useId } from "preact/hooks";
import { AgentGlyph } from "../controls/agent-glyph";
import { formatUsd } from "../../lib/usage-pricing";
import { usageAgentColor } from "./usage-agent-colors";
import { EM_DASH, ESTIMATE_NOTE, formatTokensCompact, USAGE_AGENT_LABEL } from "./usage-format";
import { maxRepoCost, summarizeRepo, type RepoRow, type RepoTable } from "./usage-by-repo";

/** How many placeholder tiles stand in while the first read is pending. */
const PLACEHOLDER_TILES = 3;
/** The biggest repositories shown; the rest stay counted in every share. */
export const REPO_TILES_SHOWN = 10;

interface UsageRepoTilesProps {
  readonly table: RepoTable;
  /** Says which period is empty (DL-16.7); shown when there are no rows. */
  readonly emptyLabel: string;
  /** First read pending: placeholder tiles, no numbers. */
  readonly loading?: boolean;
  /** A newer read is in flight: the last tiles stay, muted, instead of flashing. */
  readonly reloading?: boolean;
  /** One more sentence under the list, for a state the data cannot say itself. */
  readonly note?: string;
}

/** A real but tiny share reads `<0.1%`; `0.0%` would say nothing was spent. */
function shareLabel(row: RepoRow): string {
  if (row.shareTenths === null) {
    return EM_DASH;
  }
  return row.shareTenths === 0 && (row.costUsd ?? 0) > 0
    ? "<0.1%"
    : `${(row.shareTenths / 10).toFixed(1)}%`;
}

/** What `cost` leaves out, so a partial figure is never read as complete. */
function unpricedNote(row: RepoRow): string {
  if (row.unpricedTokens === 0) {
    return "";
  }
  return row.costUsd === null
    ? " · no price"
    : ` · ${formatTokensCompact(row.unpricedTokens)} unpriced`;
}

/**
 * The bar shows magnitude, scaled to the biggest repository, with the agents'
 * own colours splitting the filled part (DL-16.4). A bar that always filled
 * would sit beside "<0.1%" and read as large.
 */
function MagnitudeBar({ row, scale }: { readonly row: RepoRow; readonly scale: number }) {
  const width = row.costUsd === null || scale === 0 ? 0 : (row.costUsd / scale) * 100;
  return (
    <span class="usage-tile__bar" aria-hidden="true">
      <span class="usage-tile__fill" style={{ width: `${width}%` }}>
        {row.agentWeights.map((part) => (
          <span
            key={part.agent}
            style={{ width: `${part.fraction * 100}%`, background: usageAgentColor(part.agent) }}
          />
        ))}
      </span>
    </span>
  );
}

function Tile({ row, scale }: { readonly row: RepoRow; readonly scale: number }) {
  const agents = [...new Set(row.lines.map((line) => line.agent))];
  return (
    <li class="usage-tile">
      <p class="usage-tile__name">{row.name}</p>
      {row.parent === null ? null : <p class="usage-tile__parent">{row.parent}</p>}
      <p class={`usage-tile__cost ${row.costUsd === null ? "usage-tile__cost--absent" : ""}`}>
        {row.costUsd === null ? EM_DASH : formatUsd(row.costUsd)}
        <span class="usage-tile__share">{shareLabel(row)}</span>
      </p>
      <MagnitudeBar row={row} scale={scale} />
      <p class="usage-tile__summary">{summarizeRepo(row)}</p>
      <p class="usage-tile__meta">
        {agents.map((agent) => (
          // One named picture per agent: the swatch and the mark are decoration
          // inside it, so a screen reader hears "Codex" once.
          <span
            key={agent}
            class="usage-tile__agent"
            role="img"
            aria-label={USAGE_AGENT_LABEL[agent]}
          >
            <i style={{ background: usageAgentColor(agent) }} aria-hidden="true" />
            <AgentGlyph agent={agent} className="usage-tile__logo" />
          </span>
        ))}
        <span>
          {formatTokensCompact(row.tokens)} tokens
          {unpricedNote(row)}
        </span>
      </p>
    </li>
  );
}

/**
 * Usage by repository: one tile per repository, read-only (no sort, no click,
 * no hover). A tile carries the cost, its share of the total, a magnitude bar
 * split by agent, a one-line summary of the models it ran, and the tokens. The
 * full agent/model list is not shown here; per-repository totals are the
 * requirement. Not a `<table>`, so DL §15's table rules do not apply.
 */
export function UsageRepoTiles({
  table,
  emptyLabel,
  loading = false,
  reloading = false,
  note,
}: UsageRepoTilesProps) {
  const id = useId();
  const unpriced = table.unpricedModels.length;
  const scale = maxRepoCost(table);
  const shown = table.rows.slice(0, REPO_TILES_SHOWN);
  const hidden = table.rows.length - shown.length;
  return (
    <section class={`usage-overview usage-repo-tiles ${reloading ? "is-reloading" : ""}`}>
      <h3 id={`${id}-title`}>Usage by repository</h3>
      {loading ? (
        <ul class="usage-tiles" aria-hidden="true">
          {Array.from({ length: PLACEHOLDER_TILES }, (_, index) => (
            <li key={index} class="usage-tile usage-tile--placeholder" />
          ))}
        </ul>
      ) : table.rows.length === 0 ? (
        <p class="usage-tiles__empty">{emptyLabel}</p>
      ) : (
        <ul class="usage-tiles" aria-labelledby={`${id}-title`}>
          {shown.map((row) => (
            <Tile key={row.key} row={row} scale={scale} />
          ))}
        </ul>
      )}
      {hidden > 0 && <p class="usage-overview__note">+{hidden} more repositories</p>}
      <p class="usage-overview__note">
        {ESTIMATE_NOTE}
        {unpriced === 0
          ? ""
          : ` · ${unpriced} ${unpriced === 1 ? "model has" : "models have"} no published price and ${
              unpriced === 1 ? "is" : "are"
            } left out of cost`}
        {note === undefined ? "" : ` · ${note}`}
      </p>
    </section>
  );
}
