import type { SettingKey } from "../../settings-redesign/model";
import { KEY_TARGET, focusLink, hoverLink, type Pointer } from "./canvas-regions";

/*
 * Inspector to miniature: pointing at or focusing a control lights the part of
 * Deck it changes. A row that carries a setting id (`SettingRow` and the colour
 * cards do) resolves through the key table; anything else lights the panel's own
 * fallback, such as the selected agent.
 */

const ROW_ID_PREFIX = "srd-setting-";

function pointerOf(target: EventTarget | null, fallback: Pointer): Pointer {
  const row = (target as Element | null)?.closest<HTMLElement>(`[id^="${ROW_ID_PREFIX}"]`);
  const key = row?.id.slice(ROW_ID_PREFIX.length) as SettingKey | undefined;
  // The roster's own root carries the `agents` id; the panel names the agent itself.
  if (key === undefined || key === "agents" || !(key in KEY_TARGET)) return fallback;
  const { region, part } = KEY_TARGET[key];
  return { region, part };
}

/** Spread these on a panel root; they only read, so they cost the controls nothing. */
export function linkEvents(fallback: Pointer) {
  return {
    onPointerOver: (event: PointerEvent) => {
      hoverLink.value = pointerOf(event.target, fallback);
    },
    onPointerLeave: () => {
      hoverLink.value = null;
    },
    onFocusIn: (event: FocusEvent) => {
      focusLink.value = pointerOf(event.target, fallback);
    },
    onFocusOut: (event: FocusEvent) => {
      const root = event.currentTarget as HTMLElement;
      if (!root.contains(event.relatedTarget as Node | null)) focusLink.value = null;
    },
  };
}

/** The pointer an item such as a result or a change points at. */
export function pointerForKey(key: SettingKey): Pointer {
  const { region, part } = KEY_TARGET[key];
  return { region, part };
}

/** Hover and focus handlers for a list item that stands for one region (a hit, a chip). */
export function itemLink(pointer: Pointer) {
  return {
    onPointerEnter: () => {
      hoverLink.value = pointer;
    },
    onPointerLeave: () => {
      hoverLink.value = null;
    },
    onFocus: () => {
      focusLink.value = pointer;
    },
    onBlur: () => {
      focusLink.value = null;
    },
  };
}
