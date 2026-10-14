import type { RepoUsage } from "../../ui/usage/usage-by-repo";
import type { UsageCounters } from "../../lib/usage-snapshot";

/** Fixture figures: the shape of a heavy month, not anyone's real usage. */
function counters(part: Partial<UsageCounters>): UsageCounters {
  return {
    inputUncached: 0,
    cacheRead: 0,
    cacheCreate5m: 0,
    cacheCreate1h: 0,
    cacheWrite: 0,
    output: 0,
    ...part,
  };
}

const OPUS = "claude-opus-5-5";
const SONNET = "claude-sonnet-5-5";
const HAIKU = "claude-haiku-5-5";
const GPT = "gpt-5";
/** Not in the pricing snapshot, so its cost is unknown. */
const UNPRICED = "gpt-6-preview";

export const REPOS_TYPICAL: readonly RepoUsage[] = [
  {
    key: "/Users/dev/Development/spacevibe/spacevibe-deck",
    name: "spacevibe-deck",
    parent: "~/Development/spacevibe",
    lines: [
      {
        agent: "claude",
        model: OPUS,
        counters: counters({
          inputUncached: 3_200_000,
          cacheRead: 612_000_000,
          cacheCreate5m: 21_000_000,
          output: 4_100_000,
        }),
      },
      {
        agent: "claude",
        model: SONNET,
        counters: counters({ inputUncached: 900_000, cacheRead: 88_000_000, output: 1_300_000 }),
      },
      {
        agent: "codex",
        model: GPT,
        counters: counters({ inputUncached: 4_400_000, cacheRead: 140_000_000, output: 2_200_000 }),
      },
    ],
  },
  {
    key: "/Users/dev/Development/spacevibe/spacevibe-api",
    name: "spacevibe-api",
    parent: "~/Development/spacevibe",
    lines: [
      {
        agent: "claude",
        model: OPUS,
        counters: counters({ inputUncached: 1_100_000, cacheRead: 190_000_000, output: 1_600_000 }),
      },
      {
        agent: "codex",
        model: GPT,
        counters: counters({ inputUncached: 900_000, cacheRead: 30_000_000, output: 600_000 }),
      },
    ],
  },
  {
    key: "/Users/dev/Development/spacevibe/spacevibe-bench",
    name: "spacevibe-bench",
    parent: "~/Development/spacevibe",
    lines: [
      {
        agent: "claude",
        model: SONNET,
        counters: counters({ inputUncached: 600_000, cacheRead: 41_000_000, output: 800_000 }),
      },
    ],
  },
  {
    key: "/Users/dev/Development/dotfiles",
    name: "dotfiles",
    parent: "~/Development",
    lines: [
      {
        agent: "claude",
        model: HAIKU,
        counters: counters({ inputUncached: 40_000, cacheRead: 1_200_000, output: 60_000 }),
      },
    ],
  },
  {
    key: "unattributed",
    name: "Unattributed",
    parent: null,
    unattributed: true,
    lines: [
      {
        agent: "codex",
        model: GPT,
        counters: counters({ inputUncached: 120_000, cacheRead: 2_000_000, output: 50_000 }),
      },
    ],
  },
];

/** Two repos that share a name, plus a model with no price and a long path. */
export const REPOS_AWKWARD: readonly RepoUsage[] = [
  {
    key: "/Users/dev/Work/client-one/web/app",
    name: "app",
    parent: "~/Work/client-one/web",
    lines: [
      {
        agent: "claude",
        model: SONNET,
        counters: counters({ inputUncached: 700_000, cacheRead: 55_000_000, output: 900_000 }),
      },
    ],
  },
  {
    key: "/Users/dev/Work/client-two/mobile/app",
    name: "app",
    parent: "~/Work/client-two/mobile",
    lines: [
      {
        agent: "codex",
        model: UNPRICED,
        counters: counters({ inputUncached: 2_000_000, cacheRead: 30_000_000, output: 700_000 }),
      },
      {
        agent: "claude",
        model: HAIKU,
        counters: counters({ inputUncached: 80_000, cacheRead: 3_000_000, output: 90_000 }),
      },
    ],
  },
  {
    key: "/Users/dev/Library/Mobile Documents/com~apple~CloudDocs/Research/experiments/long-running-notebooks/agent-evals",
    name: "agent-evals",
    parent:
      "~/Library/Mobile Documents/com~apple~CloudDocs/Research/experiments/long-running-notebooks",
    lines: [
      {
        agent: "claude",
        model: OPUS,
        counters: counters({ inputUncached: 300_000, cacheRead: 20_000_000, output: 500_000 }),
      },
    ],
  },
];

/** The scanner has not recorded a working directory yet: everything is unattributed. */
export const REPOS_NO_REPO_DATA: readonly RepoUsage[] = [
  {
    key: "unattributed",
    name: "Unattributed",
    parent: null,
    unattributed: true,
    lines: REPOS_TYPICAL.flatMap((repo) => repo.lines),
  },
];

const MANY_MODELS: readonly [string, "claude" | "codex"][] = [
  [OPUS, "claude"],
  ["claude-opus-4-6", "claude"],
  ["claude-opus-4-5", "claude"],
  [SONNET, "claude"],
  ["claude-sonnet-4-6", "claude"],
  ["claude-sonnet-4-5", "claude"],
  [HAIKU, "claude"],
  ["claude-haiku-4-5", "claude"],
  [GPT, "codex"],
  ["gpt-5-codex", "codex"],
  ["gpt-5-mini", "codex"],
  [UNPRICED, "codex"],
];

/** One repository that ran twelve different agent/model pairs. */
export const REPOS_MANY_LINES: readonly RepoUsage[] = [
  {
    key: "/Users/dev/Development/spacevibe/spacevibe-deck",
    name: "spacevibe-deck",
    parent: "~/Development/spacevibe",
    lines: MANY_MODELS.map(([model, agent], index) => ({
      agent,
      model,
      counters: counters({
        inputUncached: 400_000 - index * 25_000,
        cacheRead: 60_000_000 - index * 4_000_000,
        output: 900_000 - index * 50_000,
      }),
    })),
  },
  REPOS_TYPICAL[1],
];
