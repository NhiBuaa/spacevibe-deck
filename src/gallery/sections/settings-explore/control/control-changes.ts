import {
  DEMO_DEFAULTS,
  EXTERNAL_APPS,
  REGISTRY,
  SHORTCUT_ACTIONS,
  agentModified,
  effectiveCommand,
  isModified,
  resetAgent,
  resetKeys,
  settings,
  update,
  type DemoAgent,
  type DemoSettings,
  type PageId,
  type SettingKey,
} from "../../settings-redesign/model";

/*
 * What differs from default, as a flat list the Overview can count and the
 * changed screen can reset one by one. The model marks whole keys; here a key
 * that holds a collection (agents, templates, shortcuts) is split so each
 * entry resets on its own.
 *
 * Things the user made (their own agent, their prompt templates) are kept
 * apart as `added`: they are content, not a setting that drifted, so they are
 * not counted and no bulk reset ever deletes them.
 */

const onOff = (value: boolean): string => (value ? "On" : "Off");
const capital = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** A current value as a short human phrase, for search hits and the changed list. */
const FORMAT: Readonly<Record<SettingKey, (s: DemoSettings) => string>> = {
  colorMode: (s) => capital(s.colorMode),
  fontFamily: (s) => s.fontFamily,
  fontSize: (s) => `${s.fontSize}px`,
  lineHeight: (s) => s.lineHeight.toFixed(2),
  tabBarPosition: (s) => capital(s.tabBarPosition),
  showPaneBar: (s) => onOff(s.showPaneBar),
  showStatusBar: (s) => onOff(s.showStatusBar),
  focusExpand: (s) => onOff(s.focusExpand),
  customLogo: (s) => (s.customLogo ? "Custom" : "Default"),
  scrollback: (s) => `${s.scrollback / 1000}k lines`,
  cursorStyle: (s) => capital(s.cursorStyle),
  cursorBlink: (s) => onOff(s.cursorBlink),
  copyOnSelect: (s) => onOff(s.copyOnSelect),
  agents: (s) => `${s.agents.filter((agent) => agent.installed).length} of ${s.agents.length}`,
  promptTemplates: (s) => plural(s.promptTemplates.length, "template"),
  notifications: (s) => onOff(s.notifications),
  notifyNeedsYou: (s) => onOff(s.notifyNeedsYou),
  notifyFinished: (s) => onOff(s.notifyFinished),
  notifyErrors: (s) => onOff(s.notifyErrors),
  notifyWhileFocused: (s) => (s.notifyWhileFocused ? "Always" : "Background only"),
  externalApp: (s) => EXTERNAL_APPS.find((app) => app.id === s.externalApp)?.label ?? s.externalApp,
  editorTabSize: (s) => String(s.editorTabSize),
  editorWordWrap: (s) => onOff(s.editorWordWrap),
  browserHome: (s) => s.browserHome,
  keybindings: (s) => `${Object.keys(s.keybindings).length} rebound`,
  sidebarWidth: (s) => `${s.sidebarWidth}px`,
  dockWidth: (s) => `${s.dockWidth}px`,
  railOrder: (s) => (s.railOrder.length === 0 ? "Automatic" : `${s.railOrder.length} pinned`),
};

export function valueText(key: SettingKey, current: DemoSettings = settings.value): string {
  return FORMAT[key](current);
}

// ── agents ─────────────────────────────────────────────────────────────────

/** What differs on one built-in agent, in the user's words. */
function agentDelta(agent: DemoAgent, base: DemoAgent): string {
  const parts: string[] = [];
  if (agent.enabled !== base.enabled) parts.push(agent.enabled ? "shown in pickers" : "hidden");
  if (agent.inQuickMenu !== base.inQuickMenu) parts.push("quick menu");
  if (effectiveCommand(agent) !== effectiveCommand(base)) parts.push("launch command");
  if (agent.model !== base.model) parts.push(`model ${agent.model ?? "CLI default"}`);
  if (agent.effort !== base.effort) parts.push(`effort ${agent.effort ?? "CLI default"}`);
  if (agent.signals !== base.signals) parts.push(`signals ${agent.signals ? "on" : "off"}`);
  if (agent.savedCommands.length !== base.savedCommands.length) parts.push("saved commands");
  if (JSON.stringify(agent.models) !== JSON.stringify(base.models)) parts.push("extra models");
  return parts.length === 0 ? "Modified" : parts.join(" · ");
}

