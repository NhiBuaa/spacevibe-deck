import { signal } from "@preact/signals";

/*
 * Settings redesign prototype — the shared in-memory model.
 *
 * Gallery only: nothing here reads or writes the owner's settings.json. Every
 * page of the prototype reads `settings` and writes through `update`, which
 * simulates the real patch round trip (saving → saved, or a failure when the
 * demo toolbar turns saves off). The registry is the proposal's "spine": search,
 * changed marks, per-page reset and the Reset scope text all read it.
 * Plan: docs/plans/2026-10-04-settings-redesign.md (local, gitignored).
 */

// ── pages ──────────────────────────────────────────────────────────────────

export type PageId =
  "appearance" | "terminal" | "agents" | "notifications" | "files" | "shortcuts" | "about" | "data";

export interface PageInfo {
  readonly id: PageId;
  readonly label: string;
  readonly lede: string;
}

export const PAGES: readonly PageInfo[] = [
  { id: "appearance", label: "Appearance", lede: "How Deck looks and reads." },
  { id: "terminal", label: "Terminal", lede: "History, cursor and copying in every pane." },
  { id: "agents", label: "Agents", lede: "The CLIs Deck launches, and how each one starts." },
  {
    id: "notifications",
    label: "Notifications",
    lede: "When an agent may ask for your attention.",
  },
  {
    id: "files",
    label: "Files & browser",
    lede: "Where paths open, and what the editor and browser start with.",
  },
  { id: "shortcuts", label: "Shortcuts", lede: "Every action and the keys it answers to." },
  { id: "about", label: "About", lede: "This build, updates, and the usage data Deck sends." },
  {
    id: "data",
    label: "Data & reset",
    lede: "Where your settings live, backups, and starting over.",
  },
];

export function pageInfo(id: PageId): PageInfo {
  return PAGES.find((page) => page.id === id) ?? PAGES[0];
}

// ── settings shape ─────────────────────────────────────────────────────────

export type ColorMode = "light" | "dark" | "system";
export type CursorStyle = "bar" | "block" | "underline";
export type SignalStatus = "active" | "off" | "failed" | "unsupported";

export interface SavedCommand {
  readonly id: string;
  readonly command: string;
}

export interface DemoAgent {
  readonly id: string;
  readonly label: string;
  readonly kind: "builtin" | "custom";
  readonly installed: boolean;
  /** Shown in agent pickers. */
  readonly enabled: boolean;
  /** Pinned to the checkout menu (max `QUICK_MENU_MAX`). */
  readonly inQuickMenu: boolean;
  /** The catalog's recommended command — what launches when no saved command is the default. */
  readonly recommended: string;
  readonly savedCommands: readonly SavedCommand[];
  /** Saved command that launches; null = the recommended command. */
  readonly defaultCommandId: string | null;
  /** null = whatever the CLI itself defaults to. */
  readonly model: string | null;
  readonly effort: string | null;
  /** Models offered in the picker (seed + user additions). Empty = no model flag. */
  readonly models: readonly string[];
  /** null = this CLI has no effort flag. */
  readonly efforts: readonly string[] | null;
  /** null = no signal adapter exists for this agent. */
  readonly signals: boolean | null;
}

export interface PromptTemplateDemo {
  readonly id: string;
  readonly label: string;
  readonly body: string;
  readonly autoSend: boolean;
}

export interface DemoSettings {
  // Appearance
  readonly colorMode: ColorMode;
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly tabBarPosition: "left" | "top";
  readonly showPaneBar: boolean;
  readonly showStatusBar: boolean;
  readonly focusExpand: boolean;
  readonly customLogo: boolean;
  // Terminal
  readonly scrollback: number;
  readonly cursorStyle: CursorStyle;
  readonly cursorBlink: boolean;
  readonly copyOnSelect: boolean;
  // Agents
  readonly agents: readonly DemoAgent[];
  readonly promptTemplates: readonly PromptTemplateDemo[];
  // Notifications
  readonly notifications: boolean;
  readonly notifyNeedsYou: boolean;
  readonly notifyFinished: boolean;
  readonly notifyErrors: boolean;
  readonly notifyWhileFocused: boolean;
  // Files & browser
  readonly externalApp: string;
  readonly editorTabSize: number;
  readonly editorWordWrap: boolean;
  readonly browserHome: string;
  // Shortcuts — action id → chord override
  readonly keybindings: Readonly<Record<string, string>>;
  // Layout state (set by gestures elsewhere; only Data & reset touches it)
  readonly sidebarWidth: number;
  readonly dockWidth: number;
  readonly railOrder: readonly string[];
}

