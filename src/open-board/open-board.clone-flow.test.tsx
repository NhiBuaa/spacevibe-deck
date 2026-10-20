// @vitest-environment jsdom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  client: null as import("../lib/clone-fixtures").FakeCloneClient | null,
  storeSet: vi.fn(async (_key: string, _value: unknown) => {}),
}));

vi.mock("../host/store-host", () => ({
  Store: {
    load: vi.fn(async () => ({
      get: vi.fn(async () => undefined),
      set: (key: string, value: unknown) => mocks.storeSet(key, value),
      save: vi.fn(async () => {}),
    })),
  },
}));
vi.mock("../host/dialog-host", () => ({ open: vi.fn(async () => null) }));
vi.mock("../host/bridge", () => ({
  invoke: vi.fn(async (command: string, args?: { paths?: readonly string[] }) =>
    command === "dirs_exist" ? (args?.paths ?? []).map(() => true) : null,
  ),
}));
vi.mock("../host/worktree-host", () => ({ available: false }));
vi.mock("../host/workspace-create-host", () => ({ available: true, createWorkspace: vi.fn() }));
vi.mock("../host/clone-host", async () => {
  const { createFakeCloneClient } = await import("../lib/clone-fixtures");
  mocks.client = createFakeCloneClient();
  return { available: true, cloneClient: mocks.client };
});
vi.mock("../repositories/repositories-store", () => ({ ensureRepositoriesScanned: vi.fn() }));
vi.mock("../terminal/pty-client", () => ({
  defaultPtyClient: { detectAgents: vi.fn(async () => []) },
}));

import { initializeDesktopEnvironment, resetDesktopEnvironmentForTests } from "../lib/platform";
import { newTaskDraft, resetLauncherStore } from "../launcher/launcher-store";
import { resetAgentDetectionForTests } from "../terminal/agent-detection-store";
import {
  type FakeCloneClient,
  FIXTURE_DESTINATION,
  SUCCEEDED,
  SUCCEEDED_WITH_SUBMODULES,
  cloneJob,
} from "../lib/clone-fixtures";
import { cloneFormRequest, getCloneController, resetCloneSession } from "./clone-session";
import { initWorkspaces, workspacesData } from "./workspaces-store";
import { OpenBoard } from "./open-board";

