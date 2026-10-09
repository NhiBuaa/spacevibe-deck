import {
  PAGES,
  REGISTRY,
  SHORTCUT_ACTIONS,
  agentById,
  agentModified,
  isModified,
  pageInfo,
  registryEntry,
  resetAgent,
  resetKeys,
  searchSettings,
  settings,
  type PageId,
} from "../../settings-redesign/model";
import { agentHit, openHit, settingHit, shortcutHit, type Hit } from "./command-hits";
import {
  EXTRAS,
  agentFieldLabel,
  agentHits,
  rebindShortcut,
  shortcutHits,
} from "./command-sources";

/*
 * Command direction: the one index behind the field. A query (or a scope) becomes a list of
 * hits from the settings registry, the agents and the shortcut actions; the changed list and
 * the area scopes are other views of the same hits.
 */

// ── search ─────────────────────────────────────────────────────────────────

/** Hits for a query, best first. Inside an area scope only that area's rows remain. */
export function searchHits(rawQuery: string, area: PageId | null): readonly Hit[] {
  const q = rawQuery.trim().toLowerCase();
  if (q === "") return [];
  const current = settings.value;
  const hits: Hit[] = [];
  let agentsHit = false;
  let shortcutsHit = false;
  for (const entry of searchSettings(q)) {
    if (entry.key === "agents") agentsHit = true;
    else if (entry.key === "keybindings") shortcutsHit = true;
    else if (entry.key === "promptTemplates")
      hits.push(openHit("prompts", "agents", "Prompt templates", "promptTemplates"));
    else hits.push(settingHit(entry.key));
  }
  hits.push(...agentHits(q, agentsHit, current.agents));
  hits.push(...shortcutHits(q, shortcutsHit, current));
  for (const extra of EXTRAS) {
    const label = extra.hit.type === "open" ? extra.hit.label.toLowerCase() : "";
    if (label.includes(q) || extra.words.some((word) => word.includes(q))) hits.push(extra.hit);
  }
  // An opener to the area you are already in is noise.
  const scoped =
    area === null ? hits : hits.filter((hit) => hit.area === area && hit.type !== "open");
  return bestFirst(scoped, q);
}

/** A name that starts with the query beats one that contains it beats a keyword match. */
function bestFirst(hits: readonly Hit[], q: string): readonly Hit[] {
  const score = (hit: Hit): number => {
    const label = hitLabel(hit).toLowerCase();
    return label.startsWith(q) ? 3 : label.includes(q) ? 2 : 1;
  };
  return hits
    .map((hit, index) => ({ hit, index, rank: score(hit) }))
    .sort((a, b) => b.rank - a.rank || a.index - b.index)
    .map(({ hit }) => hit);
}

function hitLabel(hit: Hit): string {
  switch (hit.type) {
    case "setting":
      return registryEntry(hit.key).label;
    case "agent":
      return agentById(hit.agentId)?.label ?? "";
    case "agent-field":
      return agentFieldLabel(hit.field);
    case "shortcut":
      return SHORTCUT_ACTIONS.find((action) => action.id === hit.actionId)?.label ?? "";
    case "open":
      return hit.label;
  }
}

// ── changed ────────────────────────────────────────────────────────────────

/** Everything that differs from its default, one hit per thing that can be reset on its own. */
export function changedHits(rawQuery = "", area: PageId | null = null): readonly Hit[] {
  const current = settings.value;
  const hits: Hit[] = [
    ...REGISTRY.filter(
      (entry) =>
        entry.scope === "preference" &&
        entry.key !== "agents" &&
        entry.key !== "keybindings" &&
        isModified(entry.key, current),
    ).map((entry) => settingHit(entry.key, "c")),
    // Per agent: resetting the "agents" key would also delete the custom ones.
    ...current.agents
      .filter((agent) => agent.kind === "builtin" && agentModified(agent.id, current))
      .map((agent) => agentHit(agent.id)),
    ...Object.keys(current.keybindings).map(shortcutHit),
  ];
  const q = rawQuery.trim().toLowerCase();
  return hits.filter(
    (hit) => (area === null || hit.area === area) && (q === "" || hitText(hit).includes(q)),
  );
}

/** Put the changed list in area order, so it reads like the areas it came from. */
export function inAreaOrder(hits: readonly Hit[]): readonly Hit[] {
  const rank = (hit: Hit): number => PAGES.findIndex((page) => page.id === hit.area);
  return [...hits].sort((a, b) => rank(a) - rank(b));
}

function hitText(hit: Hit): string {
  const area = pageInfo(hit.area).label;
  switch (hit.type) {
    case "setting": {
      const entry = registryEntry(hit.key);
      return `${entry.label} ${entry.group} ${area} ${entry.keywords.join(" ")}`.toLowerCase();
    }
    case "agent":
      return `${agentById(hit.agentId)?.label ?? ""} ${area}`.toLowerCase();
    case "agent-field":
      return `${agentFieldLabel(hit.field)} ${area}`.toLowerCase();
    case "shortcut": {
      const action = SHORTCUT_ACTIONS.find((candidate) => candidate.id === hit.actionId);
      return `${action?.label ?? ""} ${action?.group ?? ""} ${area}`.toLowerCase();
    }
    case "open":
      return `${hit.label} ${area}`.toLowerCase();
  }
}

export function resetHit(hit: Hit): void {
  if (hit.type === "setting") resetKeys([hit.key]);
  else if (hit.type === "agent") resetAgent(hit.agentId);
  else if (hit.type === "shortcut") rebindShortcut(hit.actionId, null);
}

// ── grouping ───────────────────────────────────────────────────────────────

export interface HitGroup {
  readonly key: string;
  readonly hits: readonly Hit[];
}

/** Buckets keep the order in which each first appeared. */
export function groupHits(hits: readonly Hit[], keyOf: (hit: Hit) => string): readonly HitGroup[] {
  const groups = new Map<string, Hit[]>();
  for (const hit of hits) groups.set(keyOf(hit), [...(groups.get(keyOf(hit)) ?? []), hit]);
  return [...groups].map(([key, list]) => ({ key, hits: list }));
}

/** Every registry setting of an area, as hits (the area scope's body). */
export function areaSettingHits(area: PageId): readonly Hit[] {
  return REGISTRY.filter((entry) => entry.page === area && entry.scope !== "layout").map((entry) =>
    settingHit(entry.key, "r"),
  );
}

export function areaShortcutHits(): readonly Hit[] {
  return SHORTCUT_ACTIONS.map((action) => shortcutHit(action.id));
}