export type SettingKey = keyof DemoSettings;

export const QUICK_MENU_MAX = 5;
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 24;
export const LINE_HEIGHT_MIN = 1;
export const LINE_HEIGHT_MAX = 1.6;
export const SCROLLBACK_CHOICES = [1000, 5000, 10_000, 50_000, 100_000] as const;
export const FONT_CHOICES = ["SF Mono", "JetBrains Mono", "Menlo", "Fira Code", "IBM Plex Mono"];

export const EXTERNAL_APPS: readonly { id: string; label: string; group: string }[] = [
  { id: "vscode", label: "VS Code", group: "Editors" },
  { id: "cursor", label: "Cursor", group: "Editors" },
  { id: "zed", label: "Zed", group: "Editors" },
  { id: "github-desktop", label: "GitHub Desktop", group: "Git clients" },
  { id: "finder", label: "Finder", group: "File browser" },
  { id: "ghostty", label: "Ghostty", group: "Terminals" },
  { id: "iterm2", label: "iTerm2", group: "Terminals" },
];

const BUILTIN_AGENTS: readonly DemoAgent[] = [
  {
    id: "claude",
    label: "Claude Code",
    kind: "builtin",
    installed: true,
    enabled: true,
    inQuickMenu: true,
    recommended: "claude --dangerously-skip-permissions",
    savedCommands: [{ id: "lp:claude-plan", command: "claude --permission-mode plan" }],
    defaultCommandId: null,
    model: null,
    effort: null,
    models: ["opus", "sonnet", "haiku"],
    efforts: ["low", "medium", "high", "xhigh", "max"],
    signals: false,
  },
  {
    id: "codex",
    label: "Codex",
    kind: "builtin",
    installed: true,
    enabled: true,
    inQuickMenu: true,
    recommended: "codex --dangerously-bypass-approvals-and-sandbox",
    savedCommands: [],
    defaultCommandId: null,
    model: null,
    effort: null,
    models: ["gpt-5.5-codex", "gpt-5.5"],
    efforts: ["minimal", "low", "medium", "high"],
    signals: false,
  },
  {
    id: "opencode",
    label: "opencode",
    kind: "builtin",
    installed: true,
    enabled: true,
    inQuickMenu: true,
    recommended: "opencode",
    savedCommands: [],
    defaultCommandId: null,
    model: null,
    effort: null,
    models: ["anthropic/claude-sonnet-5-5", "openai/gpt-5.5"],
    efforts: null,
    signals: false,
  },
  {
    id: "gemini",
    label: "Gemini CLI",
    kind: "builtin",
    installed: false,
    enabled: true,
    inQuickMenu: false,
    recommended: "gemini --yolo",
    savedCommands: [],
    defaultCommandId: null,
    model: null,
    effort: null,
    models: ["gemini-3-pro", "gemini-3-flash"],
    efforts: null,
    signals: null,
  },
  {
    id: "amp",
    label: "Amp",
    kind: "builtin",
    installed: false,
    enabled: true,
    inQuickMenu: false,
    recommended: "amp",
    savedCommands: [],
    defaultCommandId: null,
    model: null,
    effort: null,
    models: [],
    efforts: null,
    signals: null,
  },
  {
    id: "cursor-agent",
    label: "Cursor Agent",
    kind: "builtin",
    installed: false,
    enabled: true,
    inQuickMenu: false,
    recommended: "cursor-agent",
    savedCommands: [],
    defaultCommandId: null,
    model: null,
    effort: null,
    models: [],
    efforts: null,
    signals: null,
  },
];

