import { describe, expect, it } from "vitest";
import { resolveAccountConfig, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./config";

const OVERRIDE = { DECK_SUPABASE_URL: "http://127.0.0.1:9999", DECK_SUPABASE_KEY: "stub-key" };

describe("account config", () => {
  it("ships the project URL and a publishable key, never a secret", () => {
    expect(SUPABASE_URL).toBe("https://calkpkscykzmvyayfxih.supabase.co");
    expect(SUPABASE_PUBLISHABLE_KEY).toMatch(/^sb_publishable_/);
    expect(SUPABASE_PUBLISHABLE_KEY).not.toMatch(/secret|service_role/i);
  });

  it("lets an unpackaged run point at a stub", () => {
    expect(resolveAccountConfig(false, OVERRIDE)).toEqual({
      url: "http://127.0.0.1:9999",
      key: "stub-key",
    });
  });

  it("ignores the override in a packaged app", () => {
    expect(resolveAccountConfig(true, OVERRIDE)).toEqual({
      url: SUPABASE_URL,
      key: SUPABASE_PUBLISHABLE_KEY,
    });
  });

  it("rejects a URL that is not http(s)", () => {
    expect(
      resolveAccountConfig(false, { ...OVERRIDE, DECK_SUPABASE_URL: "file:///etc" }),
    ).toBeNull();
    expect(resolveAccountConfig(false, { ...OVERRIDE, DECK_SUPABASE_URL: "nope" })).toBeNull();
  });
});
