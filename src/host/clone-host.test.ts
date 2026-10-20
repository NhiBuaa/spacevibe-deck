import { beforeEach, describe, expect, it, vi } from "vitest";
import { SUCCEEDED } from "../lib/clone-fixtures";

async function load() {
  vi.resetModules();
  const bridge = await import("./bridge");
  const host = await import("./clone-host");
  return { bridge, host };
}

describe("clone-host", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    vi.doMock("./bridge", () => ({ invoke: vi.fn(), listen: vi.fn() }));
  });

  it("reports unavailable without the Electron preload", async () => {
    vi.stubGlobal("__deckHost", undefined);
    const { host } = await load();
    expect(host.available).toBe(false);
  });

  it("sends flat payloads with no owner key", async () => {
    vi.stubGlobal("__deckHost", { invoke: vi.fn(), listen: vi.fn() });
    const { bridge, host } = await load();
    vi.mocked(bridge.invoke).mockResolvedValue({ ok: true, job: SUCCEEDED });

    await host.cloneClient.start({ requestId: "r", repository: "o/r", parent: "/p", name: "n" });
    await host.cloneClient.cancel("job-1");

    expect(bridge.invoke).toHaveBeenNthCalledWith(1, "clone_start", {
      requestId: "r",
      repository: "o/r",
      parent: "/p",
      name: "n",
    });
    expect(bridge.invoke).toHaveBeenNthCalledWith(2, "clone_cancel", { jobId: "job-1" });
  });

  it("narrows replies: a malformed job becomes an unknown error, a bad status null", async () => {
    vi.stubGlobal("__deckHost", { invoke: vi.fn(), listen: vi.fn() });
    const { bridge, host } = await load();
    vi.mocked(bridge.invoke).mockResolvedValueOnce({ ok: true, job: { jobId: 1 } });
    vi.mocked(bridge.invoke).mockResolvedValueOnce("nope");
    vi.mocked(bridge.invoke).mockResolvedValueOnce({ ok: false, error: "stderr: secret" });

    await expect(
      host.cloneClient.start({ requestId: "r", repository: "o/r", parent: "/p", name: "n" }),
    ).resolves.toEqual({ ok: false, error: "unknown" });
    await expect(host.cloneClient.status()).resolves.toBeNull();
    await expect(host.cloneClient.cancel("j")).resolves.toEqual({ ok: false, error: "unknown" });
  });

  it("delivers valid snapshots, drops malformed ones, and unlistens after settling", async () => {
    vi.stubGlobal("__deckHost", { invoke: vi.fn(), listen: vi.fn() });
    const { bridge, host } = await load();
    const unlisten = vi.fn();
    let deliver: (event: { payload: unknown }) => void = () => {};
    vi.mocked(bridge.listen).mockImplementation(async (_event, handler) => {
      deliver = handler as typeof deliver;
      return unlisten;
    });
    const seen: number[] = [];
    const stop = host.cloneClient.subscribe((job) => seen.push(job.revision));

    deliver({ payload: SUCCEEDED });
    deliver({ payload: { jobId: "x" } });
    stop();
    await Promise.resolve();
    await Promise.resolve();

    expect(bridge.listen).toHaveBeenCalledWith("clone:changed", expect.any(Function));
    expect(seen).toEqual([SUCCEEDED.revision]);
    expect(unlisten).toHaveBeenCalledTimes(1);
  });
});
