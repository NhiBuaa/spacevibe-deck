// @vitest-environment jsdom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentOption } from "../lib/agent-catalog";
import { initializeDesktopEnvironment, resetDesktopEnvironmentForTests } from "../lib/platform";
import type { RecentWorkspace } from "../lib/workspace-recents";
import { EMPTY_DRAFT, withAgent, withWorkspace } from "../launcher/new-task-draft";
import { DEFAULT_SETTINGS } from "../settings/settings-schema";
import { settings } from "../settings/settings-store";
import { BoardComposer, type BoardComposerProps } from "./board-composer";

const AGENTS: readonly AgentOption[] = [
  { id: "claude", label: "Claude Code", detail: "/usr/bin/claude", missing: false },
];

const RECENTS: readonly RecentWorkspace[] = [
  { path: "/repo/deck", lastOpenedAt: 2 },
  { path: "/repo/api", lastOpenedAt: 1 },
];

let host: HTMLDivElement;

function mount(overrides: Partial<BoardComposerProps> = {}): {
  onSelectWorkspace: ReturnType<typeof vi.fn>;
  onStartTask: ReturnType<typeof vi.fn>;
  onOpenAgent: ReturnType<typeof vi.fn>;
  onOpenWorkspace: ReturnType<typeof vi.fn>;
} {
  const onSelectWorkspace = vi.fn();
  const onStartTask = vi.fn();
  const onOpenAgent = vi.fn();
  const onOpenWorkspace = vi.fn();
  const props: BoardComposerProps = {
    // The staged prompt is hidden in production behind
    // `TASK_PROMPT_STAGING_ENABLED`; these tests keep it wired, the
    // `deliverGrab(…, pasteDisabled)` precedent.
    promptStaging: true,
    draft: { ...withAgent(withWorkspace(EMPTY_DRAFT, "/repo/deck"), "claude", null), prompt: "go" },
    agents: AGENTS,
    homeDir: "/Users/dev",
    alive: RECENTS,
    missingGroup: [],
    openWorkspacePaths: new Set<string>(),
    canBrowseSessions: true,
    openFolderShortcut: "⌘O",
    declaredModels: {},
    agentRuntimeDefaults: {},
    canCreateWorkspace: true,
    canCreateWorktree: true,
    pending: null,
    problem: null,
    openProblem: null,
    agentsResolved: true,
    notice: null,
    canRetryDelivery: false,
    canFocusOpenedAgent: false,
    hasUserDraftContent: true,
    onDraftChange: vi.fn(),
    onPickFolder: vi.fn(),
    onCreateWorkspace: vi.fn(),
    onCreateWorktree: vi.fn(),
    onManageAgents: vi.fn(),
    onSelectWorkspace,
    onOpenWorkspace,
    onBrowseSessions: vi.fn(),
    onRemove: vi.fn(),
    onStartTask,
    onOpenAgent,
    onRunAgent: vi.fn(),
    onRetryDelivery: vi.fn(),
    onFocusOpenedAgent: vi.fn(),
    onClearDraft: vi.fn(),
    ...overrides,
  };
  render(<BoardComposer {...props} />, host);
  return { onSelectWorkspace, onStartTask, onOpenAgent, onOpenWorkspace };
}

function rows(): HTMLButtonElement[] {
  return Array.from(host.querySelectorAll<HTMLButtonElement>(".row__open"));
}

