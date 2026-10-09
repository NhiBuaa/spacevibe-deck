import { loadMode } from "../../settings-redesign/model";
import { AgentsPage } from "../../settings-redesign/page-agents";
import { healthTiles, type HealthTile } from "./control-health";
import { focusHeading } from "./control-nav";
import { ToneIcon } from "./control-parts";

/** One live fact about the area, with the fix beside it when something is wrong. */
function Fact({ tile }: { readonly tile: HealthTile }) {
  return (
    <li class={`ctl-fact is-${tile.tone}`}>
      <ToneIcon tone={tile.tone} />
      <span class="ctl-fact__label">{tile.label}</span>
      <span class="ctl-fact__value">{tile.fact}</span>
      {tile.detail !== "" && <span class="ctl-fact__detail">{tile.detail}</span>}
      {tile.fix !== undefined && (
        <button
          type="button"
          class="ctl-health__fix"
          onClick={() => {
            tile.fix?.run();
            focusHeading();
          }}
        >
          {tile.fix.label}
        </button>
      )}
    </li>
  );
}

/**
 * Agents opens on its own health (what is installed, are signals reporting),
 * then the master–detail where each agent is set up.
 */
export function AgentsArea() {
  const facts = healthTiles().filter((tile) => tile.id === "agents" || tile.id === "signals");
  return (
    <>
      <ul class="ctl-facts" aria-label="Agent health" aria-busy={loadMode.value === "loading"}>
        {facts.map((tile) => (
          <Fact key={tile.id} tile={tile} />
        ))}
      </ul>
      <AgentsPage />
    </>
  );
}
