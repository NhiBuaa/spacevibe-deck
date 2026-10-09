import type { ComponentChildren } from "preact";
import { CHROME_ICON, DeckIcon } from "../../../../ui/controls/deck-icon";
import { selectedAgent } from "../../settings-redesign/agents-state";
import { settings } from "../../settings-redesign/model";
import {
  REGIONS,
  focusAt,
  hot,
  isLit,
  isPartLit,
  pointerAt,
  selectedRegion,
  tabStop,
  type RegionId,
} from "./canvas-regions";

/*
 * A region of the miniature. Each region is a positioned box that holds one
 * transparent button covering it (the keyboard and pointer handle) and its
 * drawing on top. The drawing ignores the pointer, so a click always lands on
 * the deepest region under it, and nested regions are siblings of each other's
 * buttons instead of buttons inside buttons.
 */

export interface RegionProps {
  readonly region: RegionId;
  /** Unique per element: a region can be drawn more than once (two panes). */
  readonly instance: string;
  /** Which piece of the region this element is (an agent row names its agent). */
  readonly part?: string;
  /** Tooltip and accessible name; defaults to the region's own. */
  readonly label?: string;
  /** False in the narrow thumbnail: drawn, lit and selected, but not a control. */
  readonly interactive: boolean;
  /** `in`: inside the region's top-left corner. `above`: just over its top edge. */
  readonly tip?: "in" | "above";
  /** Drawn as an empty slot: the thing is off, the region stays selectable. */
  readonly ghost?: boolean;
  /** Draws the changed dot. */
  readonly changed?: boolean;
  readonly class?: string;
  /** Custom properties for the drawing under this region. */
  readonly style?: Readonly<Record<string, string>>;
  readonly children?: ComponentChildren;
}

function isSelected(region: RegionId, part: string | undefined): boolean {
  if (selectedRegion.value !== region) return false;
  if (region !== "agents" || part === undefined) return true;
  return part === `agent:${selectedAgent(settings.value)?.id ?? ""}`;
}

export function Region({
  region,
  instance,
  part,
  label,
  interactive,
  tip = "in",
  ghost = false,
  changed = false,
  class: className = "",
  style,
  children,
}: RegionProps) {
  const lit = isLit(hot.value, region, part);
  const selected = isSelected(region, part);
  const meta = REGIONS[region];
  const name = label ?? meta.label;
  const showTip =
    interactive && (pointerAt.value?.instance === instance || focusAt.value?.instance === instance);
  const state = `${lit ? "is-lit" : ""} ${selected ? "is-selected" : ""} ${ghost ? "is-ghost" : ""}`;

  return (
    <div class={`cv-region ${className} ${state}`} data-cv-kind={region} style={style}>
      {interactive && (
        <button
          type="button"
          class="cv-hit"
          data-cv-region={region}
          data-cv-instance={instance}
          data-cv-part={part}
          aria-label={changed ? `${name}, changed` : name}
          aria-current={selected ? "true" : undefined}
          tabIndex={tabStop.value === instance ? 0 : -1}
        />
      )}
      {children}
      {changed && <span class="cv-dot" aria-hidden="true" />}
      {showTip && (
        <span class={`cv-tip is-${tip}`} aria-hidden="true">
          <DeckIcon icon={meta.icon} size={CHROME_ICON} />
          {name}
          {changed && <span class="cv-tip__changed">changed</span>}
        </span>
      )}
    </div>
  );
}

/** A piece inside a region that an inspector control can single out (the cursor, the logo). */
export function Part({
  region,
  id,
  class: className = "",
  children,
}: {
  readonly region: RegionId;
  readonly id: string;
  readonly class?: string;
  readonly children?: ComponentChildren;
}) {
  const lit = isPartLit(hot.value, region, id);
  return <span class={`cv-part ${className} ${lit ? "is-linked" : ""}`}>{children}</span>;
}
