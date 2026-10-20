import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CloneJob, CloneService } from "../../src/lib/clone-contract";
import { PROGRESS_SEQUENCE, SUCCEEDED } from "../../src/lib/clone-fixtures";
import { registerClone } from "./register-clone";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => Promise<unknown>>(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (name: string, callback: (event: unknown, payload?: unknown) => Promise<unknown>) =>
      mocks.handlers.set(name, callback),
  },
}));

const EVENT = { sender: { id: 7 } };

function call(channel: string, payload: unknown): Promise<unknown> {
  return mocks.handlers.get(channel)!(EVENT, payload);
}

function fakeService() {
  let listener: (owner: string, job: CloneJob) => void = () => {};
  const service = {
    start: vi.fn(async () => ({ ok: true as const, job: SUCCEEDED })),
    status: vi.fn(() => SUCCEEDED),
    cancel: vi.fn(async () => ({ ok: true as const, job: SUCCEEDED })),
    onChanged: vi.fn((next: typeof listener) => {
      listener = next;
      return () => {};
    }),
    releaseOwner: vi.fn(async () => {}),
    dispose: vi.fn(async () => {}),
  } satisfies CloneService;
  return { service, push: (owner: string, job: CloneJob) => listener(owner, job) };
}

describe("registerClone", () => {
  const emitTo = vi.fn(() => true);
  const labelOf = vi.fn(() => "deck-1");
  let fake: ReturnType<typeof fakeService>;

  beforeEach(() => {
    mocks.handlers.clear();
    emitTo.mockClear();
    fake = fakeService();
    registerClone({ service: fake.service, labelOf, emitTo });
  });

  it("owns the job by the sender's window, never by the payload", async () => {
    const payload = { requestId: "r", repository: "o/r", parent: "/p", name: "n", owner: "main" };
    await call("clone_start", payload);
    expect(fake.service.start).toHaveBeenCalledWith("deck-1", {
      requestId: "r",
      repository: "o/r",
      parent: "/p",
      name: "n",
    });
    await call("clone_status", {});
    expect(fake.service.status).toHaveBeenCalledWith("deck-1");
    await call("clone_cancel", { jobId: "job-1" });
    expect(fake.service.cancel).toHaveBeenCalledWith("deck-1", "job-1");
  });

  it("rejects malformed payloads as invalid-input without reaching the service", async () => {
    await expect(
      call("clone_start", { requestId: "", repository: "o/r", parent: "/p", name: "n" }),
    ).resolves.toEqual({ ok: false, error: "invalid-input" });
    await expect(
      call("clone_start", { requestId: "r", repository: 5, parent: "/p", name: "n" }),
    ).resolves.toEqual({ ok: false, error: "invalid-input" });
    await expect(call("clone_cancel", { jobId: 3 })).resolves.toEqual({
      ok: false,
      error: "invalid-input",
    });
    expect(fake.service.start).not.toHaveBeenCalled();
    expect(fake.service.cancel).not.toHaveBeenCalled();
  });

  it("forwards each snapshot only to the window that owns the job", () => {
    fake.push("deck-2", PROGRESS_SEQUENCE[0]);
    expect(emitTo).toHaveBeenCalledTimes(1);
    expect(emitTo).toHaveBeenCalledWith("deck-2", "clone:changed", PROGRESS_SEQUENCE[0]);
  });
});
