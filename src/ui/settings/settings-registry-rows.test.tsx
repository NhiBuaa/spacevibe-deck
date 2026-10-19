// @vitest-environment jsdom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../host/store-host", () => ({
  Store: {
    load: vi.fn(async () => ({
      get: vi.fn(async () => undefined),
      set: vi.fn(async () => {}),
      save: vi.fn(async () => {}),
      loadState: { state: "ready", fresh: false },
    })),
  },
}));
vi.mock("../../host/dialog-host", () => ({
  open: vi.fn(async () => null),
  ask: vi.fn(async () => true),
}));
vi.mock("../../lib/native-notification", () => ({
  requestAgentNotificationPermission: vi.fn(),
}));

import { SETTINGS_REGISTRY, SETTINGS_PAGES } from "../../settings/settings-registry";
import { DEFAULT_SETTINGS } from "../../settings/settings-schema";
import { settings, settingsLoadState } from "../../settings/settings-store";
import { BUILTIN_AGENTS } from "../../lib/agent-catalog";
import { detectedAgents } from "../../terminal/agent-detection-store";
import { activeCategory } from "./active-category-store";
import { SETTINGS_CATEGORIES } from "./settings-categories";
import { SettingsScreen } from "./settings-screen";

/**
 * The registry's `page` is a promise that a row for the key is on that page:
 * search sends the user there, the change count and Reset page read it. This
 * walk holds both sides of the promise, so a key cannot claim a page it does
 * not show and a row cannot edit a key the registry files elsewhere.
 */
describe("SETTINGS_REGISTRY ↔ mounted rows", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.appendChild(host);
    settings.value = DEFAULT_SETTINGS;
    settingsLoadState.value = { status: "ready" };
    // An agent's model and effort rows only exist once its CLI is installed.
    detectedAgents.value = BUILTIN_AGENTS.map((agent) => ({
      name: agent.id,
      path: `/bin/${agent.id}`,
    }));
  });

  afterEach(() => {
    detectedAgents.value = [];
    act(() => {
      render(null, host);
    });
  });

  /** Every key a row, group or agent on this page says it edits. */
  const mountedKeys = (categoryId: (typeof SETTINGS_CATEGORIES)[number]["id"]): Set<string> => {
    activeCategory.value = categoryId;
    act(() => {
      render(<SettingsScreen open onClose={vi.fn()} />, host);
    });
    const keys = new Set<string>();
    host.querySelectorAll("[data-setting]").forEach((element) => {
      element
        .getAttribute("data-setting")
        ?.split(" ")
        .forEach((key) => keys.add(key));
    });
    return keys;
  };

  const keysFiledUnder = (page: string): string[] =>
    Object.entries(SETTINGS_REGISTRY)
      .filter(([, entry]) => entry.page === page)
      .map(([key]) => key)
      .sort();

  it.each(SETTINGS_PAGES)("page %s mounts exactly the keys the registry files under it", (page) => {
    expect([...mountedKeys(page)].sort()).toEqual(keysFiledUnder(page));
  });

  it("only files keys under pages that are rail categories", () => {
    const railIds = new Set<string>(SETTINGS_CATEGORIES.map((category) => category.id));
    for (const page of SETTINGS_PAGES) {
      expect(railIds.has(page)).toBe(true);
    }
  });

  it("a changed colour mode is both counted by Reset page and marked on its title", () => {
    settings.value = { ...DEFAULT_SETTINGS, themeId: "deck-light" };
    mountedKeys("appearance");

    expect(host.querySelector(".settings-screen__changed")?.textContent).toContain("1 changed");
    const head = host.querySelector('[data-setting="themeId"] .settings-group__head');
    expect(head?.classList.contains("is-changed")).toBe(true);
    expect(head?.textContent).toContain(SETTINGS_REGISTRY.themeId.label);
  });
});
