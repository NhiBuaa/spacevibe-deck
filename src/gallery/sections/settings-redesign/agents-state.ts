import { signal } from "@preact/signals";
import { agentById, settings, type DemoAgent, type DemoSettings } from "./model";

/*
 * Agents page UI state. Module signals, like the rest of the prototype's
 * stores: the selection survives a trip to another page and back.
 */

/** Which agent the detail pane shows. Null until picked; then the first installed one. */
export const selectedAgentId = signal<string | null>(null);
/** The Add agent form holds the detail pane. */
export const addingAgent = signal(false);
export const notInstalledOpen = signal(false);
/** Narrow only: the detail view is showing instead of the list. */
export const detailOpen = signal(false);

/** The `data-agent-id` of the "+ Add agent" row. */
export const ADD_ROW_ID = "__add";

/** One-shot: the list focuses this row after its next render, then clears it. */
export const listFocusRequest = signal<{ readonly id: string } | null>(null);

export function selectedAgent(current: DemoSettings = settings.value): DemoAgent | undefined {
  return (
    current.agents.find((agent) => agent.id === selectedAgentId.value) ??
    current.agents.find((agent) => agent.installed) ??
    current.agents[0]
  );
}

export function selectAgent(id: string): void {
  selectedAgentId.value = id;
  addingAgent.value = false;
  detailOpen.value = true;
  if (agentById(id)?.installed === false) notInstalledOpen.value = true;
}

export function startAddingAgent(): void {
  addingAgent.value = true;
  detailOpen.value = true;
}

/** Leave the detail pane (back on narrow, cancel on wide); focus returns to the row it came from. */
export function closeDetail(focusId: string): void {
  addingAgent.value = false;
  detailOpen.value = false;
  listFocusRequest.value = { id: focusId };
}
