import { useEffect, useRef } from "preact/hooks";
import { CaretLeft } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import { LoadError } from "../../../../ui/controls/load-error";
import {
  FRAME_WIDTHS,
  focusTarget,
  frameSize,
  loadMode,
  remoteNotice,
  saveStatus,
} from "../../settings-redesign/model";
import { HeaderStatus, useFrameTheme } from "../../settings-redesign/shell";
import { RegionChips } from "./canvas-chips";
import { Inspector } from "./canvas-inspector";
import { Miniature } from "./canvas-miniature";
import { CanvasSearch } from "./canvas-search";
import "./canvas-frame.css";

/*
 * Canvas: the app is its own menu. Left, a live miniature of Deck; point at a
 * part of it and the inspector on the right edits that part. Everything that
 * has no part of its own (files and browser, shortcuts, about, data and reset)
 * sits in the inspector's dock. Narrow, the miniature shrinks to a thumbnail
 * over a strip of region chips; the model is unchanged.
 */

const LOAD_ERROR_MESSAGE =
  "Couldn't load settings. Changes are temporary until Deck can read settings.json.";
/** Longer than a row's own flash, so clearing the target never cuts it short. */
const TARGET_LINGER_MS = 2000;

/** A search jump leaves its target set; drop it once the flash is over. */
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

export function CanvasFrame() {
  const frameRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mode = loadMode.value;
  const loading = mode === "loading";
  const narrow = frameSize.value === "narrow";

  useFrameTheme(frameRef);
  useClearStaleTarget();

  // Cmd/Ctrl+F belongs to the frame while focus is inside it.
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
    if (event.key.toLowerCase() !== "f") return;
    event.preventDefault();
    searchRef.current?.focus();
    searchRef.current?.select();
  };

  const retryLoad = (): void => {
    loadMode.value = "ready";
    if (saveStatus.value.kind === "temporary") saveStatus.value = { kind: "idle", failedKeys: [] };
  };

  return (
    <div
      ref={frameRef}
      class="srd-frame cv-frame"
      style={{ width: `min(100%, ${FRAME_WIDTHS[frameSize.value]}px)` }}
      onKeyDown={onKeyDown}
    >
      <header class="srd-head cv-bar">
        {/* Inert in the prototype; the real Back closes Settings. */}
        <button type="button" class="settings-screen__back" title="Back to Deck (Esc)">
          <DeckIcon icon={CaretLeft} size={ROW_ICON} />
          Back
        </button>
        <CanvasSearch inputRef={searchRef} disabled={loading} />
        <div class="srd-remote" role="status" aria-live="polite">
          {remoteNotice.value}
        </div>
        <HeaderStatus />
      </header>
      {mode === "error" && (
        <div class="cv-loaderror">
          <LoadError message={LOAD_ERROR_MESSAGE} onRetry={retryLoad} />
        </div>
      )}
      {/* Disabled for real while loading, like the shipping fieldset. */}
      <fieldset
        class={`cv-fields ${narrow ? "is-narrow" : ""}`}
        disabled={loading}
        aria-busy={loading}
      >
        <Miniature interactive={!narrow} />
        {narrow && <RegionChips />}
        <Inspector />
      </fieldset>
    </div>
  );
}