// ── the list ───────────────────────────────────────────────────────────────

export interface ChangeItem {
  readonly id: string;
  readonly page: PageId;
  readonly label: string;
  readonly kind: "changed" | "added";
  readonly from: string;
  readonly to: string;
  /** Null for something the user made: there is no default to return it to. */
  readonly reset: (() => void) | null;
}

function agentItems(current: DemoSettings): readonly ChangeItem[] {
  return current.agents.flatMap((agent): readonly ChangeItem[] => {
    const base = DEMO_DEFAULTS.agents.find((candidate) => candidate.id === agent.id);
    if (base === undefined) {
      return [
        {
          id: `agent:${agent.id}`,
          page: "agents",
          label: agent.label,
          kind: "added",
          from: "",
          to: `Your agent · ${agent.recommended}`,
          reset: null,
        },
      ];
    }
    if (!agentModified(agent.id, current)) return [];
    return [
      {
        id: `agent:${agent.id}`,
        page: "agents",
        label: agent.label,
        kind: "changed",
        from: "Default",
        to: agentDelta(agent, base),
        reset: () => resetAgent(agent.id),
      },
    ];
  });
}

function templateItems(current: DemoSettings): readonly ChangeItem[] {
  return current.promptTemplates.map((template) => ({
    id: `template:${template.id}`,
    page: "agents",
    label: template.label,
    kind: "added",
    from: "",
    to: template.autoSend ? "Prompt template · auto-send" : "Prompt template",
    reset: null,
  }));
}

function shortcutItems(current: DemoSettings): readonly ChangeItem[] {
  return Object.entries(current.keybindings).flatMap(([actionId, chord]) => {
    const action = SHORTCUT_ACTIONS.find((candidate) => candidate.id === actionId);
    if (action === undefined) return [];
    return [
      {
        id: `shortcut:${actionId}`,
        page: "shortcuts",
        label: action.label,
        kind: "changed",
        from: action.chord,
        to: chord,
        reset: () =>
          update({
            keybindings: Object.fromEntries(
              Object.entries(settings.value.keybindings).filter(([id]) => id !== actionId),
            ),
          }),
      } satisfies ChangeItem,
    ];
  });
}

const COLLECTION_KEYS: readonly SettingKey[] = ["agents", "promptTemplates", "keybindings"];

/** Every preference that differs from default. Layout state is gesture-owned and never listed. */
export function changeItems(current: DemoSettings = settings.value): readonly ChangeItem[] {
  const simple = REGISTRY.filter(
    (entry) =>
      entry.scope === "preference" &&
      !COLLECTION_KEYS.includes(entry.key) &&
      isModified(entry.key, current),
  ).map((entry): ChangeItem => ({
    id: `setting:${entry.key}`,
    page: entry.page,
    label: entry.label,
    kind: "changed",
    from: valueText(entry.key, DEMO_DEFAULTS),
    to: valueText(entry.key, current),
    reset: () => resetKeys([entry.key]),
  }));
  return [...simple, ...agentItems(current), ...shortcutItems(current), ...templateItems(current)];
}

export function changedItems(page?: PageId, current: DemoSettings = settings.value) {
  return changeItems(current).filter(
    (item) => item.kind === "changed" && (page === undefined || item.page === page),
  );
}

/** Runs every reset in the list; each reads the live settings, so they compose. */
export function resetItems(items: readonly ChangeItem[]): void {
  for (const item of items) item.reset?.();
}
