import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

// A separate process makes a regression fail by timeout instead of hanging Vitest.
describe.skipIf(process.platform === "win32")("untrusted git pointer files", () => {
  it.each([".git", "commondir"])("never blocks on a %s FIFO", (name) => {
    const root = fs.mkdtempSync(path.join(base, "fifo-"));
    const gitDir = path.join(root, ".git");
    if (name === "commondir") fs.mkdirSync(gitDir);
    execFileSync("mkfifo", [name === ".git" ? gitDir : path.join(gitDir, "commondir")]);
    const moduleUrl = pathToFileURL(path.resolve("electron/git/git-dir.ts")).href;
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { findCheckout } from ${JSON.stringify(moduleUrl)}; process.stdout.write(JSON.stringify(findCheckout(${JSON.stringify(root)})));`,
      ],
      { encoding: "utf8", timeout: 1_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual(
      name === ".git" ? null : { top: root, gitDir, commonDir: gitDir },
    );
  });

  it("bounds the actual read when a regular pointer grows after fstat, and closes it", () => {
    const root = fs.mkdtempSync(path.join(base, "growing-"));
    fs.writeFileSync(path.join(root, ".git"), `gitdir: ${"x".repeat(64 * 1024)}\n`);
    const fstat = fs.fstatSync.bind(fs);
    const statSpy = vi.spyOn(fs, "fstatSync").mockImplementationOnce((fd) => {
      const result = fstat(fd);
      return new Proxy(result, {
        get(target, key, receiver) {
          return key === "size" ? 1 : Reflect.get(target, key, receiver);
        },
      });
    });
    const closeSpy = vi.spyOn(fs, "closeSync");
    try {
      expect(findGitDir(root)).toBeNull();
      expect(statSpy).toHaveBeenCalledOnce();
      expect(closeSpy).toHaveBeenCalledWith(statSpy.mock.calls[0][0]);
    } finally {
      statSpy.mockRestore();
      closeSpy.mockRestore();
    }
  });

  it("rejects oversized and symlinked pointers without reading their targets", () => {
    const root = fs.mkdtempSync(path.join(base, "pointer-"));
    const pointer = path.join(root, ".git");
    fs.writeFileSync(pointer, `gitdir: ${"x".repeat(64 * 1024)}\n`);
    expect(findGitDir(root)).toBeNull();
    fs.unlinkSync(pointer);
    const target = path.join(root, "target");
    fs.writeFileSync(target, `gitdir: ${gitDirOutside}\n`);
    fs.symlinkSync(target, pointer);
    expect(findGitDir(root)).toBeNull();
  });
});
