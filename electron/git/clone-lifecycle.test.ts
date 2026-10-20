// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_DESTINATION, FIXTURE_PARENT, FIXTURE_REQUEST } from "../../src/lib/clone-fixtures";
import { createHarness, queueChild, TEST_TIMING, type Harness } from "./clone-test-support";

let h: Harness;

beforeEach(() => {
  vi.useFakeTimers();
  h = createHarness();
  h.vfs.directories.add(FIXTURE_PARENT);
});
afterEach(() => {
  vi.useRealTimers();
});

async function startJob(owner = "w1", pid = 4242, name?: string) {
  const child = queueChild(h, pid);
  const result = await h.service.start(
    owner,
    name === undefined ? FIXTURE_REQUEST : { ...FIXTURE_REQUEST, requestId: `req-${owner}`, name },
  );
  if (!result.ok) {
    throw new Error(`start failed: ${result.error}`);
  }
  return { child, job: result.job };
}

const phasesOf = () => h.events.map(({ job }) => job.phase);

describe("cancel", () => {
  it("signals at once, and is terminal only after the child has exited", async () => {
    const { child, job } = await startJob();
    const reply = await h.service.cancel("w1", job.jobId);

    expect(reply).toMatchObject({ ok: true, job: { phase: "cancelling", revision: 2 } });
    expect(h.kills).toEqual([{ pid: 4242, signal: "SIGTERM" }]);
    expect(phasesOf()).toEqual(["connecting", "cancelling"]);
    expect(h.locks.size).toBe(1); // the destination stays locked while git runs

    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.service.status("w1")?.phase).toBe("cancelling");

    child.finish(null, "SIGTERM");
    await h.settle();
    expect(phasesOf()).toEqual(["connecting", "cancelling", "cancelled"]);
    expect(h.service.status("w1")).toMatchObject({ phase: "cancelled", leftoverPath: null });
    expect(h.locks.size).toBe(0);
  });

  it("escalates to SIGKILL when git ignores the first signal", async () => {
    const { child, job } = await startJob();
    await h.service.cancel("w1", job.jobId);
    await vi.advanceTimersByTimeAsync(TEST_TIMING.killGraceMs);
    expect(h.kills.map((kill) => kill.signal)).toEqual(["SIGTERM", "SIGKILL"]);
    child.finish(null, "SIGKILL");
    await h.settle();
    expect(h.service.status("w1")?.phase).toBe("cancelled");
  });

  it("is idempotent while cancelling", async () => {
    const { child, job } = await startJob();
    const first = await h.service.cancel("w1", job.jobId);
    const again = await h.service.cancel("w1", job.jobId);
    expect(again).toEqual(first);
    expect(h.kills).toHaveLength(1);
    expect(phasesOf()).toEqual(["connecting", "cancelling"]);
    child.finish(null, "SIGTERM");
    await h.settle();
    expect(phasesOf()).toEqual(["connecting", "cancelling", "cancelled"]);
  });

  it("keeps the percent it had when cancel was pressed", async () => {
    const { child, job } = await startJob();
    child.write("Receiving objects:  30% (3/10)\r");
    await h.service.cancel("w1", job.jobId);
    child.write("Receiving objects:  90% (9/10)\r"); // late output must not undo cancelling
    expect(h.service.status("w1")).toMatchObject({ phase: "cancelling", percent: 30 });
  });

  it("discloses leftovers after the process is gone, and removes nothing", async () => {
    const { child, job } = await startJob();
    await h.service.cancel("w1", job.jobId);
    h.vfs.directories.add(FIXTURE_DESTINATION);
    child.finish(null, "SIGKILL");
    await h.settle();
    expect(h.service.status("w1")).toMatchObject({
      phase: "cancelled",
      leftoverPath: FIXTURE_DESTINATION,
    });
    expect(h.vfs.directories.has(FIXTURE_DESTINATION)).toBe(true);
  });

  it("stays finished once finished, and refuses an unknown job", async () => {
    const { child, job } = await startJob();
    h.vfs.entries.add(`${FIXTURE_DESTINATION}/.git`);
    child.finish(0);
    await h.settle();
    const finished = h.service.status("w1");

    expect(await h.service.cancel("w1", job.jobId)).toEqual({ ok: true, job: finished });
    expect(h.kills).toEqual([]);
    expect(await h.service.cancel("w1", "nope")).toEqual({ ok: false, error: "job-unavailable" });
    expect(await h.service.cancel("w2", job.jobId)).toEqual({
      ok: false,
      error: "job-unavailable",
    });
  });

  it("wins over a clone that finished while the cancel was in flight", async () => {
    const { child, job } = await startJob();
    h.vfs.entries.add(`${FIXTURE_DESTINATION}/.git`);
    h.vfs.directories.add(FIXTURE_DESTINATION);
    child.emit("exit", 0, null);
    child.emit("close", 0, null); // finishing has begun, its inspection is pending
    await h.service.cancel("w1", job.jobId);
    await h.settle();
    expect(h.service.status("w1")).toMatchObject({
      phase: "cancelled",
      leftoverPath: FIXTURE_DESTINATION,
    });
    expect(h.kills).toEqual([]); // nothing left to signal
  });
});

