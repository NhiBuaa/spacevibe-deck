import { useSignal } from "@preact/signals";
import { useRef } from "preact/hooks";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../ui/controls/deck-icon";
import {
  SHORTCUT_ACTIONS,
  anchorId,
  chordFor,
  resetKeys,
  settings,
  shortcutConflicts,
  update,
  type ShortcutAction,
} from "./model";
import { Group, PageIntro, ResetButton } from "./primitives";
import { ChordButton } from "./chord-button";
import { ConfirmAction } from "./misc-actions";
import { useJumpTarget } from "./use-jump-target";
import "./pages-misc.css";

/** Typed in the filter, a modifier symbol also matches its name. */
const MODIFIER_WORDS: Readonly<Record<string, string>> = {
  "⌘": " cmd command",
  "⌥": " opt option alt",
  "⌃": " ctrl control",
  "⇧": " shift",
};

const GROUPS: readonly string[] = [...new Set(SHORTCUT_ACTIONS.map((action) => action.group))];
const rowId = (actionId: string): string => `srd-misc-shortcut-${actionId}`;
const labelOf = (actionId: string): string =>
  SHORTCUT_ACTIONS.find((action) => action.id === actionId)?.label ?? actionId;

/** A copy of the overrides with one action rebound (a chord), unbound ("") or restored (null). */
function withBinding(
  bindings: Readonly<Record<string, string>>,
  actionId: string,
  chord: string | null,
): Record<string, string> {
  const rest = Object.fromEntries(Object.entries(bindings).filter(([id]) => id !== actionId));
  return chord === null ? rest : { ...rest, [actionId]: chord };
}

function matchesFilter(action: ShortcutAction, chord: string, terms: readonly string[]): boolean {
  const words = [...chord].map((char) => MODIFIER_WORDS[char] ?? "").join("");
  const haystack = `${action.label} ${action.group} ${chord}${words}`.toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

interface ShortcutRowProps {
  readonly action: ShortcutAction;
  readonly chord: string;
  readonly overridden: boolean;
  /** "Also bound to …", or null when the chord is unique. */
  readonly conflict: string | null;
  readonly onCommit: (chord: string) => void;
  readonly onReset: () => void;
}

function ShortcutRow({ action, chord, overridden, conflict, onCommit, onReset }: ShortcutRowProps) {
  return (
    <div
      id={rowId(action.id)}
      class={`cfg-row srd-row cfg-row--shortcut ${overridden ? "is-modified" : ""}`}
    >
      <div class="cfg-row__key">
        <span class="cfg-row__label">
          {action.label}
          {overridden && <span class="srd-dot" title="Changed from default" aria-label="changed" />}
        </span>
        {conflict !== null && <span class="cfg-row__desc srd-misc-warn">{conflict}</span>}
      </div>
      <div class="cfg-row__value">
        <ChordButton label={action.label} chord={chord} onCommit={onCommit} />
        {overridden && <ResetButton label={action.label} onReset={onReset} />}
      </div>
    </div>
  );
}

export function ShortcutsPage() {
  const s = settings.value;
  const query = useSignal("");
  const filterRef = useRef<HTMLInputElement>(null);
  // A search hit for "shortcuts" lands on the filter: the keymap is one registry key, not one row.
  const jump = useJumpTarget<HTMLDivElement>("keybindings", "input");
  const conflicts = shortcutConflicts(s);
  const firstConflict = SHORTCUT_ACTIONS.find((action) => conflicts.has(action.id));
  const overrideCount = Object.keys(s.keybindings).length;
  const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);

  const sections = GROUPS.map((name) => ({
    name,
    rows: SHORTCUT_ACTIONS.filter(
      (action) => action.group === name && matchesFilter(action, chordFor(action.id, s), terms),
    ),
  })).filter((section) => section.rows.length > 0);

  // Read at call time, not render time: recording can outlive the render that built the row.
  const rebind = (action: ShortcutAction, chord: string | null): void => {
    // Recording the shipped chord again is not an override.
    const next = chord === action.chord ? null : chord;
    update({ keybindings: withBinding(settings.value.keybindings, action.id, next) });
  };

  const showFirstConflict = (): void => {
    if (firstConflict === undefined) return;
    query.value = ""; // the row may be filtered out
    requestAnimationFrame(() => {
      const row = document.getElementById(rowId(firstConflict.id));
      row?.scrollIntoView({ block: "center", behavior: "smooth" });
      row?.querySelector<HTMLElement>("button")?.focus({ preventScroll: true });
    });
  };

  return (
    <div class="srd-misc">
      <PageIntro page="shortcuts" />
      <div
        ref={jump.ref}
        id={anchorId("keybindings")}
        class={`srd-misc-toolbar srd-row ${jump.flash ? "is-flash" : ""}`}
      >
        <label class="srd-misc-filter">
          <DeckIcon icon={MagnifyingGlass} size={ROW_ICON} />
          <input
            ref={filterRef}
            type="text"
            class="srd-misc-filter__input"
            placeholder="Filter shortcuts"
            aria-label="Filter shortcuts"
            spellcheck={false}
            value={query.value}
            onInput={(event) => {
              query.value = event.currentTarget.value;
            }}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || query.value === "") return;
              event.preventDefault();
              event.stopPropagation();
              query.value = "";
            }}
          />
        </label>
        {firstConflict !== undefined && (
          <button
            type="button"
            class="srd-misc-conflict"
            title="Show the first one"
            onClick={showFirstConflict}
          >
            <span class="srd-misc-dot" aria-hidden="true" />
            {conflicts.size} shortcuts conflict
          </button>
        )}
        {overrideCount > 0 && (
          <div class="srd-misc-toolbar__end">
            <ConfirmAction
              danger
              confirmLabel={`Reset ${overrideCount} shortcut${overrideCount === 1 ? "" : "s"}?`}
              onConfirm={() => {
                resetKeys(["keybindings"]);
                filterRef.current?.focus(); // the pill that was pressed is about to unmount
              }}
            >
              Reset all shortcuts
            </ConfirmAction>
          </div>
        )}
      </div>
      {sections.length === 0 && (
        <p class="srd-misc-empty" role="status">
          No shortcut matches
        </p>
      )}
      {sections.map((section) => (
        <Group key={section.name} title={section.name}>
          {section.rows.map((action) => (
            <ShortcutRow
              key={action.id}
              action={action}
              chord={chordFor(action.id, s)}
              overridden={action.id in s.keybindings}
              conflict={
                conflicts.has(action.id)
                  ? `Also bound to ${(conflicts.get(action.id) ?? []).map(labelOf).join(", ")}`
                  : null
              }
              onCommit={(chord) => rebind(action, chord)}
              onReset={() => rebind(action, null)}
            />
          ))}
        </Group>
      ))}
    </div>
  );
}
