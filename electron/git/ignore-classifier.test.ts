import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runnerFor, type GitRunner } from "./changes";
import {
  createIgnoreClassifier,
  MAX_CACHED_VERDICTS,
  MAX_REMEMBERED_DIRECTORIES,
  type IgnoreAnswer,
  type IgnoreClassifier,
} from "./ignore-classifier";

/** Git's answers are read from real repositories; the pre-push hook runs this
 * suite with its own `GIT_DIR`, so the child environment is scrubbed of `GIT_*`
 * and pinned away from the machine's config. */
const SAVED_ENV = { ...process.env };

beforeAll(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith("GIT_")) {
      delete process.env[key];
    }
  }
  process.env.GIT_CONFIG_GLOBAL = "/dev/null";
  process.env.GIT_CONFIG_SYSTEM = "/dev/null";
  process.env.GIT_AUTHOR_NAME = "t";
  process.env.GIT_AUTHOR_EMAIL = "t@example.com";
  process.env.GIT_COMMITTER_NAME = "t";
  process.env.GIT_COMMITTER_EMAIL = "t@example.com";
});

afterAll(() => {
  process.env = SAVED_ENV;
});

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" });
}

function write(root: string, name: string, text = "x\n"): void {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}

interface Spawn {
  readonly cwd: string;
  readonly args: readonly string[];
  readonly input: string | undefined;
}

let scratch: string;
let repo: string;
let spawns: Spawn[];
let classifier: IgnoreClassifier;

function counting(cwd: string): GitRunner {
  const real = runnerFor(cwd);
  return (args, input) => {
    spawns.push({ cwd, args, input });
    return real(args, input);
  };
}

function ignoredOf(answer: IgnoreAnswer): string[] {
  if (answer.kind !== "classified") {
    throw new Error(`unavailable: ${answer.reason}`);
  }
  return [...answer.ignored].sort();
}

beforeEach(() => {
  scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "deck-ignore-")));
  repo = path.join(scratch, "repo");
  fs.mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  write(repo, ".gitignore", "node_modules/\n*.log\n!keep.log\ncoverage/\n");
  write(repo, "src/a.ts");
  write(repo, "node_modules/dep/index.js");
  write(repo, "coverage/lcov.info");
  write(repo, "debug.log");
  write(repo, "keep.log");
  spawns = [];
  classifier = createIgnoreClassifier({ runnerFor: counting });
});

