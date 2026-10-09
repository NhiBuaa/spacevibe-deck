import { registryEntry, type PageId, type SettingKey } from "../../settings-redesign/model";

/*
 * Command direction: what a hit is. Every hit is drawn as one live row, never as a link to a
 * page. Ids are unique per list, so the same setting can sit in two lists at once.
 */

export type AgentField = "pickers" | "signals" | "model" | "effort";

export type Hit =
  | {
      readonly type: "setting";
      readonly id: string;
      readonly area: PageId;
      readonly key: SettingKey;
    }
  | {
      readonly type: "agent";
      readonly id: string;
      readonly area: "agents";
      readonly agentId: string;
    }
  | {
      readonly type: "agent-field";
      readonly id: string;
      readonly area: "agents";
      readonly agentId: string;
      readonly field: AgentField;
    }
  | {
      readonly type: "shortcut";
      readonly id: string;
      readonly area: "shortcuts";
      readonly actionId: string;
    }
  | {
      readonly type: "open";
      readonly id: string;
      readonly area: PageId;
      readonly label: string;
      /** A registry row inside the opened area that should flash and take focus on arrival. */
      readonly jump?: SettingKey;
    };
export const QUICK_KEYS: readonly SettingKey[] = [
  "colorMode",
  "fontSize",
  "notifications",
  "showPaneBar",
];

// ── hit constructors ───────────────────────────────────────────────────────

export const settingHit = (key: SettingKey, prefix = "s"): Hit => ({
  type: "setting",
  id: `${prefix}:${key}`,
  area: registryEntry(key).page,
  key,
});

export const agentHit = (agentId: string): Hit => ({
  type: "agent",
  id: `a:${agentId}`,
  area: "agents",
  agentId,
});

export const shortcutHit = (actionId: string): Hit => ({
  type: "shortcut",
  id: `k:${actionId}`,
  area: "shortcuts",
  actionId,
});

export const openHit = (id: string, area: PageId, label: string, jump?: SettingKey): Hit => ({
  type: "open",
  jump,
  id: `o:${id}`,
  area,
  label,
});
