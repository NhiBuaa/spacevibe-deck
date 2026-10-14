import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runReleaseCut, commandRunner } from "./release-cut.mjs";
import {
  chooseVersion,
  cutChangelog,
  parseArguments,
  requireCiJobs,
  validateAssets,
} from "./release-cut-model.mjs";
import { createGithub } from "./release-cut-github.mjs";

const roots: string[] = [];
afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});
const commit = (subject: string, body = "") => ({ subject, body });
const notes =
  "# Changelog\n\n## Unreleased\n\n- Fixed daily release cuts.\n\n## 2.2.0\n\nPrevious release.\n";
const ciJobs = () => [
  {
    name: "check",
    conclusion: "success",
    steps: ["Test", "Build frontend"].map((name) => ({
      name,
      conclusion: "success",
      status: "completed",
    })),
  },
  { name: "backend-check", conclusion: "success" },
  { name: "windows-check", conclusion: "skipped" },
];

describe("release cut pure contracts", () => {
  it("selects patch for fixes and minor for a feature anywhere in the range", () => {
    expect(chooseVersion("2.2.0", [commit("fix(ui): repair")])).toBe("2.2.1");
    expect(
      chooseVersion("2.2.0", [commit("feat(ui): hidden feature"), commit("fix(ui): repair")]),
    ).toBe("2.3.0");
    expect(chooseVersion("2.2.0", [commit("chore(release): tooling")], "patch")).toBe("2.2.1");
  });
  it.each(["feat(api)!: change", "fix(api): change\n"])(
    "refuses breaking metadata even with an override: %s",
    (subject) => {
      expect(() =>
        chooseVersion("2.2.0", [commit(subject, "BREAKING CHANGE: incompatible")], "minor"),
      ).toThrow("major");
    },
  );
  it("refuses empty, ambiguous and maintenance-only ranges without explicit bump", () => {
    for (const [entries, message] of [
      [[], "No changes"],
      [[commit("changed stuff")], "Ambiguous"],
      [[commit("chore(ci): runner")], "maintenance-only"],
    ] as const) {
      expect(() => chooseVersion("2.2.0", [...entries])).toThrow(message);
    }
    expect(() => chooseVersion("2.2.0-beta.1", [commit("fix(ui): repair")])).toThrow("stable");
  });
  it("changes only the pending heading, preserving notes and old versions", () => {
    expect(cutChangelog(notes, "2.2.1")).toBe(notes.replace("## Unreleased", "## 2.2.1"));
    for (const [source, message] of [
      ["## 2.2.0\nold", "Expected exactly one"],
      ["## Unreleased\n\n## 2.2.0\nold", "is empty"],
      [`${notes}\n## Unreleased\nagain`, "Expected exactly one"],
      [`${notes}\n## 2.2.1\nexists`, "already exists"],
    ]) {
      expect(() => cutChangelog(source, "2.2.1")).toThrow(message);
    }
  });
  it("validates CLI values before any mutation", () => {
    expect(parseArguments(["--dry-run", "--bump", "minor"])).toEqual({
      dryRun: true,
      bump: "minor",
    });
    expect(parseArguments(["--backend-compatible"])).toEqual({
      dryRun: false,
      backendCompatible: true,
    });
    for (const [args, message] of [
      [["--bump", "major"], "--bump must"],
      [["--resume", "HEAD"], "--resume must"],
      [["--force"], "Unknown argument"],
      [["--expect-sha", "HEAD"], "--expect-sha must"],
      [["--resume", "a".repeat(40), "--expect-sha", "b".repeat(40)], "Resume already names"],
      [["--resume", "a".repeat(40), "--bump", "patch"], "Resume cannot bump"],
    ] as const) {
      expect(() => parseArguments([...args])).toThrow(message);
    }
  });
  it("requires actually executed Ubuntu steps and successful backend", () => {
    requireCiJobs(ciJobs());
    expect(() =>
      requireCiJobs(
        ciJobs().map((job) =>
          job.name === "backend-check" ? { ...job, conclusion: "skipped" } : job,
        ),
      ),
    ).toThrow("Required job backend-check did not succeed");
    expect(() => requireCiJobs([{ ...ciJobs()[0], steps: [] }, ...ciJobs().slice(1)])).toThrow(
      "execute Test",
    );
    expect(() => requireCiJobs([...ciJobs(), { name: "surprise", conclusion: "skipped" }])).toThrow(
      "Unexpected surprise conclusion",
    );
  });
  it("requires each manifest's actual payload and blockmap", () => {
    const names = [
      "deck.dmg",
      "deck-mac.zip",
      "deck-setup.exe",
      "latest-mac.yml",
      "latest.yml",
      "deck-mac.zip.blockmap",
      "deck-setup.exe.blockmap",
    ];
    const manifests = {
      "latest-mac.yml": "path: deck-mac.zip",
      "latest.yml": "path: 'deck-setup.exe'",
    };
    validateAssets(
      names.map((name) => ({ name })),
      manifests,
    );
    expect(() =>
      validateAssets(
        names.filter((name) => name !== "deck-mac.zip.blockmap").map((name) => ({ name })),
        manifests,
      ),
    ).toThrow("exact blockmap");
    expect(() =>
      validateAssets(
        names.map((name) => ({ name })),
        { ...manifests, "latest.yml": "path: wrong.exe" },
      ),
    ).toThrow("latest.yml must name a served payload");
  });
});