afterEach(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

describe("git's rules (IGN1)", () => {
  it("reports ignored files and directories, honours negation, and spells inputs as given", async () => {
    const answer = await classifier.classify(repo, repo, [
      "debug.log",
      "keep.log",
      "src/a.ts",
      "node_modules",
      "coverage",
    ]);
    expect(ignoredOf(answer)).toEqual(["coverage", "debug.log", "node_modules"]);
  });

  it("reads exit 1 as nothing ignored, not as a failure", async () => {
    const answer = await classifier.classify(repo, repo, ["src/a.ts", "keep.log"]);
    expect(ignoredOf(answer)).toEqual([]);
  });

  it("never reports a tracked file, even under an ignore pattern", async () => {
    git(repo, "add", "-f", "debug.log");
    const answer = await classifier.classify(repo, repo, ["debug.log"]);
    expect(ignoredOf(answer)).toEqual([]);
  });

  it("applies a nested .gitignore and .git/info/exclude", async () => {
    write(repo, "src/.gitignore", "gen/\n");
    write(repo, "src/gen/g.ts");
    write(repo, ".git/info/exclude", "scratch.txt\n");
    write(repo, "scratch.txt");
    const answer = await classifier.classify(repo, repo, ["src/gen", "src/a.ts", "scratch.txt"]);
    expect(ignoredOf(answer)).toEqual(["scratch.txt", "src/gen"]);
  });

  it("classifies a listing relative to its own working directory", async () => {
    const answer = await classifier.classify(repo, path.join(repo, "src"), ["a.ts", "b.log"]);
    expect(ignoredOf(answer)).toEqual(["b.log"]);
  });

  it("classifies inside a linked worktree and reads the common info/exclude", async () => {
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "c");
    const linked = path.join(scratch, "linked");
    git(repo, "worktree", "add", "-q", linked);
    write(repo, ".git/info/exclude", "only-here.txt\n");
    const answer = await classifier.classify(linked, linked, [
      "only-here.txt",
      "x.log",
      "src/a.ts",
    ]);
    expect(ignoredOf(answer)).toEqual(["only-here.txt", "x.log"]);
  });

  it("leaves .git/index untouched", async () => {
    git(repo, "add", "-A");
    const before = fs.statSync(path.join(repo, ".git", "index"));
    await classifier.classify(repo, repo, ["debug.log", "src/a.ts", "node_modules/dep/index.js"]);
    const after = fs.statSync(path.join(repo, ".git", "index"));
    expect([after.size, after.mtimeMs, after.ino]).toEqual([
      before.size,
      before.mtimeMs,
      before.ino,
    ]);
  });

  it("spawns only check-ignore, behind --no-optional-locks", async () => {
    await classifier.classify(repo, repo, ["debug.log"]);
    expect(spawns.length).toBeGreaterThan(0);
    for (const spawn of spawns) {
      expect(spawn.args).toEqual(["check-ignore", "--stdin", "-z"]);
    }
  });

  it("never sends an unsafe path, and gives a nested .git the verdict of its owner", async () => {
    const answer = await classifier.classify(repo, repo, [
      "../escape.log",
      path.join(repo, "debug.log"),
      "a\0b.log",
      "",
      ".git/HEAD",
      "node_modules/dep/.git/HEAD",
      "src\\b.log",
    ]);
    expect(ignoredOf(answer)).toEqual(["node_modules/dep/.git/HEAD", "src\\b.log"]);
    const sent = spawns.map((spawn) => spawn.input ?? "").join("");
    expect(sent).not.toContain("..");
    expect(sent).not.toContain(".git");
    expect(sent).not.toContain(repo);
  });

  it("fails a batch holding a submodule path as unavailable", async () => {
    const upstream = path.join(scratch, "upstream");
    fs.mkdirSync(upstream);
    git(upstream, "init", "-q", "-b", "main");
    write(upstream, "f.txt");
    git(upstream, "add", "-A");
    git(upstream, "commit", "-q", "-m", "c");
    git(repo, "-c", "protocol.file.allow=always", "submodule", "add", "-q", upstream, "sub");
    const answer = await classifier.classify(repo, repo, ["sub/gen/g", "debug.log"]);
    expect(answer.kind).toBe("unavailable");
  });
});

describe("how git reads a name (IGN1)", () => {
  it("does not read a leading colon as pathspec magic", async () => {
    write(repo, ".gitignore", "secret\n*.log\n");
    write(repo, "secret");
    write(repo, ":secret");
    write(repo, ":(glob)x");
    const answer = await classifier.classify(repo, repo, [
      ":secret",
      ":(glob)x",
      "secret",
      "debug.log",
    ]);
    expect(ignoredOf(answer)).toEqual(["debug.log", "secret"]);
  });

  it.skipIf(process.platform === "win32")(
    "keeps a backslash inside a name off Windows",
    async () => {
      const answer = await classifier.classify(repo, repo, ["node_modules\\x", "a\\b.log"]);
      expect(ignoredOf(answer)).toEqual(["a\\b.log"]);
    },
  );

  it("keeps a nested repository's rules apart from the outer one's", async () => {
    write(repo, ".gitignore", "*.log\n");
    const nested = path.join(repo, "nested");
    fs.mkdirSync(nested);
    git(nested, "init", "-q", "-b", "main");
    write(nested, "debug.log");
    // The watch asks from the outer root; the tree asks from inside the nested one.
    expect(ignoredOf(await classifier.classify(repo, repo, ["nested/debug.log"]))).toEqual([
      "nested/debug.log",
    ]);
    expect(ignoredOf(await classifier.classify(repo, nested, ["debug.log"]))).toEqual([]);
    expect(ignoredOf(await classifier.classify(repo, repo, ["nested/debug.log"]))).toEqual([
      "nested/debug.log",
    ]);
  });
});

