import type { ComponentChildren } from "preact";
import { useSignal, useSignalEffect } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { ArrowCounterClockwise, CaretDown, CaretRight, Minus, Plus } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../ui/controls/deck-icon";
import { CommitInput } from "../../../ui/controls/commit-input";
import { AgentChoiceValue } from "../../../ui/settings/agent-choice-value";
import { MenuValue } from "./menu-value";
import {
  anchorId,
  focusTarget,
  isModified,
  modifiedOn,
  pageInfo,
  registryEntry,
  resetKeys,
  resetPage,
  settings,
  type PageId,
  type SettingKey,
} from "./model";

/*
 * The prototype's row grammar — the contract every page builds with.
 * Built on the shipping classes (`cfg-row`, `cfg-btn`, `settings-group`,
 * `segmented`) so the Studio look is the real one; `srd-*` classes are the
 * prototype's additions (changed dot, new-sessions tag, flash), styled in
 * settings-redesign.css.
 */

// ── rows ───────────────────────────────────────────────────────────────────

interface SettingRowProps {
  /** Registry key: label, description, changed mark and reset come from it. */
  readonly k: SettingKey;
  /** Override the registry label (e.g. a per-agent row). */
  readonly label?: string;
  readonly desc?: string;
  readonly children: ComponentChildren;
}

/** One setting: key left, one value right, changed dot + reset when it differs from default. */
export function SettingRow({ k, label, desc, children }: SettingRowProps) {
  const entry = registryEntry(k);
  const modified = isModified(k, settings.value);
  const flash = useSignal(false);
  const ref = useRef<HTMLDivElement>(null);

  // Re-runs only when `focusTarget` changes (a new search jump).
  useSignalEffect(() => {
    const target = focusTarget.value;
    if (target === null || target.key !== k) return;
    // One tick late: a row inside a closed "More options" is revealed by its
    // Group's own effect first, and a hidden row cannot scroll into view.
    const reveal = setTimeout(() => {
      const row = ref.current;
      row?.scrollIntoView({ block: "center", behavior: "smooth" });
      const control =
        row?.querySelector<HTMLElement>('[aria-checked="true"]') ??
        row?.querySelector<HTMLElement>("button, input, select, [tabindex]");
      control?.focus({ preventScroll: true });
      flash.value = true;
    }, 60);
    const timer = setTimeout(() => {
      flash.value = false;
    }, 1460);
    return () => {
      clearTimeout(reveal);
      clearTimeout(timer);
    };
  });

  const shownLabel = label ?? entry.label;
  return (
    <div
      ref={ref}
      id={anchorId(k)}
      class={`cfg-row srd-row ${modified ? "is-modified" : ""} ${flash.value ? "is-flash" : ""}`}
    >
      <div class="cfg-row__key">
        <span class="cfg-row__label">
          {shownLabel}
          {modified && <span class="srd-dot" title="Changed from default" aria-label="changed" />}
        </span>
        {(desc ?? entry.desc) !== undefined && (
          <span class="cfg-row__desc">{desc ?? entry.desc}</span>
        )}
        {entry.appliesTo === "new-sessions" && (
          <span class="srd-tag" title="Running sessions keep what they started with">
            new sessions
          </span>
        )}
      </div>
      <div class="cfg-row__value">
        {children}
        {modified && <ResetButton label={shownLabel} onReset={() => resetKeys([k])} />}
      </div>
    </div>
  );
}

/** A row that is not a registry setting (an action, a readout, a per-item row). */
export function PlainRow({
  label,
  desc,
  danger,
  children,
}: {
  readonly label: ComponentChildren;
  readonly desc?: ComponentChildren;
  readonly danger?: boolean;
  readonly children?: ComponentChildren;
}) {
  return (
    <div class="cfg-row srd-row">
      <div class="cfg-row__key">
        <span class={`cfg-row__label ${danger ? "cfg-row__label--danger" : ""}`}>{label}</span>
        {desc !== undefined && <span class="cfg-row__desc">{desc}</span>}
      </div>
      <div class="cfg-row__value">{children}</div>
    </div>
  );
}

export function ResetButton({
  label,
  onReset,
}: {
  readonly label: string;
  readonly onReset: () => void;
}) {
  return (
    <button
      type="button"
      class="cfg-clear srd-reset"
      aria-label={`Reset ${label} to default`}
      title="Reset to default"
      onClick={onReset}
    >
      <DeckIcon icon={ArrowCounterClockwise} size={ROW_ICON} />
    </button>
  );
}

// ── values (exactly one per row) ───────────────────────────────────────────