const CUSTOM_AIDER: DemoAgent = {
  id: "custom:aider",
  label: "aider",
  kind: "custom",
  installed: true,
  enabled: true,
  inQuickMenu: false,
  recommended: "aider --model sonnet",
  savedCommands: [],
  defaultCommandId: null,
  model: null,
  effort: null,
  models: [],
  efforts: null,
  signals: null,
};

export const DEMO_DEFAULTS: DemoSettings = {
  colorMode: "dark",
  fontFamily: "SF Mono",
  fontSize: 13,
  lineHeight: 1.25,
  tabBarPosition: "left",
  showPaneBar: false,
  showStatusBar: false,
  focusExpand: false,
  customLogo: false,
  scrollback: 10_000,
  cursorStyle: "bar",
  cursorBlink: true,
  copyOnSelect: false,
  agents: BUILTIN_AGENTS,
  promptTemplates: [],
  notifications: false,
  notifyNeedsYou: true,
  notifyFinished: true,
  notifyErrors: true,
  notifyWhileFocused: false,
  externalApp: "vscode",
  editorTabSize: 2,
  editorWordWrap: false,
  browserHome: "http://localhost:3000",
  keybindings: {},
  sidebarWidth: 275,
  dockWidth: 420,
  railOrder: [],
};

/**
 * Where the prototype opens: a lived-in profile, so changed marks, a custom
 * agent and a few templates are on screen without clicking first.
 */
const DEMO_START: DemoSettings = {
  ...DEMO_DEFAULTS,
  fontFamily: "JetBrains Mono",
  fontSize: 14,
  showPaneBar: true,
  agents: [
    ...BUILTIN_AGENTS.map((agent) =>
      agent.id === "claude"
        ? {
            ...agent,
            signals: true,
            model: "opus",
            effort: "high",
            defaultCommandId: "lp:claude-plan",
          }
        : agent,
    ),
    CUSTOM_AIDER,
  ],
  promptTemplates: [
    {
      id: "pt:review",
      label: "Review diff",
      body: "Review the staged diff for correctness bugs.",
      autoSend: true,
    },
    {
      id: "pt:tests",
      label: "Write tests",
      body: "Add tests for the function under the cursor.",
      autoSend: false,
    },
  ],
  // A rebind that collides with Explorer, so the conflict UI has something to say.
  keybindings: { "toggle-dock": "⌘⇧X" },
  sidebarWidth: 312,
  railOrder: ["spacevibe-deck", "spacevibe-api"],
};

// ── shortcuts (demo keymap) ────────────────────────────────────────────────

export interface ShortcutAction {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly chord: string;
}

export const SHORTCUT_ACTIONS: readonly ShortcutAction[] = [
  { id: "new-tab", label: "New space", group: "Spaces", chord: "⌘T" },
  { id: "close-pane", label: "Close pane", group: "Spaces", chord: "⌘W" },
  { id: "next-space", label: "Next space", group: "Spaces", chord: "⌃⇥" },
  { id: "prev-space", label: "Previous space", group: "Spaces", chord: "⌃⇧⇥" },
  { id: "mission-control", label: "Mission Control", group: "Spaces", chord: "⌃↑" },
  { id: "split-right", label: "Split right", group: "Panes", chord: "⌘D" },
  { id: "split-down", label: "Split down", group: "Panes", chord: "⌘⇧D" },
  { id: "toggle-zoom-pane", label: "Zoom pane", group: "Panes", chord: "⌘⇧⏎" },
  { id: "toggle-expand", label: "Expand focused pane", group: "Panes", chord: "⌘⌥⏎" },
  { id: "focus-next-pane", label: "Focus next pane", group: "Panes", chord: "⌘]" },
  { id: "quick-launch", label: "Quick Launch", group: "Agents", chord: "⌘N" },
  { id: "prompt-board", label: "Prompt templates", group: "Agents", chord: "⌘⇧P" },
  { id: "toggle-dock", label: "Toggle dock", group: "Tools", chord: "⌘B" },
  { id: "open-explorer", label: "Explorer", group: "Tools", chord: "⌘⇧X" },
  { id: "open-usage", label: "Token usage", group: "Tools", chord: "⌘⇧U" },
  { id: "open-browser", label: "Browser", group: "Tools", chord: "⌘⇧B" },
  { id: "copy-selection", label: "Copy", group: "Terminal", chord: "⌘C" },
  { id: "paste", label: "Paste", group: "Terminal", chord: "⌘V" },
  { id: "clear-buffer", label: "Clear scrollback", group: "Terminal", chord: "⌘K" },
  { id: "find", label: "Find in pane", group: "Terminal", chord: "⌘F" },
  { id: "zoom-in", label: "Bigger text", group: "View", chord: "⌘=" },
  { id: "zoom-out", label: "Smaller text", group: "View", chord: "⌘-" },
  { id: "zoom-reset", label: "Actual size", group: "View", chord: "⌘0" },
  { id: "open-settings", label: "Settings", group: "View", chord: "⌘," },
];

