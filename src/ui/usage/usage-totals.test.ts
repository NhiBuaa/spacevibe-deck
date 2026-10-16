import { expect, it } from "vitest";
import { EMPTY_COUNTERS, type UsageBucket } from "../../lib/usage-snapshot";
import { buildUsageTotals } from "./usage-totals";

const NOW = new Date(2026, 9, 15, 12).getTime();
const bucket = (model: string, counters: Partial<typeof EMPTY_COUNTERS>): UsageBucket => ({
  bucketStartMs: NOW - 3_600_000,
  agent: "claude",
  model,
  repo: null,
  counters: { ...EMPTY_COUNTERS, ...counters },
});

it("splits input into cached and uncached, counting cache writes as uncached", () => {
  const totals = buildUsageTotals(
    [
      bucket("claude-opus-4-5", {
        cacheRead: 900,
        inputUncached: 60,
        cacheCreate5m: 40,
        output: 10,
      }),
    ],
    "all",
    NOW,
  );
  expect(totals).toMatchObject({
    processedTokens: 1010,
    cachedInputTokens: 900,
    uncachedInputTokens: 100,
    outputTokens: 10,
    cacheHitPercent: 90,
    savingsPartial: false,
  });
  // 900 reads at (input - cacheRead) = 4.5e-6 each.
  expect(totals.savingsUsd).toBeCloseTo(0.00405, 8);
});

it("says nothing about savings when no cache read could be priced, and flags a partial sum", () => {
  const none = buildUsageTotals([bucket("not-a-model", { cacheRead: 5 })], "all", NOW);
  expect(none.savingsUsd).toBeNull();
  expect(none.savingsPartial).toBe(true);
  const some = buildUsageTotals(
    [bucket("claude-opus-4-5", { cacheRead: 10 }), bucket("not-a-model", { cacheRead: 5 })],
    "all",
    NOW,
  );
  expect(some.savingsUsd).toBeGreaterThan(0);
  expect(some.savingsPartial).toBe(true);
});

it("leaves the hit rate empty with no input and ignores buckets outside the range", () => {
  expect(buildUsageTotals([], "all", NOW).cacheHitPercent).toBeNull();
  const old = { ...bucket("claude-opus-4-5", { output: 7 }), bucketStartMs: NOW - 40 * 86_400_000 };
  expect(buildUsageTotals([old], "7d", NOW).processedTokens).toBe(0);
  expect(buildUsageTotals([old], "all", NOW).processedTokens).toBe(7);
});