/** Boolean. Renders as the Studio rail-and-thumb switch inside the Studio fieldset. */
export function Switch({
  label,
  checked,
  onChange,
  disabled,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      class={`cfg-btn ${checked ? "cfg-btn--on" : "cfg-btn--off"}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      {checked ? "on" : "off"}
    </button>
  );
}

export interface ChoiceOption {
  readonly value: string;
  readonly label: string;
}

/** Two or three options → segmented radio group (DL-6.5); more → Deck's own menu, not the OS sheet. */
export function Choice({
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
  return options.length > 3 ? (
    <MenuValue label={label} value={value} options={options} onChange={onChange} />
  ) : (
    <AgentChoiceValue label={label} value={value} choices={options} onChange={onChange} />
  );
}

/** − value + in one pill. */
export function Step({
  label,
  value,
  min,
  max,
  step = 1,
  format = (n) => String(n),
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly format?: (n: number) => string;
  readonly onChange: (next: number) => void;
}) {
  const round = (n: number): number => Math.round(n * 100) / 100;
  return (
    <span class="cfg-btn cfg-step" role="group" aria-label={label}>
      <button
        type="button"
        class="cfg-step__btn"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(round(Math.max(min, value - step)))}
      >
        <DeckIcon icon={Minus} size={ROW_ICON} />
      </button>
      <span class="cfg-step__val">{format(value)}</span>
      <button
        type="button"
        class="cfg-step__btn"
        aria-label={`Increase ${label}`}
        disabled={value >= max}
        onClick={() => onChange(round(Math.min(max, value + step)))}
      >
        <DeckIcon icon={Plus} size={ROW_ICON} />
      </button>
    </span>
  );
}

/**
 * Text that commits on blur/Enter (DL-6.3). `validate` refuses a draft with a
 * visible reason; the draft stays so it can be fixed.
 */
export function TextValue({
  label,
  value,
  placeholder,
  validate,
  onCommit,
}: {
  readonly label: string;
  readonly value: string;
  readonly placeholder?: string;
  readonly validate?: (draft: string) => string | null;
  readonly onCommit: (next: string) => void;
}) {
  const error = useSignal<string | null>(null);
  const errorId = `${anchorIdSafe(label)}-error`;
  return (
    <span class="srd-text">
      <CommitInput
        value={value}
        placeholder={placeholder ?? ""}
        ariaLabel={label}
        invalid={error.value !== null}
        describedBy={error.value === null ? undefined : errorId}
        spellcheck={false}
        onDraftChange={() => {
          error.value = null;
        }}
        onCommit={(draft) => {
          const problem = validate?.(draft) ?? null;
          if (problem !== null) {
            error.value = problem;
            return false;
          }
          onCommit(draft.trim());
          return true;
        }}
      />
      {error.value !== null && (
        <span id={errorId} class="srd-error" role="alert">
          {error.value}
        </span>
      )}
    </span>
  );
}

function anchorIdSafe(text: string): string {
  return `srd-${text.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/** An action pill. */
export function Action({
  children,
  onClick,
  danger,
  disabled,
  label,
}: {
  readonly children: ComponentChildren;
  readonly onClick: () => void;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  /** Accessible name when the pill's text is not enough. */
  readonly label?: string;
}) {
  return (
    <button
      type="button"
      class={`cfg-btn ${danger ? "cfg-btn--danger" : ""}`}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// ── groups and pages ───────────────────────────────────────────────────────

/**
 * A Studio group: short task title, rows, and an optional "More" disclosure
 * for low-use rows (no global basic/advanced switch).
 */
export function Group({
  title,
  description,
  children,
  more,
  aside,
  moreLabel,
}: {
  readonly title?: string;
  readonly description?: string;
  readonly children?: ComponentChildren;
  /** Rows revealed by "More options". Kept mounted while hidden so drafts survive. */
  readonly more?: ComponentChildren;
  /** Right side of the group head (a count, a refresh button). */
  readonly aside?: ComponentChildren;
  /** Disclosure label when "More options" is the wrong word (e.g. "What's sent"). */
  readonly moreLabel?: string;
}) {
  const open = useSignal(false);
  const id = useRef(`srd-more-${Math.random().toString(36).slice(2, 8)}`).current;
  // A search hit inside the closed disclosure opens it, so the jump lands.
  useSignalEffect(() => {
    const target = focusTarget.value;
    if (target === null || open.peek()) return;
    if (document.getElementById(id)?.querySelector(`#${anchorId(target.key)}`)) {
      open.value = true;
    }
  });

  return (
    <section class="settings-group srd-group">
      {title !== undefined && (
        <header class="settings-group__head srd-group__head">
          <div>
            <h3>{title}</h3>
            {description !== undefined && <p>{description}</p>}
          </div>
          {aside !== undefined && <div class="srd-group__aside">{aside}</div>}
        </header>
      )}
      <div class="settings-group__body">
        {children}
        {more !== undefined && (
          <>
            <div id={id} class="srd-more-body" hidden={!open.value}>
              {more}
            </div>
            <button
              type="button"
              class="srd-more"
              aria-expanded={open.value}
              aria-controls={id}
              onClick={() => {
                open.value = !open.value;
              }}
            >
              <DeckIcon icon={open.value ? CaretDown : CaretRight} size={ROW_ICON} />
              {moreLabel ?? (open.value ? "Fewer options" : "More options")}
            </button>
          </>
        )}
      </div>
    </section>
  );
}

/**
 * Title, one line on what the page is for, and the page's changed count with
 * a confirm-in-place "Reset page" (two presses, no modal).
 */
export function PageIntro({ page }: { readonly page: PageId }) {
  const info = pageInfo(page);
  const changed = modifiedOn(page, settings.value).filter((entry) => entry.scope === "preference");
  const armed = useSignal(false);

  useEffect(() => {
    if (!armed.value) return;
    const timer = setTimeout(() => {
      armed.value = false;
    }, 4000);
    return () => clearTimeout(timer);
  }, [armed.value]);

  return (
    <header class="settings-screen__intro srd-intro">
      <div>
        <h2 class="settings-screen__title">{info.label}</h2>
        <p class="settings-screen__lede">{info.lede}</p>
      </div>
      {changed.length > 0 && (
        <div class="srd-intro__changed">
          <span class="srd-dot" aria-hidden="true" />
          <span>{changed.length} changed</span>
          <button
            type="button"
            class={`cfg-btn ${armed.value ? "cfg-btn--danger" : ""}`}
            title={changed.map((entry) => entry.label).join(", ")}
            onClick={() => {
              if (armed.value) {
                resetPage(page);
                armed.value = false;
                return;
              }
              armed.value = true;
            }}
          >
            {armed.value ? `Reset ${changed.length}?` : "Reset page"}
          </button>
        </div>
      )}
    </header>
  );
}
