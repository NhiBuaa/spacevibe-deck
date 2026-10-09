import {
  SHORTCUT_ACTIONS,
  chordFor,
  settings,
  shortcutConflicts,
  update,
  type DemoAgent,
  type DemoSettings,
  type ShortcutAction,
} from "../../settings-redesign/model";
import { agentHit, openHit, shortcutHit, type AgentField, type Hit } from "./command-hits";

/*
 * Command direction: the hit sources that are not registry settings: agents (by name and by
 * field), shortcut actions (by label and chord), and whole-area entries.
 */

export const MIN_FIELD_QUERY = 2;

// ── agent fields ───────────────────────────────────────────────────────────

interface AgentFieldDef {
  readonly field: AgentField;
  readonly label: string;
  readonly words: readonly string[];
  readonly applies: (agent: DemoAgent) => boolean;
}

export const AGENT_FIELDS: readonly AgentFieldDef[] = [
  {
    field: "pickers",
    label: "Show in pickers",
    words: ["picker", "pickers", "show", "hide", "hidden", "visible", "enabled"],
    applies: () => true,
  },
  {
    field: "signals",
    label: "Agent-reported status",
    words: ["signal", "signals", "hooks", "status", "report", "reported"],
    applies: (agent) => agent.signals !== null,
  },
  {
    field: "model",
    label: "Default model",
    words: ["model"],
    applies: (agent) => agent.models.length > 0,
  },
  {
    field: "effort",
    label: "Default effort",
    words: ["effort", "reasoning", "thinking"],
    applies: (agent) => agent.efforts !== null,
  },
];

export const agentFieldLabel = (field: AgentField): string =>
  AGENT_FIELDS.find((def) => def.field === field)?.label ?? field;

function agentFieldHits(q: string, agents: readonly DemoAgent[]): readonly Hit[] {
  if (q.length < MIN_FIELD_QUERY) return [];
  return AGENT_FIELDS.filter((def) => def.words.some((word) => word.includes(q))).flatMap((def) =>
    agents.filter(def.applies).map<Hit>((agent) => ({
      type: "agent-field",
      id: `f:${agent.id}:${def.field}`,
      area: "agents",
      agentId: agent.id,
      field: def.field,
    })),
  );
}

export function agentHits(
  q: string,
  listAll: boolean,
  agents: readonly DemoAgent[],
): readonly Hit[] {
  const fields = agentFieldHits(q, agents);
  const named = agents.filter((agent) =>
    `${agent.label} ${agent.id} ${agent.recommended}`.toLowerCase().includes(q),
  );
  const listed = named.length > 0 ? named : listAll && fields.length === 0 ? agents : [];
  return [...fields, ...listed.map((agent) => agentHit(agent.id))];
}

// ── shortcuts ──────────────────────────────────────────────────────────────

/** Typed in the field, a modifier symbol also matches its name. */
const MODIFIER_WORDS: Readonly<Record<string, string>> = {
  "⌘": " cmd command",
  "⌥": " opt option alt",
  "⌃": " ctrl control",
  "⇧": " shift",
};

function shortcutMatches(action: ShortcutAction, chord: string, terms: readonly string[]): boolean {
  const words = [...chord].map((char) => MODIFIER_WORDS[char] ?? "").join("");
  const haystack = `${action.label} ${action.group} ${chord}${words}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

export function shortcutHits(
  q: string,
  listTroubled: boolean,
  current: DemoSettings,
): readonly Hit[] {
  const terms = q.split(/\s+/).filter(Boolean);
  const matched =
    q.length < MIN_FIELD_QUERY
      ? []
      : SHORTCUT_ACTIONS.filter((action) =>
          shortcutMatches(action, chordFor(action.id, current), terms),
        );
  const conflicts = shortcutConflicts(current);
  // "keys", "hotkey", "rebind": the setting itself matched, so surface what needs attention.
  const troubled = listTroubled
    ? SHORTCUT_ACTIONS.filter(
        (action) =>
          !matched.includes(action) &&
          (action.id in current.keybindings || conflicts.has(action.id)),
      )
    : [];
  return [
    ...(listTroubled ? [openHit("shortcuts", "shortcuts", "All shortcuts")] : []),
    ...[...matched, ...troubled].map((action) => shortcutHit(action.id)),
  ];
}

/** Rebind one action, unbind it (""), or restore its default (null). Shipped chord = no override. */
export function rebindShortcut(actionId: string, chord: string | null): void {
  const shipped = SHORTCUT_ACTIONS.find((action) => action.id === actionId)?.chord;
  const rest = Object.fromEntries(
    Object.entries(settings.value.keybindings).filter(([id]) => id !== actionId),
  );
  update({
    keybindings: chord === null || chord === shipped ? rest : { ...rest, [actionId]: chord },
  });
}

// ── whole-area entries without a setting of their own ──────────────────────

export const EXTRAS: readonly { readonly hit: Hit; readonly words: readonly string[] }[] = [
  {
    hit: openHit("version", "about", "Version and updates"),
    words: ["version", "update", "updates", "release", "upgrade"],
  },
  {
    hit: openHit("analytics", "about", "Usage analytics"),
    words: ["analytics", "privacy", "telemetry", "usage", "sent"],
  },
  {
    hit: openHit("file", "data", "Settings file"),
    words: ["file", "json", "finder", "where"],
  },
  {
    hit: openHit("transfer", "data", "Export and import"),
    words: ["export", "import", "backup", "restore"],
  },
  {
    hit: openHit("reset", "data", "Reset preferences and layout"),
    words: ["reset", "start over", "defaults", "wipe"],
  },
];