/** The chord an action answers to after overrides. */
export function chordFor(actionId: string, current: DemoSettings): string {
  return (
    current.keybindings[actionId] ?? SHORTCUT_ACTIONS.find((a) => a.id === actionId)?.chord ?? ""
  );
}

/** Action ids that share a chord with at least one other action. */
export function shortcutConflicts(current: DemoSettings): ReadonlyMap<string, readonly string[]> {
  const byChord = new Map<string, string[]>();
  for (const action of SHORTCUT_ACTIONS) {
    const chord = chordFor(action.id, current);
    if (chord === "") continue;
    byChord.set(chord, [...(byChord.get(chord) ?? []), action.id]);
  }
  const conflicts = new Map<string, readonly string[]>();
  for (const ids of byChord.values()) {
    if (ids.length < 2) continue;
    for (const id of ids)
      conflicts.set(
        id,
        ids.filter((other) => other !== id),
      );
  }
  return conflicts;
}

// ── registry (the spine) ───────────────────────────────────────────────────

export interface SettingEntry {
  readonly key: SettingKey;
  readonly page: PageId;
  /** Group title on the page, as printed. */
  readonly group: string;
  readonly label: string;
  /** One line, only where behaviour is not obvious. */
  readonly desc?: string;
  /** Extra search words. */
  readonly keywords: readonly string[];
  /**
   * `layout` is gesture state, `file` lives outside settings.json (the logo) —
   * both are excluded from "Reset preferences", page resets and export.
   */
  readonly scope: SettingScope;
  /** `new-sessions`: running panes keep the old value. */
  readonly appliesTo: "now" | "new-sessions";
}

export type SettingScope = "preference" | "layout" | "file";

const entry = (
  key: SettingKey,
  page: PageId,
  group: string,
  label: string,
  keywords: readonly string[],
  options: { desc?: string; scope?: SettingScope; appliesTo?: "now" | "new-sessions" } = {},
): SettingEntry => ({
  key,
  page,
  group,
  label,
  keywords,
  desc: options.desc,
  scope: options.scope ?? "preference",
  appliesTo: options.appliesTo ?? "now",
});

