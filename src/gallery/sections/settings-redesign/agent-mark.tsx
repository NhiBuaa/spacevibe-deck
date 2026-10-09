import { AgentGlyph } from "../../../ui/controls/agent-glyph";
import { letterAvatar } from "../../../lib/letter-avatar";
import type { DemoAgent } from "./model";

/**
 * The agent's brand mark. A custom agent never takes a brand mark, even when
 * its name happens to match a logo key; it wears its own first letter.
 */
export function AgentMark({ agent }: { readonly agent: DemoAgent }) {
  if (agent.kind === "builtin") return <AgentGlyph agent={agent.id} className="srd-agents-mark" />;
  return (
    <span class="srd-agents-mark srd-agents-mark--letter" aria-hidden="true">
      {letterAvatar(agent.label, agent.id).letter}
    </span>
  );
}
