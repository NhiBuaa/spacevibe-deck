import { useEffect, useRef } from "preact/hooks";
import { ArrowsClockwise, Plus } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import { AgentAddForm } from "../../settings-redesign/agent-add-form";
import { AgentDetail } from "../../settings-redesign/agent-detail";
import { AgentMark } from "../../settings-redesign/agent-mark";
import {
  ADD_ROW_ID,
  addingAgent,
  listFocusRequest,
  selectAgent,
  selectedAgent,
  startAddingAgent,
} from "../../settings-redesign/agents-state";
import {
  agentModified,
  agentScan,
  effectiveCommand,
  rescanAgents,
  settings,
  signalStatus,
  type DemoAgent,
} from "../../settings-redesign/model";
import { Action } from "../../settings-redesign/primitives";
import { PromptTemplatesGroup } from "../../settings-redesign/prompt-templates-group";
import "../../settings-redesign/page-agents.css";
import "../../settings-redesign/agent-detail.css";

/*
 * Command direction: the Agents scope. One strip of agents (a radio group, so arrows move the
 * selection) and the selected agent's own detail directly under it, in the same column.
 */

const RADIO_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

function AgentChip({ agent, selected }: { readonly agent: DemoAgent; readonly selected: boolean }) {
  // A custom agent has no default to differ from, so it would always read as changed.
  const changed = agent.kind === "builtin" && agentModified(agent.id);
  const status = signalStatus(agent);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      tabIndex={selected ? 0 : -1}
      data-agent-id={agent.id}
      title={`${agent.label} — ${effectiveCommand(agent)}${agent.installed ? "" : " (not installed)"}`}
      class={`cmd-agent ${selected ? "is-selected" : ""} ${agent.installed ? "" : "is-missing"} ${agent.enabled ? "" : "is-off"}`}
      onClick={() => selectAgent(agent.id)}
    >
      <AgentMark agent={agent} />
      <span>{agent.label}</span>
      {(status === "active" || status === "failed") && (
        <span
          class={`srd-agents-signal is-${status}`}
          title={status === "active" ? "Reporting its own status" : "Couldn't install hooks"}
        />
      )}
      {changed && <span class="srd-dot" role="img" aria-label="changed" />}
    </button>
  );
}

function moveSelection(event: KeyboardEvent): void {
  if (!RADIO_KEYS.includes(event.key)) return;
  const radios = [
    ...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="radio"]'),
  ];
  const from = radios.indexOf(event.target as HTMLElement);
  if (from === -1) return;
  event.preventDefault();
  const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
  const next = radios[(from + (forward ? 1 : -1) + radios.length) % radios.length];
  next.focus();
  selectAgent(next.dataset.agentId ?? "");
}

function AgentStrip() {
  const current = settings.value;
  const adding = addingAgent.value;
  const picked = adding ? undefined : selectedAgent(current);
  const installed = current.agents.filter((agent) => agent.installed);
  const missing = current.agents.filter((agent) => !agent.installed);
  const scan = agentScan.value;
  const request = listFocusRequest.value;
  const rowRef = useRef<HTMLDivElement>(null);

  // The shared detail hands focus back through this request (Esc on the form, a removed agent,
  // a new agent). Its list is not mounted here, so the strip answers: the chip, else the field.
  useEffect(() => {
    if (request === null) return;
    const chips = rowRef.current?.querySelectorAll<HTMLElement>("[data-agent-id]") ?? [];
    const target =
      [...chips].find((chip) => chip.dataset.agentId === request.id) ??
      rowRef.current?.closest(".cmd-frame")?.querySelector<HTMLElement>(".cmd-input");
    target?.focus({ preventScroll: true });
    listFocusRequest.value = null;
  }, [request]);

  return (
    <div ref={rowRef} class="cmd-row cmd-strip-row" data-cmd-row="agents-strip">
      <div class="cmd-strip" role="radiogroup" aria-label="Agents" onKeyDown={moveSelection}>
        {installed.map((agent) => (
          <AgentChip key={agent.id} agent={agent} selected={agent.id === picked?.id} />
        ))}
        {missing.length > 0 && <span class="cmd-strip__label">Not installed</span>}
        {missing.map((agent) => (
          <AgentChip key={agent.id} agent={agent} selected={agent.id === picked?.id} />
        ))}
      </div>
      <div class="cmd-strip__tools">
        <button
          type="button"
          class={`cmd-agent cmd-agent--add ${adding ? "is-selected" : ""}`}
          aria-pressed={adding}
          data-agent-id={ADD_ROW_ID}
          title="Add an agent"
          onClick={startAddingAgent}
        >
          <DeckIcon icon={Plus} size={ROW_ICON} />
          <span>Add</span>
        </button>
        <span title="Look for CLIs on your PATH again">
          <Action label="Refresh agents" onClick={rescanAgents} disabled={scan === "scanning"}>
            <DeckIcon icon={ArrowsClockwise} size={ROW_ICON} />
            {scan === "scanning" ? "Scanning…" : "Refresh"}
          </Action>
        </span>
        {scan === "failed" && (
          <span class="cmd-strip__fail" role="alert">
            Couldn't scan your PATH
            <Action onClick={rescanAgents}>Retry</Action>
          </span>
        )}
      </div>
    </div>
  );
}

export function AgentsScope() {
  const adding = addingAgent.value;
  const agent = selectedAgent(settings.value);
  return (
    <div class="cmd-agents">
      <AgentStrip />
      <div class="srd-agents-detail cmd-agents-detail cmd-nav">
        {adding ? (
          <AgentAddForm />
        ) : agent !== undefined ? (
          <AgentDetail key={agent.id} agent={agent} narrow={false} />
        ) : (
          <p class="cmd-empty">No agents</p>
        )}
      </div>
      <div class="cmd-nav cmd-agents-templates">
        <PromptTemplatesGroup />
      </div>
    </div>
  );
}