const settle = async (): Promise<void> => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe("OpenBoard clone flow", () => {
  let host: HTMLDivElement;

  beforeEach(async () => {
    resetAgentDetectionForTests();
    resetDesktopEnvironmentForTests();
    initializeDesktopEnvironment({ platform: "macos", homeDir: "/Users/dev" });
    resetLauncherStore();
    resetCloneSession();
    mocks.client!.calls.start.length = 0;
    mocks.storeSet.mockClear();
    mocks.storeSet.mockImplementation(async () => {});
    workspacesData.value = { version: workspacesData.value.version, recents: [] };
    await initWorkspaces();
    document.body.innerHTML = "";
    host = document.createElement("div");
    document.body.appendChild(host);
  });

  afterEach(() => {
    act(() => render(null, host));
    resetCloneSession();
    resetDesktopEnvironmentForTests();
  });

  /** The row's buttons plus the folder menu's rows (opened first): where every workspace action lives. */
  const pickerButtons = async (): Promise<HTMLButtonElement[]> => {
    if (host.querySelector(".nt-workspace-picker__menu") === null) {
      await act(async () => {
        host.querySelector<HTMLButtonElement>(".nt-workspace-picker__trigger")?.click();
      });
    }
    return [
      ...host.querySelectorAll<HTMLButtonElement>(
        ".nt-agent-launcher__action, .nt-workspace-picker__menu button",
      ),
    ];
  };

  const mount = async (): Promise<void> => {
    await act(async () => {
      render(
        <OpenBoard
          contextWorkspacePath={null}
          canCancel
          canBrowseSessions={false}
          openWorkspacePaths={new Set()}
          onCancel={() => {}}
          onStartTask={async () => "sent"}
          onOpenAgent={async () => "started"}
          canRetryDelivery={false}
          canFocusOpenedAgent={false}
          hasUserDraftContent={false}
          onRetryDelivery={async () => "prompt-not-sent"}
          onFocusOpenedAgent={() => {}}
          onClearDraft={() => {}}
          onManageAgents={() => {}}
          onResumeSession={async () => true}
        />,
        host,
      );
    });
    await getCloneController().init();
  };

  const openFromComposer = async (): Promise<void> => {
    const trigger = (await pickerButtons()).find((button) =>
      button.textContent?.includes("Clone repository"),
    );
    await act(async () => trigger?.click());
  };

  const startClone = async (): Promise<void> => {
    const repository = host.querySelector<HTMLInputElement>(
      'input[aria-label="GitHub repository"]',
    );
    await act(async () => {
      repository!.value = "octocat/hello-world";
      repository!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      host.querySelector<HTMLButtonElement>('[data-action="start-clone"]')?.click();
    });
    await settle();
  };

  const emit = async (job: Parameters<FakeCloneClient["emit"]>[0]): Promise<void> => {
    await act(async () => mocks.client!.emit(job));
    await settle();
  };

  it("opens the clone form from the composer", async () => {
    await mount();
    await openFromComposer();

    expect(host.querySelector('input[aria-label="GitHub repository"]')).not.toBeNull();
    expect(host.querySelector("[data-parent-path]")?.textContent).toBe("/Users/dev");
  });

  it("opens on the form when the File menu asked for it, once", async () => {
    cloneFormRequest.value += 1;
    await mount();
    expect(host.querySelector('input[aria-label="GitHub repository"]')).not.toBeNull();

    act(() => render(null, host));
    await mount();
    expect(host.querySelector('input[aria-label="GitHub repository"]')).toBeNull();
  });

  it("saves the clone as a workspace, selects it and returns to the composer", async () => {
    await mount();
    await openFromComposer();
    await startClone();
    expect(mocks.client!.calls.start).toHaveLength(1);

    await emit(SUCCEEDED);

    expect(workspacesData.value.recents.map((recent) => recent.path)).toEqual([
      FIXTURE_DESTINATION,
    ]);
    expect(mocks.storeSet).toHaveBeenCalledWith("workspaces", expect.anything());
    expect(newTaskDraft.value.workspacePath).toBe(FIXTURE_DESTINATION);
    expect(host.querySelector('input[aria-label="GitHub repository"]')).toBeNull();
    expect(mocks.client!.calls.start).toHaveLength(1);
  });

  it("stays on the form to show the submodule warning", async () => {
    await mount();
    await openFromComposer();
    await startClone();
    await emit(SUCCEEDED_WITH_SUBMODULES);

    expect(newTaskDraft.value.workspacePath).toBe(FIXTURE_DESTINATION);
    expect(host.querySelector(".nt-create-workspace")).not.toBeNull();
    expect(host.textContent).toContain("Submodules");
  });

  it("keeps the finished clone when the save fails and retries only the save", async () => {
    mocks.storeSet.mockRejectedValueOnce(new Error("disk"));
    await mount();
    await openFromComposer();
    await startClone();
    await emit(SUCCEEDED);

    const retry = host.querySelector<HTMLButtonElement>('[data-action="retry-add-workspace"]');
    expect(retry).not.toBeNull();

    await act(async () => retry?.click());
    await settle();

    // The failed write, then only the retry — no second clone.
    expect(mocks.storeSet.mock.calls.filter(([key]) => key === "workspaces")).toHaveLength(2);
    expect(mocks.client!.calls.start).toHaveLength(1);
    expect(workspacesData.value.recents).toHaveLength(1);
    expect(newTaskDraft.value.workspacePath).toBe(FIXTURE_DESTINATION);
  });

  it("does not select a workspace for a clone that never finished", async () => {
    await mount();
    await openFromComposer();
    await startClone();
    await emit(cloneJob({ revision: 3, phase: "receiving", percent: 12 }));

    expect(newTaskDraft.value.workspacePath).toBeNull();
    expect(workspacesData.value.recents).toEqual([]);
  });
});
