import { usageSnapshot } from "../../usage/usage-store";
import { activeUsageRange } from "./active-usage-view-store";
import { buildModelTable } from "./usage-models";
import { UsageModelsTable } from "./usage-models-section";
import { USAGE_RANGES } from "./usage-ranges";
import { buildUsageTotals } from "./usage-totals";
import { UsageTotalsStrip } from "./usage-totals-section";

/**
 * The details page's totals and model table over the store's snapshot and the
 * overview's period. Renders off signals and owns no poll.
 */
export function UsageDetailsSections() {
  const buckets = usageSnapshot.value?.buckets ?? [];
  const range = USAGE_RANGES.find((entry) => entry.id === activeUsageRange.value)?.id ?? "all";
  const definition = USAGE_RANGES.find((entry) => entry.id === range)!;
  const now = Date.now();
  return (
    <>
      <UsageTotalsStrip totals={buildUsageTotals(buckets, range, now)} />
      <UsageModelsTable
        table={buildModelTable(buckets, range, now)}
        emptyLabel={definition.emptyLabel}
      />
    </>
  );
}
