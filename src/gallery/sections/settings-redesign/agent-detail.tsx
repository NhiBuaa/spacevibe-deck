import { useEffect, useRef } from "preact/hooks";
import { ADD_ROW_ID, closeDetail, selectedAgentId } from "./agents-state";
import {
  agentModified,
  effectiveCommand,
  resetAgent,
  settings,
  updateAgent,
  type DemoAgent,
} from "./model";
import { ResetButton, Switch } from "./primitives";
import { AgentMark } from "./agent-mark";
import { CommandsGroup } from "./agent-commands-group";
import { CustomGroup, ModelGroup, QuickMenuGroup, SignalsGroup } from "./agent-settings-groups";
import "./agent-detail.css";

/**
 * The detail pane for one agent. Mounted with `key={agent.id}`, so every local
 * state below — an armed Remove, an open "More options", an undo offer — starts
 * clean when the selection changes.
 */
export function AgentDetail({
  agent,
  narrow,
}: {
  readonly agent: DemoAgent;
  readonly narrow: boolean;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const custom = agent.kind === "custom";

  // Narrow: choosing a row replaced the list, so the heading is where the user now is.
  /* oxlint-disable react-hooks/exhaustive-deps -- mount-only: the detail is keyed by agent, so each selection mounts a fresh one */
  useEffect(() => {
    if (narrow) titleRef.current?.focus();
  }, []);

  const afterRemove = (): void => {
    selectedAgentId.value = null;
    closeDetail(settings.value.agents.find((candidate) => candidate.installed)?.id ?? ADD_ROW_ID);
  };

  return (
    <div class="srd-agents-detail__body">
      <header class="srd-agents-detail__head">
        <AgentMark agent={agent} />
        <div class="srd-agents-detail__id">
          <h3 ref={titleRef} tabIndex={-1} class="srd-agents-detail__title">
            {agent.label}
          </h3>
          <span class="srd-agents-detail__cmd">{effectiveCommand(agent)}</span>
        </div>
        <div class="srd-agents-detail__ctl">
          {!custom && agentModified(agent.id) && (
            <ResetButton label={agent.label} onReset={() => resetAgent(agent.id)} />
          )}
          <span
            class="srd-agents-detail__pickers"
            title="Hidden agents stay set up but leave Quick Launch and the checkout menu"
          >
            Show in pickers
          </span>
          <Switch
            label={`Show ${agent.label} in pickers`}
            checked={agent.enabled}
            onChange={(enabled) => updateAgent(agent.id, { enabled })}
          />
        </div>
      </header>
      {!agent.installed && (
        <p class="srd-agents-note">
          Not on your PATH — install it, then Refresh. You can set it up now.
        </p>
      )}
      <CommandsGroup agent={agent} />
      {custom ? (
        <CustomGroup agent={agent} onRemoved={afterRemove} />
      ) : (
        <>
          {(agent.models.length > 0 || agent.efforts !== null) && <ModelGroup agent={agent} />}
          {agent.signals !== null && <SignalsGroup agent={agent} />}
        </>
      )}
      <QuickMenuGroup agent={agent} />
    </div>
  );
}
