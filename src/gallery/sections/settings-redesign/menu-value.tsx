import { createPortal } from "preact/compat";
import { useSignal } from "@preact/signals";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { CaretDown, Check } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../ui/controls/deck-icon";
import type { ChoiceOption } from "./primitives";

/*
 * A Deck-drawn menu value: the pill opens the app's own popover rows
 * (`.toolbar-menu`, DL-13.1) instead of the OS `<select>` sheet, so a long
 * choice list reads in Deck's type, colours and radius — the proposal's
 * amendment to DL-6's `menu` kind. Listbox semantics: the pill is the
 * trigger, options are focusable rows, the selected one carries a check.
 *
 * The popover is portalled into the `.srd-frame` that holds the pill, so it
 * inherits the frame's theme tokens and is not clipped by a group's
 * `overflow: clip`; it is positioned against the frame and flips above the
 * pill when the frame has no room below.
 */

const MENU_GAP = 4;
const ROW_ESTIMATE = 30;

interface Placement {
  readonly top?: number;
  readonly bottom?: number;
  readonly right: number;
  readonly minWidth: number;
}

function place(trigger: HTMLElement, frame: HTMLElement, count: number): Placement {
  const pill = trigger.getBoundingClientRect();
  const box = frame.getBoundingClientRect();
  const right = box.right - pill.right;
  const minWidth = Math.max(pill.width, 168);
  const below = box.bottom - pill.bottom;
  return below >= count * ROW_ESTIMATE + 16
    ? { top: pill.bottom - box.top + MENU_GAP, right, minWidth }
    : { bottom: box.bottom - pill.top + MENU_GAP, right, minWidth };
}

export function MenuValue({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly ChoiceOption[];
  readonly onChange: (value: string) => void;
}) {
  const open = useSignal<Placement | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useRef(`srd-menu-${Math.random().toString(36).slice(2, 8)}`).current;
  const current = options.find((option) => option.value === value);

  const frame = (): HTMLElement | null =>
    triggerRef.current?.closest<HTMLElement>(".srd-frame") ?? null;

  const show = (): void => {
    const host = frame();
    if (triggerRef.current === null || host === null) return;
    open.value = place(triggerRef.current, host, options.length);
  };

  const close = (refocus: boolean): void => {
    open.value = null;
    if (refocus) triggerRef.current?.focus();
  };

  const rows = (): HTMLButtonElement[] =>
    Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]") ?? []);

  const isOpen = open.value !== null;

  /* oxlint-disable react-hooks/exhaustive-deps -- both effects key on open/closed only;
     `rows`, `frame` and `close` read refs and a signal, never stale render state */
  // Opening focuses the selected row, the way a native menu lands on the current value.
  useLayoutEffect(() => {
    if (!isOpen) return;
    const list = rows();
    (list.find((row) => row.getAttribute("aria-selected") === "true") ?? list[0])?.focus();
  }, [isOpen]);

  // A press outside, a scroll or a resize closes the menu; none of them steal focus back.
  useEffect(() => {
    if (!isOpen) return;
    const host = frame();
    const onPointer = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (!listRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        close(false);
      }
    };
    const onMove = (): void => close(false);
    document.addEventListener("pointerdown", onPointer, true);
    host?.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      host?.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [isOpen]);
  /* oxlint-enable react-hooks/exhaustive-deps */

  const onTriggerKey = (event: KeyboardEvent): void => {
    if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
      event.preventDefault();
      show();
    }
  };

  const onListKey = (event: KeyboardEvent): void => {
    const list = rows();
    const index = list.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (next: number): void => {
      list[(next + list.length) % list.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusAt(index + 1);
        return;
      case "ArrowUp":
        event.preventDefault();
        focusAt(index - 1);
        return;
      case "Home":
        event.preventDefault();
        focusAt(0);
        return;
      case "End":
        event.preventDefault();
        focusAt(list.length - 1);
        return;
      case "Escape":
        // The menu owns this Escape; the shell's search-clearing never sees it.
        event.preventDefault();
        event.stopPropagation();
        close(true);
        return;
      case "Tab":
        close(false);
        return;
      default:
        return;
    }
  };

  const host = open.value === null ? null : frame();
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        class="cfg-btn srd-menu__trigger"
        aria-label={`${label}: ${current?.label ?? value}`}
        aria-haspopup="listbox"
        aria-expanded={open.value !== null}
        aria-controls={open.value === null ? undefined : listId}
        onClick={() => (open.value === null ? show() : close(true))}
        onKeyDown={onTriggerKey}
      >
        <span class="cfg-btn__text">{current?.label ?? value}</span>
        <span class="cfg-btn__hint">
          <DeckIcon icon={CaretDown} size={ROW_ICON} />
        </span>
      </button>
      {open.value !== null &&
        host !== null &&
        createPortal(
          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label={label}
            class="toolbar-menu srd-menu"
            style={{
              top: open.value.top,
              bottom: open.value.bottom,
              right: open.value.right,
              minWidth: open.value.minWidth,
            }}
            onKeyDown={onListKey}
          >
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  class={`toolbar-menu__row srd-menu__row ${selected ? "is-selected" : ""}`}
                  onClick={() => {
                    if (!selected) onChange(option.value);
                    close(true);
                  }}
                >
                  <span class="srd-menu__check" aria-hidden="true">
                    {selected && <DeckIcon icon={Check} size={ROW_ICON} />}
                  </span>
                  <span class="toolbar-menu__label">{option.label}</span>
                </button>
              );
            })}
          </div>,
          host,
        )}
    </>
  );
}
