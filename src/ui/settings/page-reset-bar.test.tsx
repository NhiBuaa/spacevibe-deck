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
    })),
  },
}));
vi.mock("../../host/dialog-host", () => ({
  open: vi.fn(async () => null),
  ask: vi.fn(async () => true),
}));
vi.mock("../../open-board/workspaces-store", () => ({ forgetWorkspaceAgent: vi.fn() }));

import { ask } from "../../host/dialog-host";
import { DEFAULT_SETTINGS } from "../../settings/settings-schema";
import { settings } from "../../settings/settings-store";
import { PageResetBar } from "./page-reset-bar";
import { resetPromptOpen } from "./confirm-reset";

const mockedAsk = vi.mocked(ask);

describe("PageResetBar", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.appendChild(host);
    mockedAsk.mockReset();
    mockedAsk.mockResolvedValue(true);
    resetPromptOpen.value = false;
    settings.value = DEFAULT_SETTINGS;
  });

  afterEach(() => {
    act(() => {
      render(null, host);
    });
  });

  const mount = (page: "appearance" | "terminal" | "agents" = "appearance"): void => {
    act(() => {
      render(<PageResetBar page={page} label="Appearance" />, host);
    });
  };

  const bar = (): Element | null => host.querySelector(".settings-screen__changed");

  it("renders nothing while the page matches the defaults", () => {
    mount();
    expect(bar()).toBeNull();
  });

  it("counts only this page's preferences, not other pages, layout or data", () => {
    settings.value = {
      ...DEFAULT_SETTINGS,
      fontSize: 20,
      showPaneBar: true,
      scrollback: 1000, // another page
      sidebarWidth: 300, // layout
      promptTemplates: [{ id: "t", name: "t", body: "b" }] as never, // data
      launchProfiles: [{ id: "lp:x", command: "claude --x" }], // data on the agents page
    };
    mount();
    expect(bar()?.textContent).toContain("2 changed");

    mount("agents");
    expect(bar()).toBeNull();
  });

  it("resets exactly this page's changed keys after the prompt, leaving the rest", async () => {
    settings.value = {
      ...DEFAULT_SETTINGS,
      fontSize: 20,
      scrollback: 1000,
      sidebarWidth: 300,
    };
    mount();

    await act(async () => {
      host.querySelector<HTMLButtonElement>(".settings-screen__changed button")?.click();
    });

    expect(mockedAsk).toHaveBeenCalledTimes(1);
    expect(settings.value.fontSize).toBe(DEFAULT_SETTINGS.fontSize);
    expect(settings.value.scrollback).toBe(1000);
    expect(settings.value.sidebarWidth).toBe(300);
  });

  it("disables the button while a reset prompt is open", () => {
    settings.value = { ...DEFAULT_SETTINGS, fontSize: 20 };
    resetPromptOpen.value = true;
    mount();
    expect(
      host.querySelector<HTMLButtonElement>(".settings-screen__changed button")?.disabled,
    ).toBe(true);
  });
});