export const REGISTRY: readonly SettingEntry[] = [
  entry("colorMode", "appearance", "Color", "Color mode", [
    "theme",
    "light",
    "dark",
    "system",
    "appearance",
  ]),
  entry("fontFamily", "appearance", "Text", "Font", ["typeface", "mono", "typography"], {
    desc: "Terminals and the editor",
  }),
  entry("fontSize", "appearance", "Text", "Size", ["font size", "zoom", "bigger", "smaller"]),
  entry("lineHeight", "appearance", "Text", "Line height", ["leading", "spacing", "density"]),
  entry("tabBarPosition", "appearance", "Layout", "Tabs", ["tab bar", "sidebar", "top"]),
  entry("showPaneBar", "appearance", "Layout", "Pane bar", ["pane name", "header", "split"]),
  entry("showStatusBar", "appearance", "Layout", "Status bar", ["bottom bar", "branch", "footer"]),
  entry("focusExpand", "appearance", "Layout", "Expand focused pane", [
    "focus",
    "zoom pane",
    "grow",
  ]),
  entry("customLogo", "appearance", "Identity", "App logo", ["icon", "brand", "image"], {
    scope: "file",
  }),
  entry("scrollback", "terminal", "History", "Scrollback", ["history", "lines", "buffer"]),
  entry("cursorStyle", "terminal", "Cursor", "Cursor shape", [
    "caret",
    "bar",
    "block",
    "underline",
  ]),
  entry("cursorBlink", "terminal", "Cursor", "Blink", ["cursor blink", "caret"]),
  entry("copyOnSelect", "terminal", "Selection", "Copy on select", [
    "clipboard",
    "copy",
    "selection",
  ]),
  entry(
    "agents",
    "agents",
    "Agents",
    "Agent setup",
    [
      "claude",
      "codex",
      "opencode",
      "command",
      "model",
      "effort",
      "signals",
      "hooks",
      "custom agent",
      "quick menu",
      "launch",
    ],
    {
      appliesTo: "new-sessions",
    },
  ),
  entry("promptTemplates", "agents", "Prompt templates", "Prompt templates", [
    "prompt",
    "snippet",
    "template",
    "auto send",
  ]),
  entry("notifications", "notifications", "Alerts", "Notifications", [
    "alert",
    "notify",
    "attention",
    "bell",
  ]),
  entry("notifyNeedsYou", "notifications", "Alerts", "Needs you", [
    "permission",
    "question",
    "asked",
  ]),
  entry("notifyFinished", "notifications", "Alerts", "Finished", ["done", "completed"]),
  entry("notifyErrors", "notifications", "Alerts", "Errors", ["failed", "warning"]),
  entry(
    "notifyWhileFocused",
    "notifications",
    "Alerts",
    "While Deck is in front",
    ["focused", "hidden tab", "background"],
    {
      desc: "For agents in a space you are not looking at",
    },
  ),
  entry(
    "externalApp",
    "files",
    "Paths",
    "Open with",
    ["editor", "vscode", "cursor", "finder", "external"],
    {
      desc: "Paths outside your open workspaces",
    },
  ),
  entry("editorTabSize", "files", "Editor", "Tab size", ["indent", "spaces"]),
  entry("editorWordWrap", "files", "Editor", "Word wrap", ["wrap", "long lines"]),
  entry(
    "browserHome",
    "files",
    "Browser",
    "Home address",
    ["url", "localhost", "port", "dev server"],
    {
      desc: "When there is no previous page",
    },
  ),
  entry("keybindings", "shortcuts", "Shortcuts", "Shortcuts", [
    "keys",
    "keyboard",
    "hotkey",
    "chord",
    "rebind",
  ]),
  entry("sidebarWidth", "data", "Layout", "Sidebar width", ["sidebar", "rail"], {
    scope: "layout",
  }),
  entry("dockWidth", "data", "Layout", "Dock width", ["dock", "panel"], { scope: "layout" }),
  entry("railOrder", "data", "Layout", "Project order", ["rail", "order", "projects"], {
    scope: "layout",
  }),
];

export function registryEntry(key: SettingKey): SettingEntry {
  const found = REGISTRY.find((candidate) => candidate.key === key);
  if (found === undefined) throw new Error(`No registry entry for ${key}`);
  return found;
}

/** DOM id a search hit scrolls to. */
export function anchorId(key: SettingKey): string {
  return `srd-setting-${key}`;
}

// ── store ──────────────────────────────────────────────────────────────────

export const settings = signal<DemoSettings>(DEMO_START);

export type LoadMode = "ready" | "loading" | "error";
/** Demo toolbar: the settings snapshot's state. */
export const loadMode = signal<LoadMode>("ready");
/** Demo toolbar: every save fails while on. */
export const failSaves = signal(false);
/** Demo toolbar: the Claude hook install fails while on. */
export const failHooks = signal(false);
/** Demo toolbar: pretend the host is Windows (no Claude hooks). */
export const windowsHost = signal(false);
/** Demo toolbar: the next agent scan fails. */
export const failScan = signal(false);

