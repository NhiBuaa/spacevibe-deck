import { loadMode, settings } from "../../settings-redesign/model";
import { AreaCards } from "./control-areas";
import { healthTiles, problems, type HealthTile, type Tone } from "./control-health";
import { openDestination } from "./control-nav";
import { QuickControls } from "./control-quick";
import { ToneIcon, toneWord } from "./control-parts";
import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import "./control-overview.css";

function HealthCell({ tile }: { readonly tile: HealthTile }) {
  const spoken = [tile.label, tile.fact, tile.detail, toneWord(tile.tone)]
    .filter((part) => part !== "")
    .join(", ");
  return (
    <li class={`ctl-health is-${tile.tone}`}>
      <button
        type="button"
        class="ctl-health__open"
        data-ctl-focus-id={`tile:${tile.id}`}
        aria-label={spoken}
        onClick={() => openDestination(tile.to)}
      >
        <span class="ctl-health__top">
          <DeckIcon icon={tile.icon} size={ROW_ICON} />
          <span class="ctl-health__label">{tile.label}</span>
          {tile.id === "changed" ? (
            <span class="ctl-dot" aria-hidden="true" />
          ) : (
            <ToneIcon tone={tile.tone} />
          )}
        </span>
        <span class="ctl-health__fact">{tile.fact}</span>
        <span class="ctl-health__detail">{tile.detail}</span>
      </button>
      {tile.fix !== undefined && (
        <button
          type="button"
          class="ctl-health__fix"
          aria-label={`${tile.fix.label}: ${tile.label}`}
          onClick={(event) => {
            const cell = event.currentTarget.closest("li");
            tile.fix?.run();
            // A fixed tile loses its button; focus goes to the tile's own open button.
            requestAnimationFrame(() =>
              cell?.querySelector<HTMLElement>(".ctl-health__open")?.focus({ preventScroll: true }),
            );
          }}
        >
          {tile.fix.label}
        </button>
      )}
    </li>
  );
}

function verdictTone(count: number, errors: number, loading: boolean): Tone {
  if (loading) return "idle";
  if (errors > 0) return "error";
  return count > 0 ? "warn" : "ok";
}

/** The answer first: how the whole setup is doing, and the way to each thing that is not fine. */
function Verdict({ tiles }: { readonly tiles: readonly HealthTile[] }) {
  const loading = loadMode.value === "loading";
  const list = loading ? [] : problems(tiles, settings.value);
  const tone = verdictTone(
    list.length,
    list.filter((item) => item.tone === "error").length,
    loading,
  );
  const heading = loading
    ? "Loading settings"
    : list.length === 0
      ? "All good"
      : `${list.length} ${list.length === 1 ? "needs" : "need"} attention`;
  return (
    <header class="ctl-verdict">
      <h2 class="ctl-verdict__title" tabIndex={-1} data-ctl-heading aria-live="polite">
        <ToneIcon tone={tone} size={16} />
        {heading}
      </h2>
      {list.length > 0 && (
        <ul class="ctl-verdict__list" aria-label="Needs attention">
          {list.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                class={`ctl-chip is-${item.tone}`}
                data-ctl-focus-id={`chip:${item.id}`}
                onClick={() => openDestination(item.to)}
              >
                <ToneIcon tone={item.tone} />
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </header>
  );
}

export function Overview() {
  const tiles = healthTiles();
  return (
    <div class="ctl-overview">
      <Verdict tiles={tiles} />
      <ul class="ctl-health-strip" aria-label="Health">
        {tiles.map((tile) => (
          <HealthCell key={tile.id} tile={tile} />
        ))}
      </ul>
      <QuickControls />
      <AreaCards />
    </div>
  );
}