describe("a rule change during a call (IGN2)", () => {
  it("never lets a late verdict into the fresh cache", async () => {
    write(repo, ".gitignore", "build/\n");
    fs.mkdirSync(path.join(repo, "build"));
    let releaseA!: () => void;
    let first = true;
    const slow = createIgnoreClassifier({
      runnerFor: () => async (_args, input) => {
        spawns.push({ cwd: repo, args: _args, input });
        if (first && input?.includes("build/a.js")) {
          first = false;
          // Git read the OLD .gitignore; its answer arrives after the edit.
          await new Promise<void>((resolve) => (releaseA = resolve));
          return { ok: true, stdout: "./build\0./build/a.js\0" };
        }
        return { ok: false, kind: "failed", stderr: "", exitCode: 1 };
      },
    });
    const a = slow.classify(repo, repo, ["build/a.js"]);
    await vi.waitFor(() => expect(releaseA).toBeTypeOf("function"));
    write(repo, ".gitignore", "# nothing at all\n");
    expect(ignoredOf(await slow.classify(repo, repo, ["readme.md"]))).toEqual([]);
    releaseA();
    expect(ignoredOf(await a)).toEqual([]);
    expect(ignoredOf(await slow.classify(repo, repo, ["build/a.js"]))).toEqual([]);
    expect(ignoredOf(await slow.classify(repo, repo, ["build/new.js"]))).toEqual([]);
  });
});

describe("no answer (IGN1, IGN3, IGN4)", () => {
  it("is unavailable outside a repository", async () => {
    const plain = path.join(scratch, "plain");
    fs.mkdirSync(plain);
    const answer = await classifier.classify(plain, plain, ["node_modules"]);
    expect(answer).toEqual({ kind: "unavailable", reason: "not-repository" });
  });

  it("is unavailable for a root that git itself ignores", async () => {
    write(repo, "inner/f.txt");
    write(repo, ".gitignore", "inner/\n");
    const inner = path.join(repo, "inner");
    const answer = await classifier.classify(inner, inner, ["f.txt"]);
    expect(answer).toEqual({ kind: "unavailable", reason: "ignored-root" });
  });

  it("classifies a subfolder of a repository by that repository's rules", async () => {
    const pkg = path.join(repo, "src");
    const answer = await classifier.classify(pkg, pkg, ["a.ts", "b.log"]);
    expect(ignoredOf(answer)).toEqual(["b.log"]);
  });

  it("reports timeout, overflow and a missing git as unavailable", async () => {
    fs.mkdirSync(path.join(scratch, "fake", ".git"), { recursive: true });
    const fake = path.join(scratch, "fake");
    for (const kind of ["timeout", "overflow", "git-missing"] as const) {
      const failing = createIgnoreClassifier({
        runnerFor: () => async () => ({ ok: false, kind, stderr: "" }),
      });
      expect(await failing.classify(fake, fake, ["a"])).toEqual({
        kind: "unavailable",
        reason: kind,
      });
    }
  });

  it("never rejects when the runner throws", async () => {
    const throwing = createIgnoreClassifier({
      runnerFor: () => () => Promise.reject(new Error("boom")),
    });
    expect((await throwing.classify(repo, repo, ["a"])).kind).toBe("unavailable");
  });
});

