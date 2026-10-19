import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { forgetWorkspaceAgent } from "../../open-board/workspaces-store";
import { DEFAULT_SETTINGS } from "../../settings/settings-schema";
import { settings } from "../../settings/settings-store";
import { confirmReset, resetPromptOpen } from "./confirm-reset";

const mockedAsk = vi.mocked(ask);
const CUSTOM_AGENT = { id: "custom:mine", label: "Mine", command: "mine" };

describe("confirmReset", () => {
  beforeEach(() => {
    mockedAsk.mockReset();
    mockedAsk.mockResolvedValue(true);
    vi.mocked(forgetWorkspaceAgent).mockReset();
    resetPromptOpen.value = false;
    settings.value = {
      ...DEFAULT_SETTINGS,
      customAgents: [CUSTOM_AGENT],
      quickAgentIds: ["claude", CUSTOM_AGENT.id],
    };
  });

  it("deleting the declared agents also unpins them and lets workspaces forget them", async () => {
    await confirmReset(["customAgents"], "Reset agents and templates", "preferences");

    expect(settings.value.customAgents).toEqual([]);
    expect(settings.value.quickAgentIds).toEqual(["claude"]);
    expect(forgetWorkspaceAgent).toHaveBeenCalledWith(CUSTOM_AGENT.id);
  });

  it("leaves pins and workspaces alone when the user cancels", async () => {
    mockedAsk.mockResolvedValue(false);

    await confirmReset(["customAgents"], "Reset agents and templates", "preferences");

    expect(settings.value.quickAgentIds).toEqual(["claude", CUSTOM_AGENT.id]);
    expect(forgetWorkspaceAgent).not.toHaveBeenCalled();
  });

  it("keeps a null (automatic) pin list null", async () => {
    settings.value = { ...settings.value, quickAgentIds: null };

    await confirmReset(["customAgents"], "Reset agents and templates", "preferences");

    expect(settings.value.quickAgentIds).toBeNull();
  });

  it("opens one prompt at a time, whichever entry point asks", async () => {
    let answer!: (confirmed: boolean) => void;
    mockedAsk.mockReturnValue(new Promise<boolean>((resolve) => (answer = resolve)));

    const first = confirmReset(["fontSize"], "Reset", "x");
    await confirmReset(["scrollback"], "Reset", "x");
    expect(mockedAsk).toHaveBeenCalledTimes(1);
    expect(resetPromptOpen.value).toBe(true);

    answer(false);
    await first;
    expect(resetPromptOpen.value).toBe(false);
  });
});
