import { type AgentTotal } from "../../../lib/usage-aggregate";
import { AgentGlyph } from "../../controls/agent-glyph";
import { usageAgentColor } from "../usage-agent-colors";
import { formatUsd } from "../../../lib/usage-pricing";
import { totalTokens, type UsageBucket } from "../../../lib/usage-snapshot";
import { usageSnapshot, usageLoading, usageStale } from "../../../usage/usage-store";
import { activeUsageRange } from "../active-usage-view-store";
import { UsageRangeSelector } from "../usage-range-selector";
import { USAGE_RANGES, type UsageRangeId } from "../usage-ranges";
import { useMemo } from "preact/hooks";
import { useAgentLimits, type AgentLimitsView } from "../use-agent-limits";
import { RemainingAllowance } from "../remaining-allowance";
import { CostTimeline } from "../cost-timeline";
import { buildUsageTimeline } from "../usage-timeline";
import { EM_DASH, ESTIMATE_NOTE, formatTokensCompact, USAGE_AGENT_LABEL } from "../usage-format";
import { largestRemainderShares } from "../usage-shares";

interface AgentBlock {
  readonly agent: string;
  readonly label: string;
  readonly color: string;
  /** The priced part; null only when nothing this agent ran has a price. */
  readonly costUsd: number | null;
  readonly tokens: number;
  /** Tokens the amount excludes, so the row can say what is missing. */
  readonly unpricedTokens: number;
  /** null when there is no stated total to be a share OF (DL-16.5). */
  readonly sharePercent: number | null;
}

/**
 * The priced part of the whole corpus, or `null` when not one model anywhere
 * has a price.
 *
 * This is the 2026-08-10 refinement of §0.3 decision 8. The old rule answered
 * `null` if ANY agent's cost was unknown, and on the real corpus a single
 * unrecognised model id holding 0.2% of Codex's tokens blanked a correct
 * $13,372.98 — it deleted an accurate number in the name of avoiding a
 * misleading one. The figure now covers everything that can be priced and the
 * footnote states the boundary. Neither half is optional: the sum without the
 * disclosure would be exactly the misleading total the old rule feared.
 */
function pricedTotal(totals: readonly AgentTotal[]): number | null {
  let sum = 0;
  let priced = 0;
  for (const total of totals) {
    if (total.costUsd === null) {
      continue;
    }
    sum += total.costUsd;
    priced += 1;
  }
  return priced === 0 ? null : sum;
}

/**
 * Cost descending, unpriced agents last, then tokens descending. The tail
 * rules are not decoration: with no cost to rank by, an unpriced agent would
 * otherwise land wherever the upstream sort left it and the block order would
 * change between renders of identical data.
 */
function compareBlocks(left: AgentTotal, right: AgentTotal): number {
  if (left.costUsd === null || right.costUsd === null) {
    if (left.costUsd !== null) {
      return -1;
    }
    if (right.costUsd !== null) {
      return 1;
    }
  } else if (left.costUsd !== right.costUsd) {
    return right.costUsd - left.costUsd;
  }
  const byTokens = totalTokens(right.counters) - totalTokens(left.counters);
  return byTokens !== 0 ? byTokens : left.agent.localeCompare(right.agent);
}

function buildBlocks(totals: readonly AgentTotal[], total: number | null): readonly AgentBlock[] {
  const ordered = [...totals].sort(compareBlocks);
  // A share needs a stated total. Without one there is nothing to be a
  // proportion of, so no bar fills and no percentage is printed (DL-16.5).
  const shares =
    total === null ? null : largestRemainderShares(ordered.map((entry) => entry.costUsd ?? 0));
  return ordered.map((entry, index) => ({
    agent: entry.agent,
    label: USAGE_AGENT_LABEL[entry.agent],
    // The Usage surfaces' own agent colour (DL-16.4), not the pane dot's.
    color: usageAgentColor(entry.agent),
    costUsd: entry.costUsd,
    tokens: totalTokens(entry.counters),
    unpricedTokens: entry.unpricedTokens,
    sharePercent: shares === null ? null : shares[index],
  }));
}

/**
 * Four cases, and conflating them is how the screen ends up lying about
 * itself. `unpriced` belongs only to an agent whose OWN cost is entirely
 * unknown — never to one whose dollar amount is sitting on the line directly
 * above. An agent that is priced but has no share (no stated total exists,
 * DL-16.5) simply states its tokens. And an agent that is mostly priced names
 * the slice its amount leaves out, so the number is never quietly partial.
 */
