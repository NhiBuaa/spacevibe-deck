import {
  DEMO_DEFAULTS,
  EXTERNAL_APPS,
  REGISTRY,
  agentModified,
  isModified,
  registryEntry,
  resetAgent,
  resetKeys,
  settings,
  type DemoAgent,
  type DemoSettings,
  type SettingKey,
} from "../../settings-redesign/model";
import { KEY_TARGET, type RegionId, type WholeSub } from "./canvas-regions";

/*
 * What differs from default, per region. Only preferences count: layout state
 * is gesture-owned and never marks a region. Agents are listed one by one and
 * only the built-in ones can be reset — `resetKeys(["agents"])` would also drop
 * the agents the user added.
 */

export interface Change {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly region: RegionId;
  readonly sub?: WholeSub;
  /** The registry key the change belongs to; search and links resolve through it. */
  readonly key: SettingKey;
  readonly reset: () => void;
}

const capitalise = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
const onOff = (value: boolean): string => (value ? "on" : "off");

/** A short, human reading of one setting's current value. */
export function formatValue(key: SettingKey, current: DemoSettings): string {
  switch (key) {
    case "fontSize":
      return `${current.fontSize}px`;
    case "lineHeight":
      return current.lineHeight.toFixed(2);
    case "scrollback":
      return `${current.scrollback / 1000}k lines`;
    case "colorMode":
    case "cursorStyle":
    case "tabBarPosition":
      return capitalise(String(current[key]));
    case "externalApp":
      return (
        EXTERNAL_APPS.find((app) => app.id === current.externalApp)?.label ?? current.externalApp
      );
    case "keybindings":
      return `${Object.keys(current.keybindings).length} rebound`;
    case "promptTemplates":
      return `${current.promptTemplates.length}`;
    case "agents":
      return `${current.agents.length} agents`;
    case "railOrder":
      return `${current.railOrder.length} pinned`;
    case "sidebarWidth":
    case "dockWidth":
      return `${current[key]}px`;
    case "customLogo":
      return onOff(current.customLogo);
    case "notifyWhileFocused":
      return current.notifyWhileFocused ? "always" : "background";
    default: {
      const value = current[key];
      return typeof value === "boolean" ? onOff(value) : String(value);
    }
  }
}

/** Which parts of one built-in agent differ from the shipped defaults. */
function agentDiff(agent: DemoAgent): string {
  const base = DEMO_DEFAULTS.agents.find((candidate) => candidate.id === agent.id);
  if (base === undefined) return "";
  const parts = [
    agent.enabled !== base.enabled ? "pickers" : "",
    agent.defaultCommandId !== base.defaultCommandId ||
    agent.savedCommands.length !== base.savedCommands.length
      ? "command"
      : "",
    agent.model !== base.model ? `model ${agent.model ?? "default"}` : "",
    agent.effort !== base.effort ? `effort ${agent.effort ?? "default"}` : "",
    agent.signals !== base.signals ? "signals" : "",
    agent.inQuickMenu !== base.inQuickMenu ? "menu" : "",
  ];
  return parts.filter((part) => part !== "").join(", ");
}

function agentChanges(current: DemoSettings): readonly Change[] {
  return current.agents
    .filter((agent) => agent.kind === "builtin" && agentModified(agent.id, current))
    .map((agent) => ({
      id: `agent:${agent.id}`,
      label: agent.label,
      value: agentDiff(agent),
      region: "agents" as const,
      key: "agents" as const,
      reset: () => resetAgent(agent.id),
    }));
}

/** Every preference that differs from default, agents expanded to one row each. */
export function allChanges(current: DemoSettings = settings.value): readonly Change[] {
  const simple = REGISTRY.filter(
    (entry) =>
      entry.scope === "preference" && entry.key !== "agents" && isModified(entry.key, current),
  ).map((entry) => ({
    id: entry.key,
    label: registryEntry(entry.key).label,
    value: formatValue(entry.key, current),
    region: KEY_TARGET[entry.key].region,
    sub: KEY_TARGET[entry.key].sub,
    key: entry.key,
    reset: () => resetKeys([entry.key]),
  }));
  return [...agentChanges(current), ...simple];
}

export function regionChanges(region: RegionId, current?: DemoSettings): readonly Change[] {
  return allChanges(current).filter((change) => change.region === region);
}

export function subChanges(sub: WholeSub, current?: DemoSettings): readonly Change[] {
  return allChanges(current).filter((change) => change.sub === sub);
}

export function resetChanges(changes: readonly Change[]): void {
  for (const change of changes) change.reset();
}
