import { describe, expect, it } from "vitest";
import { acceptsSnapshot, isTerminalPhase } from "./clone-contract";
import {
  CANCELLED_WITH_LEFTOVERS,
  PROGRESS_SEQUENCE,
  SUCCEEDED,
  cloneJob,
  createFakeCloneClient,
} from "./clone-fixtures";

describe("acceptsSnapshot", () => {
  it("accepts only a higher revision of the same job", () => {
    const [first, second] = PROGRESS_SEQUENCE;
    expect(acceptsSnapshot(first, second, null)).toBe(true);
    expect(acceptsSnapshot(second, first, null)).toBe(false);
    expect(acceptsSnapshot(second, second, null)).toBe(false);
  });

  it("never lets a late progress reply overwrite a terminal snapshot", () => {
    expect(acceptsSnapshot(SUCCEEDED, PROGRESS_SEQUENCE[2], null)).toBe(false);
  });

  it("adopts a job over nothing or a finished job when no request is outstanding", () => {
    const other = cloneJob({ jobId: "job-2", requestId: "req-2" });
    expect(acceptsSnapshot(null, other, null)).toBe(true);
    expect(acceptsSnapshot(CANCELLED_WITH_LEFTOVERS, other, null)).toBe(true);
    expect(acceptsSnapshot(PROGRESS_SEQUENCE[1], other, null)).toBe(false);
  });

  it("accepts a different job only when it answers the outstanding request", () => {
    const answering = cloneJob({ jobId: "job-2", requestId: "req-2" });
    const stale = cloneJob({ jobId: "job-0", requestId: "req-0", revision: 9 });
    expect(acceptsSnapshot(SUCCEEDED, answering, "req-2")).toBe(true);
    expect(acceptsSnapshot(SUCCEEDED, stale, "req-2")).toBe(false);
  });
});

describe("isTerminalPhase", () => {
  it("treats cancelling as still running", () => {
    expect(isTerminalPhase("cancelling")).toBe(false);
    expect(isTerminalPhase("cancelled")).toBe(true);
  });
});

describe("createFakeCloneClient", () => {
  it("delivers emitted snapshots until unsubscribed", () => {
    const client = createFakeCloneClient();
    const seen: number[] = [];
    const stop = client.subscribe((job) => seen.push(job.revision));
    client.emit(PROGRESS_SEQUENCE[0]);
    stop();
    client.emit(PROGRESS_SEQUENCE[1]);
    expect(seen).toEqual([1]);
  });
});
