/**
 * The period's token mix and what the cache saved. Pure.
 *
 * "Uncached input" is every input token that was not a cache read, writes
 * included: a written token is new input the model had to take in.
 */

import { estimateCacheSavingsUsd } from "../../lib/usage-pricing";
import { totalTokens, type UsageBucket } from "../../lib/usage-snapshot";
import { bucketsInRange, type UsageRangeId } from "./usage-ranges";

const PERCENT = 100;

export interface UsageTotals {
  readonly processedTokens: number;
  readonly cachedInputTokens: number;
  readonly uncachedInputTokens: number;
  readonly outputTokens: number;
  /** Cache reads as a share of all input, whole percent; null with no input. */
  readonly cacheHitPercent: number | null;
  /** Null when no cache read could be priced; otherwise the priced part. */
  readonly savingsUsd: number | null;
  /** Some cache reads came from a model with no published price. */
  readonly savingsPartial: boolean;
}

export function buildUsageTotals(
  buckets: readonly UsageBucket[],
  range: UsageRangeId,
  nowMs: number,
): UsageTotals {
  let processed = 0;
  let cached = 0;
  let uncached = 0;
  let output = 0;
  let savings = 0;
  let priced = false;
  let partial = false;
  for (const { model, counters } of bucketsInRange(buckets, range, nowMs)) {
    processed += totalTokens(counters);
    cached += counters.cacheRead;
    uncached +=
      counters.inputUncached +
      counters.cacheCreate5m +
      counters.cacheCreate1h +
      counters.cacheWrite;
    output += counters.output;
    const saved = estimateCacheSavingsUsd(model, counters);
    if (saved === null) {
      partial = true;
    } else if (counters.cacheRead > 0) {
      savings += saved;
      priced = true;
    }
  }
  const input = cached + uncached;
  return {
    processedTokens: processed,
    cachedInputTokens: cached,
    uncachedInputTokens: uncached,
    outputTokens: output,
    cacheHitPercent: input === 0 ? null : Math.round((cached / input) * PERCENT),
    savingsUsd: priced ? savings : null,
    savingsPartial: partial,
  };
}
