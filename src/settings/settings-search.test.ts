import { describe, expect, it } from "vitest";
import { searchSettings } from "./settings-search";

describe("searchSettings", () => {
  it("returns nothing for a blank query", () => {
    expect(searchSettings("  ").keys.size).toBe(0);
  });

  it("matches label and keywords, case-insensitively, and counts per page", () => {
    const result = searchSettings("HISTORY");
    expect([...result.keys]).toEqual(["scrollback"]);
    expect(result.pages.get("terminal")).toBe(1);
  });

  it("requires every word to match", () => {
    expect(searchSettings("font size").keys.has("fontSize")).toBe(true);
    expect(searchSettings("font nonsense").keys.size).toBe(0);
  });

  it("never offers a key that has no Settings row", () => {
    expect(searchSettings("sidebar width").keys.has("sidebarWidth")).toBe(false);
  });
});
