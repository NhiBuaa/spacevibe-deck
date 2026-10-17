import type { Settings } from "./settings-schema";

/** The rail pages a setting can live on. Mirrors `CategoryId`; a test keeps them equal. */
export type SettingsPage =
  "appearance" | "browser" | "terminal" | "agents" | "links-editor" | "shortcuts" | "notifications";

/**
 * `preference` is something the user chose in Settings, `layout` is window
 * chrome the app also writes while it is used (widths, open flags), and `data`
 * is content or remembered state the user did not set as a preference.
 * Restore-defaults and page reset use this to say what they keep (FBK-3).
 */
export type SettingScope = "preference" | "layout" | "data";

export interface SettingEntry {
  /** Where the row is mounted; null when no Settings row edits the key. */
  readonly page: SettingsPage | null;
  readonly scope: SettingScope;
  readonly label: string;
  /** Extra words search matches besides the label. */
  readonly keywords: readonly string[];
}

/**
 * One entry per `Settings` key (SET-1). Typed as a full `Record`, so adding a
 * key to the schema without describing it here — or leaving a stale entry
 * behind — fails `tsc`; search, change marks and page reset read this table.
 */
export const SETTINGS_REGISTRY: Readonly<Record<keyof Settings, SettingEntry>> = {
  fontFamily: {
    page: "appearance",
    scope: "preference",
    label: "Font family",
    keywords: ["typeface", "mono"],
  },
  fontSize: {
    page: "appearance",
    scope: "preference",
    label: "Font size",
    keywords: ["text", "zoom"],
  },
  themeId: {
    page: "appearance",
    scope: "preference",
    label: "Theme",
    keywords: ["dark", "light", "palette"],
  },
  colorOverrides: {
    page: "appearance",
    scope: "preference",
    label: "Color overrides",
    keywords: ["background", "cursor", "selection"],
  },
  focusExpand: { page: null, scope: "layout", label: "Expand focused pane", keywords: [] },
  showPaneBar: { page: "appearance", scope: "preference", label: "Pane bar", keywords: ["header"] },
  showStatusBar: {
    page: "appearance",
    scope: "preference",
    label: "Status bar",
    keywords: ["footer"],
  },
  agentNotifications: {
    page: "notifications",
    scope: "preference",
    label: "Agent notifications",
    keywords: ["alert", "attention"],
  },
  tabBarPosition: {
    page: "appearance",
    scope: "preference",
    label: "Tab bar position",
    keywords: ["sidebar", "layout"],
  },
  sidebarWidth: { page: null, scope: "layout", label: "Sidebar width", keywords: [] },
  sidebarCollapsed: { page: null, scope: "layout", label: "Sidebar collapsed", keywords: [] },
  externalAppId: {
    page: "links-editor",
    scope: "preference",
    label: "Open outside paths in",
    keywords: ["editor", "app", "link"],
  },
  scrollback: {
    page: "terminal",
    scope: "preference",
    label: "Scrollback",
    keywords: ["history", "lines"],
  },
  customAgents: {
    page: "agents",
    scope: "data",
    label: "Custom agents",
    keywords: ["command", "cli"],
  },
  launchProfiles: {
    page: "agents",
    scope: "data",
    label: "Launch profiles",
    keywords: ["flags", "arguments"],
  },
  disabledAgents: {
    page: "agents",
    scope: "preference",
    label: "Disabled agents",
    keywords: ["hide", "switch off"],
  },
  quickAgentIds: {
    page: "agents",
    scope: "preference",
    label: "Pinned agents",
    keywords: ["quick launch"],
  },
  railOrder: { page: null, scope: "layout", label: "Project order", keywords: [] },
  defaultAgent: {
    page: "agents",
    scope: "preference",
    label: "Default agent",
    keywords: ["new tab"],
  },
  defaultLaunchProfiles: {
    page: "agents",
    scope: "preference",
    label: "Default launch profile",
    keywords: ["flags"],
  },
  agentModels: { page: "agents", scope: "data", label: "Agent models", keywords: ["model list"] },
  agentRuntimeDefaults: {
    page: "agents",
    scope: "preference",
    label: "Agent model and effort",
    keywords: ["reasoning", "model"],
  },
  agentSignalAdapters: {
    page: "agents",
    scope: "preference",
    label: "Signal adapters",
    keywords: ["hooks", "status"],
  },
  signalAdaptersRevision: {
    page: null,
    scope: "data",
    label: "Signal adapters revision",
    keywords: [],
  },
  quickLaunchPromptExpanded: {
    page: null,
    scope: "layout",
    label: "Quick launch prompt expanded",
    keywords: [],
  },
  promptTemplates: { page: null, scope: "data", label: "Prompt templates", keywords: [] },
  browserHomeUrl: {
    page: "browser",
    scope: "preference",
    label: "Browser home page",
    keywords: ["url", "localhost", "port"],
  },
  browserLastUrl: { page: null, scope: "data", label: "Last browser page", keywords: [] },
  dockOpen: { page: null, scope: "layout", label: "Dock open", keywords: [] },
  dockWidth: { page: null, scope: "layout", label: "Dock width", keywords: [] },
  dockTab: { page: null, scope: "layout", label: "Dock tab", keywords: [] },
  keybindings: {
    page: "shortcuts",
    scope: "preference",
    label: "Keyboard shortcuts",
    keywords: ["keys", "chord", "hotkey"],
  },
  githubStarred: { page: null, scope: "data", label: "GitHub star asked", keywords: [] },
};
