import { appendFileSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanAll, buildSnapshot } from "./scan";
import { emptyCache } from "./model";
import type { ResolveRepo } from "./repo-resolver";

/**
 * The repository dimension of the scan: per-line cwds survive compaction and
 * resume, a stored cwd → repository answer is never recomputed, a transient
 * one is never stored, and the rows always sum to the total. The resolver is
 * a stub; `repo-resolver.test.ts` runs real git.
 */

const T0 = 1_786_320_000_000; // 2026-08-10T00:00:00Z
const NOW = T0 + 60 * 60 * 1000;

const temps: string[] = [];
function tempHome(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "usage-repos-"));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function pin(target: string, atMs: number = T0): void {
  utimesSync(target, atMs / 1000, atMs / 1000);
}

function claudeHome(home: string, lines: string): string {
  const project = path.join(home, ".claude", "projects", "proj");
  mkdirSync(project, { recursive: true });
  const file = path.join(project, "sess.jsonl");
  writeFileSync(file, lines);
  pin(file);
  return file;
}

function lineIn(cwd: string | null, id: string, output: number): string {
  return `${JSON.stringify({
    type: "assistant",
    timestamp: "2026-08-10T05:06:00.351Z",
    requestId: `req-${id}`,
    sessionId: "sess-1",
    ...(cwd === null ? {} : { cwd }),
    message: {
      id: `msg-${id}`,
      model: "claude-opus-5",
      usage: { input_tokens: 1, output_tokens: output },
    },
  })}\n`;
}

/** A stub that records every call and answers from a table. */
function tableResolver(table: Record<string, string | null | "retry">) {
  const calls: string[] = [];
  const resolve: ResolveRepo = async (cwd) => {
    calls.push(cwd);
    const answer = table[cwd];
    if (answer === "retry" || answer === undefined) {
      return { kind: "retry" };
    }
    return answer === null ? { kind: "none" } : { kind: "repo", root: answer };
  };
  return { calls, resolve };
}

const sumOutput = (buckets: readonly { counters: { output: number } }[]) =>
  buckets.reduce((sum, bucket) => sum + bucket.counters.output, 0);

