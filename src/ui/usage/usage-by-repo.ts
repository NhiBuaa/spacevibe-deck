/**
 * Usage grouped by repository, as the rows of the details page's table. Pure —
 * no signals, no DOM.
 *
 * The input is one repository's counters per `agent/model`. Until the
 * scanner records a working directory per bucket (plan 2026-10-14-usage-
 * scanner-by-repo) nothing real produces it; the gallery feeds fixtures.
 *
 * Three rules carry the page's honesty and are why this is not a plain group-by:
 * - a cost is the PRICED part only, `null` when nothing in the row has a price,
 *   so a dash is never confused with `$0` (DL-15.6);
 * - a repository's share is the SUM of its lines' shares, and the lines' shares
 *   come from one largest-remainder pass over every line, so the column adds up
 *   to 100.0 at both levels to the printed digit;
 * - a row with no resolvable repository is kept, last, so the table still sums
 *   to the machine-wide total.
 */

import { estimateCostUsd } from "../../lib/usage-pricing";
import { totalTokens, type UsageAgent, type UsageCounters } from "../../lib/usage-snapshot";
import { largestRemainderTenths } from "./usage-shares";

export interface RepoUsageLine {
  readonly agent: UsageAgent;
  /** The raw model string, as the scanner reports it. */
  readonly model: string;
  readonly counters: UsageCounters;
}

export interface RepoUsage {
  /** The repository root path. The identity: two repos may share a `name`. */
  readonly key: string;
  readonly name: string;
  /** The folder that holds it, shown faint so same-named repos stay apart. */
  readonly parent: string | null;
  /** Usage whose working directory resolved to no repository. */
  readonly unattributed?: boolean;
  readonly lines: readonly RepoUsageLine[];
}

export interface RepoRowLine {
  readonly agent: UsageAgent;
  readonly model: string;
  /** Null when the model has no published price. */
  readonly costUsd: number | null;
  readonly tokens: number;
  /** Tenths of a percent of the priced total; null when no stated total or no price. */
  readonly shareTenths: number | null;
}

export interface RepoRow {
  readonly key: string;
  readonly name: string;
  readonly parent: string | null;
  readonly unattributed: boolean;
  /** The priced part; null only when no line of this repo has a price. */
  readonly costUsd: number | null;
  readonly tokens: number;
  /** Tokens `costUsd` leaves out, so the row can say what is missing. */
  readonly unpricedTokens: number;
  readonly shareTenths: number | null;
  /** The agent that spent the most here; the colour a single-hue bar takes. */
  readonly dominantAgent: UsageAgent;
  /** Each agent's priced cost, in tokens when nothing is priced, for a mix strip. */
  readonly agentWeights: readonly { readonly agent: UsageAgent; readonly weight: number }[];
  readonly lines: readonly RepoRowLine[];
}

export interface RepoTable {
  readonly rows: readonly RepoRow[];
  /** The priced part of everything; null only when nothing anywhere has a price. */
  readonly totalCostUsd: number | null;
  readonly totalTokens: number;
  readonly unpricedModels: readonly string[];
}

function byCostThenTokens(
  left: { costUsd: number | null; tokens: number },
  right: { costUsd: number | null; tokens: number },
): number {
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
  return right.tokens - left.tokens;
}

function sumPriced(costs: readonly (number | null)[]): number | null {
  let sum = 0;
  let priced = 0;
  for (const cost of costs) {
    if (cost !== null) {
      sum += cost;
      priced += 1;
    }
  }
  return priced === 0 ? null : sum;
}

interface DraftLine extends RepoRowLine {
  readonly counters: UsageCounters;
}

function draftLines(lines: readonly RepoUsageLine[]): readonly DraftLine[] {
  return lines
    .map((line) => ({
      agent: line.agent,
      model: line.model,
      counters: line.counters,
      costUsd: estimateCostUsd(line.model, line.counters),
      tokens: totalTokens(line.counters),
      shareTenths: null,
    }))
    .filter((line) => line.tokens > 0)
    .sort(
      (left, right) =>
        byCostThenTokens(left, right) ||
        left.agent.localeCompare(right.agent) ||
        left.model.localeCompare(right.model),
    );
}

function dominantOf(lines: readonly DraftLine[]): {
  readonly dominantAgent: UsageAgent;
  readonly agentWeights: RepoRow["agentWeights"];
} {
  const priced = lines.some((line) => line.costUsd !== null);
  const weights = new Map<UsageAgent, number>();
  for (const line of lines) {
    const weight = priced ? (line.costUsd ?? 0) : line.tokens;
    weights.set(line.agent, (weights.get(line.agent) ?? 0) + weight);
  }
  const agentWeights = [...weights.entries()]
    .map(([agent, weight]) => ({ agent, weight }))
    .sort((left, right) => right.weight - left.weight || left.agent.localeCompare(right.agent));
  return { dominantAgent: agentWeights[0].agent, agentWeights };
}

/**
 * The page's rows for one range's worth of per-repo usage. Repositories with no
 * tokens are dropped; the unattributed row sorts after every real repository.
 */
export function buildRepoTable(repos: readonly RepoUsage[]): RepoTable {
  const drafts = repos
    .map((repo) => ({ repo, lines: draftLines(repo.lines) }))
    .filter((entry) => entry.lines.length > 0);
  const totalCostUsd = sumPriced(drafts.flatMap((entry) => entry.lines.map((l) => l.costUsd)));

  const leaves = drafts.flatMap((entry) => entry.lines);
  const tenths =
    totalCostUsd === null ? null : largestRemainderTenths(leaves.map((line) => line.costUsd ?? 0));
  let cursor = 0;

  const rows = drafts.map(({ repo, lines }): RepoRow => {
    const shared = lines.map((line): RepoRowLine => {
      const share = tenths === null || line.costUsd === null ? null : tenths[cursor];
      cursor += 1;
      return {
        agent: line.agent,
        model: line.model,
        costUsd: line.costUsd,
        tokens: line.tokens,
        shareTenths: share,
      };
    });
    const costUsd = sumPriced(lines.map((line) => line.costUsd));
    const shares = shared.map((line) => line.shareTenths);
    return {
      key: repo.key,
      name: repo.name,
      parent: repo.parent,
      unattributed: repo.unattributed === true,
      costUsd,
      tokens: lines.reduce((sum, line) => sum + line.tokens, 0),
      unpricedTokens: lines.reduce(
        (sum, line) => sum + (line.costUsd === null ? line.tokens : 0),
        0,
      ),
      shareTenths:
        costUsd === null ? null : shares.reduce<number>((sum, part) => sum + (part ?? 0), 0),
      ...dominantOf(lines),
      lines: shared,
    };
  });

  rows.sort(
    (left, right) =>
      Number(left.unattributed) - Number(right.unattributed) ||
      byCostThenTokens(left, right) ||
      left.name.localeCompare(right.name) ||
      left.key.localeCompare(right.key),
  );

  const unpricedModels = [
    ...new Set(leaves.filter((line) => line.costUsd === null).map((line) => line.model)),
  ].sort();
  return {
    rows,
    totalCostUsd,
    totalTokens: rows.reduce((sum, row) => sum + row.tokens, 0),
    unpricedModels,
  };
}
