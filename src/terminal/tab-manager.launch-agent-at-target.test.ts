// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryPtyClient } from "./pty-client";
import { settings } from "../settings/settings-store";
import { DEFAULT_SETTINGS } from "../settings/settings-schema";
import { activeTabIndex, tabViews } from "./tabs-store";
import { initializeDesktopEnvironment, resetDesktopEnvironmentForTests } from "../lib/platform";
import { TERMINAL_LAUNCH_ID } from "./agent-launch-target";
import { freshWindowFocusController, wire, processInfo } from "./tab-manager.fixtures";

vi.mock("../lib/native-notification", () => ({
  sendAgentNotification: vi.fn(),
}));

vi.mock("../telemetry/usage-counters", () => ({
  countAgentLaunch: vi.fn(),
}));

let windowFocus = freshWindowFocusController();

vi.mock("../host/window-host", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: async () => () => {} }),
  getCurrentWindow: () => ({
    scaleFactor: async () => 1,
    close: async () => {},
    isFocused: async () => windowFocus.initialFocused,
    onFocusChanged: async (handler: (event: { payload: boolean }) => void) => {
      windowFocus.emitFocusChanged = (focused) => handler({ payload: focused });
      return windowFocus.unlistenFocus;
    },
  }),
}));

import { detectedAgents } from "./agent-detection-store";
import { countAgentLaunch } from "../telemetry/usage-counters";
import { persistError } from "../chrome/events";
import { createMemoryTransferClient } from "./transfer-client";

