/**
 * One row per agent and model for the period, biggest cost first. Pure.
 *
 * The model string is the scanner's raw one, so a missing price mapping stays
 * diagnosable. Shares run over priced cost only and sum to exactly 100.0.
 */

import { estimateCostUsd } from "../../lib/usage-pricing";
import {
  addCounters,
  EMPTY_COUNTERS,
  totalTokens,
  type UsageAgent,
  type UsageBucket,
} from "../../lib/usage-snapshot";
import { bucketsInRange, type UsageRangeId } from "./usage-ranges";
import { largestRemainderTenths } from "./usage-shares";

export const MODEL_ROWS_SHOWN = 8;

export interface ModelRow {
  readonly key: string;
  readonly agent: UsageAgent;
  readonly model: string;
  /** Null when the model has no published price. */
  readonly costUsd: number | null;
  readonly tokens: number;
  /** Tenths of a percent of the priced total; null with no cost. */
  readonly shareTenths: number | null;
}

export interface ModelTable {
  readonly rows: readonly ModelRow[];
  /** Models past the cap, still counted in every share. */
  readonly hidden: number;
}

export function buildModelTable(
  buckets: readonly UsageBucket[],
  range: UsageRangeId,
  nowMs: number,
): ModelTable {
  const lines = new Map<
    string,
    { agent: UsageAgent; model: string; counters: typeof EMPTY_COUNTERS }
  >();
  for (const { agent, model, counters } of bucketsInRange(buckets, range, nowMs)) {
    const key = `${agent}\u0000${model}`;
    lines.set(key, {
      agent,
      model,
      counters: addCounters(lines.get(key)?.counters ?? EMPTY_COUNTERS, counters),
    });
  }
  // A model with no tokens says nothing: Claude Code writes `<synthetic>` turns with zero usage.
  const priced = [...lines.entries()]
    .map(([key, line]) => ({
      key,
      ...line,
      costUsd: estimateCostUsd(line.model, line.counters),
      tokens: totalTokens(line.counters),
    }))
    .filter((row) => row.tokens > 0);
  const tenths = largestRemainderTenths(priced.map((row) => row.costUsd ?? 0));
  const rows = priced
    .map(({ counters: _counters, ...row }, index) => ({
      ...row,
      shareTenths: row.costUsd === null ? null : tenths[index],
    }))
    .sort(
      (left, right) =>
        (right.costUsd ?? -1) - (left.costUsd ?? -1) ||
        right.tokens - left.tokens ||
        left.model.localeCompare(right.model),
    );
  return {
    rows: rows.slice(0, MODEL_ROWS_SHOWN),
    hidden: Math.max(0, rows.length - MODEL_ROWS_SHOWN),
  };
}
