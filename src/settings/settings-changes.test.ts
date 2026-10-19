import { describe, expect, it } from "vitest";
import {
  changedKeys,
  defaultsFor,
  isChanged,
  isMarkedChanged,
  keysFor,
  marksChange,
} from "./settings-changes";
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

  it("marks only what a page reset would restore", () => {
    expect(marksChange("fontSize", true)).toBe(true);
    expect(marksChange("fontSize", false)).toBe(false);
    expect(marksChange("sidebarWidth", true)).toBe(false); // layout
    expect(marksChange("customAgents", true)).toBe(false); // data
    const custom = { ...DEFAULT_SETTINGS, fontSize: 20, sidebarWidth: 300 };
    expect(isMarkedChanged(custom, "fontSize")).toBe(true);
    expect(isMarkedChanged(custom, "sidebarWidth")).toBe(false);
  });

  it("never lets a reset scope reach what the app remembers on its own", () => {
    const resettable = [...keysFor("preference"), ...keysFor("layout"), ...keysFor("data")];
    for (const key of ["githubStarred", "browserLastUrl", "signalAdaptersRevision"] as const) {
      expect(resettable).not.toContain(key);
    }
  });
});
