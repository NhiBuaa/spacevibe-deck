import { useEffect, useRef } from "preact/hooks";
import type { RefObject } from "preact";
import { CaretLeft, CaretRight, MagnifyingGlass, PencilSimpleLine, X } from "@phosphor-icons/react";
import { DeckIcon, RAIL_ICON, ROW_ICON } from "../../../../ui/controls/deck-icon";
import { LoadError } from "../../../../ui/controls/load-error";
import { AgentMark } from "../../settings-redesign/agent-mark";
import { addingAgent, selectedAgent } from "../../settings-redesign/agents-state";
import {
  FRAME_WIDTHS,
  focusTarget,
  frameSize,
  loadMode,
  pageInfo,
  remoteNotice,
  saveStatus,
  settings,
  type PageId,
} from "../../settings-redesign/model";
import { HeaderStatus, useFrameTheme } from "../../settings-redesign/shell";
import { handleKeyDown, navItems, setActive, syncActive } from "./command-keys";
import { AreaScope, ChangedView, HomeView, ResultsView } from "./command-scopes";
import { AREA_ICONS, leaveScope, query, scope, scopeKey } from "./command-state";
import "./command.css";
import "./command-scopes.css";

/*
 * Command direction. No rail: one field is the navigation. Typing filters live rows from the
 * whole registry, the agents and the shortcuts; an area token narrows the column to that area
 * ("scope"), and the field wears the scope as a chip. Plan: docs/plans/2026-10-04-settings-redesign.md.
 */

const LOAD_ERROR_MESSAGE =
  "Couldn't load settings. Changes are temporary until Deck can read settings.json.";
/** Longer than the arrival flash of the row a jump lands on. */
const JUMP_LINGER_MS = 2000;
const PLACEHOLDER_HOME = "Search settings, agents and shortcuts";
const FIELD_TIP = "Search (⌘F). ↑ ↓ choose a row, Enter changes it, Tab edits it, Esc clears.";

function FrameHeader() {
  return (
    <header class="srd-head">
      {/* Inert in the prototype; the real Back closes Settings. */}
      <button type="button" class="settings-screen__back" title="Back to Deck (Esc)">
        <DeckIcon icon={CaretLeft} size={ROW_ICON} />
        Back
      </button>
      <div class="srd-remote" role="status" aria-live="polite">
        {remoteNotice.value}
      </div>
      <HeaderStatus />
    </header>
  );
}

// ── the field ──────────────────────────────────────────────────────────────

function ScopeChips() {
  const current = scope.value;
  if (current === null) return null;
  const area: PageId | null = current.kind === "area" ? current.area : null;
  const label = area === null ? "Changed" : pageInfo(area).label;
  const agent = area === "agents" && !addingAgent.value ? selectedAgent(settings.value) : undefined;
  return (
    <>
      <button
        type="button"
        class="cmd-chip"
        aria-label={`Leave ${label}`}
        title="Back to all settings (Esc)"
        onClick={leaveScope}
      >
        <DeckIcon icon={area === null ? PencilSimpleLine : AREA_ICONS[area]} size={ROW_ICON} />
        {label}
      </button>
      {area === "agents" && (
        <>
          <DeckIcon icon={CaretRight} size={ROW_ICON} class="cmd-field__sep" />
          <span class="cmd-seg">
            {agent !== undefined && <AgentMark agent={agent} />}
            {agent?.label ?? "New agent"}
          </span>
        </>
      )}
    </>
  );
}

function placeholderFor(): string {
  const current = scope.value;
  if (current === null) return PLACEHOLDER_HOME;
  return current.kind === "changed"
    ? "Filter the changed settings"
    : `Search in ${pageInfo(current.area).label}`;
}