describe("usage by repository", () => {
  it("keeps one row per repository, and the rows sum to the total", async () => {
    const home = tempHome();
    claudeHome(
      home,
      lineIn("/w/deck", "1", 10) +
        lineIn("/w/deck-worktrees/feature", "2", 20) +
        lineIn("/w/notes", "3", 5) +
        lineIn(null, "4", 1),
    );
    const { resolve } = tableResolver({
      "/w/deck": "/w/deck",
      "/w/deck-worktrees/feature": "/w/deck",
      "/w/notes": null,
    });
    const snapshot = buildSnapshot(await scanAll(emptyCache(), home, NOW, resolve), NOW);
    expect(snapshot.buckets.map((bucket) => [bucket.repo, bucket.counters.output])).toEqual([
      [null, 1],
      ["/w/deck", 30],
      ["/w/notes", 5],
    ]);
    expect(sumOutput(snapshot.buckets)).toBe(36);
  });

  it("keeps two directories of one file apart after compaction", async () => {
    const home = tempHome();
    claudeHome(home, lineIn("/w/a", "1", 10) + lineIn("/w/b", "2", 20));
    const { resolve } = tableResolver({ "/w/a": "/w/a", "/w/b": "/w/b" });
    const first = await scanAll(emptyCache(), home, NOW, resolve);
    const later = NOW + 49 * 60 * 60 * 1000;
    const second = await scanAll(first.cache, home, later, resolve);
    const record = [...second.cache.files.values()][0];
    expect(record.compacted).toBe(true);
    expect(record.totals.map((total) => total.cwd)).toEqual(["/w/a", "/w/b"]);
    expect(
      buildSnapshot(second, later).buckets.map((bucket) => [bucket.repo, bucket.counters.output]),
    ).toEqual([
      ["/w/a", 10],
      ["/w/b", 20],
    ]);
  });

  it("asks once per new cwd, and a warm poll with stored answers asks nothing", async () => {
    const home = tempHome();
    const file = claudeHome(home, lineIn("/w/a", "1", 10) + lineIn("/w/a", "2", 1));
    const { calls, resolve } = tableResolver({ "/w/a": "/w/a", "/w/b": null });
    const first = await scanAll(emptyCache(), home, NOW, resolve);
    expect(calls).toEqual(["/w/a"]);
    const warm = await scanAll(first.cache, home, NOW, resolve);
    expect(warm.changed).toBe(false);
    expect(calls).toEqual(["/w/a"]);

    appendFileSync(file, lineIn("/w/b", "3", 2));
    pin(file, T0 + 1000);
    const grown = await scanAll(warm.cache, home, NOW, resolve);
    expect(calls).toEqual(["/w/a", "/w/b"]);
    expect([...grown.cache.repos]).toEqual([
      ["/w/a", "/w/a"],
      ["/w/b", null],
    ]);
  });

  it("ships a transient answer as the raw cwd, stores nothing, and asks again", async () => {
    const home = tempHome();
    claudeHome(home, lineIn("/w/a", "1", 10));
    const table: Record<string, string | null | "retry"> = { "/w/a": "retry" };
    const { calls, resolve } = tableResolver(table);
    const first = await scanAll(emptyCache(), home, NOW, resolve);
    expect(first.cache.repos.size).toBe(0);
    expect(buildSnapshot(first, NOW).buckets[0].repo).toBe("/w/a");

    table["/w/a"] = "/w/repo";
    const second = await scanAll(first.cache, home, NOW, resolve);
    expect(calls).toEqual(["/w/a", "/w/a"]);
    // The resolution alone is a change worth writing.
    expect(second.changed).toBe(true);
    expect(buildSnapshot(second, NOW).buckets[0].repo).toBe("/w/repo");
  });

  it("never recomputes a stored answer, so a removed worktree keeps its repository", async () => {
    const home = tempHome();
    const file = claudeHome(home, lineIn("/w/wt", "1", 10));
    const table: Record<string, string | null | "retry"> = { "/w/wt": "/w/repo" };
    const { resolve } = tableResolver(table);
    const first = await scanAll(emptyCache(), home, NOW, resolve);

    // The worktree directory is gone now; git would say so.
    table["/w/wt"] = null;
    appendFileSync(file, lineIn("/w/wt", "2", 5));
    pin(file, T0 + 1000);
    const second = await scanAll(first.cache, home, NOW, resolve);
    expect(buildSnapshot(second, NOW).buckets.map((bucket) => bucket.repo)).toEqual(["/w/repo"]);
  });

  it("drops a stored answer once no record references its cwd", async () => {
    const home = tempHome();
    const file = claudeHome(home, lineIn("/w/a", "1", 10));
    const { resolve } = tableResolver({ "/w/a": "/w/a" });
    const first = await scanAll(emptyCache(), home, NOW, resolve);
    expect(first.cache.repos.size).toBe(1);
    rmSync(file);
    const second = await scanAll(first.cache, home, NOW, resolve);
    expect(second.cache.repos.size).toBe(0);
    expect(second.changed).toBe(true);
  });

  it("keeps a path with spaces whole", async () => {
    const home = tempHome();
    const spaced = "/Users/me/Library/Application Support/My Repo";
    claudeHome(home, lineIn(spaced, "1", 10));
    const { resolve } = tableResolver({ [spaced]: spaced });
    const snapshot = buildSnapshot(await scanAll(emptyCache(), home, NOW, resolve), NOW);
    expect(snapshot.buckets).toHaveLength(1);
    expect(snapshot.buckets[0]).toMatchObject({ model: "claude-opus-5", repo: spaced });
  });

  it("resumes a Codex rollout with the directory it already knew", async () => {
    const home = tempHome();
    const sessions = path.join(home, ".codex", "sessions");
    mkdirSync(sessions, { recursive: true });
    const count = (at: string, input: number) =>
      `${JSON.stringify({
        timestamp: at,
        type: "event_msg",
        payload: {
          type: "token_count",
          info: { total_token_usage: { input_tokens: input, output_tokens: 0 } },
        },
      })}\n`;
    const file = path.join(sessions, "rollout-a.jsonl");
    writeFileSync(
      file,
      `${JSON.stringify({
        timestamp: "2026-08-10T04:45:59.358Z",
        type: "session_meta",
        payload: { id: "codex-1", cwd: "/w/codex" },
      })}\n${count("2026-08-10T04:46:10.000Z", 100)}`,
    );
    pin(file);
    const { resolve } = tableResolver({ "/w/codex": "/w/codex-repo" });
    const first = await scanAll(emptyCache(), home, NOW, resolve);
    appendFileSync(file, count("2026-08-10T04:47:10.000Z", 150));
    pin(file, T0 + 1000);
    const resumed = await scanAll(first.cache, home, NOW, resolve);
    const record = [...resumed.cache.files.values()][0];
    expect(record.offset).toBeGreaterThan(0);
    expect(record.totals.map((total) => total.cwd)).toEqual(["/w/codex"]);
    const buckets = buildSnapshot(resumed, NOW).buckets;
    expect(buckets.map((bucket) => [bucket.repo, bucket.counters.inputUncached])).toEqual([
      ["/w/codex-repo", 150],
    ]);
  });
});
