import { formatUsd } from "../../lib/usage-pricing";
import { EM_DASH, formatTokensCompact } from "./usage-format";
import type { UsageTotals } from "./usage-totals";

/** The period's token mix and cache savings, as one row of plain figures. */
export function UsageTotalsStrip({ totals }: { readonly totals: UsageTotals }) {
  return (
    <section class="usage-overview usage-totals" aria-label="Token totals">
      <h3>Totals</h3>
      <dl class="usage-totals__grid">
        <div>
          <dt>Processed tokens</dt>
          <dd>{formatTokensCompact(totals.processedTokens)}</dd>
        </div>
        <div>
          <dt>Cached input</dt>
          <dd>{formatTokensCompact(totals.cachedInputTokens)}</dd>
          {totals.cacheHitPercent !== null && <small>{totals.cacheHitPercent}% of input</small>}
        </div>
        <div>
          <dt>Uncached input</dt>
          <dd>{formatTokensCompact(totals.uncachedInputTokens)}</dd>
        </div>
        <div>
          <dt>Output</dt>
          <dd>{formatTokensCompact(totals.outputTokens)}</dd>
        </div>
        <div>
          <dt>Cache savings</dt>
          <dd>{totals.savingsUsd === null ? EM_DASH : formatUsd(totals.savingsUsd)}</dd>
          {totals.savingsPartial && <small>excludes unpriced models</small>}
        </div>
      </dl>
    </section>
  );
}
