import { useEffect, useRef } from "preact/hooks";
import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import { pageInfo, settings } from "../../settings-redesign/model";
import { PAGE_COMPONENTS } from "../../settings-redesign/pages";
import { AgentsPanel } from "./canvas-agents-panel";
import { subChanges } from "./canvas-changes";
import { ChangeTray, Head, Overview } from "./canvas-changes-view";
import { BarPanel, PanePanel, TabsPanel, ToastPanel, WindowPanel } from "./canvas-panels";
import {
  WHOLE_SUBS,
  focusLink,
  hoverLink,
  openWhole,
  searchText,
  selectedRegion,
  wholeSub,
  type RegionId,
  type WholeSub,
} from "./canvas-regions";
import { SearchResults } from "./canvas-search";
import "./canvas-inspector.css";

/*
 * The inspector: what the selected region of the miniature edits. Above it, a
 * head with the region's name, how many of its settings differ from default and
 * a two-press reset; below it the shared setting rows. With nothing selected it
 * is the overview of every change. The dock at the bottom reaches what has no
 * region of its own: files and browser, shortcuts, about, data and reset.
 */

// ── whole app ──────────────────────────────────────────────────────────────

function WholeIndex() {
  const current = settings.value;
  return (
    <ul class="cv-whole" aria-label="Whole app">
      {WHOLE_SUBS.map((sub) => (
        <li key={sub.id}>
          <button type="button" class="cv-whole__item" onClick={() => openWhole(sub.id)}>
            <DeckIcon icon={sub.icon} size={ROW_ICON} />
            <span class="cv-whole__text">
              <span class="cv-whole__name">{sub.label}</span>
              <span class="cv-whole__lede">{pageInfo(sub.id).lede}</span>
            </span>
            {subChanges(sub.id, current).length > 0 && (
              <span class="srd-dot" role="img" aria-label="has changes" />
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}

function WholeDock({
  region,
  sub,
}: {
  readonly region: RegionId | null;
  readonly sub: WholeSub | null;
}) {
  const current = settings.value;
  return (
    <nav class="cv-dock" aria-label="Whole app">
      {WHOLE_SUBS.map((item) => {
        const active = region === "whole" && sub === item.id;
        return (
          <button
            key={item.id}
            type="button"
            class={`cv-dock__item ${active ? "is-active" : ""}`}
            title={item.label}
            aria-current={active ? "page" : undefined}
            onClick={() => openWhole(item.id)}
          >
            <DeckIcon icon={item.icon} size={ROW_ICON} />
            {item.short}
            {subChanges(item.id, current).length > 0 && (
              <span class="srd-dot" role="img" aria-label="has changes" />
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ── panel switch ───────────────────────────────────────────────────────────

function RegionPanel({
  region,
  sub,
}: {
  readonly region: RegionId;
  readonly sub: WholeSub | null;
}) {
  switch (region) {
    case "window":
      return <WindowPanel />;
    case "tabs":
      return <TabsPanel />;
    case "agents":
      return <AgentsPanel />;
    case "pane":
      return <PanePanel />;
    case "panebar":
    case "statusbar":
      return <BarPanel region={region} />;
    case "toast":
      return <ToastPanel />;
    case "whole": {
      if (sub === null) return <WholeIndex />;
      const Page = PAGE_COMPONENTS[sub];
      return (
        <div class="cv-sub">
          <Page />
        </div>
      );
    }
  }
}

export function Inspector() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const searching = searchText.value.trim() !== "";
  const region = selectedRegion.value;
  const sub = wholeSub.value;

  // A new panel opens at its top, and nothing stays lit from the old one.
  useEffect(() => {
    if (scrollRef.current !== null) scrollRef.current.scrollTop = 0;
    hoverLink.value = null;
    focusLink.value = null;
  }, [region, sub]);

  return (
    <aside class="cv-inspector" aria-label="Inspector">
      {!searching && <Head region={region} sub={sub} />}
      {!searching && region !== null && <ChangeTray region={region} sub={sub} />}
      <div ref={scrollRef} class="cv-inspector__scroll">
        {searching ? (
          <SearchResults />
        ) : region === null ? (
          <Overview />
        ) : (
          <RegionPanel region={region} sub={sub} />
        )}
      </div>
      <WholeDock region={region} sub={sub} />
    </aside>
  );
}
