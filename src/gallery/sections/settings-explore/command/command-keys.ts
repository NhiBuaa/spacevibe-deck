import { leaveScope, query, scope } from "./command-state";

/*
 * Command direction: the keyboard. The field keeps real focus while one row is "active" (a
 * data attribute, so the shared agent and page rows take part without being rewritten).
 * Up and Down move the active row, Enter or an empty-field Space acts on it, Tab hands real
 * focus to its control, Escape walks back out: control, then query, then scope.
 */

export const NAV_SELECTOR = "[data-cmd-row], .cmd-nav .cfg-row, .cmd-nav .srd-agents-cmdrow";

/** Where Tab lands inside a row: the control a person would have aimed at. */
const ENTER_ORDER: readonly string[] = [
  '[role="radio"][aria-checked="true"]',
  '[aria-label^="Increase"]:not(:disabled)',
  "input:not(:disabled)",
  ".srd-menu__trigger:not(:disabled)",
  ".cfg-chord",
  '[role="switch"]:not(:disabled)',
  "button:not(:disabled):not(.srd-reset):not([data-cmd-open])",
  "[data-cmd-open]",
];

const REVEAL_MARGIN = 10;
let sequence = 0;

function visible(el: HTMLElement): boolean {
  return el.closest("[hidden]") === null && el.getClientRects().length > 0;
}

export function navItems(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(NAV_SELECTOR)].filter(visible);
}

export function activeItem(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-active="true"]');
}

/** Scroll the results region, never the page the gallery lives in. */
function reveal(root: HTMLElement, el: HTMLElement): void {
  const scroller = root.querySelector<HTMLElement>(".cmd-scroll");
  if (scroller === null) return;
  const row = el.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  if (row.top < box.top + REVEAL_MARGIN) scroller.scrollTop -= box.top + REVEAL_MARGIN - row.top;
  else if (row.bottom > box.bottom - REVEAL_MARGIN)
    scroller.scrollTop += row.bottom - (box.bottom - REVEAL_MARGIN);
}

export function setActive(root: HTMLElement, el: HTMLElement | null, scroll = true): void {
  for (const old of root.querySelectorAll("[data-active]")) old.removeAttribute("data-active");
  const input = root.querySelector<HTMLInputElement>(".cmd-input");
  if (el === null) {
    input?.removeAttribute("aria-activedescendant");
    return;
  }
  el.setAttribute("data-active", "true");
  if (el.id === "") el.id = `cmd-nav-${(sequence += 1)}`;
  input?.setAttribute("aria-activedescendant", el.id);
  if (scroll) reveal(root, el);
}

/** Give the keyboard back to the field of the frame that holds `from`. */
export function focusFieldFrom(from: Element | null): void {
  from
    ?.closest(".cmd-frame")
    ?.querySelector<HTMLInputElement>(".cmd-input")
    ?.focus({ preventScroll: true });
}

/** Make a row active by its element id (a "show me the conflict" link). */
export function activateRow(id: string): void {
  const row = document.getElementById(id);
  const root = row?.closest<HTMLElement>(".cmd-frame");
  if (row !== null && row !== undefined && root !== null && root !== undefined) {
    setActive(root, row);
    root.querySelector<HTMLInputElement>(".cmd-input")?.focus({ preventScroll: true });
  }
}

function moveActive(root: HTMLElement, delta: number): void {
  const items = navItems(root);
  if (items.length === 0) return;
  const from = items.findIndex((item) => item === activeItem(root));
  setActive(root, items[Math.min(items.length - 1, Math.max(0, from + delta))]);
}

/** Real focus into the row's control. Returns false when the row has none. */
export function enterControl(row: HTMLElement): boolean {
  for (const selector of ENTER_ORDER) {
    const control = row.querySelector<HTMLElement>(selector);
    if (control !== null) {
      control.focus({ preventScroll: true });
      return true;
    }
  }
  return false;
}

/** Enter on a row: open it, flip its switch, open its menu, or step inside it. */
export function actOn(row: HTMLElement): void {
  const opener = row.querySelector<HTMLElement>("[data-cmd-open]");
  const toggle = row.querySelector<HTMLElement>('[role="switch"]');
  const menu = row.querySelector<HTMLElement>(".srd-menu__trigger:not(:disabled)");
  if (opener !== null) opener.click();
  else if (toggle !== null) {
    if (!toggle.matches(":disabled")) toggle.click();
  } else if (menu !== null) menu.click();
  else if (row.classList.contains("srd-agents-cmdrow"))
    row.querySelector<HTMLElement>('[role="radio"]')?.click();
  else enterControl(row);
}

/** Pointer or focus landing on a row makes it the active one, without scrolling. */
export function syncActive(event: Event, root: HTMLElement): void {
  const row = (event.target as HTMLElement).closest<HTMLElement>(NAV_SELECTOR);
  if (row !== null && row !== activeItem(root)) setActive(root, row, false);
}

function onEscape(event: KeyboardEvent, field: HTMLInputElement): void {
  // CommitInput, menus and the chord recorder claim their own Escape first.
  if (event.defaultPrevented) return;
  const target = event.target as HTMLElement;
  if (target !== field) {
    if (target.closest(".cmd-scroll") === null) return;
    event.preventDefault();
    field.focus({ preventScroll: true });
    return;
  }
  if (query.value !== "") {
    event.preventDefault();
    query.value = "";
  } else if (scope.value !== null) {
    event.preventDefault();
    leaveScope();
  }
  // Otherwise it bubbles: in the real app a second Escape leaves Settings.
}

function onFieldKey(event: KeyboardEvent, root: HTMLElement, field: HTMLInputElement): void {
  const row = activeItem(root);
  switch (event.key) {
    case "ArrowDown":
    case "ArrowUp":
      event.preventDefault();
      moveActive(root, event.key === "ArrowDown" ? 1 : -1);
      return;
    case "Enter":
      if (row === null) return;
      event.preventDefault();
      actOn(row);
      return;
    case "Tab":
      if (!event.shiftKey && row !== null && enterControl(row)) event.preventDefault();
      return;
    case " ":
      // A space is part of a query ("font size"); it only acts while the field is empty.
      if (field.value !== "" || row === null) return;
      event.preventDefault();
      actOn(row);
      return;
    case "Backspace":
      if (field.value !== "" || scope.value === null) return;
      event.preventDefault();
      leaveScope();
      return;
  }
}

/** A letter typed while focus sits on a control goes back to the field, like Spotlight. */
function typeThrough(event: KeyboardEvent, field: HTMLInputElement): void {
  const target = event.target as HTMLElement;
  const printable =
    event.key.length === 1 &&
    event.key !== " " &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey;
  const typing = target.matches("input, textarea, select, [contenteditable]");
  if (printable && !typing && target.closest('[role="listbox"]') === null)
    field.focus({ preventScroll: true });
}

export function handleKeyDown(
  event: KeyboardEvent,
  root: HTMLElement,
  field: HTMLInputElement,
): void {
  const plain = !event.shiftKey && !event.altKey;
  if ((event.metaKey || event.ctrlKey) && plain && event.key.toLowerCase() === "f") {
    event.preventDefault();
    field.focus({ preventScroll: true });
    field.select();
    return;
  }
  if (event.key === "Escape") onEscape(event, field);
  else if (event.target === field) onFieldKey(event, root, field);
  else if ((event.target as HTMLElement).closest(".cmd-scroll") !== null) typeThrough(event, field);
}
