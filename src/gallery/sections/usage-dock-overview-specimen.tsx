/**
 * The dock's Usage overview in the same palette as the repository tiles, so
 * both surfaces can be judged side by side. The real `OverviewContent` over
 * generated history; nothing here reads the scanner. Gallery only (R7).
 */
import { EMPTY_COUNTERS, type UsageBucket } from "../../lib/usage-snapshot";
import { OverviewContent } from "../../ui/usage/sections/overview-section";

const NOW = new Date(2026, 9, 15, 12).getTime();
const DAY_MS = 86_400_000;
const WEEKS = 26;
const WEEK_DAYS = 7;

/** Six months of weekly buckets that grow, Claude first, Codex heavier early on. */
function history(): readonly UsageBucket[] {
  return Array.from({ length: WEEKS }, (_, week) => {
    const start = NOW - (WEEKS - week) * WEEK_DAYS * DAY_MS;
    const growth = (week + 1) / WEEKS;
    return [
      {
        bucketStartMs: start,
        agent: "claude" as const,
        model: "claude-opus-5-5",
        repo: null,
        counters: { ...EMPTY_COUNTERS, cacheRead: Math.round(300_000_000 * growth ** 2) },
      },
      {
        bucketStartMs: start,
        agent: "codex" as const,
        model: "gpt-5",
        repo: null,
        counters: { ...EMPTY_COUNTERS, cacheRead: Math.round(500_000_000 * (1.1 - growth)) },
      },
    ];
  }).flat();
}

const LIMITS = { snapshot: [], nowMs: NOW, available: true, loading: false, error: false };

export function UsageDockOverviewSpecimen() {
  return (
    <div class="ur-dock">
      <OverviewContent
        buckets={history()}
        range="all"
        onRangeChange={() => undefined}
        limits={LIMITS}
        nowMs={NOW}
      />
    </div>
  );
}