function CommandField({ inputRef }: { readonly inputRef: RefObject<HTMLInputElement> }) {
  const q = query.value;
  const active = q !== "" || scope.value !== null;
  return (
    <div
      class="cmd-field"
      title={FIELD_TIP}
      onClick={(event) => {
        if (event.target === event.currentTarget) inputRef.current?.focus();
      }}
    >
      <DeckIcon icon={MagnifyingGlass} size={RAIL_ICON} class="cmd-field__lens" />
      <ScopeChips />
      <input
        ref={inputRef}
        type="search"
        class="cmd-input"
        value={q}
        placeholder={placeholderFor()}
        aria-label="Search settings"
        autocomplete="off"
        spellcheck={false}
        onInput={(event) => {
          query.value = event.currentTarget.value;
        }}
      />
      {active && (
        <button
          type="button"
          class="cmd-clear"
          aria-label="Clear"
          title={q === "" ? "Back to all settings (Esc)" : "Clear the search (Esc)"}
          onClick={() => {
            if (q !== "") query.value = "";
            else leaveScope();
            inputRef.current?.focus();
          }}
        >
          <DeckIcon icon={X} size={ROW_ICON} />
        </button>
      )}
    </div>
  );
}

// ── the column ─────────────────────────────────────────────────────────────

function Body() {
  const q = query.value.trim();
  const current = scope.value;
  if (current?.kind === "changed") return <ChangedView q={q} />;
  const area = current === null ? null : current.area;
  if (q !== "") return <ResultsView q={q} area={area} />;
  return area === null ? <HomeView /> : <AreaScope area={area} />;
}

export function CommandFrame() {
  const frameRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const mode = loadMode.value;
  const loading = mode === "loading";
  const q = query.value;
  const key = scopeKey(scope.value);

  useFrameTheme(frameRef);

  // The field has the keyboard when Settings opens and whenever the scope changes.
  /* oxlint-disable react-hooks/exhaustive-deps -- keyed on the scope; the ref is stable */
  useEffect(() => {
    fieldRef.current?.focus({ preventScroll: true });
  }, [key]);

  // A query puts its best row under the cursor; an empty field leaves the choice to the arrows.
  useEffect(() => {
    const root = frameRef.current;
    if (root !== null) setActive(root, q.trim() === "" ? null : (navItems(root)[0] ?? null));
  }, [q, key]);
  /* oxlint-enable react-hooks/exhaustive-deps */

  // A jump (Prompt templates) leaves its target set; drop it once the arrival flash is over, so
  // opening the scope again later does not scroll and flash a second time.
  const jumpNonce = focusTarget.value?.nonce;
  useEffect(() => {
    if (jumpNonce === undefined) return;
    const timer = setTimeout(() => {
      if (focusTarget.peek()?.nonce === jumpNonce) focusTarget.value = null;
    }, JUMP_LINGER_MS);
    return () => clearTimeout(timer);
  }, [jumpNonce]);

  const retryLoad = (): void => {
    loadMode.value = "ready";
    if (saveStatus.value.kind === "temporary") saveStatus.value = { kind: "idle", failedKeys: [] };
  };

  return (
    <div
      ref={frameRef}
      class="srd-frame cmd-frame"
      style={{ width: `min(100%, ${FRAME_WIDTHS[frameSize.value]}px)` }}
      onKeyDown={(event) => {
        if (frameRef.current !== null && fieldRef.current !== null)
          handleKeyDown(event, frameRef.current, fieldRef.current);
      }}
      onPointerMove={(event) => frameRef.current !== null && syncActive(event, frameRef.current)}
      onFocusIn={(event) => frameRef.current !== null && syncActive(event, frameRef.current)}
    >
      <FrameHeader />
      <div class="cmd-top">
        <div class="cmd-col">
          <CommandField inputRef={fieldRef} />
        </div>
      </div>
      <section class="cmd-scroll" aria-label="Settings" aria-busy={loading}>
        <div class="cmd-col cmd-inner">
          {mode === "error" && <LoadError message={LOAD_ERROR_MESSAGE} onRetry={retryLoad} />}
          {/* Disabled for real while loading, like the shipping fieldset: the rows would
              otherwise offer placeholder values as the user's own. */}
          <fieldset
            class="settings-screen__fields settings-screen__fields--studio srd-fields cmd-fields"
            disabled={loading}
            aria-busy={loading}
          >
            <Body />
          </fieldset>
        </div>
      </section>
    </div>
  );
}