describe("releaseOwner", () => {
  it("signals the process group before the first await, then waits for the exit", async () => {
    const { child } = await startJob();
    const before = h.events.length;
    let settled = false;
    const released = h.service.releaseOwner("w1").then(() => {
      settled = true;
    });

    expect(h.kills).toEqual([{ pid: 4242, signal: "SIGTERM" }]); // synchronous
    expect(settled).toBe(false);
    expect(h.service.status("w1")).toBeNull(); // snapshot dropped at once

    await h.settle();
    expect(settled).toBe(false); // still waiting for the child
    child.finish(null, "SIGTERM");
    await released;
    expect(h.locks.size).toBe(0);
    expect(h.events).toHaveLength(before); // a released owner hears nothing more
  });

  it("is harmless for an unknown owner or a job that already ended", async () => {
    await expect(h.service.releaseOwner("ghost")).resolves.toBeUndefined();
    const { child } = await startJob();
    h.vfs.entries.add(`${FIXTURE_DESTINATION}/.git`);
    child.finish(0);
    await h.settle();
    await expect(h.service.releaseOwner("w1")).resolves.toBeUndefined();
    expect(h.kills).toEqual([]);
    expect(h.service.status("w1")).toBeNull();
  });

  it("stops a start that is still resolving git, so nothing is spawned", async () => {
    let resolveGit: (path: string) => void = () => {};
    const slow = createHarness({
      resolveGit: () => new Promise<string>((resolve) => (resolveGit = resolve)),
    });
    slow.vfs.directories.add(FIXTURE_PARENT);
    queueChild(slow);
    const pending = slow.service.start("w1", FIXTURE_REQUEST);
    await slow.settle();
    await slow.service.releaseOwner("w1");
    resolveGit("/opt/git/bin/git");
    expect(await pending).toEqual({ ok: false, error: "job-unavailable" });
    expect(slow.spawn).not.toHaveBeenCalled();
    expect(slow.locks.size).toBe(0);
  });
});

describe("dispose", () => {
  it("signals every job synchronously, so it also works from process exit", async () => {
    const first = await startJob("w1", 100);
    const second = await startJob("w2", 200, "other");
    let settled = false;
    const disposed = h.service.dispose().then(() => {
      settled = true;
    });

    expect(h.kills).toEqual([
      { pid: 100, signal: "SIGTERM" },
      { pid: 200, signal: "SIGTERM" },
    ]);
    expect(settled).toBe(false);

    first.child.finish(null, "SIGTERM");
    await h.settle();
    expect(settled).toBe(false);
    second.child.finish(null, "SIGTERM");
    await disposed;
    expect(h.service.status("w1")?.phase).toBe("cancelled");
    expect(h.service.status("w2")?.phase).toBe("cancelled");
    expect(h.locks.size).toBe(0);
  });

  it("refuses new work afterwards, and is safe to call twice", async () => {
    await h.service.dispose();
    await h.service.dispose();
    queueChild(h);
    expect(await h.service.start("w1", FIXTURE_REQUEST)).toEqual({
      ok: false,
      error: "job-unavailable",
    });
  });
});

describe("timeouts", () => {
  it("fails with timed-out when git goes quiet, after stopping the process", async () => {
    const { child } = await startJob();
    await vi.advanceTimersByTimeAsync(TEST_TIMING.idleTimeoutMs);
    expect(h.kills).toEqual([{ pid: 4242, signal: "SIGTERM" }]);
    expect(h.service.status("w1")?.phase).toBe("connecting"); // not over until it has exited
    h.vfs.directories.add(FIXTURE_DESTINATION);
    child.finish(null, "SIGTERM");
    await h.settle();
    expect(h.service.status("w1")).toMatchObject({
      phase: "failed",
      error: "timed-out",
      leftoverPath: FIXTURE_DESTINATION,
    });
    expect(h.locks.size).toBe(0);
  });

  it("counts output as life: a slow but steady transfer never times out", async () => {
    const { child } = await startJob();
    for (let step = 0; step < 5; step += 1) {
      await vi.advanceTimersByTimeAsync(TEST_TIMING.idleTimeoutMs - 1_000);
      child.write(`Receiving objects:  ${step * 10}% (${step}/50)\r`);
    }
    expect(h.kills).toEqual([]);
    expect(h.service.status("w1")?.phase).toBe("receiving");
  });
});

describe("finishing", () => {
  it("emits the terminal snapshot once, after the child is gone", async () => {
    const child = queueChild(h);
    await h.service.start("w1", FIXTURE_REQUEST);
    h.vfs.entries.add(`${FIXTURE_DESTINATION}/.git`);
    child.emit("exit", 0, null);
    expect(h.service.status("w1")?.phase).toBe("connecting"); // stderr not drained yet
    child.emit("close", 0, null);
    await h.settle();
    await vi.advanceTimersByTimeAsync(5_000); // the close grace timer must not double-finish
    expect(h.events.filter(({ job }) => job.phase === "succeeded")).toHaveLength(1);
  });

  it("finishes even when a grandchild keeps stderr open", async () => {
    const child = queueChild(h);
    await h.service.start("w1", FIXTURE_REQUEST);
    h.vfs.entries.add(`${FIXTURE_DESTINATION}/.git`);
    child.emit("exit", 0, null); // no `close`
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.service.status("w1")?.phase).toBe("succeeded");
  });
});