describe("the cache (IGN2)", () => {
  it("spawns nothing for a repeat, and nothing under a remembered ignored directory", async () => {
    await classifier.classify(repo, repo, ["node_modules/dep/index.js", "src/a.ts"]);
    const warm = spawns.length;
    expect(warm).toBeGreaterThan(0);
    await classifier.classify(repo, repo, ["node_modules/dep/index.js", "src/a.ts"]);
    const other = await classifier.classify(repo, repo, ["node_modules/other/deep/file.js"]);
    expect(spawns.length).toBe(warm);
    expect(ignoredOf(other)).toEqual(["node_modules/other/deep/file.js"]);
  });

  it("clears after a .gitignore edit and returns the new verdict", async () => {
    expect(ignoredOf(await classifier.classify(repo, repo, ["src/a.ts"]))).toEqual([]);
    const warm = spawns.length;
    write(repo, ".gitignore", "node_modules/\n*.log\n!keep.log\ncoverage/\nsrc/\n");
    expect(ignoredOf(await classifier.classify(repo, repo, ["src/a.ts"]))).toEqual(["src/a.ts"]);
    expect(spawns.length).toBeGreaterThan(warm);
  });

  it("clears after an info/exclude edit", async () => {
    expect(ignoredOf(await classifier.classify(repo, repo, ["x.txt"]))).toEqual([]);
    write(repo, ".git/info/exclude", "x.txt\n");
    expect(ignoredOf(await classifier.classify(repo, repo, ["x.txt"]))).toEqual(["x.txt"]);
  });

  it("clears after git add -f under a remembered ignored directory", async () => {
    const target = "node_modules/dep/index.js";
    expect(ignoredOf(await classifier.classify(repo, repo, [target]))).toEqual([target]);
    git(repo, "add", "-f", target);
    expect(ignoredOf(await classifier.classify(repo, repo, [target]))).toEqual([]);
  });

  it("caches nothing when no checkout is found, and says not-repository each time", async () => {
    const plain = path.join(scratch, "plain");
    fs.mkdirSync(plain);
    await classifier.classify(plain, plain, ["a"]);
    await classifier.classify(plain, plain, ["a"]);
    expect(spawns.length).toBe(2);
  });
});

describe("the caps (IGN2)", () => {
  let fake: string;
  let run: ReturnType<typeof vi.fn>;
  let everythingIgnored: boolean;

  function capped(): IgnoreClassifier {
    return createIgnoreClassifier({
      runnerFor: () => async (_args, input) => {
        run();
        const paths = (input ?? "").split("\0").filter((entry) => entry.length > 0);
        if (everythingIgnored) {
          return { ok: true, stdout: `${paths.join("\0")}\0` };
        }
        // git's "none ignored" is exit 1.
        return { ok: false, kind: "failed", stderr: "", exitCode: 1 };
      },
    });
  }

  beforeEach(() => {
    fake = path.join(scratch, "fake");
    fs.mkdirSync(path.join(fake, ".git"), { recursive: true });
    run = vi.fn();
    everythingIgnored = false;
  });

  it("clears the verdicts wholesale past 20,000", async () => {
    const subject = capped();
    const first = Array.from({ length: MAX_CACHED_VERDICTS - 5_000 }, (_, i) => `a/${i}`);
    const second = Array.from({ length: MAX_CACHED_VERDICTS - 5_000 }, (_, i) => `b/${i}`);
    await subject.classify(fake, fake, first);
    await subject.classify(fake, fake, second);
    const before = run.mock.calls.length;
    await subject.classify(fake, fake, first.slice(0, 10));
    expect(run.mock.calls.length).toBe(before + 1);
  });

  it("clears the remembered directories wholesale past 256", async () => {
    everythingIgnored = true;
    const subject = capped();
    for (let i = 0; i <= MAX_REMEMBERED_DIRECTORIES; i += 1) {
      await subject.classify(fake, fake, [`d${i}/f`]);
    }
    const before = run.mock.calls.length;
    await subject.classify(fake, fake, [`d${MAX_REMEMBERED_DIRECTORIES}/g`]);
    expect(run.mock.calls.length).toBe(before);
    await subject.classify(fake, fake, ["d0/g"]);
    expect(run.mock.calls.length).toBe(before + 1);
  });
});
