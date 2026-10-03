import { describe, expect, it, vi } from "vitest";
import { guardReleaseSwitchHandler } from "./release-switch-guard";
import type { ReleaseSwitchId } from "../../src/lib/release-switches";

vi.mock("electron", () => ({ app: { isPackaged: true } }));

describe("main-owned feature IPC guard", () => {
  it.each([false, true])(
    "guards direct invocation with enabled=%s before side effects",
    (enabled) => {
      const handler = vi.fn((_event: unknown, payload: { enabled: boolean }) => payload.enabled);
      const guarded = guardReleaseSwitchHandler("fixture" as ReleaseSwitchId, handler, () => ({
        fixture: enabled,
      }));
      if (enabled) {
        expect(guarded({}, { enabled: true })).toBe(true);
        expect(handler).toHaveBeenCalledOnce();
      } else {
        expect(() => guarded({}, { enabled: true })).toThrow("not available");
        expect(handler).not.toHaveBeenCalled();
      }
    },
  );
  it("rejects unknown keys even when a renderer claims it enabled", () => {
    const handler = vi.fn();
    expect(() =>
      guardReleaseSwitchHandler("unknown" as ReleaseSwitchId, handler)({}, { enabled: true }),
    ).toThrow("not available");
    expect(handler).not.toHaveBeenCalled();
  });
});
