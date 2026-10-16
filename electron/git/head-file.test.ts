import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BINARY_REFUSAL, MAX_EDITABLE_BYTES, normalizeEol } from "../../src/files/file-content";
import type { GitBufferRunner, GitRun } from "./changes";
import { readHeadFile } from "./head-file";

/** An explicit environment with no `GIT_*` of ours: the pre-push hook runs this
 * suite with its own `GIT_DIR`, and a leak would rewrite the real repository. */
function gitEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.startsWith("GIT_")) {
      env[key] = value;
    }
  }
  return {
    ...env,
    LC_ALL: "C",
    GIT_AUTHOR_NAME: "t",
    GIT_AUTHOR_EMAIL: "t@example.com",
    GIT_COMMITTER_NAME: "t",
    GIT_COMMITTER_EMAIL: "t@example.com",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_SYSTEM: "/dev/null",
  };
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", ["-C", cwd, ...args], { env: gitEnv(), encoding: "utf8" });
}

function write(root: string, name: string, text: string | Buffer): void {
  const target = path.join(root, name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
}

function commitAll(root: string): void {
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "c");
}

let scratch: string;
let repo: string;

beforeEach(() => {
  scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "deck-head-file-")));
  repo = path.join(scratch, "repo");
  fs.mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
});

afterEach(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

/** A runner that answers from a script and records every call. */
function scripted(replies: readonly GitRun<Buffer>[]): {
  readonly run: GitBufferRunner;
  readonly calls: string[][];
} {
  const calls: string[][] = [];
  const run: GitBufferRunner = async (args) => {
    calls.push([...args]);
    const reply = replies[calls.length - 1];
    if (reply === undefined) {
      throw new Error(`unexpected git call: ${args.join(" ")}`);
    }
    return reply;
  };
  return { run, calls };
}

const sizeOf = (bytes: number): GitRun<Buffer> => ({
  ok: true,
  stdout: Buffer.from(`${bytes}\n`),
});

describe("readHeadFile on a repository", () => {
  it("reads a text blob as committed, not as the working copy has it", async () => {
    write(repo, "a.txt", "one\ntwo\n");
    commitAll(repo);
    write(repo, "a.txt", "one\nchanged\n");

    expect(await readHeadFile(repo, "a.txt")).toEqual({
      kind: "ok",
      content: "one\ntwo\n",
      eol: "lf",
      encoding: "utf-8",
      bytes: 8,
      mixedEol: false,
    });
  });

  it("matches a CRLF working file after normalizing, and flags a CRLF blob", async () => {
    write(repo, "lf.txt", "x\ny\n");
    write(repo, "crlf.txt", "p\r\nq\r\n");
    commitAll(repo);
    write(repo, "lf.txt", "x\r\ny\r\n");

    const lf = await readHeadFile(repo, "lf.txt");
    expect(lf).toMatchObject({ kind: "ok", eol: "lf", mixedEol: false });
    if (lf.kind === "ok") {
      expect(lf.content).toBe(normalizeEol(fs.readFileSync(path.join(repo, "lf.txt"), "utf8")));
    }
    expect(await readHeadFile(repo, "crlf.txt")).toMatchObject({
      kind: "ok",
      content: "p\nq\n",
      eol: "crlf",
    });
  });

  it("decodes an invalid UTF-8 blob as the working side would", async () => {
    write(repo, "latin.txt", Buffer.from([0x61, 0xff, 0x0a]));
    commitAll(repo);

    expect(await readHeadFile(repo, "latin.txt")).toMatchObject({
      kind: "ok",
      encoding: "invalid-utf-8",
    });
  });

  it("refuses a binary blob with the shared reason", async () => {
    write(repo, "bin.dat", Buffer.from([0, 1, 2, 3]));
    commitAll(repo);

    expect(await readHeadFile(repo, "bin.dat")).toEqual({
      kind: "refused",
      reason: BINARY_REFUSAL,
    });
  });

  it("answers absent for a path HEAD does not hold, on disk or not", async () => {
    write(repo, "kept.txt", "k\n");
    commitAll(repo);
    write(repo, "loose.txt", "u\n");

    expect(await readHeadFile(repo, "loose.txt")).toEqual({ kind: "absent" });
    expect(await readHeadFile(repo, "never.txt")).toEqual({ kind: "absent" });
  });

  it("answers absent on an unborn branch", async () => {
    write(repo, "new.txt", "n\n");

    expect(await readHeadFile(repo, "new.txt")).toEqual({ kind: "absent" });
  });

  it("looks up HEAD:./ from a subfolder root and refuses to climb out of it", async () => {
    write(repo, "top.txt", "top\n");
    write(repo, "sub/inner.txt", "inner\n");
    commitAll(repo);
    const sub = path.join(repo, "sub");

    expect(await readHeadFile(sub, "inner.txt")).toMatchObject({ kind: "ok", content: "inner\n" });
    expect(await readHeadFile(sub, "top.txt")).toEqual({ kind: "absent" });
    expect(await readHeadFile(sub, "../top.txt")).toMatchObject({ kind: "failed" });
  });

  it("fails for a submodule gitlink, which has no blob", async () => {
    write(repo, "a.txt", "a\n");
    git(repo, "add", "-A");
    git(
      repo,
      "update-index",
      "--add",
      "--cacheinfo",
      "160000,1234567890123456789012345678901234567890,subm",
    );
    git(repo, "commit", "-q", "-m", "c");

    expect(await readHeadFile(repo, "subm")).toMatchObject({ kind: "failed" });
  });

  it("says not-repository for a plain folder", async () => {
    const plain = path.join(scratch, "plain");
    fs.mkdirSync(plain);

    expect(await readHeadFile(plain, "a.txt")).toMatchObject({ kind: "not-repository" });
  });

  it("leaves .git/index alone", async () => {
    write(repo, "a.txt", "a\n");
    commitAll(repo);
    const index = path.join(repo, ".git", "index");
    const before = { mtimeMs: fs.statSync(index).mtimeMs, bytes: fs.readFileSync(index) };

    await readHeadFile(repo, "a.txt");
    await readHeadFile(repo, "missing.txt");

    expect(fs.statSync(index).mtimeMs).toBe(before.mtimeMs);
    expect(fs.readFileSync(index).equals(before.bytes)).toBe(true);
  });
});

describe("readHeadFile with an injected runner", () => {
  it("asks the size first, then reads the blob, with nothing else", async () => {
    const { run, calls } = scripted([sizeOf(3), { ok: true, stdout: Buffer.from("hi\n") }]);

    expect(await readHeadFile(repo, "dir/a b.txt", { run })).toMatchObject({
      kind: "ok",
      content: "hi\n",
      bytes: 3,
    });
    expect(calls).toEqual([
      ["cat-file", "-s", "HEAD:./dir/a b.txt"],
      ["cat-file", "blob", "HEAD:./dir/a b.txt"],
    ]);
  });

  it("answers too-large from the size alone, without reading the blob", async () => {
    const { run, calls } = scripted([sizeOf(MAX_EDITABLE_BYTES + 1)]);

    expect(await readHeadFile(repo, "big.txt", { run })).toEqual({
      kind: "too-large",
      bytes: MAX_EDITABLE_BYTES + 1,
    });
    expect(calls).toHaveLength(1);
  });

  it("reads a blob of exactly the limit", async () => {
    const text = Buffer.alloc(MAX_EDITABLE_BYTES, 0x61);
    const { run } = scripted([sizeOf(MAX_EDITABLE_BYTES), { ok: true, stdout: text }]);

    expect(await readHeadFile(repo, "edge.txt", { run })).toMatchObject({
      kind: "ok",
      bytes: MAX_EDITABLE_BYTES,
    });
  });

  it("answers too-large when a commit swaps in a larger blob between the two calls", async () => {
    const { run } = scripted([
      sizeOf(10),
      { ok: true, stdout: Buffer.alloc(MAX_EDITABLE_BYTES + 5, 0x61) },
    ]);

    expect(await readHeadFile(repo, "swap.txt", { run })).toEqual({
      kind: "too-large",
      bytes: MAX_EDITABLE_BYTES + 5,
    });
  });

  it.each([
    ["an absolute path", "/etc/passwd"],
    ["a Windows drive path", "C:\\Windows\\win.ini"],
    ["a parent segment", "a/../../b.txt"],
    ["a leading parent segment", "../b.txt"],
    ["a backslash parent segment", "a\\..\\b.txt"],
    ["a NUL byte", "a\0b.txt"],
    ["an empty path", ""],
    ["a path over the cap", `${"a/".repeat(20_000)}b.txt`],
  ])("fails %s before any git call", async (_label, target) => {
    const { run, calls } = scripted([]);

    expect(await readHeadFile(repo, target, { run })).toMatchObject({ kind: "failed" });
    expect(calls).toHaveLength(0);
  });

  it("fails a path that is not a string, and a root that cannot be read", async () => {
    const { run, calls } = scripted([]);

    expect(await readHeadFile(repo, 7 as unknown as string, { run })).toMatchObject({
      kind: "failed",
    });
    expect(await readHeadFile(path.join(scratch, "gone"), "a.txt", { run })).toMatchObject({
      kind: "failed",
      message: "The workspace folder cannot be read",
    });
    expect(await readHeadFile("relative/root", "a.txt", { run })).toMatchObject({ kind: "failed" });
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["git-missing", "Git is not installed"],
    ["timeout", "took longer"],
    ["overflow", "too large"],
    ["not-repository", "Not a git repository"],
  ] as const)("passes %s through as a typed reply", async (kind, fragment) => {
    const { run } = scripted([{ ok: false, kind, stderr: "" }]);

    const reply = await readHeadFile(repo, "a.txt", { run });

    expect(reply).toMatchObject({ kind });
    expect(reply.kind === kind && "message" in reply ? reply.message : "").toContain(fragment);
  });

  it("reports a failing blob read with git's own first line", async () => {
    const { run } = scripted([
      sizeOf(4),
      { ok: false, kind: "failed", stderr: "\nfatal: bad object\nmore\n" },
    ]);

    expect(await readHeadFile(repo, "a.txt", { run })).toEqual({
      kind: "failed",
      message: "fatal: bad object",
    });
  });

  it("fails on a size git did not print as a number", async () => {
    const { run } = scripted([{ ok: true, stdout: Buffer.from("not a size\n") }]);

    expect(await readHeadFile(repo, "a.txt", { run })).toMatchObject({ kind: "failed" });
  });

  it("never rejects, even when the runner throws", async () => {
    const run: GitBufferRunner = async () => {
      throw new Error("spawn exploded");
    };

    expect(await readHeadFile(repo, "a.txt", { run })).toEqual({
      kind: "failed",
      message: "spawn exploded",
    });
  });
});
