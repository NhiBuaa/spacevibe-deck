// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CloneStartRequest } from "../../src/lib/clone-contract";
import {
  FIXTURE_DESTINATION,
  FIXTURE_PARENT,
  FIXTURE_REQUEST,
  PROGRESS_SEQUENCE,
} from "../../src/lib/clone-fixtures";
import { createHarness, queueChild, type Harness } from "./clone-test-support";

let h: Harness;

beforeEach(() => {
  vi.useFakeTimers();
  h = createHarness();
  h.vfs.directories.add(FIXTURE_PARENT);
});
afterEach(() => {
  vi.useRealTimers();
});

const other = (overrides: Partial<CloneStartRequest>): CloneStartRequest => ({
  ...FIXTURE_REQUEST,
  ...overrides,
});

function phases(): string[] {
  return h.events.map(({ job }) => `${job.phase}:${job.percent}`);
}

describe("start", () => {
  it("accepts a request and spawns git with an argv array, never a shell", async () => {
    queueChild(h);
    const result = await h.service.start("w1", FIXTURE_REQUEST);

    expect(result).toEqual({
      ok: true,
      job: expect.objectContaining({
        jobId: "job-1",
        requestId: "req-1",
        revision: 1,
        phase: "connecting",
        percent: null,
        error: null,
        leftoverPath: null,
        warnings: [],
        destination: FIXTURE_DESTINATION, // spaces and non-ASCII survive intact
      }),
    });
    const [command, args, options] = h.spawn.mock.calls[0];
    expect(command).toBe("/opt/git/bin/git");
    expect(args).toEqual([
      "clone",
      "--progress",
      "--",
      "https://github.com/octocat/hello-world.git",
      FIXTURE_DESTINATION,
    ]);
    expect(options).toMatchObject({
      cwd: FIXTURE_PARENT,
      detached: true,
      stdio: ["ignore", "ignore", "pipe"],
    });
    expect(options).not.toHaveProperty("shell");
    expect(h.events.map((event) => event.job.revision)).toEqual([1]);
    expect(h.locks.size).toBe(1);
  });

  it("closes every prompt path and keeps the user's own ssh command", async () => {
    queueChild(h);
    await h.service.start("w1", FIXTURE_REQUEST);
    expect(h.spawn.mock.calls[0][2].env).toMatchObject({
      GIT_TERMINAL_PROMPT: "0",
      GIT_ASKPASS: "",
      GIT_SSH_COMMAND: "ssh -o BatchMode=yes",
      LC_ALL: "C",
      PATH: "/usr/bin",
    });

    const custom = createHarness({ env: () => ({ GIT_SSH_COMMAND: "ssh -i ~/.ssh/work" }) });
    custom.vfs.directories.add(FIXTURE_PARENT);
    queueChild(custom);
    await custom.service.start("w1", FIXTURE_REQUEST);
    expect(custom.spawn.mock.calls[0][2].env.GIT_SSH_COMMAND).toBe("ssh -i ~/.ssh/work");
  });

  it("rejects input main cannot trust, before touching anything", async () => {
    const bad: Partial<CloneStartRequest>[] = [
      { repository: "https://github.com/octocat/hello-world/tree/main" },
      { repository: "--upload-pack=evil" },
      { parent: "relative/dir" },
      { parent: "/Users/test/missing" },
      { name: ".." },
      { name: "a/b" },
      { name: ".hidden" },
      { name: " padded " },
      { name: "nul\0byte" },
      { name: "" },
    ];
    for (const [index, overrides] of bad.entries()) {
      expect(
        await h.service.start("w1", other({ requestId: `bad-${index}`, ...overrides })),
      ).toEqual({ ok: false, error: "invalid-input" });
    }
    expect(h.spawn).not.toHaveBeenCalled();
    expect(h.locks.size).toBe(0);
  });

  it("rejects a parent that is a file", async () => {
    h.vfs.entries.add("/Users/test/file");
    expect(await h.service.start("w1", other({ parent: "/Users/test/file" }))).toEqual({
      ok: false,
      error: "invalid-input",
    });
  });

  it("reports a missing git without creating a job", async () => {
    const child = queueChild(h, null);
    const pending = h.service.start("w1", FIXTURE_REQUEST);
    await h.settle();
    child.fail("ENOENT");
    expect(await pending).toEqual({ ok: false, error: "git-not-found" });
    expect(h.service.status("w1")).toBeNull();
    expect(h.events).toEqual([]);
    expect(h.locks.size).toBe(0);
  });

  it.each(["file", "directory", "symlink or broken symlink"])(
    "rejects an occupied destination (%s) and spawns nothing",
    async () => {
      h.vfs.entries.add(FIXTURE_DESTINATION);
      expect(await h.service.start("w1", FIXTURE_REQUEST)).toEqual({
        ok: false,
        error: "destination-exists",
      });
      expect(h.spawn).not.toHaveBeenCalled();
      expect(h.locks.size).toBe(0);
      expect(h.service.status("w1")).toBeNull();
    },
  );

  it("locks a destination across owners, and across simultaneous starts", async () => {
    queueChild(h);
    const [first, second] = await Promise.all([
      h.service.start("w1", FIXTURE_REQUEST),
      h.service.start("w2", other({ requestId: "req-2" })),
    ]);
    expect([first.ok, second.ok].sort()).toEqual([false, true]);
    expect([first, second].find((result) => !result.ok)).toEqual({
      ok: false,
      error: "destination-busy",
    });
    expect(h.spawn).toHaveBeenCalledTimes(1);
  });

  it("treats a differently cased folder name as the same destination on a case-insensitive disk", async () => {
    const mac = createHarness({ platform: "darwin" });
    mac.vfs.directories.add(FIXTURE_PARENT);
    queueChild(mac);
    await mac.service.start("w1", FIXTURE_REQUEST);
    expect(await mac.service.start("w2", other({ requestId: "r2", name: "DỰ ÁN MẪU" }))).toEqual({
      ok: false,
      error: "destination-busy",
    });
  });

  it("allows one active job per owner", async () => {
    queueChild(h);
    await h.service.start("w1", FIXTURE_REQUEST);
    expect(await h.service.start("w1", other({ requestId: "req-2", name: "second" }))).toEqual({
      ok: false,
      error: "job-busy",
    });
    expect(h.spawn).toHaveBeenCalledTimes(1);
  });

  it("returns the retained job for a repeated requestId, even while starting", async () => {
    queueChild(h);
    const [first, repeat] = await Promise.all([
      h.service.start("w1", FIXTURE_REQUEST),
      h.service.start("w1", FIXTURE_REQUEST),
    ]);
    expect(repeat).toEqual(first);
    expect(await h.service.start("w1", FIXTURE_REQUEST)).toEqual(first);
    expect(h.spawn).toHaveBeenCalledTimes(1);
  });

  it("replaces the finished job when a new request arrives", async () => {
    const first = queueChild(h);
    await h.service.start("w1", FIXTURE_REQUEST);
    h.vfs.entries.add(`${FIXTURE_DESTINATION}/.git`);
    first.finish(0);
    await h.settle();
    expect(h.service.status("w1")?.phase).toBe("succeeded");

    queueChild(h);
    const next = await h.service.start("w1", other({ requestId: "req-2", name: "second" }));
    expect(next).toMatchObject({ ok: true, job: { jobId: "job-2", requestId: "req-2" } });
    expect(h.service.status("w1")?.jobId).toBe("job-2");
  });
});

