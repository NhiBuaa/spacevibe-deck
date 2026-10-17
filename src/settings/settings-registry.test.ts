import { describe, expect, it } from "vitest";
import { SETTINGS_CATEGORIES } from "../ui/settings/settings-categories";
import { DEFAULT_SETTINGS } from "./settings-schema";
import { SETTINGS_REGISTRY, type SettingsPage } from "./settings-registry";

describe("SETTINGS_REGISTRY", () => {
  it("describes exactly the keys of Settings", () => {
    expect(Object.keys(SETTINGS_REGISTRY).sort()).toEqual(Object.keys(DEFAULT_SETTINGS).sort());
  });

  it("only names pages that exist in the rail", () => {
    const railIds = new Set<string>(SETTINGS_CATEGORIES.map((category) => category.id));
    const pages = Object.values(SETTINGS_REGISTRY)
      .map((entry) => entry.page)
      .filter((page): page is SettingsPage => page !== null);
    for (const page of pages) {
      expect(railIds.has(page)).toBe(true);
    }
  });
});
