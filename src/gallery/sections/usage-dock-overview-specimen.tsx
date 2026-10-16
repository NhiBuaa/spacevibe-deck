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

const HOUR_MS = 3_600_000;
const LIMITS = {
  snapshot: [
    {
      agent: "claude" as const,
      state: "ready" as const,
      observedAtMs: NOW,
      windows: [
        { durationMinutes: 300, usedPercent: 91, resetsAtMs: NOW + 2 * HOUR_MS },
        { durationMinutes: 1440, usedPercent: 12, resetsAtMs: NOW + 9 * HOUR_MS },
        { durationMinutes: 10080, usedPercent: 46, resetsAtMs: NOW + 35 * HOUR_MS },
      ],
    },
    {
      agent: "codex" as const,
      state: "ready" as const,
      observedAtMs: NOW,
      windows: [{ durationMinutes: 10080, usedPercent: 38, resetsAtMs: NOW + 126 * HOUR_MS }],
    },
  ],
  nowMs: NOW,
  available: true,
  loading: false,
  error: false,
};

export function UsageDockOverviewSpecimen({
  loading = false,
}: {
  readonly loading?: boolean;
} = {}) {
  return (
    <div class="ur-dock">
      <OverviewContent
        buckets={history()}
        range="all"
        onRangeChange={() => undefined}
        limits={LIMITS}
        nowMs={NOW}
        loading={loading}
      />
    </div>
  );
}
