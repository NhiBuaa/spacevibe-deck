import { signal } from "@preact/signals";
import { SectionHead } from "../../specimen";
import { DemoToolbar } from "../settings-redesign/demo-toolbar";
import { settings, update } from "../settings-redesign/model";
import { DIRECTIONS, directionById, type DirectionId } from "./directions";
import "../settings-redesign/settings-redesign.css";
import "../settings-redesign/settings-redesign-demo.css";
import "../settings-redesign/settings-redesign-rail.css";
import "./settings-explore.css";

/** `?direction=canvas&mode=light` opens a direction directly, for review links and screenshots. */
function initialDirection(): DirectionId {
  const asked = new URLSearchParams(window.location.search).get("direction");
  return DIRECTIONS.some((direction) => direction.id === asked)
    ? (asked as DirectionId)
    : "command";
}

const activeDirection = signal<DirectionId>(initialDirection());

function applyInitialMode(): void {
  const mode = new URLSearchParams(window.location.search).get("mode");
  if (mode === "light" || mode === "dark") update({ colorMode: mode });
}
applyInitialMode();

export function SettingsExploreSection() {
  const current = directionById(activeDirection.value);
  const Frame = current.Frame;
  return (
    <div class="srd-stage sx-stage">
      <SectionHead
        title="Settings · exploration round"
        blurb="Three divergent directions on the same in-memory settings. Pick by eye; nothing here is saved."
      />
      <div class="sx-picker" role="radiogroup" aria-label="Direction">
        {DIRECTIONS.map((direction) => (
          <button
            key={direction.id}
            type="button"
            role="radio"
            aria-checked={direction.id === current.id}
            class={`sx-picker__option ${direction.id === current.id ? "is-selected" : ""}`}
            onClick={() => {
              activeDirection.value = direction.id;
            }}
          >
            {direction.label}
          </button>
        ))}
        <button
          type="button"
          class="sx-picker__mode"
          onClick={() =>
            update({ colorMode: settings.value.colorMode === "light" ? "dark" : "light" })
          }
        >
          {settings.value.colorMode === "light" ? "Dark" : "Light"}
        </button>
      </div>
      <p class="sx-thesis">{current.thesis}</p>
      {current.replaces.length > 0 && (
        <p class="sx-replaces">Replaces: {current.replaces.join(" · ")}</p>
      )}
      {current.invariants.length > 0 && (
        <p class="sx-replaces">Bends invariants: {current.invariants.join(" · ")}</p>
      )}
      <DemoToolbar />
      <Frame />
    </div>
  );
}