describe("explicit agent launch target", () => {
  beforeEach(() => {
    persistError.value = null;
    vi.useFakeTimers();
    settings.value = DEFAULT_SETTINGS;
    initializeDesktopEnvironment({ platform: "macos", homeDir: "/Users/dev" });
    tabViews.value = [];
    activeTabIndex.value = -1;
    detectedAgents.value = [{ name: "claude", path: "/bin/claude" }];
  });
  afterEach(() => {
    vi.useRealTimers();
    resetDesktopEnvironmentForTests();
  });

  it("captures without creating and runs exactly one agent beside the captured pane", async () => {
    const pty = createMemoryPtyClient({
      nextId: 1,
      infos: new Map([[1, processInfo(1, "/repo", "zsh", "idle-shell", null)]]),
    });
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo");
    const target = tm.captureAgentLaunchTarget("/repo");
    expect(tm.allPaneIds()).toEqual([1]);
    const result = await tm.launchAgentAtTarget(target!, "claude", () => true);
    expect(result.kind).toBe("spawned");
    expect(tabViews.value).toHaveLength(1);
    expect(tm.allPaneIds()).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(pty.writes).toHaveLength(1);
    expect(pty.writes[0].id).toBe(2);
    tm.dispose();
  });

  it("opens a bare shell for the Terminal card without arming a command", async () => {
    detectedAgents.value = [];
    const pty = createMemoryPtyClient({
      nextId: 1,
      infos: new Map([[1, processInfo(1, "/repo", "zsh", "idle-shell", null)]]),
    });
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo");
    const target = tm.captureAgentLaunchTarget("/repo");
    const result = await tm.launchAgentAtTarget(target!, TERMINAL_LAUNCH_ID, () => true);
    expect(result.kind).toBe("spawned");
    expect(tm.allPaneIds()).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(3000);
    expect(pty.writes).toHaveLength(0);
    tm.dispose();
  });

  it("tiles the second agent into the roomiest pane instead of another column", async () => {
    const pty = createMemoryPtyClient({
      nextId: 1,
      infos: new Map(
        [1, 2, 3].map((id) => [id, processInfo(id, "/repo", "zsh", "idle-shell", null)]),
      ),
    });
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo");
    for (const _ of [0, 1]) {
      const target = tm.captureAgentLaunchTarget("/repo")!;
      expect((await tm.launchAgentAtTarget(target, "claude", () => true)).kind).toBe("spawned");
    }
    // Leaf order, not spawn order: pane 3 landed UNDER pane 1.
    expect(tm.allPaneIds()).toEqual([1, 3, 2]);
    // Columns only for the first split; the second cuts the left column across
    // (jsdom's 1024x768 window stands in for the stage).
    expect((await tm.captureActiveLayout())?.layout).toEqual({
      type: "split",
      direction: "row",
      ratio: 0.5,
      first: {
        type: "split",
        direction: "column",
        ratio: 0.5,
        first: { type: "leaf" },
        second: { type: "leaf" },
      },
      second: { type: "leaf" },
    });
    tm.dispose();
  });

  it("opens a new space in a folder that already has one, instead of splitting it", async () => {
    const pty = createMemoryPtyClient({
      nextId: 1,
      infos: new Map([1, 2].map((id) => [id, processInfo(id, "/repo", "zsh", "idle-shell", null)])),
    });
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo");
    // The page would offer a split here; the user chose a new space instead.
    expect(tm.captureAgentLaunchTarget("/repo")?.kind).toBe("split");
    const result = await tm.launchAgentAtTarget(
      { kind: "new-space", workspacePath: "/repo" },
      "claude",
      () => true,
    );
    expect(result.kind).toBe("spawned");
    expect(tabViews.value.map((tab) => tab.workspacePath)).toEqual(["/repo", "/repo"]);
    expect(tabViews.value.map((tab) => tab.panes?.length)).toEqual([1, 1]);
    if (result.kind === "spawned") {
      expect(result.receipt.tabKey).toBe(tabViews.value[1]?.key);
    }
    tm.dispose();
  });

  it("does not open a new space once the page has been closed", async () => {
    const pty = createMemoryPtyClient({ nextId: 1 });
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo");
    const result = await tm.launchAgentAtTarget(
      { kind: "new-space", workspacePath: "/repo" },
      "claude",
      () => false,
    );
    expect(result.kind).toBe("cancelled");
    expect(tabViews.value).toHaveLength(1);
    tm.dispose();
  });

  it("rejects a captured destination later identified as another checkout", async () => {
    const pty = createMemoryPtyClient({ nextId: 1 });
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo/.worktrees/feature");
    const target = tm.captureAgentLaunchTarget("/repo")!;
    expect(target.kind).toBe("split");
    const result = await tm.launchAgentAtTarget(
      target,
      "claude",
      () => true,
      () => ["/repo", "/repo/.worktrees/feature"],
    );
    expect(result.kind).toBe("failed");
    expect(pty.sessions.size).toBe(1);
    expect(pty.writes).toEqual([]);
    tm.dispose();
  });

  it("rechecks checkout ownership after a pending cwd read", async () => {
    const base = createMemoryPtyClient({ nextId: 1 });
    let release!: () => void;
    const wait = new Promise<void>((done) => {
      release = done;
    });
    const pty = {
      ...base,
      ptyInfo: async () => {
        await wait;
        return [processInfo(1, "/repo/.worktrees/feature", "zsh", "idle-shell", null)];
      },
    };
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo/.worktrees/feature");
    let roots: readonly string[] = [];
    const target = tm.captureAgentLaunchTarget("/repo")!;
    const pending = tm.launchAgentAtTarget(
      target,
      "claude",
      () => true,
      () => roots,
    );
    roots = ["/repo", "/repo/.worktrees/feature"];
    release();
    expect((await pending).kind).toBe("failed");
    expect(base.sessions.size).toBe(1);
    expect(base.writes).toEqual([]);
    tm.dispose();
  });

  it("does not defer Windows polling again after early first-pane prompt readiness", async () => {
    resetDesktopEnvironmentForTests();
    initializeDesktopEnvironment({ platform: "windows", homeDir: "C:/Users/dev" });
    const base = createMemoryPtyClient({ nextId: 1 });
    const pty = {
      ...base,
      async spawnShell(opts: Parameters<typeof base.spawnShell>[0]) {
        const id = await base.spawnShell(opts);
        base.emitPromptReady(id);
        return id;
      },
    };
    const inspect = vi.spyOn(pty, "ptyInfo");
    const { tm } = wire(pty);
    await tm.init();
    await tm.launchAgentAtTarget(tm.captureAgentLaunchTarget("C:/repo")!, "claude", () => true);
    inspect.mockClear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(inspect).toHaveBeenCalled();
    tm.dispose();
  });

  it.each(["committed", "aborted"] as const)(
    "reports a cancelled command when delayed preparation overlaps a %s transfer",
    async (kind) => {
      // A Codex launch re-reads the launch config before it arms, which is the slow preparation.
      detectedAgents.value = [{ name: "codex", path: "/bin/codex" }];
      settings.value = {
        ...DEFAULT_SETTINGS,
        agentSignalAdapters: { ...DEFAULT_SETTINGS.agentSignalAdapters, codex: true },
      };
      const pty = createMemoryPtyClient({ nextId: 1 });
      const transfer = createMemoryTransferClient();
      let hold = false;
      let release!: () => void;
      const { tm } = wire(pty, {
        transfer,
        signalConfig: async () => {
          if (hold) await new Promise<void>((done) => (release = done));
          return {
            claudeSettingsPath: "/settings",
            hookPort: 1,
            hooksSupported: true,
            shellBootstrap: false,
            codexBypassHookTrust: false,
            codexNoDaemon: false,
          };
        },
      });
      await tm.openQuickAgent(null, "/other");
      hold = true;
      const result = await tm.launchAgentAtTarget(
        tm.captureAgentLaunchTarget("/repo")!,
        "codex",
        () => true,
      );
      expect(result.kind).toBe("spawned");
      if (result.kind !== "spawned") throw new Error("Expected spawned pane");
      tm.focusAgentLaunch(result.receipt);
      const moving = tm.movePaneToNewWindow();
      await vi.waitFor(() => expect(transfer.calls).toContain("await:xfer-1"));
      release();
      await vi.advanceTimersByTimeAsync(0);
      expect(persistError.value).toContain("agent did not start");
      transfer.settle(
        "xfer-1",
        kind === "committed" ? { kind } : { kind, reason: "Destination closed" },
      );
      await moving;
      await vi.advanceTimersByTimeAsync(3000);
      expect(pty.writes).toEqual([]);
      expect(tm.allPaneIds().includes(2)).toBe(kind === "aborted");
      tm.dispose();
    },
  );

  it("creates one first pane, and refuses a stale first-pane request", async () => {
    const pty = createMemoryPtyClient({
      nextId: 1,
      infos: new Map([[1, processInfo(1, "/repo", "zsh", "idle-shell", null)]]),
    });
    const { tm } = wire(pty);
    const target = tm.captureAgentLaunchTarget("/repo")!;
    expect(target.kind).toBe("first-pane");
    expect((await tm.launchAgentAtTarget(target, "claude", () => true)).kind).toBe("spawned");
    expect((await tm.launchAgentAtTarget(target, "claude", () => true)).kind).toBe("failed");
    expect(tm.allPaneIds()).toEqual([1]);
    tm.dispose();
  });

  it("cancels before spawn and refuses disabled agents", async () => {
    const pty = createMemoryPtyClient({
      nextId: 1,
      infos: new Map([[1, processInfo(1, "/repo", "zsh", "idle-shell", null)]]),
    });
    const { tm } = wire(pty);
    const target = tm.captureAgentLaunchTarget("/repo")!;
    expect((await tm.launchAgentAtTarget(target, "claude", () => false)).kind).toBe("cancelled");
    settings.value = { ...DEFAULT_SETTINGS, disabledAgents: ["claude"] };
    expect((await tm.launchAgentAtTarget(target, "claude", () => true)).kind).toBe("failed");
    expect(tm.allPaneIds()).toEqual([]);
    tm.dispose();
  });
  it("discards a first pane cancelled while spawn is pending", async () => {
    const base = createMemoryPtyClient({ nextId: 1 });
    let release!: () => void;
    const wait = new Promise<void>((done) => {
      release = done;
    });
    const pty = {
      ...base,
      spawnShell: async (...args: Parameters<typeof base.spawnShell>) => {
        await wait;
        return base.spawnShell(...args);
      },
    };
    const { tm } = wire(pty);
    let valid = true;
    const pending = tm.launchAgentAtTarget(
      tm.captureAgentLaunchTarget("/repo")!,
      "claude",
      () => valid,
    );
    valid = false;
    release();
    expect((await pending).kind).toBe("cancelled");
    expect(base.sessions.size).toBe(0);
    expect(tabViews.value).toHaveLength(0);
    expect(base.writes).toEqual([]);
    tm.dispose();
  });

  it("fails closed when the target cwd cannot be read", async () => {
    const pty = createMemoryPtyClient({ nextId: 1 });
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo");
    expect(
      (await tm.launchAgentAtTarget(tm.captureAgentLaunchTarget("/repo")!, "claude", () => true))
        .kind,
    ).toBe("failed");
    expect(pty.sessions.size).toBe(1);
    expect(pty.writes).toEqual([]);
    tm.dispose();
  });

  it("does not arm a Codex command after disposal during adapter preparation", async () => {
    detectedAgents.value = [{ name: "codex", path: "/bin/codex" }];
    settings.value = {
      ...DEFAULT_SETTINGS,
      agentSignalAdapters: { ...DEFAULT_SETTINGS.agentSignalAdapters, codex: true },
    };
    const pty = createMemoryPtyClient({ nextId: 1 });
    let release!: () => void;
    const fetchConfig = vi.fn(async () => {
      await new Promise<void>((done) => (release = done));
      return {
        claudeSettingsPath: "/settings",
        hookPort: 1,
        hooksSupported: true,
        shellBootstrap: false,
        codexBypassHookTrust: false,
        codexNoDaemon: false,
      };
    });
    const { tm } = wire(pty, { signalConfig: fetchConfig });
    expect(
      (await tm.launchAgentAtTarget(tm.captureAgentLaunchTarget("/repo")!, "codex", () => true))
        .kind,
    ).toBe("spawned");
    expect(fetchConfig).toHaveBeenCalledOnce();
    tm.dispose();
    release();
    await vi.advanceTimersByTimeAsync(3000);
    expect(pty.writes).toEqual([]);
  });

  // The page stays up while the rail is live, so the tab it captured can be
  // closed under it. The split must fail rather than dock beside a dead owner.
  it("fails a split whose captured tab closed while the page was open", async () => {
    const pty = createMemoryPtyClient({
      nextId: 1,
      infos: new Map([[1, processInfo(1, "/repo", "zsh", "idle-shell", null)]]),
    });
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo");
    const target = tm.captureAgentLaunchTarget("/repo")!;
    expect(target.kind).toBe("split");

    tm.runAction("close-tab");
    await vi.advanceTimersByTimeAsync(0);
    expect(tabViews.value).toHaveLength(0);
    // The captured pane went with its tab; the launch must add nothing back.
    const sessionsBefore = pty.sessions.size;

    expect((await tm.launchAgentAtTarget(target, "claude", () => true)).kind).toBe("failed");
    expect(pty.sessions.size).toBe(sessionsBefore);
    expect(pty.writes).toEqual([]);
    tm.dispose();
  });
});

