// @vitest-environment node
import { execFileSync, spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CloneJob } from "../../src/lib/clone-contract";
import { createCloneService } from "./clone";
import { defaultCloneDeps, type CloneDeps } from "./clone-deps";
import { killProcessTree } from "./clone-kill";

/**
 * The only tests that run the real `git`: they prove the argv and environment
 * work end to end against a local bare repository. `parseGithubRepository`
 * rejects local paths on purpose, so the remote is injected for these alone.
 */
let root: string;
let bare: string;
let parent: string;

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    cwd,
    stdio: "ignore",
    env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
  });
}

function serviceFor(remote: string) {
  const overrides: Partial<CloneDeps> = {
    parseRepository: () => ({ owner: "o", repo: "r", remoteUrl: remote, folderName: "r" }),
    locks: new Set<string>(),
  };
  const service = createCloneService({ ...defaultCloneDeps(), ...overrides });
  const events: CloneJob[] = [];
  service.onChanged((_owner, job) => events.push(job));
  return { service, events };
}

async function untilTerminal(service: ReturnType<typeof serviceFor>["service"]): Promise<CloneJob> {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const job = service.status("w1");
    if (job !== null && ["succeeded", "failed", "cancelled"].includes(job.phase)) {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("clone did not finish");
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), "deck-clone-"));
  const work = path.join(root, "work");
  bare = path.join(root, "source.git");
  mkdirSync(work);
  git(work, "init", "-q", "-b", "main");
  writeFileSync(path.join(work, "README.md"), "hello\n");
  git(work, "add", ".");
  git(work, "commit", "-q", "-m", "init");
  git(root, "clone", "-q", "--bare", work, bare);
  parent = path.join(root, "Code Projects"); // a space on purpose
  mkdirSync(parent);
});
afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("createCloneService with the real git", () => {
  it("clones a repository into a folder with spaces and non-ASCII characters", async () => {
    const { service, events } = serviceFor(bare);
    const result = await service.start("w1", {
      requestId: "r1",
      repository: "o/r",
      parent,
      name: "Dự án mẫu",
    });
    expect(result.ok).toBe(true);

    const job = await untilTerminal(service);
    expect(job).toMatchObject({ phase: "succeeded", error: null, leftoverPath: null });
    const destination = path.join(parent, "Dự án mẫu");
    expect(job.destination).toBe(destination);
    expect(readFileSync(path.join(destination, "README.md"), "utf8")).toBe("hello\n");
    const revisions = events.map((event) => event.revision);
    expect(revisions).toEqual(revisions.map((_, index) => index + 1));
  });

  it("leaves a pre-existing file, directory or dangling symlink untouched", async () => {
    const occupied = path.join(root, "occupied");
    mkdirSync(occupied);
    writeFileSync(path.join(occupied, "file.txt"), "mine");
    mkdirSync(path.join(occupied, "dir"));
    writeFileSync(path.join(occupied, "dir", "keep.txt"), "keep");
    symlinkSync(path.join(root, "nowhere"), path.join(occupied, "dangling"));
    const before = readdirSync(occupied, { recursive: true }).sort();

    for (const name of ["file.txt", "dir", "dangling"]) {
      const { service } = serviceFor(bare);
      const result = await service.start("w1", {
        requestId: `r-${name}`,
        repository: "o/r",
        parent: occupied,
        name,
      });
      expect(result).toEqual({ ok: false, error: "destination-exists" });
    }
    expect(readdirSync(occupied, { recursive: true }).sort()).toEqual(before);
    expect(readFileSync(path.join(occupied, "file.txt"), "utf8")).toBe("mine");
    expect(readFileSync(path.join(occupied, "dir", "keep.txt"), "utf8")).toBe("keep");
  });

  it("reports an unreachable remote as repository-unavailable and creates nothing", async () => {
    const { service } = serviceFor(path.join(root, "missing.git"));
    await service.start("w1", { requestId: "r2", repository: "o/r", parent, name: "ghost" });
    const job = await untilTerminal(service);
    expect(job).toMatchObject({ phase: "failed", error: "repository-unavailable" });
    expect(readdirSync(parent)).not.toContain("ghost");
  });

  it("fails fast on an unreachable remote, never waiting on a prompt", async () => {
    const { service } = serviceFor("https://127.0.0.1:9/never/there.git");
    await service.start("w1", { requestId: "r3", repository: "o/r", parent, name: "nowhere" });
    const job = await untilTerminal(service);
    expect(job.phase).toBe("failed");
    expect(["network", "authentication-required"]).toContain(job.error);
  }, 30_000);
});

describe("killProcessTree", () => {
  it.skipIf(process.platform === "win32")("stops a detached process and its children", async () => {
    const child = spawn("sh", ["-c", "sleep 60 & wait"], { detached: true, stdio: "ignore" });
    const exited = new Promise<NodeJS.Signals | null>((resolve) =>
      child.on("exit", (_code, signal) => resolve(signal)),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));
    killProcessTree(child, "SIGTERM");
    expect(await exited).toBe("SIGTERM");
  });
});
