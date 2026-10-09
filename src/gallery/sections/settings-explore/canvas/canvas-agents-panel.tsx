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
  selectedAgent,
  startAddingAgent,
} from "../../settings-redesign/agents-state";
import {
  agentModified,
  agentScan,
  anchorId,
  rescanAgents,
  settings,
  type DemoAgent,
} from "../../settings-redesign/model";
import { Action } from "../../settings-redesign/primitives";
import { PromptTemplatesGroup } from "../../settings-redesign/prompt-templates-group";
import { useJumpTarget } from "../../settings-redesign/use-jump-target";
import { itemLink, linkEvents } from "./canvas-link";
import { rovingKeyDown } from "./canvas-keys";
import { selectRegion } from "./canvas-regions";

/*
 * Agents in the inspector: the roster as a row of chips (the miniature's rail
 * rows select the same agent), then the selected agent's own setup and the
 * prompt templates. Launch commands, model, effort and signals are the shared
 * detail pane, so validation, remove-with-undo and the honest signal states are
 * the ones the other directions show.
 */

const CHIP = "[data-agent-id]";

function AgentChip({ agent, selected }: { readonly agent: DemoAgent; readonly selected: boolean }) {
  const changed = agent.kind === "builtin" && agentModified(agent.id);
  return (
    <button
      type="button"
      data-agent-id={agent.id}
      aria-current={selected ? "true" : undefined}
      aria-label={[agent.label, agent.installed ? "" : "not installed", changed ? "changed" : ""]
        .filter((part) => part !== "")
        .join(", ")}
      title={agent.installed ? agent.label : `${agent.label} is not on your PATH`}
      tabIndex={selected ? 0 : -1}
      class={`cv-agent-chip ${selected ? "is-selected" : ""} ${agent.installed ? "" : "is-missing"} ${agent.enabled ? "" : "is-off"}`}
      onClick={() => selectRegion("agents", `agent:${agent.id}`)}
      {...itemLink({ region: "agents", part: `agent:${agent.id}` })}
    >
      <AgentMark agent={agent} />
      <span class="cv-agent-chip__name">{agent.label}</span>
      {changed && <span class="srd-dot" aria-hidden="true" />}
    </button>
  );
}

function AgentPicker() {
  const rootRef = useRef<HTMLDivElement>(null);
  const current = settings.value;
  const adding = addingAgent.value;
  const picked = adding ? undefined : selectedAgent(current);
  const scan = agentScan.value;
  const request = listFocusRequest.value;

  // Closing the detail (remove, cancel) asks the roster to take focus back.
  useEffect(() => {
    if (request === null) return;
    const chips = rootRef.current?.querySelectorAll<HTMLElement>(CHIP) ?? [];
    [...chips].find((chip) => chip.dataset.agentId === request.id)?.focus();
    listFocusRequest.value = null;
  }, [request]);

  return (
    <div class="cv-picker">
      <div
        ref={rootRef}
        class="cv-picker__chips"
        role="group"
        aria-label="Agents"
        onKeyDown={(event) => rovingKeyDown(event, CHIP)}
      >
        {current.agents.map((agent) => (
          <AgentChip key={agent.id} agent={agent} selected={agent.id === picked?.id} />
        ))}
        <button
          type="button"
          data-agent-id={ADD_ROW_ID}
          aria-current={adding ? "true" : undefined}
          tabIndex={adding ? 0 : -1}
          class={`cv-agent-chip is-add ${adding ? "is-selected" : ""}`}
          onClick={startAddingAgent}
        >
          <DeckIcon icon={Plus} size={ROW_ICON} />
          <span class="cv-agent-chip__name">Add</span>
        </button>
      </div>
      <button
        type="button"
        class="cv-iconbtn"
        title="Look for CLIs on your PATH again"
        aria-label="Refresh agents"
        disabled={scan === "scanning"}
        onClick={rescanAgents}
      >
        <DeckIcon icon={ArrowsClockwise} size={ROW_ICON} />
      </button>
      {scan === "failed" && (
        <div class="cv-picker__fail" role="alert">
          <span>Couldn't scan your PATH</span>
          <Action onClick={rescanAgents}>Retry</Action>
        </div>
      )}
    </div>
  );
}

export function AgentsPanel() {
  const current = settings.value;
  const agent = selectedAgent(current);
  const adding = addingAgent.value;
  // A search hit for the roster itself lands on the selected chip.
  const jump = useJumpTarget<HTMLDivElement>("agents", ".cv-agent-chip.is-selected");

  return (
    <div
      id={anchorId("agents")}
      ref={jump.ref}
      class={`cv-panel cv-agents ${jump.flash ? "is-flash" : ""}`}
      {...linkEvents({
        region: "agents",
        part: agent === undefined ? undefined : `agent:${agent.id}`,
      })}
    >
      <AgentPicker />
      <div class="srd-agents-detail cv-agent-detail">
        {adding ? (
          <AgentAddForm />
        ) : agent !== undefined ? (
          <AgentDetail key={agent.id} agent={agent} narrow={false} />
        ) : (
          <p class="srd-agents-empty">No agents</p>
        )}
      </div>
      <PromptTemplatesGroup />
    </div>
  );
}
