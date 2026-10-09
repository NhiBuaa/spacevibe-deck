import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import { allChanges } from "./canvas-changes";
import { rovingKeyDown } from "./canvas-keys";
import { itemLink } from "./canvas-link";
import {
  REGIONS,
  REGION_ORDER,
  openWhole,
  selectRegion,
  selectedRegion,
  wholeSub,
} from "./canvas-regions";

/*
 * Narrow frames: the miniature is a thumbnail, so the same regions are chips
 * you tap. Same selection, same changed dots, and pointing at a chip lights
 * its region in the thumbnail.
 */

const CHIP = ".cv-chip";

export function RegionChips() {
  const selected = selectedRegion.value;
  const changed = new Set(allChanges().map((change) => change.region));
  return (
    <nav
      class="cv-chips"
      aria-label="Parts of Deck"
      onKeyDown={(event) => rovingKeyDown(event, CHIP)}
    >
      {REGION_ORDER.map((region) => {
        const meta = REGIONS[region];
        const active = selected === region;
        return (
          <button
            key={region}
            type="button"
            class={`cv-chip ${active ? "is-selected" : ""}`}
            aria-current={active ? "true" : undefined}
            aria-label={changed.has(region) ? `${meta.label}, changed` : meta.label}
            title={meta.label}
            tabIndex={active || (selected === null && region === REGION_ORDER[0]) ? 0 : -1}
            onClick={() => (region === "whole" ? openWhole(wholeSub.value) : selectRegion(region))}
            {...itemLink({ region })}
          >
            <DeckIcon icon={meta.icon} size={ROW_ICON} />
            {meta.short}
            {changed.has(region) && <span class="cv-chip__dot" aria-hidden="true" />}
          </button>
        );
      })}
    </nav>
  );
}