function fixture(subject = "fix(release): stop batching") {
  const cwd = mkdtempSync(join(tmpdir(), "deck-release-cut-"));
  roots.push(cwd);
  const origin = join(cwd, "..", `${cwd.split("/").at(-1)}-origin.git`);
  roots.push(origin);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  execFileSync("git", ["init", "--bare", "--initial-branch=main", origin], { stdio: "ignore" });
  git("init", "--initial-branch=main");
  git("config", "user.email", "release-test@example.invalid");
  git("config", "user.name", "Release test");
  git("config", "commit.gpgsign", "false");
  git("config", "core.hooksPath", join(cwd, ".git", "hooks"));
  writeFileSync(
    join(cwd, "package.json"),
    JSON.stringify({ name: "fixture", version: "2.2.0" }, null, 2) + "\n",
  );
  writeFileSync(
    join(cwd, "package-lock.json"),
    JSON.stringify(
      { version: "2.2.0", packages: { "": { name: "fixture", version: "2.2.0" } } },
      null,
      2,
    ) + "\n",
  );
  writeFileSync(join(cwd, "CHANGELOG.md"), "# Changelog\n\n## 2.2.0\n\nPrevious release.\n");
  git("add", "--", "package.json", "package-lock.json", "CHANGELOG.md");
  git(
    "commit",
    "-m",
    "chore(release): baseline",
    "--",
    "package.json",
    "package-lock.json",
    "CHANGELOG.md",
  );
  git("tag", "v2.2.0");
  git("remote", "add", "origin", origin);
  git("push", "origin", "main", "refs/tags/v2.2.0");
  writeFileSync(join(cwd, "CHANGELOG.md"), notes);
  git("commit", "-m", subject, "--", "CHANGELOG.md");
  const calls: string[][] = [];
  const original = git("rev-parse", "HEAD");
  const real = commandRunner(cwd);
  const run = (command: string, args: string[], options?: { allowFailure?: boolean }) => {
    calls.push([command, ...args]);
    if (command === "gh") return "authenticated";
    if (command === "git" && args[0] === "remote" && args[1] === "get-url")
      return "https://github.com/mxrsv/spacevibe-deck.git\n";
    return real(command, args, options);
  };
  const github = {
    baseline: () => ({ tag_name: "v2.2.0", draft: false, prerelease: false }),
    release: () => null,
    noPendingRelease: () => undefined,
    watchCi: async (sha: string) => {
      calls.push(["ci", sha]);
      return { html_url: "https://example.invalid/ci" };
    },
    promotion: async (sha: string, version: string) => {
      calls.push(["promote", sha]);
      execFileSync("git", ["--git-dir", origin, "tag", `v${version}`, sha]);
      return {
        attempt: { html_url: "https://example.invalid/run" },
        release: { html_url: "https://example.invalid/release" },
      };
    },
  };
  return { cwd, origin, git, run, calls, original, github, output: () => undefined };
}

