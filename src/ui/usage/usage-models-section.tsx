import { useId } from "preact/hooks";
import { formatUsd } from "../../lib/usage-pricing";
import { AgentGlyph } from "../controls/agent-glyph";
import { EM_DASH, formatTokensCompact } from "./usage-format";
import type { ModelTable } from "./usage-models";

function shareLabel(tenths: number | null): string {
  return tenths === null ? EM_DASH : `${(tenths / 10).toFixed(1)}%`;
}

/** Read-only table of the period's models (DL-15): no sort, no click. */
export function UsageModelsTable({
  table,
  emptyLabel,
}: {
  readonly table: ModelTable;
  readonly emptyLabel: string;
}) {
  const headingId = useId();
  return (
    <section class="usage-overview usage-models">
      <h3 id={headingId}>Models</h3>
      <div class="usage-overview__table-scroll" tabIndex={0} aria-labelledby={headingId}>
        <table>
          <thead>
            <tr>
              <th scope="col">Model</th>
              <th scope="col">Cost</th>
              <th scope="col">Share</th>
              <th scope="col">Tokens</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.length === 0 ? (
              <tr>
                <td colSpan={4} class="usage-models__empty">
                  {emptyLabel}
                </td>
              </tr>
            ) : (
              table.rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">
                    <span class="usage-models__name">
                      <AgentGlyph agent={row.agent} className="usage-models__logo" />
                      {row.model}
                    </span>
                  </th>
                  <td>{row.costUsd === null ? EM_DASH : formatUsd(row.costUsd)}</td>
                  <td>{shareLabel(row.shareTenths)}</td>
                  <td>{formatTokensCompact(row.tokens)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {table.hidden > 0 && <p class="usage-overview__note">+{table.hidden} more models</p>}
    </section>
  );
}
