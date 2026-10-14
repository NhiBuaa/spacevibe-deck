import { describe, expect, it } from "vitest";
import { buildRepoTable, summarizeRepo, type RepoUsage } from "./usage-by-repo";

const tokens = (output: number) => ({
  inputUncached: 0,
  cacheRead: 0,
  cacheCreate5m: 0,
  cacheCreate1h: 0,
  cacheWrite: 0,
  output,
});

function repo(key: string, name: string, ...lines: [string, number][]): RepoUsage {
  return {
    key,
    name,
    parent: null,
    unattributed: key === "unattributed",
    lines: lines.map(([model, output]) => ({
      agent: model.startsWith("gpt") ? "codex" : "claude",
      model,
      counters: tokens(output),
    })),
  };
}

/** Three equal repos split 100.0 as 33.3 / 33.3 / 33.4, never 99.9. */
const THIRDS = [
  repo("/a", "a", ["claude-opus-5-5", 1_000_000]),
  repo("/b", "b", ["claude-opus-5-5", 1_000_000]),
  repo("/c", "c", ["claude-opus-5-5", 1_000_000]),
];
const AWKWARD = [
  repo("/w/one/app", "app", ["claude-sonnet-5-5", 900_000], ["gpt-5", 400_000]),
  repo("/w/two/app", "app", ["gpt-6-preview", 700_000], ["claude-haiku-5-5", 90_000]),
  repo("unattributed", "Unattributed", ["gpt-5", 50_000]),
];

const FIXTURES = { thirds: THIRDS, awkward: AWKWARD };
const REPOS_TYPICAL = THIRDS;
const REPOS_AWKWARD = AWKWARD;

describe("buildRepoTable", () => {
  it.each(Object.entries(FIXTURES))("%s: repo costs and tokens sum to the totals", (_, repos) => {
    const table = buildRepoTable(repos);
    const cost = table.rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0);
    expect(cost).toBeCloseTo(table.totalCostUsd ?? 0, 6);
    expect(table.rows.reduce((sum, row) => sum + row.tokens, 0)).toBe(table.totalTokens);
  });

  it.each(Object.entries(FIXTURES))(
    "%s: shares add to exactly 100.0 at both levels",
    (_, repos) => {
      const table = buildRepoTable(repos);
      const repoShares = table.rows.reduce((sum, row) => sum + (row.shareTenths ?? 0), 0);
      const lineShares = table.rows.reduce(
        (sum, row) => sum + row.lines.reduce((inner, line) => inner + (line.shareTenths ?? 0), 0),
        0,
      );
      expect(repoShares).toBe(1000);
      expect(lineShares).toBe(1000);
    },
  );

  it("a repo with no priced line has a null cost and share, never zero", () => {
    const [row] = buildRepoTable([
      {
        key: "/x",
        name: "x",
        parent: null,
        lines: [
          {
            agent: "codex",
            model: "gpt-6-preview",
            counters: {
              inputUncached: 10,
              cacheRead: 0,
              cacheCreate5m: 0,
              cacheCreate1h: 0,
              cacheWrite: 0,
              output: 5,
            },
          },
        ],
      },
    ]).rows;
    expect(row.costUsd).toBeNull();
    expect(row.shareTenths).toBeNull();
    expect(row.unpricedTokens).toBe(15);
  });

  it("keeps same-named repos apart by key and sorts Unattributed last", () => {
    const table = buildRepoTable([...REPOS_TYPICAL, ...REPOS_AWKWARD]);
    const apps = table.rows.filter((row) => row.name === "app");
    expect(new Set(apps.map((row) => row.key)).size).toBe(2);
    expect(table.rows.at(-1)?.unattributed).toBe(true);
  });

  it("agent fractions add to 1 even for a repo that cost under a dollar", () => {
    const [row] = buildRepoTable([
      repo("/tiny", "tiny", ["claude-haiku-5-5", 1_000], ["gpt-5", 2_000]),
    ]).rows;
    expect(row.agentWeights).toHaveLength(2);
    expect(row.agentWeights.reduce((sum, part) => sum + part.fraction, 0)).toBeCloseTo(1, 10);
  });

  it("drops repos with no tokens and reports no total when nothing is priced", () => {
    expect(buildRepoTable([]).rows).toEqual([]);
    expect(buildRepoTable([]).totalCostUsd).toBeNull();
  });
});

describe("summarizeRepo", () => {
  it("names the top two priced models by share of the repo and counts the rest", () => {
    const [row] = buildRepoTable([
      repo(
        "/x",
        "x",
        ["claude-opus-5-5", 3_000_000],
        ["gpt-5", 1_000_000],
        ["claude-haiku-5-5", 10_000],
      ),
    ]).rows;
    const text = summarizeRepo(row);
    expect(text).toMatch(/^claude-opus-5-5 \d+% · gpt-5 \d+% · \+1$/);
  });

  it("names models without percentages when nothing in the repo is priced", () => {
    const [row] = buildRepoTable([repo("/x", "x", ["gpt-6-preview", 5_000])]).rows;
    expect(summarizeRepo(row)).toBe("gpt-6-preview");
  });
});
