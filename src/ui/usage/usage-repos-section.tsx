import { usageLoading, usageSnapshot } from "../../usage/usage-store";
import { activeUsageRange } from "./active-usage-view-store";
import { buildRepoTable } from "./usage-by-repo";
import { USAGE_RANGES } from "./usage-ranges";
import { reposFromBuckets } from "./usage-repos-from-buckets";
import { UsageRepoTiles } from "./usage-repo-tiles";

/** Said when the scanner has not yet recorded a repository on any bucket. */
const NO_REPO_NOTE = "repository grouping starts after the next full scan";

/**
 * The details page's repository tiles over the store's current snapshot and
 * the overview's period. Renders off signals and owns no poll, like the
 * overview beside it.
 */
export function UsageReposSection() {
  const snapshot = usageSnapshot.value;
  const range = USAGE_RANGES.find((entry) => entry.id === activeUsageRange.value)?.id ?? "all";
  const definition = USAGE_RANGES.find((entry) => entry.id === range)!;
  const buckets = snapshot?.buckets ?? [];
  const table = buildRepoTable(reposFromBuckets(buckets, range, Date.now()));
  const reading = usageLoading.value;
  const hasRepoData = buckets.some((bucket) => bucket.repo !== null);
  return (
    <UsageRepoTiles
      table={table}
      emptyLabel={definition.emptyLabel}
      loading={reading && snapshot === null}
      reloading={reading && snapshot !== null}
      note={buckets.length > 0 && !hasRepoData ? NO_REPO_NOTE : undefined}
    />
  );
}
