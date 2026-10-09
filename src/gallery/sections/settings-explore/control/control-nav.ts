import { signal } from "@preact/signals";
import {
  focusTarget,
  registryEntry,
  type PageId,
  type SettingKey,
} from "../../settings-redesign/model";
import { selectAgent } from "../../settings-redesign/agents-state";

/*
 * Control center navigation: one signal says which screen is up. The Overview
 * is home; an area page and the changed list are one step down, and every
 * route back is the same `goOverview`.
 */

export type ControlView =
  | { readonly kind: "overview" }
  | { readonly kind: "changed" }
  | { readonly kind: "area"; readonly page: PageId };

/** Where a health tile or a verdict chip leads: the place that fixes it. */
export type Destination =
  | { readonly kind: "changed" }
  | { readonly kind: "area"; readonly page: PageId; readonly agentId?: string };

export const view = signal<ControlView>({ kind: "overview" });
export const query = signal("");

/*
 * Focus follows the screen. Opening something unmounts the control that was
 * pressed, so without help keyboard focus falls to the page and the next Tab
 * starts over. Controls that open a screen carry `data-ctl-focus-id`; a
 * screen's heading carries `data-ctl-heading`.
 *
 * - Opening from the Overview remembers which control did it (`opener`), and
 *   coming back to the Overview focuses that same control again.
 * - Moving between areas by the sibling chips keeps focus on the chip.
 * - Anything else lands on the new screen's heading.
 */
let opener: string | null = null;
let pendingFocus: string | null = null;

const focusIdOf = (element: Element | null): string | null =>
  element?.closest<HTMLElement>("[data-ctl-focus-id]")?.dataset.ctlFocusId ?? null;

function go(next: ControlView): void {
  const from = focusIdOf(document.activeElement);
  if (view.value.kind === "overview" && next.kind !== "overview") opener = from;
  pendingFocus = next.kind === "overview" ? opener : from;
  query.value = "";
  view.value = next;
}

/** The id of the control that should hold focus on the screen that just mounted, once. */
export function takePendingFocus(): string | null {
  const id = pendingFocus;
  pendingFocus = null;
  return id;
}

/** Put focus on the current screen's heading, after the control that held it has gone. */
export function focusHeading(): void {
  requestAnimationFrame(() =>
    document
      .querySelector<HTMLElement>(".ctl-frame [data-ctl-heading]")
      ?.focus({ preventScroll: true }),
  );
}

export function goOverview(): void {
  go({ kind: "overview" });
}

export function openArea(page: PageId): void {
  go({ kind: "area", page });
}

export function openDestination(destination: Destination): void {
  if (destination.kind === "changed") {
    go({ kind: "changed" });
    return;
  }
  if (destination.agentId !== undefined) selectAgent(destination.agentId);
  openArea(destination.page);
}

/**
 * A search hit: the view changes first, so the target row mounts into a page
 * that already knows where it is, then the row finds `focusTarget` and flashes.
 */
export function jumpToSetting(key: SettingKey): void {
  openArea(registryEntry(key).page);
  pendingFocus = null;
  focusTarget.value = { key, nonce: Date.now() };
}
