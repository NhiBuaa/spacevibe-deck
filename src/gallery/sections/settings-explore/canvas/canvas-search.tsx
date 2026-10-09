import type { RefObject } from "preact";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import {
  isModified,
  registryEntry,
  searchSettings,
  settings,
  windowsHost,
  type SettingEntry,
} from "../../settings-redesign/model";
import { formatValue } from "./canvas-changes";
import { itemLink, pointerForKey } from "./canvas-link";
import { KEY_TARGET, REGIONS, WHOLE_SUBS, goToSetting, searchText } from "./canvas-regions";

/*
 * Search lives in the header; its results take over the inspector. A result
 * names the region it lives in, shows the current value, and lights that region
 * in the miniature while it is pointed at. Choosing one selects the region and
 * flashes the row.
 */

const RESULTS_ID = "cv-results";

function clearSearch(): void {
  searchText.value = "";
}

export function CanvasSearch({
  inputRef,
  disabled,
}: {
  readonly inputRef: RefObject<HTMLInputElement>;
  readonly disabled: boolean;
}) {
  const query = searchText.value;
  const hint = windowsHost.value ? "Ctrl+F" : "⌘F";

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      if (query === "") {
        (event.currentTarget as HTMLInputElement).blur();
        return;
      }
      event.preventDefault();
      clearSearch();
      return;
    }
    if (query.trim() === "") return;
    if (event.key === "Enter") {
      const [first] = searchSettings(query);
      if (first !== undefined) goToSetting(first.key);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      document.querySelector<HTMLElement>(`#${RESULTS_ID} .cv-hit-row`)?.focus();
    }
  };

  return (
    <label
      class={`cv-search ${query === "" ? "" : "has-query"}`}
      title={`Search settings (${hint})`}
    >
      <DeckIcon icon={MagnifyingGlass} size={ROW_ICON} />
      <input
        ref={inputRef}
        type="search"
        value={query}
        placeholder="Search settings"
        aria-label="Search settings"
        aria-controls={query.trim() === "" ? undefined : RESULTS_ID}
        autocomplete="off"
        spellcheck={false}
        disabled={disabled}
        onInput={(event) => {
          searchText.value = event.currentTarget.value;
        }}
        onKeyDown={onKeyDown}
      />
    </label>
  );
}

function whereIs(entry: SettingEntry): string {
  const target = KEY_TARGET[entry.key];
  const sub = WHOLE_SUBS.find((item) => item.id === target.sub);
  return sub === undefined ? REGIONS[target.region].label : sub.label;
}

export function SearchResults() {
  const query = searchText.value;
  const hits = searchSettings(query);
  const current = settings.value;

  if (hits.length === 0) {
    return (
      <p id={RESULTS_ID} class="cv-empty" role="status">
        No setting matches
      </p>
    );
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      clearSearch();
      document.querySelector<HTMLElement>(".cv-search input")?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const rows = [
      ...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(".cv-hit-row"),
    ];
    const index = rows.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowUp" && index <= 0) {
      document.querySelector<HTMLElement>(".cv-search input")?.focus();
      return;
    }
    rows[Math.min(index + (event.key === "ArrowDown" ? 1 : -1), rows.length - 1)]?.focus();
  };

  return (
    <div
      id={RESULTS_ID}
      class="cv-results"
      role="group"
      aria-label="Search results"
      onKeyDown={onKeyDown}
    >
      {hits.map((hit) => {
        const meta = REGIONS[KEY_TARGET[hit.key].region];
        return (
          <button
            key={hit.key}
            type="button"
            class="cv-hit-row"
            title={`${registryEntry(hit.key).label}, in ${whereIs(hit)}`}
            onClick={() => goToSetting(hit.key)}
            {...itemLink(pointerForKey(hit.key))}
          >
            <DeckIcon icon={meta.icon} size={ROW_ICON} />
            <span class="cv-hit-row__text">
              <span class="cv-hit-row__label">
                {hit.label}
                {isModified(hit.key, current) && hit.scope === "preference" && (
                  <span class="srd-dot" role="img" aria-label="changed" />
                )}
              </span>
              {whereIs(hit) !== hit.label && <span class="cv-hit-row__path">{whereIs(hit)}</span>}
            </span>
            <span class="cv-hit-row__value">{formatValue(hit.key, current)}</span>
          </button>
        );
      })}
    </div>
  );
}