function subLine(block: AgentBlock): string {
  const tokens = `${formatTokensCompact(block.tokens)} tokens`;
  if (block.costUsd === null) {
    return `unpriced · ${tokens}`;
  }
  const omitted =
    block.unpricedTokens > 0 ? ` · ${formatTokensCompact(block.unpricedTokens)} unpriced` : "";
  if (block.sharePercent === null) {
    return `${tokens}${omitted}`;
  }
  return `${block.sharePercent}% of cost · ${tokens}${omitted}`;
}

function AgentRow({ block }: { readonly block: AgentBlock }) {
  return (
    <li class="usage-agent">
      <div class="usage-agent__line">
        <AgentGlyph agent={block.agent} className="usage-agent__logo" />
        <span class="usage-agent__label">{block.label}</span>
        <span class="usage-agent__amount">
          {block.costUsd === null ? EM_DASH : formatUsd(block.costUsd)}
        </span>
      </div>
      {/* aria-hidden: the sub-line below already states the share in words, so
          the bar carries no information of its own (DL-16.6). */}
      <div class="usage-agent__bar" aria-hidden="true">
        <div
          class="usage-agent__fill"
          style={{
            width: `${block.sharePercent ?? 0}%`,
            background: block.color,
          }}
        />
      </div>
      <p class="usage-agent__sub">{subLine(block)}</p>
    </li>
  );
}

export interface OverviewContentProps {
  readonly buckets: readonly UsageBucket[];
  readonly range: UsageRangeId;
  readonly onRangeChange: (range: UsageRangeId) => void;
  readonly limits: AgentLimitsView;
  readonly nowMs: number;
  readonly loading?: boolean;
  readonly stale?: boolean;
}

/** Injectable production markup; fixtures never mount the account-reading wrapper. */
export function OverviewContent({
  buckets,
  range,
  onRangeChange,
  limits,
  nowMs,
  loading = false,
  stale = false,
}: OverviewContentProps) {
  const timeline = useMemo(
    () => buildUsageTimeline(buckets, range, nowMs),
    [buckets, range, nowMs],
  );
  const recorded = timeline.agents;
  const total = pricedTotal(recorded);
  const blocks = buildBlocks(recorded, total);
  const unpriced = [...new Set(recorded.flatMap((entry) => entry.unpricedModels))].sort();
  const definition = USAGE_RANGES.find((entry) => entry.id === range)!;
  return (
    <div class={loading && buckets.length ? "usage-overview is-reloading" : "usage-overview"}>
      <RemainingAllowance {...limits} />
      <section class="usage-hero" aria-label="Estimated API cost">
        <div class="usage-hero__head">
          <p class="usage-hero__eyebrow">Estimated API cost</p>
          <UsageRangeSelector value={range} onChange={onRangeChange} />
        </div>
        <p class={`usage-hero__figure ${total === null ? "usage-hero__figure--absent" : ""}`}>
          {total === null ? EM_DASH : formatUsd(total)}
        </p>
        <p class="usage-hero__footnote">API equivalent, not your subscription bill</p>
        {unpriced.length > 0 && (
          <p class="usage-hero__footnote">
            {total === null ? "No priced data" : "Partial estimate"} · excludes {unpriced.length}{" "}
            {unpriced.length === 1 ? "model" : "models"} with no published price
          </p>
        )}
        {blocks.length === 0 ? (
          <p class="usage-hero__empty">{definition.emptyLabel}</p>
        ) : (
          <ul class="usage-hero__agents">
            {blocks.map((block) => (
              <AgentRow key={block.agent} block={block} />
            ))}
          </ul>
        )}
        <details class="usage-overview__details">
          <summary>Pricing details</summary>
          <p>{ESTIMATE_NOTE}</p>
          <p>This machine’s recorded history only; agent CLIs may prune older transcripts.</p>
          {unpriced.length > 0 && (
            <p>No price for {unpriced.join(", ")}. These tokens are excluded from the estimate.</p>
          )}
        </details>
      </section>
      {loading && !buckets.length ? (
        <p class="usage-overview__note" role="status">
          Reading recorded token history…
        </p>
      ) : null}
      {stale ? (
        <p class="usage-overview__note" role="status">
          Cost history is stale — showing the last good read
        </p>
      ) : null}
      <CostTimeline timeline={timeline} />
    </div>
  );
}

export function OverviewSection() {
  const limits = useAgentLimits();
  const range = USAGE_RANGES.find((entry) => entry.id === activeUsageRange.value)?.id ?? "all";
  return (
    <OverviewContent
      buckets={usageSnapshot.value?.buckets ?? []}
      range={range}
      onRangeChange={(next) => {
        activeUsageRange.value = next;
      }}
      limits={limits}
      nowMs={limits.nowMs}
      loading={usageLoading.value}
      stale={usageStale.value}
    />
  );
}