export type FrameSize = "wide" | "medium" | "narrow";
export const FRAME_WIDTHS: Readonly<Record<FrameSize, number>> = {
  wide: 1280,
  medium: 900,
  narrow: 480,
};
export const frameSize = signal<FrameSize>("wide");

export interface SaveStatus {
  readonly kind: "idle" | "saving" | "saved" | "error" | "temporary";
  readonly failedKeys: readonly SettingKey[];
}
export const saveStatus = signal<SaveStatus>({ kind: "idle", failedKeys: [] });

export const activePage = signal<PageId>("agents");
/** A search jump: the row with this key scrolls into view and flashes once. */
export const focusTarget = signal<{ readonly key: SettingKey; readonly nonce: number } | null>(
  null,
);
export const searchQuery = signal("");
/** One line announcing an edit that arrived from another window. */
export const remoteNotice = signal<string | null>(null);

const SAVE_DELAY_MS = 380;
const SAVED_LINGER_MS = 1600;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let lingerTimer: ReturnType<typeof setTimeout> | undefined;

function settle(keys: readonly SettingKey[]): void {
  clearTimeout(saveTimer);
  clearTimeout(lingerTimer);
  saveStatus.value = { kind: "saving", failedKeys: saveStatus.value.failedKeys };
  saveTimer = setTimeout(() => {
    if (failSaves.value) {
      const failed = [...new Set([...saveStatus.value.failedKeys, ...keys])];
      saveStatus.value = { kind: "error", failedKeys: failed };
      return;
    }
    saveStatus.value = { kind: "saved", failedKeys: [] };
    lingerTimer = setTimeout(() => {
      saveStatus.value = { kind: "idle", failedKeys: [] };
    }, SAVED_LINGER_MS);
  }, SAVE_DELAY_MS);
}

/** The one write path. Ignored while loading, like the real disabled fieldset. */
export function update(patch: Partial<DemoSettings>): void {
  if (loadMode.value === "loading") return;
  settings.value = { ...settings.value, ...patch };
  if (loadMode.value === "error") {
    saveStatus.value = { kind: "temporary", failedKeys: [] };
    return;
  }
  settle(Object.keys(patch) as SettingKey[]);
}

/** Re-send the CURRENT values of the keys that failed — never a stale patch. */
export function retrySave(): void {
  const keys = saveStatus.value.failedKeys;
  if (keys.length === 0) return;
  settle(keys);
}

export function isModified(key: SettingKey, current: DemoSettings = settings.value): boolean {
  return JSON.stringify(current[key]) !== JSON.stringify(DEMO_DEFAULTS[key]);
}

/** Changed preferences on a page. Layout state is gesture-owned, so it never marks a page. */
export function modifiedOn(
  page: PageId,
  current: DemoSettings = settings.value,
): readonly SettingEntry[] {
  return REGISTRY.filter(
    (candidate) =>
      candidate.page === page &&
      candidate.scope === "preference" &&
      isModified(candidate.key, current),
  );
}

export function resetKeys(keys: readonly SettingKey[]): void {
  const patch: Record<string, unknown> = {};
  for (const key of keys) patch[key] = DEMO_DEFAULTS[key];
  update(patch as Partial<DemoSettings>);
}

/** Preferences on one page; layout state is never reset from a page. */
export function resetPage(page: PageId): void {
  resetKeys(REGISTRY.filter((c) => c.page === page && c.scope === "preference").map((c) => c.key));
}

export function keysInScope(scope: SettingScope): readonly SettingKey[] {
  return REGISTRY.filter((candidate) => candidate.scope === scope).map(
    (candidate) => candidate.key,
  );
}

// ── agents helpers ─────────────────────────────────────────────────────────

export function agentById(
  id: string,
  current: DemoSettings = settings.value,
): DemoAgent | undefined {
  return current.agents.find((agent) => agent.id === id);
}

/** Replace one agent; every agent edit goes through here. */
export function updateAgent(id: string, patch: Partial<DemoAgent>): void {
  update({
    agents: settings.value.agents.map((agent) =>
      agent.id === id ? { ...agent, ...patch } : agent,
    ),
  });
}

