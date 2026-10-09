import { useEffect } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { Check, SquaresFour } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import { Action, ResetButton } from "../../settings-redesign/primitives";
import { allChanges, regionChanges, resetChanges, subChanges, type Change } from "./canvas-changes";
import { itemLink, pointerForKey } from "./canvas-link";
import {
  REGIONS,
  REGION_ORDER,
  WHOLE_SUBS,
  goToSetting,
  selectRegion,
  selectedRegion,
  type RegionId,
  type WholeSub,
} from "./canvas-regions";

/*
 * What differs from default, as the inspector shows it: the head over a panel
 * (region name, a count, a two-press reset), the tray of changed settings under
 * it, and the overview of every change when no region is selected.
 */

const ARMED_MS = 4000;

export function ResetChanges({
  changes,
  label = "Reset",
}: {
  readonly changes: readonly Change[];
  readonly label?: string;
}) {
  const armed = useSignal(false);
  const count = changes.length;
  // The changes vanish once reset; a stale armed state must not carry over to the next set.
  useEffect(() => {
    if (!armed.value) return;
    if (count === 0) {
      armed.value = false;
      return;
    }
    const timer = setTimeout(() => {
      armed.value = false;
    }, ARMED_MS);
    return () => clearTimeout(timer);
  }, [armed.value, count]);

  return (
    <Action
      danger={armed.value}
      label={`${label} ${changes.length} changed settings`}
      onClick={() => {
        if (armed.value) {
          resetChanges(changes);
          armed.value = false;
          return;
        }
        armed.value = true;
      }}
    >
      {armed.value ? `Reset ${changes.length}?` : label}
    </Action>
  );
}

function changePointer(change: Change) {
  return change.id.startsWith("agent:")
    ? { region: change.region, part: change.id }
    : pointerForKey(change.key);
}

function openChange(change: Change): void {
  if (change.id.startsWith("agent:")) selectRegion("agents", change.id);
  else goToSetting(change.key);
}

// ── head ───────────────────────────────────────────────────────────────────

function panelTitle(region: RegionId | null, sub: WholeSub | null): string {
  if (region === null) return "Overview";
  if (region === "whole" && sub !== null) return WHOLE_SUBS.find((s) => s.id === sub)?.label ?? "";
  return REGIONS[region].label;
}

function changesFor(region: RegionId | null, sub: WholeSub | null): readonly Change[] {
  if (region === null) return allChanges();
  if (region === "whole" && sub !== null) return subChanges(sub);
  return regionChanges(region);
}

export function Head({
  region,
  sub,
}: {
  readonly region: RegionId | null;
  readonly sub: WholeSub | null;
}) {
  const changes = changesFor(region, sub);
  const icon =
    region === null
      ? SquaresFour
      : region === "whole" && sub !== null
        ? (WHOLE_SUBS.find((s) => s.id === sub)?.icon ?? REGIONS.whole.icon)
        : REGIONS[region].icon;
  return (
    <header class="cv-head">
      {region !== null && (
        <button
          type="button"
          class="cv-iconbtn"
          title="Overview"
          aria-label="Overview of every change"
          onClick={() => {
            selectedRegion.value = null;
          }}
        >
          <DeckIcon icon={SquaresFour} size={ROW_ICON} />
        </button>
      )}
      <h2 class="cv-head__title">
        <DeckIcon icon={icon} size={ROW_ICON} />
        {panelTitle(region, sub)}
      </h2>
      {changes.length > 0 && (
        <div class="cv-head__changed">
          <span class="srd-dot" aria-hidden="true" />
          <span title={`${changes.length} changed`}>
            {changes.length}
            <span class="cv-head__word"> changed</span>
          </span>
          <ResetChanges changes={changes} label={region === null ? "Reset all" : "Reset"} />
        </div>
      )}
    </header>
  );
}

// ── changes ────────────────────────────────────────────────────────────────

function ChangeRow({ change }: { readonly change: Change }) {
  return (
    <li class="cv-change" {...itemLink(changePointer(change))}>
      <button type="button" class="cv-change__open" onClick={() => openChange(change)}>
        <span class="cv-change__label">{change.label}</span>
        <span class="cv-change__value">{change.value}</span>
      </button>
      <ResetButton label={change.label} onReset={change.reset} />
    </li>
  );
}

/** The selected region's changes, as a tray under the head. */
export function ChangeTray({
  region,
  sub,
}: {
  readonly region: RegionId;
  readonly sub: WholeSub | null;
}) {
  const changes = changesFor(region, sub);
  if (changes.length === 0) return null;
  return (
    <ul class="cv-tray" aria-label="Changed settings">
      {changes.map((change) => (
        <ChangeRow key={change.id} change={change} />
      ))}
    </ul>
  );
}

export function Overview() {
  const changes = allChanges();
  if (changes.length === 0) {
    return (
      <p class="cv-empty">
        <DeckIcon icon={Check} size={ROW_ICON} />
        Everything is at its default
      </p>
    );
  }
  return (
    <div class="cv-overview">
      {REGION_ORDER.map((region) => {
        const mine = changes.filter((change) => change.region === region);
        if (mine.length === 0) return null;
        return (
          <section key={region} class="cv-overview__group" aria-label={REGIONS[region].label}>
            <h3 class="cv-overview__head">
              <DeckIcon icon={REGIONS[region].icon} size={ROW_ICON} />
              {REGIONS[region].label}
              <ResetChanges changes={mine} />
            </h3>
            <ul class="cv-tray is-list">
              {mine.map((change) => (
                <ChangeRow key={change.id} change={change} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
