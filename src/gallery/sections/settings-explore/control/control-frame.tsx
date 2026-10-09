import { useEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";
import { CaretLeft } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import { LoadError } from "../../../../ui/controls/load-error";
import {
  FRAME_WIDTHS,
  focusTarget,
  frameSize,
  loadMode,
  registryEntry,
  remoteNotice,
  type PageId,
} from "../../settings-redesign/model";
import { HeaderStatus, useFrameTheme } from "../../settings-redesign/shell";
import { AreaPage } from "./control-area";
import { ChangedView } from "./control-changed";
import { retryLoad } from "./control-health";
import { query, takePendingFocus, view } from "./control-nav";
import { Overview } from "./control-overview";
import { SearchField, SearchResults } from "./control-search";
import "./control-frame.css";

const LOAD_ERROR_MESSAGE =
  "Couldn't load settings. Changes are temporary until Deck can read settings.json.";
/** Longer than a row's own 1.4s flash, so clearing the target never cuts it short. */
const TARGET_LINGER_MS = 2000;
const JUMP_WINDOW_MS = 1000;
const FOCUS_FALLBACK_MS = 150;

/** A search jump leaves its target set; drop it once the flash is over so revisiting does not flash again. */
function useClearStaleTarget(): void {
  const nonce = focusTarget.value?.nonce;
  useEffect(() => {
    if (nonce === undefined) return;
    const timer = setTimeout(() => {
      if (focusTarget.peek()?.nonce === nonce) focusTarget.value = null;
    }, TARGET_LINGER_MS);
    return () => clearTimeout(timer);
  }, [nonce]);
}

function currentPage(): PageId | null {
  const current = view.value;
  return current.kind === "area" ? current.page : null;
}

/** A change of screen opens at the top, unless a search hit is about to scroll to a row on it. */
function useScrollToTop(scrollRef: RefObject<HTMLElement>): void {
  const page = currentPage();
  const screen = view.value.kind;
  /* oxlint-disable react-hooks/exhaustive-deps -- keyed on the screen; the ref is stable */
  useEffect(() => {
    const target = focusTarget.peek();
    const jumping =
      target !== null &&
      registryEntry(target.key).page === page &&
      Date.now() - target.nonce < JUMP_WINDOW_MS;
    if (!jumping && scrollRef.current !== null) scrollRef.current.scrollTop = 0;
  }, [screen, page]);
  /* oxlint-enable react-hooks/exhaustive-deps */
}

/** The page's `Back`, the screen, and the sibling chips all unmount their pressed control; this puts focus somewhere sensible. */
function useFocusAfterNavigation(frameRef: RefObject<HTMLElement>): void {
  const page = currentPage();
  const screen = view.value.kind;
  /* oxlint-disable react-hooks/exhaustive-deps -- keyed on the screen; the ref is stable */
  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null) return;
    const wanted = takePendingFocus();
    const target =
      wanted === null ? null : frame.querySelector<HTMLElement>(`[data-ctl-focus-id="${wanted}"]`);
    if (target !== null) {
      target.focus({ preventScroll: true });
      return;
    }
    // A search jump focuses its own row; give it a moment, then fall back to the heading.
    const timer = setTimeout(() => {
      if (frame.contains(document.activeElement) && document.activeElement !== frame) return;
      frame.querySelector<HTMLElement>("[data-ctl-heading]")?.focus({ preventScroll: true });
    }, FOCUS_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [screen, page]);
  /* oxlint-enable react-hooks/exhaustive-deps */
}

function Screen() {
  const current = view.value;
  if (current.kind === "changed") return <ChangedView />;
  if (current.kind === "area") return <AreaPage key={current.page} page={current.page} />;
  return <Overview />;
}

export function ControlFrame() {
  const frameRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mode = loadMode.value;
  const loading = mode === "loading";
  const searching = query.value.trim() !== "";

  useFrameTheme(frameRef);
  useClearStaleTarget();
  useScrollToTop(scrollRef);
  useFocusAfterNavigation(frameRef);

  // ⌘F / Ctrl+F belongs to the frame while focus is inside it.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
    if (event.key.toLowerCase() !== "f") return;
    event.preventDefault();
    searchRef.current?.focus();
    searchRef.current?.select();
  };

  return (
    <div
      ref={frameRef}
      class="srd-frame ctl-frame"
      style={{ width: `min(100%, ${FRAME_WIDTHS[frameSize.value]}px)` }}
      onKeyDown={onKeyDown}
    >
      <header class="srd-head ctl-head">
        {/* Inert in the prototype; the real Back closes Settings. */}
        <button type="button" class="settings-screen__back" title="Back to Deck (Esc)">
          <DeckIcon icon={CaretLeft} size={ROW_ICON} />
          Back
        </button>
        <SearchField inputRef={searchRef} />
        <div class="srd-remote" role="status" aria-live="polite">
          {remoteNotice.value}
        </div>
        <HeaderStatus />
      </header>
      <section
        ref={scrollRef}
        class="srd-scroll ctl-scroll"
        aria-label="Settings"
        aria-busy={loading}
      >
        <div class="srd-doc ctl-doc">
          {mode === "error" && <LoadError message={LOAD_ERROR_MESSAGE} onRetry={retryLoad} />}
          {/* Disabled for real while loading, like the shipping fieldset: the tiles
              would otherwise offer placeholder values as the user's own. */}
          <fieldset
            class="settings-screen__fields settings-screen__fields--studio srd-fields"
            disabled={loading}
            aria-busy={loading}
          >
            {searching ? <SearchResults inputRef={searchRef} /> : <Screen />}
          </fieldset>
        </div>
      </section>
    </div>
  );
}
