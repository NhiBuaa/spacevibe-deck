import { BUILTIN_AGENTS, type AgentOption } from "../lib/agent-catalog";

/** Null keeps automatic defaults; an empty list deliberately selects none. */
export function validateQuickAgentIds(raw: unknown): readonly string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = raw.filter((id): id is string => typeof id === "string" && id.trim() !== "");
  return [...new Set(ids)];
}

/**
 * The pinned list once these agent ids no longer exist. Null (automatic) stays
 * null: it has no ids to drop.
 */
export function quickAgentsWithout(
  selectedIds: readonly string[] | null,
  removed: readonly string[],
): readonly string[] | null {
  return selectedIds?.filter((id) => !removed.includes(id)) ?? null;
}

/** Filter availability, without replacing saved picks; no saved picks means every available agent. */
export function quickAgentOptions(
  options: readonly AgentOption[],
  selectedIds: readonly string[] | null,
): readonly AgentOption[] {
  const available = options.filter((agent) => !agent.missing);
  const selected = validateQuickAgentIds(selectedIds);
  if (selected === null) return available;
  const byId = new Map(available.map((agent) => [agent.id, agent]));
  return selected.flatMap((id) => {
    const agent = byId.get(id);
    return agent === undefined ? [] : [agent];
  });
}

export interface LaunchPageCatalog {
  /** The discovery probe has landed; before that every built-in looks missing. */
  readonly probed: boolean;
  readonly disabledAgents: readonly string[];
}

/**
 * The launch page's tiles (launch-actions decision 14): the quick agents, then
 * every agent Deck knows that is not on this machine, so Install has a tile to
 * sit on. `agentOptions` lists a built-in only when it was found, so the
 * missing built-ins come from the catalog itself, in catalog order, followed by
 * declared agents whose binary is gone. A disabled agent stays out, and
 * nothing is added until the probe has answered.
 */
export function launchPageAgents(
  options: readonly AgentOption[],
  selectedIds: readonly string[] | null,
  catalog: LaunchPageCatalog,
): readonly AgentOption[] {
  const installed = quickAgentOptions(options, selectedIds);
  if (!catalog.probed) return installed;
  const known = new Set(options.map((agent) => agent.id));
  const off = new Set(catalog.disabledAgents);
  const absent = BUILTIN_AGENTS.filter((agent) => !known.has(agent.id) && !off.has(agent.id)).map(
    (agent): AgentOption => ({ id: agent.id, label: agent.label, detail: agent.id, missing: true }),
  );
  return [...installed, ...absent, ...options.filter((agent) => agent.missing)];
}