beforeEach(() => {
  resetDesktopEnvironmentForTests();
  initializeDesktopEnvironment({ platform: "macos", homeDir: "/Users/dev" });
  document.body.innerHTML = "";
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe("BoardComposer", () => {
  it("keeps the prompt visible even when the draft says collapsed", () => {
    mount({ draft: { ...EMPTY_DRAFT, promptExpanded: false } });
    expect(host.querySelector("textarea")).not.toBeNull();
  });

  it("a recents row selects the workspace and never launches", () => {
    const { onSelectWorkspace, onStartTask, onOpenAgent } = mount();
    const second = rows()[1];
    expect(second.textContent).toContain("api");
    second.click();
    expect(onSelectWorkspace).toHaveBeenCalledWith("/repo/api");
    expect(onStartTask).not.toHaveBeenCalled();
    expect(onOpenAgent).not.toHaveBeenCalled();
  });

  it("double-clicking a recents row opens that workspace", () => {
    const { onOpenWorkspace } = mount();
    rows()[1].dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(onOpenWorkspace).toHaveBeenCalledExactlyOnceWith("/repo/api");
  });

  it("keeps a row clickable while a workspace selection is pending", () => {
    mount({ pending: "selecting-workspace" });
    expect(rows()[1].disabled).toBe(false);
  });

  it("marks the row that matches the draft", () => {
    mount();
    expect(rows()[0].getAttribute("aria-pressed")).toBe("true");
    expect(rows()[1].getAttribute("aria-pressed")).toBe("false");
    // The semantic mark needs a visible counterpart, or a click on a row
    // changes nothing the eye can find (the wash itself is `.row.is-selected`
    // in `09-open-board.css`, gated by the design-language suite).
    expect(host.querySelectorAll(".row.is-selected")).toHaveLength(1);
    expect(rows()[0].closest(".row")?.classList.contains("is-selected")).toBe(true);
  });

  it("returns focus to the prompt after a row is picked", async () => {
    mount();
    rows()[1].click();
    await new Promise((resolve) => queueMicrotask(() => resolve(null)));
    expect(document.activeElement?.tagName).toBe("TEXTAREA");
  });

  it("Cmd+Enter starts the task once", () => {
    const { onStartTask } = mount();
    const textarea = host.querySelector("textarea");
    textarea?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }),
    );
    expect(onStartTask).toHaveBeenCalledTimes(1);
  });

  it("Cmd+Enter does nothing while the draft is blocked", () => {
    const { onStartTask } = mount({ problem: "empty-prompt" });
    host
      .querySelector("textarea")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true }));
    expect(onStartTask).not.toHaveBeenCalled();
  });

  it("a bare Enter is left to the textarea", () => {
    const { onStartTask } = mount();
    host
      .querySelector("textarea")
      ?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(onStartTask).not.toHaveBeenCalled();
  });

  it("hides the host-only shortcuts rather than disabling them", () => {
    mount({ canCreateWorkspace: false, canCreateWorktree: false });
    const labels = Array.from(host.querySelectorAll(".nt-board__shortcuts button")).map(
      (button) => button.textContent,
    );
    expect(labels.join(" ")).toContain("Open folder");
    expect(labels.join(" ")).not.toContain("Create workspace");
    expect(labels.join(" ")).not.toContain("Create worktree");
  });

  it("omits the recents section entirely when there are none", () => {
    mount({ alive: [] });
    expect(host.querySelector(".board-home__recents")).toBeNull();
  });

  it("offers no last session unless one is held", () => {
    mount();
    expect(host.querySelector(".nt-last-session")).toBeNull();
  });

  it("prints the last session's size and folds names past three", () => {
    mount({
      lastSession: { tabCount: 5, workspaces: ["deck", "api", "bench", "hub", "academy"] },
    });
    expect(host.querySelector(".nt-last-session__meta")?.textContent).toBe(
      "5 tabs · deck, api, bench, +2",
    );
  });

  it("reopens or dismisses the last session from its own buttons", () => {
    const onReopenLastSession = vi.fn();
    const onDismissLastSession = vi.fn();
    mount({
      lastSession: { tabCount: 1, workspaces: ["deck"] },
      onReopenLastSession,
      onDismissLastSession,
    });
    host.querySelector<HTMLButtonElement>(".nt-last-session__reopen")?.click();
    expect(onReopenLastSession).toHaveBeenCalledTimes(1);
    host.querySelector<HTMLButtonElement>('[aria-label="Dismiss last session"]')?.click();
    expect(onDismissLastSession).toHaveBeenCalledTimes(1);
  });
  it("offers Run on each agent instead of the dropdown in production", () => {
    const onRunAgent = vi.fn();
    mount({
      promptStaging: false,
      onRunAgent,
      agents: [
        ...AGENTS,
        { id: "codex", label: "Codex", detail: "/usr/bin/codex", missing: false },
      ],
    });
    expect(host.querySelector('[aria-label="Agent"]')).toBeNull();
    host.querySelector<HTMLButtonElement>('[aria-label="Run Codex"]')!.click();
    expect(onRunAgent).toHaveBeenCalledExactlyOnceWith("codex");
  });

  it.each([
    { draft: EMPTY_DRAFT },
    { pending: "selecting-workspace" as const },
    { agentsResolved: false },
    { agents: [{ ...AGENTS[0], missing: true }] },
  ])("blocks Run without a ready folder and agent: %j", (props) => {
    const onRunAgent = vi.fn();
    mount({ promptStaging: false, onRunAgent, ...props });
    // A missing agent's tile is named for what it is, not for the press it lacks.
    const run = host.querySelector<HTMLButtonElement>(
      '[aria-label="Run Claude Code"], [aria-label="Claude Code is not installed"]',
    )!;
    expect(run.disabled).toBe(true);
    run.click();
    expect(onRunAgent).not.toHaveBeenCalled();
  });

  it("shows the pinned quick agents in saved order, then Terminal", () => {
    const agents: readonly AgentOption[] = [
      ...AGENTS,
      { id: "codex", label: "Codex", detail: "/usr/bin/codex", missing: false },
      { id: "gemini", label: "Gemini CLI", detail: "/usr/bin/gemini", missing: false },
    ];
    settings.value = { ...DEFAULT_SETTINGS, quickAgentIds: ["gemini", "claude"] };
    try {
      mount({ promptStaging: false, agents });
      const labels = [...host.querySelectorAll(".agent-launch-page__main strong")].map(
        (name) => name.textContent,
      );
      expect(labels).toEqual(["Gemini CLI", "Claude Code", "Terminal"]);
    } finally {
      settings.value = DEFAULT_SETTINGS;
    }
  });

  it("offers the folder bar and Open folder even with no recents or selected folder", () => {
    const onPickFolder = vi.fn();
    mount({ promptStaging: false, draft: EMPTY_DRAFT, alive: [], onPickFolder });
    const field = host.querySelector<HTMLButtonElement>(".nt-workspace-picker__trigger")!;
    expect(field.textContent).toContain("Choose a folder");
    act(() => field.click());
    const items = host.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]');
    expect(items[0].textContent).toContain("Create workspace…");
    expect(host.querySelector('[role="menuitemradio"]')).toBeNull();
    expect(host.querySelector('[role="separator"]')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>(".nt-agent-launcher__action")!.click());
    expect(onPickFolder).toHaveBeenCalledTimes(1);
  });

  it("the workspace menu selects a recent and never launches", () => {
    const onRunAgent = vi.fn();
    const { onSelectWorkspace, onOpenAgent } = mount({ promptStaging: false, onRunAgent });
    act(() => host.querySelector<HTMLButtonElement>(".nt-workspace-picker__trigger")!.click());
    const api = host.querySelector<HTMLButtonElement>('[role="menuitemradio"][title="/repo/api"]')!;
    act(() => api.click());
    expect(onSelectWorkspace).toHaveBeenCalledExactlyOnceWith("/repo/api");
    expect(onRunAgent).not.toHaveBeenCalled();
    expect(onOpenAgent).not.toHaveBeenCalled();
    expect(host.querySelector('[role="menu"]')).toBeNull();
  });

  it("promises a folder drop only when the host can resolve it", () => {
    mount({ promptStaging: false });
    expect(host.textContent).not.toContain("or drop files or folders here");
    act(() => render(null, host));
    mount({ promptStaging: false, canDropFolder: true });
    expect(host.textContent).toContain("or drop files or folders here");
  });
  it("does not launch the hidden draft agent from the old composer shortcut", () => {
    const onOpenAgent = vi.fn();
    mount({ promptStaging: false, onOpenAgent });
    const run = host.querySelector<HTMLButtonElement>('[aria-label="Run Claude Code"]')!;
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    run.dispatchEvent(event);
    expect(onOpenAgent).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
  const openFolderMenu = (): void => {
    act(() => host.querySelector<HTMLButtonElement>(".nt-workspace-picker__trigger")!.click());
  };
  const menuLabels = (): string[] =>
    Array.from(host.querySelectorAll(".nt-workspace-picker__menu button")).map(
      (entry) => entry.textContent?.trim() ?? "",
    );
  const rowLabels = (): string[] =>
    Array.from(host.querySelectorAll(".nt-agent-launcher__action")).map(
      (entry) => entry.getAttribute("aria-label") ?? "",
    );

  it.each([
    ["Open folder…", "onPickFolder"],
    ["Clone repository…", "onCloneRepository"],
    ["Create worktree…", "onCreateWorktree"],
  ] as const)("shows %s as a button in the row beside the folder bar", (label, callback) => {
    const action = vi.fn();
    mount({ promptStaging: false, canCloneRepository: true, [callback]: action });
    const button = host.querySelector<HTMLButtonElement>(
      `.nt-agent-launcher__action[aria-label="${label}"]`,
    )!;
    act(() => button.click());
    expect(action).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["Create workspace…", "onCreateWorkspace"],
    ["Resume a session…", "onBrowseSessions"],
    ["Manage agents", "onManageAgents"],
  ] as const)("keeps %s in the folder menu and closes it after activation", (label, callback) => {
    const action = vi.fn();
    mount({ promptStaging: false, [callback]: action });
    expect(host.querySelector(".nt-workspace-picker__menu")).toBeNull();
    openFolderMenu();
    const button = Array.from(host.querySelectorAll(".nt-workspace-picker__menu button")).find(
      (entry) => entry.textContent?.trim() === label,
    ) as HTMLButtonElement;
    act(() => button.click());
    expect(action).toHaveBeenCalledTimes(1);
    expect(host.querySelector(".nt-workspace-picker__menu")).toBeNull();
    expect(host.querySelector(".nt-board__more")).toBeNull();
    expect(host.querySelector(".nt-board__shortcuts")).toBeNull();
  });

  it("splits the actions: three in the row, the rest in the menu ahead of the recents", () => {
    mount({ promptStaging: false, canCloneRepository: true, onCloneRepository: vi.fn() });
    expect(rowLabels()).toEqual(["Open folder…", "Clone repository…", "Create worktree…"]);
    openFolderMenu();
    expect(menuLabels()).toEqual([
      "Create workspace…",
      "Resume a session…",
      "Manage agents",
      "deck",
      "api",
    ]);
  });

  it("omits the actions a host cannot do", () => {
    mount({
      promptStaging: false,
      canCreateWorkspace: false,
      canCreateWorktree: false,
      canBrowseSessions: false,
    });
    expect(rowLabels()).toEqual(["Open folder…"]);
    openFolderMenu();
    expect(menuLabels().slice(0, 1)).toEqual(["Manage agents"]);
  });

  it("disables the row while a launch is pending and keeps the folder menu shut", () => {
    mount({ promptStaging: false, pending: "opening-agent" });
    const buttons = Array.from(
      host.querySelectorAll<HTMLButtonElement>(".nt-agent-launcher__action"),
    );
    expect(buttons.length).toBeGreaterThan(0);
    expect(buttons.every((button) => button.disabled)).toBe(true);
    act(() => host.querySelector<HTMLButtonElement>(".nt-workspace-picker__trigger")!.click());
    expect(host.querySelector(".nt-workspace-picker__menu")).toBeNull();
  });
});
