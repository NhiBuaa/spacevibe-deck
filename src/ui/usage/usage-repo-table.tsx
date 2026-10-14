import { useId } from "preact/hooks";
import { AGENT_LOGOS } from "../../lib/agent-logos";
import { dotColor } from "../../lib/process-info";
import { formatUsd } from "../../lib/usage-pricing";
import {
  EM_DASH,
  ESTIMATE_NOTE,
  formatTokens,
  formatTokensCompact,
  USAGE_AGENT_LABEL,
} from "./usage-format";
import type { RepoRow, RepoRowLine, RepoTable } from "./usage-by-repo";

/**
 * The treatments the gallery compares. Shipping settles each to one value; the
 * defaults are the plain, quiet end of every axis.
 */
export interface RepoTableLook {
  /** How a child row hangs under its repository. */
  readonly indent: "plain" | "leader";
  /** Whether a repository's name is set heavier than its children. */
  readonly repoWeight: "regular" | "strong";
  /** One neutral fill, or the colour of the agent that spent the most. */
  readonly bar: "neutral" | "agent";
  /** A thin strip under the name showing how the agents split the repo. */
  readonly mix: boolean;
}

export const DEFAULT_REPO_LOOK: RepoTableLook = {
  indent: "plain",
  repoWeight: "regular",
  bar: "neutral",
  mix: false,
};

interface UsageRepoTableProps {
  readonly table: RepoTable;
  /** Says which period is empty (DL-16.7); shown when there are no rows. */
  readonly emptyLabel: string;
  readonly look?: RepoTableLook;
  /** One more sentence under the table, for a state the data cannot say itself. */
  readonly note?: string;
}

function percent(tenths: number | null): string {
  return tenths === null ? EM_DASH : `${(tenths / 10).toFixed(1)}%`;
}

function cost(costUsd: number | null): string {
  return costUsd === null ? EM_DASH : formatUsd(costUsd);
}

function ShareCell({ tenths, color }: { readonly tenths: number | null; readonly color?: string }) {
  return (
    <td class="usage-repos__share">
      <span class={tenths === null ? "usage-repos__absent" : undefined}>{percent(tenths)}</span>
      {color === undefined || tenths === null ? null : (
        <span class="usage-repos__bar" aria-hidden="true">
          <span class="usage-repos__fill" style={{ width: `${tenths / 10}%`, background: color }} />
        </span>
      )}
    </td>
  );
}

function MixStrip({ row }: { readonly row: RepoRow }) {
  if (row.agentWeights.length < 2) {
    return null;
  }
  return (
    <span class="usage-repos__mix" aria-hidden="true">
      {row.agentWeights.map((part) => (
        <span
          key={part.agent}
          style={{ width: `${part.fraction * 100}%`, background: dotColor(part.agent) }}
        />
      ))}
    </span>
  );
}

function RepoRowView({ row, look }: { readonly row: RepoRow; readonly look: RepoTableLook }) {
  const barColor = look.bar === "agent" ? dotColor(row.dominantAgent) : "var(--text-muted)";
  return (
    <>
      <tr class="usage-repos__repo">
        <th scope="row">
          <span class="usage-repos__name">{row.name}</span>
          {row.parent === null ? null : <span class="usage-repos__parent">{row.parent}</span>}
          {look.mix ? <MixStrip row={row} /> : null}
        </th>
        <td class={row.costUsd === null ? "usage-repos__absent" : undefined}>
          {cost(row.costUsd)}
          {row.costUsd !== null && row.unpricedTokens > 0 ? (
            <span class="usage-repos__sub">{formatTokensCompact(row.unpricedTokens)} unpriced</span>
          ) : null}
        </td>
        <ShareCell tenths={row.shareTenths} color={barColor} />
        <td>{formatTokens(row.tokens)}</td>
      </tr>
      {row.lines.map((line) => (
        <LineView key={`${line.agent}:${line.model}`} line={line} />
      ))}
    </>
  );
}

function LineView({ line }: { readonly line: RepoRowLine }) {
  const logo = AGENT_LOGOS[line.agent];
  return (
    <tr class="usage-repos__line">
      <th scope="row">
        {logo === undefined ? null : (
          <img class="usage-repos__logo" src={logo} alt={USAGE_AGENT_LABEL[line.agent]} />
        )}
        <span class="usage-repos__model">{line.model}</span>
      </th>
      <td class={line.costUsd === null ? "usage-repos__absent" : undefined}>
        {cost(line.costUsd)}
      </td>
      <ShareCell tenths={line.shareTenths} />
      <td>{formatTokens(line.tokens)}</td>
    </tr>
  );
}

/**
 * Usage by repository: one real table, a repository row then its `agent/model`
 * rows, all read-only (DL-15). Columns are Cost, Share and Tokens; an
 * unknown value is an em dash and never `0` (DL-15.6).
 */
export function UsageRepoTable({
  table,
  emptyLabel,
  look = DEFAULT_REPO_LOOK,
  note,
}: UsageRepoTableProps) {
  const id = useId();
  const unpriced = table.unpricedModels.length;
  return (
    <section
      class={`usage-overview usage-repos usage-repos--${look.indent} usage-repos--${look.repoWeight} usage-repos--${look.bar}`}
    >
      <h3 id={`${id}-title`}>Usage by repository</h3>
      <div
        class="usage-repos__scroll"
        role="region"
        aria-labelledby={`${id}-title`}
        // Focusable only because it can scroll sideways (DL-15.3); without it a
        // keyboard user cannot reach the clipped columns.
        tabIndex={0}
      >
        <table aria-describedby={`${id}-note`}>
          <thead>
            <tr>
              <th scope="col">Repository</th>
              <th scope="col">Cost</th>
              <th scope="col">Share</th>
              <th scope="col">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.length === 0 ? (
              <tr>
                <td colSpan={4} class="usage-repos__empty">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              table.rows.map((row) => <RepoRowView key={row.key} row={row} look={look} />)
            )}
          </tbody>
        </table>
      </div>
      <p id={`${id}-note`} class="usage-overview__note">
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