describe("profile launch override (PAGE4)", () => {
  const PLAN = "claude --permission-mode plan";
  const NEW_SPACE = { kind: "new-space", workspacePath: "/repo" } as const;
  const pick = (command: string) => ({ kind: "profile", command }) as const;
  const shellPty = (...ids: number[]) =>
    createMemoryPtyClient({
      nextId: 1,
      infos: new Map(ids.map((id) => [id, processInfo(id, "/repo", "zsh", "idle-shell", null)])),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(countAgentLaunch).mockClear();
    settings.value = {
      ...DEFAULT_SETTINGS,
      launchProfiles: [{ id: "lp:plan", command: PLAN }],
    };
    initializeDesktopEnvironment({ platform: "macos", homeDir: "/Users/dev" });
    tabViews.value = [];
    activeTabIndex.value = -1;
    detectedAgents.value = [{ name: "claude", path: "/bin/claude" }];
  });
  afterEach(() => {
    vi.useRealTimers();
    resetDesktopEnvironmentForTests();
  });

  it("types a command the agent lists, and records and counts it like any launch", async () => {
    const pty = shellPty(1, 2);
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo");
    const result = await tm.launchAgentAtTarget(
      NEW_SPACE,
      "claude",
      () => true,
      undefined,
      pick(PLAN),
    );
    if (result.kind !== "spawned") throw new Error("Expected spawned pane");
    await vi.advanceTimersByTimeAsync(3000);
    expect(pty.writes).toEqual([{ id: result.receipt.paneId, data: `${PLAN}\r` }]);
    expect(tm.launchCommandFor(result.receipt.paneId)).toBe(PLAN);
    expect(countAgentLaunch).toHaveBeenCalledExactlyOnceWith("claude");
    tm.dispose();
  });

  it("types a listed pick instead of the starred default, which a plain launch still types", async () => {
    const OTHER = "claude --model sonnet";
    settings.value = {
      ...DEFAULT_SETTINGS,
      launchProfiles: [
        { id: "lp:plan", command: PLAN },
        { id: "lp:other", command: OTHER },
      ],
      defaultLaunchProfiles: { claude: "lp:plan" },
    };
    const pty = shellPty(1, 2, 3);
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo");
    const picked = await tm.launchAgentAtTarget(
      NEW_SPACE,
      "claude",
      () => true,
      undefined,
      pick(OTHER),
    );
    const plain = await tm.launchAgentAtTarget(NEW_SPACE, "claude", () => true);
    if (picked.kind !== "spawned" || plain.kind !== "spawned") throw new Error("Expected panes");
    await vi.advanceTimersByTimeAsync(3000);
    const typed = (paneId: number) => pty.writes.find((write) => write.id === paneId)?.data;
    expect(typed(picked.receipt.paneId)).toBe(`${OTHER}\r`);
    expect(typed(plain.receipt.paneId)).toBe(`${PLAN}\r`);
    expect(tm.launchCommandFor(picked.receipt.paneId)).toBe(OTHER);
    expect(countAgentLaunch).toHaveBeenCalledTimes(2);
    tm.dispose();
  });

  it("refuses a command the agent does not list, before any pane exists", async () => {
    const pty = shellPty(1, 2);
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo");
    for (const command of [
      "claude --not-a-listed-flag",
      "codex --sandbox read-only",
      "claude; rm",
    ]) {
      const result = await tm.launchAgentAtTarget(
        NEW_SPACE,
        "claude",
        () => true,
        undefined,
        pick(command),
      );
      expect(result).toEqual({
        kind: "failed",
        message: "That launch command is no longer available. Choose another.",
      });
    }
    expect(tm.allPaneIds()).toEqual([1]);
    expect(pty.writes).toEqual([]);
    expect(countAgentLaunch).not.toHaveBeenCalled();
    tm.dispose();
  });

  it("cannot launch an agent that is not installed", async () => {
    detectedAgents.value = [];
    const pty = shellPty(1, 2);
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo");
    const result = await tm.launchAgentAtTarget(
      NEW_SPACE,
      "claude",
      () => true,
      undefined,
      pick(PLAN),
    );
    expect(result).toEqual({
      kind: "failed",
      message: "This agent is no longer available. Choose another agent.",
    });
    expect(tm.allPaneIds()).toEqual([1]);
    tm.dispose();
  });

  it("launches the stored default with no override, and ignores a pick on the Terminal card", async () => {
    const pty = shellPty(1, 2, 3);
    const { tm } = wire(pty);
    await tm.openQuickAgent(null, "/repo");
    const plain = await tm.launchAgentAtTarget(NEW_SPACE, "claude", () => true);
    const shell = await tm.launchAgentAtTarget(
      NEW_SPACE,
      TERMINAL_LAUNCH_ID,
      () => true,
      undefined,
      pick(PLAN),
    );
    if (plain.kind !== "spawned" || shell.kind !== "spawned") throw new Error("Expected panes");
    await vi.advanceTimersByTimeAsync(3000);
    // No profile is starred, so the plain launch types the first command the user wrote.
    expect(tm.launchCommandFor(plain.receipt.paneId)).toBe(PLAN);
    expect(tm.launchCommandFor(shell.receipt.paneId)).toBeNull();
    expect(pty.writes.map((write) => write.id)).toEqual([plain.receipt.paneId]);
    tm.dispose();
  });

  it("drops a pick that stopped being listed while the pane was opening", async () => {
    const base = shellPty(1);
    let release!: () => void;
    const wait = new Promise<void>((done) => {
      release = done;
    });
    const pty = {
      ...base,
      spawnShell: async (...args: Parameters<typeof base.spawnShell>) => {
        await wait;
        return base.spawnShell(...args);
      },
    };
    const { tm } = wire(pty);
    const pending = tm.launchAgentAtTarget(
      tm.captureAgentLaunchTarget("/repo")!,
      "claude",
      () => true,
      undefined,
      pick(PLAN),
    );
    settings.value = { ...DEFAULT_SETTINGS, launchProfiles: [] };
    release();
    expect((await pending).kind).toBe("failed");
    expect(base.sessions.size).toBe(0);
    await vi.advanceTimersByTimeAsync(3000);
    expect(base.writes).toEqual([]);
    expect(countAgentLaunch).not.toHaveBeenCalled();
    tm.dispose();
  });
});
