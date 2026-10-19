import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { findCheckout, findGitDir } from "./git-dir";

let base: string;
let plain: string;
let worktree: string;
let gitDirOutside: string;
let submodule: string;
let moduleDir: string;

beforeAll(() => {
  base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "deck-git-dir-")));
  plain = path.join(base, "plain");
  fs.mkdirSync(path.join(plain, ".git"), { recursive: true });
  const main = path.join(base, "main-repo");
  gitDirOutside = path.join(main, ".git", "worktrees", "wt");
  fs.mkdirSync(gitDirOutside, { recursive: true });
  fs.writeFileSync(path.join(gitDirOutside, "commondir"), "../..\n");
  worktree = path.join(base, "wt");
  fs.mkdirSync(worktree);
  fs.writeFileSync(path.join(worktree, ".git"), `gitdir: ${gitDirOutside}\n`);
  moduleDir = path.join(plain, ".git", "modules", "sub");
  fs.mkdirSync(moduleDir, { recursive: true });
  submodule = path.join(plain, "sub");
  fs.mkdirSync(submodule);
  fs.writeFileSync(path.join(submodule, ".git"), "gitdir: ../.git/modules/sub\n");
});

afterAll(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

describe("findGitDir", () => {
  it("walks up from a subdirectory and follows a gitdir pointer", () => {
    const sub = path.join(plain, "pkg", "deep");
    fs.mkdirSync(sub, { recursive: true });
    expect(findGitDir(sub)).toBe(path.join(plain, ".git"));
    expect(findGitDir(worktree)).toBe(gitDirOutside);
  });

  it("returns null outside any checkout", () => {
    expect(findGitDir(path.join(base, "nowhere-" + Date.now()))).toBeNull();
  });
});

describe("findCheckout", () => {
  it("names the top, git directory and common directory of a plain checkout", () => {
    const sub = path.join(plain, "pkg", "deep");
    fs.mkdirSync(sub, { recursive: true });
    const gitDir = path.join(plain, ".git");
    expect(findCheckout(sub)).toEqual({ top: plain, gitDir, commonDir: gitDir });
  });

  it("follows commondir for a linked worktree", () => {
    expect(findCheckout(worktree)).toEqual({
      top: worktree,
      gitDir: gitDirOutside,
      commonDir: path.join(base, "main-repo", ".git"),
    });
  });

  it("treats a submodule's .git file as its own checkout", () => {
    expect(findCheckout(path.join(submodule, "src"))).toEqual({
      top: submodule,
      gitDir: moduleDir,
      commonDir: moduleDir,
    });
  });
});