export function agentModified(id: string, current: DemoSettings = settings.value): boolean {
  const now = agentById(id, current);
  const base = DEMO_DEFAULTS.agents.find((agent) => agent.id === id);
  return base === undefined || JSON.stringify(now) !== JSON.stringify(base);
}

export function resetAgent(id: string): void {
  const base = DEMO_DEFAULTS.agents.find((agent) => agent.id === id);
  if (base !== undefined) updateAgent(id, base);
}

/** The command a new session of this agent types. */
export function effectiveCommand(agent: DemoAgent): string {
  return (
    agent.savedCommands.find((saved) => saved.id === agent.defaultCommandId)?.command ??
    agent.recommended
  );
}

export function signalStatus(agent: DemoAgent): SignalStatus | null {
  if (agent.signals === null) return null;
  if (windowsHost.value && agent.id === "claude") return "unsupported";
  if (!agent.signals) return "off";
  if (failHooks.value && agent.id === "claude") return "failed";
  return "active";
}

/** Same character rule the real launch-profile validator enforces. */
const COMMAND_SAFE = /^[A-Za-z0-9 _.,:@+=/-]+$/;

/** Why a saved command for this agent is refused, or null. */
export function commandProblem(agent: DemoAgent, command: string): string | null {
  const trimmed = command.trim();
  if (trimmed === "") return "Type a command";
  if (trimmed.length > 200) return "Commands stay under 200 characters";
  if (!COMMAND_SAFE.test(trimmed)) return "Only letters, digits, spaces and . , : @ + = _ - /";
  const binary = agent.recommended.split(" ")[0];
  if (trimmed.split(" ")[0] !== binary) return `Start with ${binary}`;
  if (agent.savedCommands.some((saved) => saved.command === trimmed)) return "Already saved";
  return null;
}

export type AgentScan = "done" | "scanning" | "failed";
export const agentScan = signal<AgentScan>("done");

export function rescanAgents(): void {
  if (agentScan.value === "scanning") return;
  agentScan.value = "scanning";
  setTimeout(() => {
    agentScan.value = failScan.value ? "failed" : "done";
  }, 1200);
}

// ── search ─────────────────────────────────────────────────────────────────

/** Label prefix beats label substring beats keyword/group/page match. */
export function searchSettings(query: string): readonly SettingEntry[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [];
  const scored = REGISTRY.flatMap((candidate) => {
    const label = candidate.label.toLowerCase();
    const haystack = [
      ...candidate.keywords,
      candidate.group,
      pageInfo(candidate.page).label,
      candidate.desc ?? "",
    ].map((word) => word.toLowerCase());
    const score = label.startsWith(q)
      ? 3
      : label.includes(q)
        ? 2
        : haystack.some((w) => w.includes(q))
          ? 1
          : 0;
    return score === 0 ? [] : [{ candidate, score }];
  });
  return scored.sort((a, b) => b.score - a.score).map((hit) => hit.candidate);
}

/** Open a page and flash one row on it. */
export function jumpTo(key: SettingKey): void {
  activePage.value = registryEntry(key).page;
  focusTarget.value = { key, nonce: Date.now() };
  searchQuery.value = "";
}

// ── demo helpers ───────────────────────────────────────────────────────────

/** A change arriving through the merged broadcast from a peer window. */
export function simulateRemoteEdit(): void {
  const next =
    settings.value.fontSize >= FONT_SIZE_MAX ? FONT_SIZE_MIN + 3 : settings.value.fontSize + 1;
  settings.value = { ...settings.value, fontSize: next };
  remoteNotice.value = `Text size changed to ${next}px in another window`;
  setTimeout(() => {
    remoteNotice.value = null;
  }, 3200);
}

/** Back to the lived-in starting profile (demo toolbar). */
export function restartDemo(): void {
  settings.value = DEMO_START;
  saveStatus.value = { kind: "idle", failedKeys: [] };
  loadMode.value = "ready";
  failSaves.value = false;
  failHooks.value = false;
  windowsHost.value = false;
  failScan.value = false;
  agentScan.value = "done";
}
