import type { RefObject } from "preact";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import {
  isModified,
  pageInfo,
  searchSettings,
  windowsHost,
  type SettingEntry,
} from "../../settings-redesign/model";
import { AREA_ICON } from "./control-areas";
import { valueText } from "./control-changes";
import { jumpToSetting, query } from "./control-nav";

/*
 * Search is a field in the header; while it holds a query the body is the
 * list of hits. A hit says where it lives and what it is set to now, and
 * opening it lands on the row in its own area, highlighted.
 */

const RESULTS_ID = "ctl-results";

export function SearchField({ inputRef }: { readonly inputRef: RefObject<HTMLInputElement> }) {
  const text = query.value;
  const hint = windowsHost.value ? "Ctrl+F" : "⌘F";

  const onKeyDown = (event: KeyboardEvent): void => {
    const input = event.currentTarget as HTMLInputElement;
    if (event.key === "Escape") {
      if (text === "") {
        input.blur();
        return;
      }
      event.preventDefault();
      query.value = "";
      return;
    }
    if (text.trim() === "") return;
    if (event.key === "Enter") {
      const [first] = searchSettings(text);
      if (first !== undefined) jumpToSetting(first.key);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      document.getElementById(RESULTS_ID)?.querySelector<HTMLElement>(".ctl-hit")?.focus();
    }
  };

  return (
    <label class="ctl-search" title={`Search settings (${hint})`}>
      <DeckIcon icon={MagnifyingGlass} size={ROW_ICON} />
      <input
        ref={inputRef}
        type="search"
        value={text}
        placeholder="Search settings"
        aria-label="Search settings"
        aria-controls={text.trim() === "" ? undefined : RESULTS_ID}
        autocomplete="off"
        spellcheck={false}
        onInput={(event) => {
          query.value = event.currentTarget.value;
        }}
        onKeyDown={onKeyDown}
      />
    </label>
  );
}

function pathOf(hit: SettingEntry): string {
  const area = pageInfo(hit.page).label;
  return hit.group === area ? area : `${area} · ${hit.group}`;
}

export function SearchResults({ inputRef }: { readonly inputRef: RefObject<HTMLInputElement> }) {
  const hits = searchSettings(query.value);
  if (hits.length === 0) {
    return (
      <p id={RESULTS_ID} class="ctl-empty" role="status">
        No setting matches
      </p>
    );
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      query.value = "";
      inputRef.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [
      ...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(".ctl-hit"),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowUp" && index <= 0) inputRef.current?.focus();
    else
      buttons[Math.min(index + (event.key === "ArrowDown" ? 1 : -1), buttons.length - 1)]?.focus();
  };

  return (
    <div
      id={RESULTS_ID}
      class="ctl-results"
      role="group"
      aria-label="Search results"
      onKeyDown={onKeyDown}
    >
      {hits.map((hit) => (
        <button key={hit.key} type="button" class="ctl-hit" onClick={() => jumpToSetting(hit.key)}>
          <span class="ctl-hit__icon">
            <DeckIcon icon={AREA_ICON[hit.page]} size={ROW_ICON} />
          </span>
          <span class="ctl-hit__text">
            <span class="ctl-hit__label">
              {hit.label}
              {isModified(hit.key) && <span class="ctl-dot" title="Changed from default" />}
            </span>
            <span class="ctl-hit__path">{pathOf(hit)}</span>
          </span>
          <span class="ctl-hit__value">{valueText(hit.key)}</span>
        </button>
      ))}
    </div>
  );
}
