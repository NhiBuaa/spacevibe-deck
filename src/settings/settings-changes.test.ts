import { describe, expect, it } from "vitest";
import { changedKeys, defaultsFor, isChanged, keysFor } from "./settings-changes";
import { DEFAULT_SETTINGS } from "./settings-schema";

describe("settings changes", () => {
  it("sees a nested value that differs from its default", () => {
    expect(isChanged(DEFAULT_SETTINGS, "keybindings")).toBe(false);
    const custom = { ...DEFAULT_SETTINGS, disabledAgents: ["codex"] };
    expect(isChanged(custom, "disabledAgents")).toBe(true);
  });

  it("scopes keys by scope and page", () => {
    expect(keysFor("preference", "terminal")).toEqual(["scrollback"]);
    expect(keysFor("layout")).toContain("sidebarWidth");
    expect(keysFor("layout")).not.toContain("fontSize");
  });

  it("lists only changed keys and resets exactly the keys asked", () => {
    const custom = { ...DEFAULT_SETTINGS, fontSize: 20, scrollback: 1000 };
    expect(changedKeys(custom, keysFor("preference"))).toEqual(["fontSize", "scrollback"]);
    expect(defaultsFor(["fontSize"])).toEqual({ fontSize: DEFAULT_SETTINGS.fontSize });
  });
});
