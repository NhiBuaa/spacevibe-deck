import type { RefObject } from "preact";
import { useRef } from "preact/hooks";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../ui/controls/deck-icon";
import {
  PAGES,
  activePage,
  jumpTo,
  modifiedOn,
  pageInfo,
  searchQuery,
  searchSettings,
  settings,
  windowsHost,
  type PageId,
  type SettingEntry,
} from "./model";

/*
 * The rail: a search field over the page tabs (DL-11.1/11.4 as amended by the
 * proposal). While the query is non-empty the tabs give way to the results.
 * Tabs keep the shipping `settings-nav` roving contract: ↑/↓ wrap and move
 * focus with the selection.
 */

export const PANEL_ID = "srd-panel";
const RESULTS_ID = "srd-results";

export const tabId = (page: PageId): string => `srd-tab-${page}`;

const clearSearch = (): void => {
  searchQuery.value = "";
};

// ── search ─────────────────────────────────────────────────────────────────

function SearchField({ inputRef }: { readonly inputRef: RefObject<HTMLInputElement> }) {
  const query = searchQuery.value;
  const hint = windowsHost.value ? "Ctrl+F" : "⌘F";

  const onKeyDown = (event: KeyboardEvent): void => {
    const input = event.currentTarget as HTMLInputElement;
    if (event.key === "Escape") {
      if (query === "") {
        input.blur();
        return;
      }
      event.preventDefault();
      clearSearch();
      return;
    }
    if (query.trim() === "") return;
    if (event.key === "Enter") {
      const [first] = searchSettings(query);
      if (first !== undefined) jumpTo(first.key);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      input.closest(".srd-rail")?.querySelector<HTMLElement>(".srd-hit")?.focus();
    }
  };

  return (
    <div class="srd-search-slot">
      <label
        class={`srd-search ${query === "" ? "" : "has-query"}`}
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
          onInput={(event) => {
            searchQuery.value = event.currentTarget.value;
          }}
          onKeyDown={onKeyDown}
        />
      </label>
    </div>
  );
}

function resultPath(hit: SettingEntry): string {
  const page = pageInfo(hit.page).label;
  return hit.group === page ? page : `${page} · ${hit.group}`;
}

function SearchResults({
  hits,
  inputRef,
}: {
  readonly hits: readonly SettingEntry[];
  readonly inputRef: RefObject<HTMLInputElement>;
}) {
  if (hits.length === 0) {
    return (
      <p id={RESULTS_ID} class="srd-rail__empty" role="status">
        No setting matches
      </p>
    );
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      clearSearch();
      inputRef.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = [
      ...(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>(".srd-hit"),
    ];
    const index = buttons.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowUp" && index <= 0) inputRef.current?.focus();
    else
      buttons[Math.min(index + (event.key === "ArrowDown" ? 1 : -1), buttons.length - 1)]?.focus();
  };

  return (
    <div
      id={RESULTS_ID}
      class="srd-results"
      role="group"
      aria-label="Search results"
      onKeyDown={onKeyDown}
    >
      {hits.map((hit) => (
        <button
          key={hit.key}
          type="button"
          class="srd-hit"
          title={`${hit.label} — ${resultPath(hit)}`}
          onClick={() => jumpTo(hit.key)}
        >
          <span class="srd-hit__label">{hit.label}</span>
          <span class="srd-hit__path">{resultPath(hit)}</span>
        </button>
      ))}
    </div>
  );
}

// ── page tabs ──────────────────────────────────────────────────────────────

function PageTabs() {
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = settings.value;

  const select = (index: number): void => {
    activePage.value = PAGES[index].id;
    itemRefs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const from = Math.max(
      PAGES.findIndex((page) => page.id === activePage.value),
      0,
    );
    select((from + (event.key === "ArrowDown" ? 1 : -1) + PAGES.length) % PAGES.length);
  };

  return (
    <div
      class="settings-nav__list"
      role="tablist"
      aria-orientation="vertical"
      onKeyDown={onKeyDown}
    >
      {PAGES.map((page, index) => {
        const isActive = page.id === activePage.value;
        return (
          <button
            key={page.id}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            type="button"
            id={tabId(page.id)}
            role="tab"
            aria-selected={isActive}
            aria-controls={PANEL_ID}
            tabIndex={isActive ? 0 : -1}
            class={`settings-nav__item ${isActive ? "is-active" : ""}`}
            title={page.label}
            onClick={() => select(index)}
          >
            <span class="settings-nav__label">{page.label}</span>
            {modifiedOn(page.id, current).length > 0 && (
              <span class="srd-dot" role="img" aria-label="has changes" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function SettingsRail({ searchRef }: { readonly searchRef: RefObject<HTMLInputElement> }) {
  const query = searchQuery.value;
  const searching = query.trim() !== "";
  return (
    <nav class="settings-nav srd-rail" aria-label="Settings">
      <SearchField inputRef={searchRef} />
      {searching ? (
        <SearchResults hits={searchSettings(query)} inputRef={searchRef} />
      ) : (
        <PageTabs />
      )}
    </nav>
  );
}