describe("release cut with real disposable git repositories", () => {
  it("keeps edits visible and never pushes after a real pre-commit hook failure", async () => {
    const f = fixture();
    writeFileSync(join(f.cwd, ".git", "hooks", "pre-commit"), "#!/bin/sh\nexit 9\n", {
      mode: 0o700,
    });
    await expect(runReleaseCut([], f)).rejects.toThrow("commit");
    expect(f.git("rev-parse", "HEAD")).toBe(f.original);
    expect(f.git("status", "--porcelain")).not.toBe("");
    expect(f.calls.some(([cmd, op]) => cmd === "git" && op === "push")).toBe(false);
  });
  it("refuses a HEAD that is not the verified commit before any edit", async () => {
    const f = fixture();
    await expect(runReleaseCut(["--expect-sha", "a".repeat(40)], f)).rejects.toThrow(
      "not the verified commit",
    );
    expect(f.git("rev-parse", "HEAD")).toBe(f.original);
    expect(f.git("status", "--porcelain")).toBe("");
    expect(f.calls.some(([cmd, op]) => cmd === "git" && op === "push")).toBe(false);
  });
  it("accepts a dry run at exactly the verified commit", async () => {
    const f = fixture();
    const result = await runReleaseCut(["--dry-run", "--expect-sha", f.original], f);
    expect(result.dryRun).toBe(true);
  });
  it("refuses a second cut's shared lock without changing version files", async () => {
    const f = fixture();
    mkdirSync(join(f.cwd, ".git", "deck-release-cut.lock"));
    await expect(runReleaseCut([], f)).rejects.toThrow("release lock");
    expect(f.git("rev-parse", "HEAD")).toBe(f.original);
    expect(f.git("status", "--porcelain")).toBe("");
  });

  it.each(["local", "remote"])(
    "refuses a %s main advancement while waiting for CI",
    async (side) => {
      const f = fixture();
      const github = {
        ...f.github,
        watchCi: async () => {
          if (side === "local") {
            f.git("commit", "--allow-empty", "-m", "chore(peer): advance main");
          } else {
            const peer = join(f.cwd, "..", `${f.cwd.split("/").at(-1)}-peer`);
            roots.push(peer);
            execFileSync("git", ["clone", f.origin, peer], { stdio: "ignore" });
            const git = (...args: string[]) =>
              execFileSync("git", args, { cwd: peer, stdio: "ignore" });
            git("config", "user.email", "peer@example.invalid");
            git("config", "user.name", "Peer fixture");
            git("commit", "--allow-empty", "-m", "chore(peer): advance main");
            git("push", "origin", "main");
          }
          return { html_url: "https://example.invalid/ci" };
        },
      };
      await expect(runReleaseCut([], { ...f, github })).rejects.toThrow("advanced before tagging");
      expect(f.git("tag", "--list", "build/*")).toBe("");
      expect(f.git("ls-remote", "origin", "refs/tags/build/v2.2.1")).toBe("");
      expect(f.calls.some(([name]) => name === "promote")).toBe(false);
    },
  );
  it("resumes an immutable pushed cut from a newer clean main descendant", async () => {
    const f = fixture();
    await expect(
      runReleaseCut([], {
        ...f,
        github: {
          ...f.github,
          promotion: async () => {
            throw new Error("draft only");
          },
        },
      }),
    ).rejects.toThrow("draft only");
    const sha = f.git("rev-parse", "HEAD");
    f.git("commit", "--allow-empty", "-m", "chore(peer): newer main");
    f.git("push", "origin", "main");
    const newer = f.git("rev-parse", "HEAD");
    const result = await runReleaseCut(["--resume", sha], f);
    expect(result.sha).toBe(sha);
    expect(f.git("rev-parse", "HEAD")).toBe(newer);
    expect(f.calls.filter(([cmd, op]) => cmd === "git" && op === "tag")).toHaveLength(1);
  });
  it("refuses multiple effective push URLs before editing", async () => {
    const f = fixture();
    const run = (command: string, args: string[], options?: { allowFailure?: boolean }) => {
      if (command === "git" && args[0] === "remote" && args.includes("--push")) {
        expect(args).toContain("--all");
        return "https://github.com/mxrsv/spacevibe-deck.git\nhttps://github.com/other/unintended.git\n";
      }
      return f.run(command, args, options);
    };
    await expect(runReleaseCut([], { ...f, run })).rejects.toThrow("push URL");
    expect(f.git("rev-parse", "HEAD")).toBe(f.original);
  });
  it("cuts exact files and pushes CI's captured commit before its trigger", async () => {
    const f = fixture();
    const result = await runReleaseCut([], f);
    expect(result.version).toBe("2.2.1");
    expect(f.git("status", "--porcelain")).toBe("");
    expect(f.git("show", "-s", "--format=%s")).toBe("chore(release): cut 2.2.1");
    expect(
      JSON.parse(readFileSync(join(f.cwd, "package-lock.json"), "utf8")).packages[""].version,
    ).toBe("2.2.1");
    expect(f.calls.findIndex(([cmd]) => cmd === "ci")).toBeLessThan(
      f.calls.findIndex(([cmd, op]) => cmd === "git" && op === "tag"),
    );
    expect(
      f.calls
        .filter(([cmd, op]) => cmd === "git" && op === "push")
        .every((call) => !call.includes("--force")),
    ).toBe(true);
    expect(f.git("ls-remote", "origin", "refs/heads/main").split(/\s/)[0]).toBe(result.sha);
    expect(f.git("ls-remote", "origin", "refs/tags/build/v2.2.1").split(/\s/)[0]).toBe(result.sha);
  });
  it("dry-run changes no files, refs, locks or remotes", async () => {
    const f = fixture("feat(ui): gated feature");
    const output: string[] = [];
    expect(
      await runReleaseCut(["--dry-run"], { ...f, output: (line: string) => output.push(line) }),
    ).toEqual({ version: "2.3.0", dryRun: true });
    expect(output.join("\n")).toContain("Baseline v2.2.0");
    expect(output.join("\n")).toContain(`..${f.original}`);
    expect(output.join("\n")).toContain("Actions: bump");
    expect(output.join("\n")).toContain("Fixed daily release cuts.");
    expect(f.git("rev-parse", "HEAD")).toBe(f.original);
    expect(f.git("status", "--porcelain")).toBe("");
    expect(
      f.calls.some(([cmd, op]) => cmd === "git" && ["fetch", "commit", "push", "tag"].includes(op)),
    ).toBe(false);
  });
  it("requires explicit backend compatibility acknowledgment for telemetry payload changes", async () => {
    const f = fixture();
    mkdirSync(join(f.cwd, "src", "telemetry"), { recursive: true });
    writeFileSync(join(f.cwd, "src", "telemetry", "payload.ts"), "export const shape = 2;\n");
    f.git("add", "src/telemetry/payload.ts");
    f.git("commit", "-m", "fix(telemetry): extend payload");
    await expect(runReleaseCut(["--dry-run"], f)).rejects.toThrow("--backend-compatible");
    expect(await runReleaseCut(["--dry-run", "--backend-compatible"], f)).toEqual({
      version: "2.2.1",
      dryRun: true,
    });
    expect(f.git("status", "--porcelain")).toBe("");
    expect(f.calls.some(([cmd, op]) => cmd === "git" && op === "push")).toBe(false);
  });
  it("stops a wrong branch or dirty checkout before editing", async () => {
    const f = fixture();
    f.git("checkout", "-b", "feature");
    await expect(runReleaseCut([], f)).rejects.toThrow("local main");
    f.git("checkout", "main");
    writeFileSync(join(f.cwd, "untracked.txt"), "peer work");
    await expect(runReleaseCut([], f)).rejects.toThrow("clean");
    expect(f.git("rev-parse", "HEAD")).toBe(f.original);
  });
  it("does not tag after failed/cancelled CI and resumes without another commit", async () => {
    const f = fixture();
    await expect(
      runReleaseCut([], {
        ...f,
        github: {
          ...f.github,
          watchCi: async () => {
            throw new Error("cancelled");
          },
        },
      }),
    ).rejects.toThrow("cancelled");
    const sha = f.git("rev-parse", "HEAD");
    expect(f.git("ls-remote", "origin", "refs/tags/build/v2.2.1")).toBe("");
    await expect(runReleaseCut([], f)).rejects.toThrow("resume");
    await runReleaseCut(["--resume", sha], f);
    expect(f.git("rev-parse", "HEAD")).toBe(sha);
    expect(f.calls.filter(([cmd, op]) => cmd === "git" && op === "commit")).toHaveLength(1);
  });
  it("resumes monitoring a pushed trigger without tagging again", async () => {
    const f = fixture();
    await expect(
      runReleaseCut([], {
        ...f,
        github: {
          ...f.github,
          promotion: async () => {
            throw new Error("draft only");
          },
        },
      }),
    ).rejects.toThrow("draft only");
    const sha = f.git("rev-parse", "HEAD");
    await runReleaseCut(["--resume", sha], f);
    expect(f.calls.filter(([cmd, op]) => cmd === "git" && op === "tag")).toHaveLength(1);
  });
  it.each(["commit", "push", "tag"])("fails closed at git %s", async (operation) => {
    const f = fixture();
    const run = (command: string, args: string[], options?: { allowFailure?: boolean }) => {
      if (command === "git" && args[0] === operation)
        throw new Error(`Injected ${operation} failure`);
      return f.run(command, args, options);
    };
    await expect(runReleaseCut([], { ...f, run })).rejects.toThrow(`Injected ${operation}`);
    expect(f.calls.some(([cmd]) => cmd === "promote")).toBe(false);
    if (operation !== "tag")
      expect(f.calls.some(([cmd, op]) => cmd === "git" && op === "tag")).toBe(false);
  });
  it("stops before editing if target refs already exist", async () => {
    const f = fixture();
    f.git("tag", "build/v2.2.1");
    await expect(runReleaseCut([], f)).rejects.toThrow("already exists");
    expect(f.git("rev-parse", "HEAD")).toBe(f.original);
    expect(f.git("status", "--porcelain")).toBe("");
  });
});