describe("progress", () => {
  it("reports each phase with its own percent and strictly rising revisions", async () => {
    const child = queueChild(h);
    await h.service.start("w1", FIXTURE_REQUEST);
    child.write("Cloning into 'x'...\nremote: Counting objects: 100% (5/5), done.\n");
    child.write("Receiving objects:   0% (0/100)\rReceiving objects:  48% (48/100)\r");
    child.write("Receiving objects:  48% (48/100)\r"); // a repeat is not a change
    child.write("Receiving objects: 100% (100/100), done.\nResolving deltas:  1");
    child.write("00% (9/9), done.\n");
    child.write("Updating files:  60% (3/5)\r");

    expect(phases()).toEqual([
      "connecting:null",
      "receiving:48", // two redraws in one chunk collapse to the latest
      "receiving:100",
      "resolving:100",
      "checkout:60",
    ]);
    const revisions = h.events.map(({ job }) => job.revision);
    expect(revisions).toEqual(PROGRESS_SEQUENCE.map((_, index) => index + 1));
  });

  it("never walks a finished phase backwards", async () => {
    const child = queueChild(h);
    await h.service.start("w1", FIXTURE_REQUEST);
    child.write("Resolving deltas:  10% (1/9)\r");
    child.write("Receiving objects:  99% (99/100)\r");
    expect(h.service.status("w1")).toMatchObject({ phase: "resolving", percent: 10 });
  });
});

describe("finishing", () => {
  it("succeeds and frees the destination", async () => {
    const child = queueChild(h);
    await h.service.start("w1", FIXTURE_REQUEST);
    h.vfs.directories.add(FIXTURE_DESTINATION);
    h.vfs.entries.add(`${FIXTURE_DESTINATION}/.git`);
    child.finish(0);
    await h.settle();

    expect(h.service.status("w1")).toMatchObject({
      phase: "succeeded",
      percent: 100,
      error: null,
      leftoverPath: null,
      warnings: [],
    });
    expect(h.locks.size).toBe(0);
  });

  it("warns, and does nothing else, when the checkout has submodules", async () => {
    const child = queueChild(h);
    await h.service.start("w1", FIXTURE_REQUEST);
    h.vfs.entries.add(`${FIXTURE_DESTINATION}/.git`);
    h.vfs.entries.add(`${FIXTURE_DESTINATION}/.gitmodules`);
    child.finish(0);
    await h.settle();
    expect(h.service.status("w1")).toMatchObject({
      phase: "succeeded",
      warnings: ["submodules-not-initialized"],
    });
    expect(h.spawn).toHaveBeenCalledTimes(1);
  });

  it("fails an exit-0 clone that has no .git, and discloses the files", async () => {
    const child = queueChild(h);
    await h.service.start("w1", FIXTURE_REQUEST);
    h.vfs.directories.add(FIXTURE_DESTINATION);
    child.finish(0);
    await h.settle();
    expect(h.service.status("w1")).toMatchObject({
      phase: "failed",
      error: "incomplete-checkout",
      leftoverPath: FIXTURE_DESTINATION,
    });
  });
});
