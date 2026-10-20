import { describe, expect, it, vi } from "vitest";
import { createAccountService } from "./service";
import { REASONS } from "./model";

describe("privacy-first account service", () => {
  const store = {
    load: vi.fn(async () => ({})),
    clear: vi.fn(async () => true),
    entries: vi.fn(() => ({})),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  };

  it("always returns signed-out not-configured without touching network", async () => {
    const onStateChanged = vi.fn();
    const fetchMock = vi.fn();
    const openExternalMock = vi.fn();

    const service = createAccountService({
      config: null,
      store,
      fetch: fetchMock as unknown as typeof fetch,
      openExternal: openExternalMock,
      onStateChanged,
    });

    await service.start();
    expect(await service.state()).toEqual({
      status: "signed-out",
      reason: REASONS.notConfigured,
    });

    const signInResult = await service.signIn();
    expect(signInResult).toEqual({
      status: "signed-out",
      reason: REASONS.notConfigured,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(openExternalMock).not.toHaveBeenCalled();
  });

  it("signOut clears store and returns signed-out when successful", async () => {
    const onStateChanged = vi.fn();
    const service = createAccountService({
      config: null,
      store,
      onStateChanged,
    });

    const result = await service.signOut();
    expect(result).toEqual({ status: "signed-out", reason: null });
    expect(store.clear).toHaveBeenCalled();
    expect(onStateChanged).toHaveBeenCalledWith({ status: "signed-out", reason: null });
  });

  it("signOut reports error when store.clear returns false", async () => {
    const failStore = {
      ...store,
      clear: vi.fn(async () => false),
    };
    const onStateChanged = vi.fn();
    const service = createAccountService({
      config: null,
      store: failStore,
      onStateChanged,
    });

    const result = await service.signOut();
    expect(result).toEqual({ status: "signed-out", reason: REASONS.savedAccount });
    expect(onStateChanged).toHaveBeenCalledWith({
      status: "signed-out",
      reason: REASONS.savedAccount,
    });
  });

  it("signOut reports error when store.clear throws or rejects", async () => {
    const errorStore = {
      ...store,
      clear: vi.fn(async () => {
        throw new Error("disk error");
      }),
    };
    const onStateChanged = vi.fn();
    const service = createAccountService({
      config: null,
      store: errorStore,
      onStateChanged,
    });

    const result = await service.signOut();
    expect(result).toEqual({ status: "signed-out", reason: REASONS.savedAccount });
    expect(onStateChanged).toHaveBeenCalledWith({
      status: "signed-out",
      reason: REASONS.savedAccount,
    });
  });
});
