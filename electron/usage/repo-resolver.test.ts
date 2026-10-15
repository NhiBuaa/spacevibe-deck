import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  REPO_RETRY_BACKOFF_MS,
  createRepoResolver,
  repoRootOf,
  resolveWithGit,
  type RepoAnswer,
} from "./repo-resolver";

/**
 * Real git over temp directories for the answers that get persisted, because
 * a wrong `none` is stored forever; a stub for the backoff.
 */

const temps: string[] = [];
function tempDir(): string {
  // Resolved, because git reports `/private/var/...` for macOS's `/var/...`.
  const dir = realpathSync(mkdtempSync(path.join(tmpdir(), "usage-repo-")));
  temps.push(dir);
  return dir;
}
const savedEnv = { PATH: process.env.PATH, GIT_DIR: process.env.GIT_DIR };
afterEach(() => {
  process.env.PATH = savedEnv.PATH;
  if (savedEnv.GIT_DIR === undefined) {
    delete process.env.GIT_DIR;
  } else {
    process.env.GIT_DIR = savedEnv.GIT_DIR;
  }
  for (const dir of temps.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    stdio: "ignore",
  });
}

function repository(): string {
  const root = path.join(tempDir(), "repo");
  mkdirSync(root);
  git(root, "init", "-q");
  git(root, "commit", "-q", "--allow-empty", "-m", "init");
  return root;
}

describe("repoRootOf", () => {
  it("names the parent of a .git directory and keeps anything else", () => {
    expect(repoRootOf("/w/deck/.git")).toBe("/w/deck");
    expect(repoRootOf("/w/deck/.git/")).toBe("/w/deck");
    expect(repoRootOf("/w/bare.git")).toBe("/w/bare.git");
    expect(repoRootOf("/w/super/.git/modules/lib")).toBe("/w/super/.git/modules/lib");
    expect(repoRootOf("C:/w/deck/.git")).toBe("C:/w/deck");
    expect(repoRootOf("C:\\w\\deck\\.git")).toBe("C:\\w\\deck");
  });
});

describe("resolveWithGit", () => {
  it("folds a subdirectory and a linked worktree into the main checkout", async () => {
    const root = repository();
    const sub = path.join(root, "src", "deep");
    mkdirSync(sub, { recursive: true });
    const worktree = path.join(path.dirname(root), "wt");
    git(root, "worktree", "add", "-q", worktree);
    const expected: RepoAnswer = { kind: "repo", root };
    expect(await resolveWithGit(root)).toEqual(expected);
    expect(await resolveWithGit(sub)).toEqual(expected);
    expect(await resolveWithGit(worktree)).toEqual(expected);
  });

  it("answers none for a directory that is gone, a file, or a plain folder", async () => {
    const dir = tempDir();
    const file = path.join(dir, "file.txt");
    writeFileSync(file, "x");
    expect(await resolveWithGit(path.join(dir, "missing"))).toEqual({ kind: "none" });
    expect(await resolveWithGit(file)).toEqual({ kind: "none" });
    expect(await resolveWithGit(dir)).toEqual({ kind: "none" });
  });

  it("answers retry, never none, when git cannot run", async () => {
    const root = repository();
    process.env.PATH = path.join(tempDir(), "no-git-here");
    expect(await resolveWithGit(root)).toEqual({ kind: "retry" });
  });

  it("ignores an inherited GIT_DIR that would point every cwd at one repository", async () => {
    const root = repository();
    const other = repository();
    process.env.GIT_DIR = path.join(other, ".git");
    expect(await resolveWithGit(root)).toEqual({ kind: "repo", root });
  });
});

describe("createRepoResolver", () => {
  it("does not ask again inside the backoff window after a transient answer", async () => {
    let clock = 0;
    let answer: RepoAnswer = { kind: "retry" };
    const calls: string[] = [];
    const resolve = createRepoResolver({
      now: () => clock,
      resolve: async (cwd) => {
        calls.push(cwd);
        return answer;
      },
    });
    expect(await resolve("/w/a")).toEqual({ kind: "retry" });
    clock = REPO_RETRY_BACKOFF_MS - 1;
    expect(await resolve("/w/a")).toEqual({ kind: "retry" });
    expect(calls).toEqual(["/w/a"]);

    answer = { kind: "repo", root: "/w/a" };
    clock = REPO_RETRY_BACKOFF_MS;
    expect(await resolve("/w/a")).toEqual({ kind: "repo", root: "/w/a" });
    expect(await resolve("/w/a")).toEqual({ kind: "repo", root: "/w/a" });
    expect(calls).toEqual(["/w/a", "/w/a", "/w/a"]);
  });
});
