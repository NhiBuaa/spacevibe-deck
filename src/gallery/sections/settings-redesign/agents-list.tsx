import { useEffect, useRef } from "preact/hooks";
import { CaretDown, CaretRight, Plus } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../ui/controls/deck-icon";
import {
  agentModified,
  agentScan,
  effectiveCommand,
  rescanAgents,
  settings,
  signalStatus,
  type DemoAgent,
} from "./model";
import { Action } from "./primitives";
import { AgentMark } from "./agent-mark";
import {
  ADD_ROW_ID,
  addingAgent,
  listFocusRequest,
  notInstalledOpen,
  selectAgent,
  selectedAgent,
  startAddingAgent,
} from "./agents-state";

/*
 * The master list. Every row is a button in one roving group: the selected row
 * (or the Add row while the form is open) holds the tab stop, ↑/↓/Home/End move
 * focus, Enter or a click selects. Moving focus never selects — selecting can
 * close a form with a draft in it.
 */

function itemLabel(agent: DemoAgent, changed: boolean): string {
  return [
    agent.label,
    agent.kind === "custom" ? "yours" : "",
    effectiveCommand(agent),
    agent.enabled ? "" : "off",
    changed ? "changed" : "",
  ]
    .filter((part) => part !== "")
    .join(", ");
}

function ItemMarks({ agent, changed }: { readonly agent: DemoAgent; readonly changed: boolean }) {
  const status = signalStatus(agent);
  return (
    <span class="srd-agents-item__marks">
      {!agent.enabled && (
        <span class="srd-agents-off" title="Hidden from agent pickers">
          off
        </span>
      )}
      {(status === "active" || status === "failed") && (
        <span
          class={`srd-agents-signal is-${status}`}
          title={status === "active" ? "Reporting its own status" : "Couldn't install hooks"}
        />
      )}
      {changed && <span class="srd-dot" title="Changed from default" />}
    </span>
  );
}

function AgentItem({ agent, selected }: { readonly agent: DemoAgent; readonly selected: boolean }) {
  // A custom agent has no default to differ from, so the changed mark would always show.
  const changed = agent.kind === "builtin" && agentModified(agent.id);
  return (
    <button
      type="button"
      data-srd-nav
      data-agent-id={agent.id}
      aria-label={itemLabel(agent, changed)}
      aria-current={selected ? "true" : undefined}
      tabIndex={selected ? 0 : -1}
      class={`srd-agents-item ${selected ? "is-selected" : ""} ${agent.enabled ? "" : "is-off"} ${agent.installed ? "" : "is-missing"}`}
      onClick={() => selectAgent(agent.id)}
    >
      <AgentMark agent={agent} />
      <span class="srd-agents-item__text">
        <span class="srd-agents-item__name">
          {agent.label}
          {agent.kind === "custom" && <span class="srd-agents-yours">yours</span>}
        </span>
        <span class="srd-agents-item__cmd">{effectiveCommand(agent)}</span>
      </span>
      <ItemMarks agent={agent} changed={changed} />
    </button>
  );
}

function moveFocus(event: KeyboardEvent): void {
  const { key } = event;
  if (key !== "ArrowDown" && key !== "ArrowUp" && key !== "Home" && key !== "End") return;
  const items = [
    ...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>("[data-srd-nav]"),
  ];
  const index = items.indexOf(event.target as HTMLElement);
  if (index === -1) return;
  event.preventDefault();
  const last = items.length - 1;
  const step = key === "ArrowDown" ? index + 1 : index - 1;
  items[key === "Home" ? 0 : key === "End" ? last : Math.min(last, Math.max(0, step))].focus();
}

export function AgentsList() {
  const rootRef = useRef<HTMLDivElement>(null);
  const current = settings.value;
  const adding = addingAgent.value;
  const picked = adding ? undefined : selectedAgent(current);
  const installed = current.agents.filter((agent) => agent.installed);
  const missing = current.agents.filter((agent) => !agent.installed);
  const scan = agentScan.value;
  const request = listFocusRequest.value;

  useEffect(() => {
    if (request === null) return;
    const rows = rootRef.current?.querySelectorAll<HTMLElement>("[data-agent-id]") ?? [];
    [...rows].find((row) => row.dataset.agentId === request.id)?.focus();
    listFocusRequest.value = null;
  }, [request]);

  return (
    <div class="srd-agents-list" ref={rootRef} onKeyDown={moveFocus}>
      <header class="srd-agents-list__head">
        <h3 class="srd-agents-list__title">
          Agents <span class="srd-agents-count">{current.agents.length}</span>
        </h3>
        <span title="Look for CLIs on your PATH again">
          <Action onClick={rescanAgents} disabled={scan === "scanning"}>
            {scan === "scanning" ? "Scanning…" : "Refresh"}
          </Action>
        </span>
      </header>
      {scan === "failed" && (
        <div class="srd-agents-scanfail" role="alert">
          <span>Couldn't scan your PATH</span>
          <Action onClick={rescanAgents}>Retry</Action>
        </div>
      )}
      <p class="srd-agents-list__label">Installed</p>
      <div role="group" aria-label="Installed agents" class="srd-agents-list__items">
        {installed.map((agent) => (
          <AgentItem key={agent.id} agent={agent} selected={agent.id === picked?.id} />
        ))}
      </div>
      {missing.length > 0 && (
        <>
          <button
            type="button"
            class="srd-agents-disclosure"
            data-srd-nav
            aria-expanded={notInstalledOpen.value}
            onClick={() => {
              notInstalledOpen.value = !notInstalledOpen.value;
            }}
          >
            <DeckIcon icon={notInstalledOpen.value ? CaretDown : CaretRight} size={ROW_ICON} />
            Not installed ({missing.length})
          </button>
          {notInstalledOpen.value && (
            <div role="group" aria-label="Agents not installed" class="srd-agents-list__items">
              {missing.map((agent) => (
                <AgentItem key={agent.id} agent={agent} selected={agent.id === picked?.id} />
              ))}
            </div>
          )}
        </>
      )}
      <div class="srd-agents-list__foot">
        <button
          type="button"
          class={`srd-agents-add ${adding ? "is-selected" : ""}`}
          data-srd-nav
          data-agent-id={ADD_ROW_ID}
          aria-current={adding ? "true" : undefined}
          onClick={startAddingAgent}
        >
          <DeckIcon icon={Plus} size={ROW_ICON} />
          Add agent
        </button>
      </div>
    </div>
  );
}
