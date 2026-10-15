import { describe, expect, it } from "vitest";
import { EMPTY_COUNTERS, type UsageBucket } from "../../lib/usage-snapshot";
import { reposFromBuckets } from "./usage-repos-from-buckets";

const NOW = new Date(2026, 9, 15, 12).getTime();
const DAY = 86_400_000;

function bucket(over: Partial<UsageBucket>): UsageBucket {
  return {
    bucketStartMs: NOW - 1000,
    agent: "claude",
    model: "claude-opus-5-5",
    repo: "/work/app",
    counters: { ...EMPTY_COUNTERS, output: 10 },
    ...over,
  };
}

describe("reposFromBuckets", () => {
  it("merges buckets of one repo and agent/model into one line", () => {
    const repos = reposFromBuckets([bucket({}), bucket({ bucketStartMs: NOW - 2000 })], "all", NOW);
    expect(repos).toHaveLength(1);
    expect(repos[0].lines).toHaveLength(1);
    expect(repos[0].lines[0].counters.output).toBe(20);
  });

  it("keeps same-named repos apart and labels them by folder", () => {
    const repos = reposFromBuckets(
      [bucket({ repo: "/a/app" }), bucket({ repo: "/b/app.git" })],
      "all",
      NOW,
    );
    expect(repos.map((r) => [r.key, r.name, r.parent])).toEqual([
      ["/a/app", "app", "a"],
      ["/b/app.git", "app", "b"],
    ]);
  });

  it("reads Windows separators and a trailing slash", () => {
    const [repo] = reposFromBuckets([bucket({ repo: "C:\\dev\\deck\\" })], "all", NOW);
    expect([repo.name, repo.parent]).toEqual(["deck", "dev"]);
  });

  it("puts a bucket with no repo under Unattributed", () => {
    const [repo] = reposFromBuckets([bucket({ repo: null })], "all", NOW);
    expect(repo.unattributed).toBe(true);
    expect(repo.name).toBe("Unattributed");
  });

  it("applies the period like the timeline: local days, nothing in the future", () => {
    const old = bucket({ bucketStartMs: NOW - 10 * DAY, repo: "/old" });
    const future = bucket({ bucketStartMs: NOW + DAY, repo: "/future" });
    expect(reposFromBuckets([old, future, bucket({})], "7d", NOW).map((r) => r.key)).toEqual([
      "/work/app",
    ]);
    expect(reposFromBuckets([old], "all", NOW)).toHaveLength(1);
  });
});