describe("GitHub run identity and failure handling", () => {
  function promotionFixture(change: string) {
    const sha = "a".repeat(40);
    const release = {
      id: 12,
      tag_name: "v2.2.1",
      draft: change === "draft",
      prerelease: change === "prerelease",
      body: change === "notes" ? "Build in progress." : "- Reviewed notes.",
      html_url: "release",
    };
    const run = {
      id: 88,
      run_attempt: 1,
      event: "push",
      head_sha: sha,
      head_branch: "build/v2.2.1",
      status: "completed",
      conclusion: "success",
      html_url: "run",
    };
    const names = [
      "deck.dmg",
      "deck-mac.zip",
      "deck-setup.exe",
      "latest-mac.yml",
      "latest.yml",
      "deck-mac.zip.blockmap",
      "deck-setup.exe.blockmap",
    ];
    const assets = names
      .filter((name) => change !== "blockmap" || name !== "deck-mac.zip.blockmap")
      .map((name, index) => ({ name, id: index + 20 }));
    const jobs = ["prepare", "source-check", "mac", "windows", "promote"].map((name) => ({
      name,
      conclusion:
        name === "source-check" && ["failure", "skipped"].includes(change) ? change : "success",
    }));
    const api = (_command: string, args: string[]) => {
      const endpoint = args
        .find((arg) => arg.startsWith("repos/"))!
        .split("mxrsv/spacevibe-deck/")[1];
      if (endpoint.startsWith("actions/workflows/"))
        return JSON.stringify({ workflow_runs: [run] });
      if (endpoint.includes("/jobs?")) return JSON.stringify({ jobs });
      if (endpoint.startsWith("actions/runs/")) return JSON.stringify(run);
      if (endpoint === "releases/tags/v2.2.1") return JSON.stringify(release);
      if (endpoint === "releases/latest")
        return JSON.stringify(
          ["draft", "prerelease", "latest"].includes(change)
            ? { ...release, id: 11, tag_name: "v2.2.0", draft: false, prerelease: false }
            : release,
        );
      if (endpoint.startsWith("releases/12/assets?")) return JSON.stringify(assets);
      if (endpoint.startsWith("releases/assets/")) {
        const name = assets.find((asset) => endpoint === `releases/assets/${asset.id}`)!.name;
        return `path: ${name === "latest-mac.yml" ? "deck-mac.zip" : change === "payload" ? "missing.exe" : "deck-setup.exe"}\n`;
      }
      throw new Error(`Unexpected fixture endpoint ${endpoint}`);
    };
    return { sha, client: createGithub(api, { now: () => 0, sleep: async () => undefined }) };
  }
  it("verifies real promotion adapter jobs, reviewed notes and served updater assets", async () => {
    const f = promotionFixture("success");
    expect((await f.client.promotion(f.sha, "2.2.1", 10, "- Reviewed notes.")).release.id).toBe(12);
  });
  it.each([
    ["draft", "public latest stable"],
    ["prerelease", "public latest stable"],
    ["latest", "public latest stable"],
    ["notes", "reviewed CHANGELOG section"],
    ["failure", "source-check did not succeed"],
    ["skipped", "source-check did not succeed"],
    ["blockmap", "exact blockmap"],
    ["payload", "served payload"],
  ])("rejects promotion with %s", async (failure, message) => {
    const f = promotionFixture(failure);
    await expect(f.client.promotion(f.sha, "2.2.1", 10, "- Reviewed notes.")).rejects.toThrow(
      message,
    );
  });
  it("finds exact-SHA CI across pagination and inspects its latest attempt", async () => {
    const sha = "a".repeat(40);
    const run = {
      id: 88,
      run_attempt: 2,
      event: "push",
      head_sha: sha,
      head_branch: "main",
      status: "completed",
      conclusion: "success",
      html_url: "run",
    };
    const requested: string[] = [];
    const client = createGithub(
      (_cmd: string, args: string[]) => {
        const endpoint = args.find((arg) => arg.startsWith("repos/"))!;
        requested.push(endpoint);
        if (endpoint.includes("/workflows/"))
          return JSON.stringify({
            workflow_runs: endpoint.endsWith("page=1")
              ? Array.from({ length: 100 }, (_, id) => ({ ...run, id, head_sha: "b".repeat(40) }))
              : [run],
          });
        if (endpoint.includes("/jobs?")) return JSON.stringify({ jobs: ciJobs() });
        return JSON.stringify(run);
      },
      { now: () => 0, sleep: async () => undefined },
    );
    expect((await client.watchCi(sha, 10)).run_attempt).toBe(2);
    expect(requested.some((path) => path.includes("attempts/2/jobs"))).toBe(true);
  });
  it.each(["failure", "cancelled", "skipped"])(
    "stops on CI %s instead of an older green run",
    async (conclusion) => {
      const sha = "a".repeat(40);
      const run = {
        id: 8,
        run_attempt: 2,
        event: "push",
        head_sha: sha,
        head_branch: "main",
        status: "completed",
        conclusion,
        html_url: "run",
      };
      const olderGreen = { ...run, id: 7, run_attempt: 1, conclusion: "success" };
      const requested: string[] = [];
      const client = createGithub(
        (_command: string, args: string[]) => {
          const path = args.find((argument) => argument.startsWith("repos/"))!;
          requested.push(path);
          if (path.includes("workflows/ci.yml/runs")) {
            // Deliberately oldest first: selection must use run identity, not API order.
            return JSON.stringify({ workflow_runs: [olderGreen, run] });
          }
          if (path.includes("/jobs")) return JSON.stringify({ jobs: ciJobs() });
          return JSON.stringify(path.includes("/runs/7/") ? olderGreen : run);
        },
        { now: () => 0, sleep: async () => undefined },
      );
      await expect(client.watchCi(sha, 10)).rejects.toThrow(conclusion);
      expect(requested.some((path) => path.includes("/runs/8/attempts/2"))).toBe(true);
      expect(requested.some((path) => path.includes("/runs/7/"))).toBe(false);
    },
  );
  it("does not treat an auth/network failure as a missing release", () => {
    const client = createGithub(() => {
      throw new Error("HTTP 403 permission denied");
    });
    expect(() => client.release("v2.2.1")).toThrow("403");
    expect(
      createGithub(() => {
        throw new Error("gh: Not Found (HTTP 404)");
      }).release("v2.2.1"),
    ).toBeNull();
  });
  it("times out when only a different SHA has a green check", async () => {
    let now = 0;
    const client = createGithub(
      () =>
        JSON.stringify({
          workflow_runs: [
            {
              id: 2,
              event: "push",
              head_sha: "b".repeat(40),
              head_branch: "main",
              conclusion: "success",
            },
          ],
        }),
      {
        now: () => now,
        sleep: async () => {
          now += 10;
        },
      },
    );
    await expect(client.watchCi("a".repeat(40), 10)).rejects.toThrow("Timed out");
  });
});
