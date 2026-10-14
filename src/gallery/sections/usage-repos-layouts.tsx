/**
 * Three layouts that answer "the stacked list is hard to read" (plan
 * 2026-10-14-usage-page-content). Each shows ONE row per repository and folds
 * the agent/model lines into a faint summary, so a repo that ran twelve models
 * costs the same height as one that ran one. Same model as the table
 * (`buildRepoTable`); gallery only, never imported by shipping code (R7).
 */
import { AGENT_LOGOS } from "../../lib/agent-logos";
import { dotColor } from "../../lib/process-info";
import { formatUsd } from "../../lib/usage-pricing";
import type { RepoRow, RepoTable } from "../../ui/usage/usage-by-repo";
import { EM_DASH, formatTokensCompact, USAGE_AGENT_LABEL } from "../../ui/usage/usage-format";

const SUMMARY_LINES = 2;

function percent(tenths: number | null): string {
  return tenths === null ? EM_DASH : `${(tenths / 10).toFixed(1)}%`;
}

/** `claude-opus-5-5 82% · gpt-5 14% · +2`: what the repo ran, biggest first. */
function summary(row: RepoRow): string {
  const priced = row.lines.filter((line) => line.costUsd !== null);
  const parts = priced.slice(0, SUMMARY_LINES).map((line) => {
    const share = row.costUsd === null || row.costUsd === 0 ? 0 : (line.costUsd ?? 0) / row.costUsd;
    return `${line.model} ${Math.round(share * 100)}%`;
  });
  const rest = row.lines.length - parts.length;
  return rest > 0 ? [...parts, `+${rest}`].join(" · ") : parts.join(" · ");
}

function Name({ row }: { readonly row: RepoRow }) {
  return (
    <th scope="row">
      <span class="usage-repos__name">{row.name}</span>
      {row.parent === null ? null : <span class="usage-repos__parent">{row.parent}</span>}
      <span class="ur-summary">{summary(row)}</span>
    </th>
  );
}

/** The agents' split of one repo, as stacked segments of the agents' own colours. */
function AgentBar({ row, scale }: { readonly row: RepoRow; readonly scale: number }) {
  const width = row.costUsd === null || scale === 0 ? 0 : (row.costUsd / scale) * 100;
  return (
    <span class="ur-lead" aria-hidden="true">
      <span class="ur-lead__fill" style={{ width: `${width}%` }}>
        {row.agentWeights.map((part) => (
          <span
            key={part.agent}
            style={{ width: `${part.fraction * 100}%`, background: dotColor(part.agent) }}
          />
        ))}
      </span>
    </span>
  );
}

function maxCost(table: RepoTable): number {
  return Math.max(0, ...table.rows.map((row) => row.costUsd ?? 0));
}

/** D: the bar leads. Each repo's bar is scaled to the biggest repo, so lengths compare. */
export function LeadBarsLayout({ table }: { readonly table: RepoTable }) {
  const scale = maxCost(table);
  return (
    <div class="usage-overview usage-repos ur-layout ur-layout--lead">
      <div class="usage-repos__scroll" role="region" aria-label="Usage by repository" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Repository</th>
              <th scope="col">Agents</th>
              <th scope="col">Cost</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.key}>
                <Name row={row} />
                <td class="ur-lead__cell">
                  <AgentBar row={row} scale={scale} />
                </td>
                <td>{row.costUsd === null ? EM_DASH : formatUsd(row.costUsd)}</td>
                <td>{percent(row.shareTenths)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AgentLegend table={table} />
    </div>
  );
}

/** Names the bar colours: a bar the reader must decode is not a bar they can read. */
function AgentLegend({ table }: { readonly table: RepoTable }) {
  const agents = [...new Set(table.rows.flatMap((row) => row.agentWeights.map((p) => p.agent)))];
  return (
    <p class="usage-overview__note ur-legend">
      {agents.map((agent) => (
        <span key={agent} class="ur-legend__item">
          <span class="ur-legend__dot" style={{ background: dotColor(agent) }} aria-hidden="true" />
          {USAGE_AGENT_LABEL[agent]}
        </span>
      ))}
    </p>
  );
}

/** E: no bar at all. A narrow table so the numbers sit next to the names. */
export function OneLineLayout({ table }: { readonly table: RepoTable }) {
  return (
    <div class="usage-overview usage-repos ur-layout ur-layout--one">
      <div class="usage-repos__scroll" role="region" aria-label="Usage by repository" tabIndex={0}>
        <table>
          <thead>
            <tr>
              <th scope="col">Repository</th>
              <th scope="col">Cost</th>
              <th scope="col">Share</th>
              <th scope="col">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.key}>
                <Name row={row} />
                <td>{row.costUsd === null ? EM_DASH : formatUsd(row.costUsd)}</td>
                <td>{percent(row.shareTenths)}</td>
                <td>{formatTokensCompact(row.tokens)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** F: tiles, two across. Reads like a grid of projects rather than a ledger. */
export function TilesLayout({ table }: { readonly table: RepoTable }) {
  return (
    <ul class="ur-tiles" aria-label="Usage by repository">
      {table.rows.map((row) => (
        <li key={row.key} class="ur-tile">
          <p class="usage-repos__name">{row.name}</p>
          {row.parent === null ? null : <p class="usage-repos__parent">{row.parent}</p>}
          <p class="ur-tile__cost">
            {row.costUsd === null ? EM_DASH : formatUsd(row.costUsd)}
            <span class="ur-tile__share">{percent(row.shareTenths)}</span>
          </p>
          <AgentBar row={row} scale={row.costUsd ?? 0} />
          <p class="ur-summary">{summary(row)}</p>
          <p class="ur-tile__marks" aria-hidden="true">
            {[...new Set(row.lines.map((line) => line.agent))].map((agent) => {
              const logo = AGENT_LOGOS[agent];
              return logo === undefined ? null : <img key={agent} src={logo} alt="" />;
            })}
            <span>{formatTokensCompact(row.tokens)} tokens</span>
          </p>
        </li>
      ))}
    </ul>
  );
}
