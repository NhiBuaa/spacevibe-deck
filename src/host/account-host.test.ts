import { describe, expect, it } from "vitest";
import { asAccountState } from "./account-host";

describe("asAccountState", () => {
  it("reads the three display states", () => {
    expect(asAccountState({ status: "signed-out", reason: "Sign-in was cancelled." })).toEqual({
      status: "signed-out",
      reason: "Sign-in was cancelled.",
    });
    expect(asAccountState({ status: "signing-in" })).toEqual({ status: "signing-in" });
    expect(
      asAccountState({ status: "signed-in", email: "a@b.dev", name: "Ada", plan: "pro" }),
    ).toEqual({ status: "signed-in", email: "a@b.dev", name: "Ada", plan: "pro" });
  });

  it("reads a missing or unknown plan as free", () => {
    expect(asAccountState({ status: "signed-in", email: "a@b.dev" })).toMatchObject({
      plan: "free",
      name: null,
    });
    expect(asAccountState({ status: "signed-in", email: "a@b.dev", plan: "gold" })).toMatchObject({
      plan: "free",
    });
  });

  it("never carries fields beyond the display state", () => {
    const state = asAccountState({
      status: "signed-in",
      email: "a@b.dev",
      name: null,
      plan: "free",
      accessToken: "secret",
      refreshToken: "secret",
    });
    expect(Object.keys(state ?? {}).sort()).toEqual(["email", "name", "plan", "status"]);
  });

  it("rejects malformed replies", () => {
    expect(asAccountState(null)).toBe(null);
    expect(asAccountState({ status: "signed-in" })).toBe(null);
    expect(asAccountState({ status: "unknown" })).toBe(null);
  });
});
