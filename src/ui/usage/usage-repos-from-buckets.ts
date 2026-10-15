/**
 * Scanner buckets → the per-repository input `buildRepoTable` takes. Pure.
 *
 * The period filter is the timeline's own (same `rangeSinceMs`, same upper
 * bound), so a tile total and the chart beside it cover the same buckets.
 */

import { addCounters, EMPTY_COUNTERS, type UsageBucket } from "../../lib/usage-snapshot";
import type { RepoUsage, RepoUsageLine } from "./usage-by-repo";
import { rangeSinceMs, USAGE_RANGES, type UsageRangeId } from "./usage-ranges";

const UNATTRIBUTED_KEY = "(unattributed)";

/** Path segments, tolerating both separators and a trailing one. */
function segments(path: string): readonly string[] {
  return path.split(/[\\/]+/).filter((part) => part.length > 0);
}

function describeRepo(path: string): Pick<RepoUsage, "name" | "parent"> {
  const parts = segments(path);
  const last = parts[parts.length - 1] ?? path;
  return {
    name: last.replace(/\.git$/, "") || last,
    parent: parts.length > 1 ? parts[parts.length - 2] : null,
  };
}

export function reposFromBuckets(
  buckets: readonly UsageBucket[],
  range: UsageRangeId,
  nowMs: number,
): readonly RepoUsage[] {
  const definition = USAGE_RANGES.find((entry) => entry.id === range)!;
  const since = rangeSinceMs(definition, nowMs);
  const byRepo = new Map<string, Map<string, RepoUsageLine>>();
  for (const bucket of buckets) {
    if (bucket.bucketStartMs > nowMs || (since !== null && bucket.bucketStartMs < since)) {
      continue;
    }
    const key = bucket.repo ?? UNATTRIBUTED_KEY;
    const lines = byRepo.get(key) ?? new Map();
    const lineKey = `${bucket.agent}\u0000${bucket.model}`;
    const previous = lines.get(lineKey)?.counters ?? EMPTY_COUNTERS;
    lines.set(lineKey, {
      agent: bucket.agent,
      model: bucket.model,
      counters: addCounters(previous, bucket.counters),
    });
    byRepo.set(key, lines);
  }
  return [...byRepo.entries()].map(([key, lines]) => ({
    key,
    unattributed: key === UNATTRIBUTED_KEY,
    ...(key === UNATTRIBUTED_KEY ? { name: "Unattributed", parent: null } : describeRepo(key)),
    lines: [...lines.values()],
  }));
}
