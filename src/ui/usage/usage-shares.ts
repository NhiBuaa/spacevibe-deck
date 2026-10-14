/** Shares are printed to one decimal, so the arithmetic runs in tenths. */
const PERCENT_TENTHS = 1000;

/**
 * Shares in tenths of a percent (integers summing to exactly 1000, or all zero
 * when nothing is stated), by largest remainder, so the printed figures add up
 * to exactly 100.0 — rounding each share independently prints
 * 33.3 + 33.3 + 33.3 = 99.9, and a reader who adds the column up is entitled
 * to get 100. Every share is floored first; the leftover tenths then go to the
 * largest fractional parts, ties broken by position so the result is stable
 * across renders rather than dependent on sort order.
 *
 * The integer form exists so a parent row can SUM its children's tenths and
 * still agree with them to the digit.
 */
export function largestRemainderTenths(costs: readonly number[]): readonly number[] {
  const sum = costs.reduce((running, cost) => running + cost, 0);
  if (sum <= 0) {
    return costs.map(() => 0);
  }
  const exact = costs.map((cost) => (cost / sum) * PERCENT_TENTHS);
  const tenths = exact.map(Math.floor);
  const assigned = tenths.reduce((running, part) => running + part, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction || left.index - right.index);
  for (let spare = 0; spare < PERCENT_TENTHS - assigned; spare += 1) {
    tenths[byRemainder[spare % byRemainder.length].index] += 1;
  }
  return tenths;
}

/** The same shares as percentages with one decimal (`33.4`). */
export function largestRemainderShares(costs: readonly number[]): readonly number[] {
  return largestRemainderTenths(costs).map((part) => part / 10);
}
