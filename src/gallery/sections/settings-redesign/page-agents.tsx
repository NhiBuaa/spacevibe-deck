import { CaretLeft } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../ui/controls/deck-icon";
import { anchorId, frameSize, settings } from "./model";
import { PageIntro } from "./primitives";
import { AgentAddForm } from "./agent-add-form";
import { AgentDetail } from "./agent-detail";
import { AgentsList } from "./agents-list";
import { PromptTemplatesGroup } from "./prompt-templates-group";
import { ADD_ROW_ID, addingAgent, closeDetail, detailOpen, selectedAgent } from "./agents-state";
import { useJumpTarget } from "./use-jump-target";
import "./page-agents.css";

/*
 * Agents: a master–detail surface (list left, the selected agent's settings
 * right), then Prompt templates. Narrow, the two take turns: choosing a row
 * shows its detail full width under a "← Agents" back button.
 */

function AgentsSurface() {
  const narrow = frameSize.value === "narrow";
  const adding = addingAgent.value;
  const agent = selectedAgent(settings.value);
  const { ref, flash } = useJumpTarget<HTMLElement>("agents", '[data-srd-nav][tabindex="0"]');

  return (
    <section
      id={anchorId("agents")}
      ref={ref}
      aria-label="Agents"
      class={`srd-agents ${narrow ? "is-narrow" : ""} ${flash ? "is-flash" : ""}`}
    >
      {(!narrow || !detailOpen.value) && <AgentsList />}
      {(!narrow || detailOpen.value) && (
        <div class="srd-agents-detail">
          {narrow && (
            <button
              type="button"
              class="srd-agents-back"
              onClick={() => closeDetail(adding ? ADD_ROW_ID : (agent?.id ?? ADD_ROW_ID))}
            >
              <DeckIcon icon={CaretLeft} size={ROW_ICON} />
              Agents
            </button>
          )}
          {adding ? (
            <AgentAddForm />
          ) : agent !== undefined ? (
            <AgentDetail key={agent.id} agent={agent} narrow={narrow} />
          ) : (
            <p class="srd-agents-empty">No agents</p>
          )}
        </div>
      )}
    </section>
  );
}

export function AgentsPage() {
  return (
    <>
      <PageIntro page="agents" />
      <AgentsSurface />
      <PromptTemplatesGroup />
    </>
  );
}
