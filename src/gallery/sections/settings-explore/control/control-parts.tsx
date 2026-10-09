import type { ComponentChildren } from "preact";
import { useRef } from "preact/hooks";
import {
  ArrowCounterClockwise,
  CheckCircle,
  MinusCircle,
  Warning,
  WarningOctagon,
  type Icon,
} from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON, type DeckIconSize } from "../../../../ui/controls/deck-icon";
import type { Tone } from "./control-health";
import { focusHeading } from "./control-nav";

/*
 * Small pieces every part of the control center shares: the state glyph (a
 * different SHAPE per tone, so colour is never the only signal), the reset
 * button that appears on hover or focus, and an icon-first segmented group.
 */

const TONE_ICON: Readonly<Record<Tone, Icon>> = {
  ok: CheckCircle,
  warn: Warning,
  error: WarningOctagon,
  idle: MinusCircle,
};

const TONE_WORD: Readonly<Record<Tone, string>> = {
  ok: "fine",
  warn: "needs a look",
  error: "problem",
  idle: "off",
};

export function ToneIcon({
  tone,
  size = ROW_ICON,
}: {
  readonly tone: Tone;
  readonly size?: DeckIconSize;
}) {
  return (
    <span class={`ctl-tone is-${tone}`} title={TONE_WORD[tone]} aria-hidden="true">
      <DeckIcon icon={TONE_ICON[tone]} size={size} />
    </span>
  );
}

/** Spoken form of a tone, for an `aria-label` that must not rely on colour. */
export const toneWord = (tone: Tone): string =>
  tone === "warn" || tone === "error" ? TONE_WORD[tone] : "";

export function ChangedDot() {
  return <span class="ctl-dot" title="Changed from default" role="img" aria-label="changed" />;
}

/** Quiet until its tile is hovered or holds focus, so it never costs a tab stop's worth of noise. */
export function ControlReset({
  label,
  onReset,
}: {
  readonly label: string;
  readonly onReset: () => void;
}) {
  return (
    <button
      type="button"
      class="ctl-reset"
      aria-label={`Reset ${label} to default`}
      title="Reset to default"
      onClick={(event) => {
        const host = event.currentTarget.closest<HTMLElement>(".ctl-q, .ctl-spot");
        onReset();
        // The reset unmounts itself once nothing differs; keep focus on the value it belonged to.
        requestAnimationFrame(() => {
          if (document.activeElement !== document.body) return;
          if (host?.isConnected === true)
            host
              .querySelector<HTMLElement>("[tabindex='0'], button:not(.ctl-reset), input")
              ?.focus({ preventScroll: true });
          else focusHeading();
        });
      }}
    >
      <DeckIcon icon={ArrowCounterClockwise} size={ROW_ICON} />
    </button>
  );
}

export interface SegmentOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly content: ComponentChildren;
}

const ARROWS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];

/** One radio group whose options are pictures; arrows move the selection itself. */
export function IconSegments<T extends string>({
  label,
  value,
  options,
  onChange,
  variant = "",
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly SegmentOption<T>[];
  readonly onChange: (next: T) => void;
  /** Extra class on the group, for a different layout of the same radios. */
  readonly variant?: string;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const onKeyDown = (event: KeyboardEvent): void => {
    if (!ARROWS.includes(event.key)) return;
    event.preventDefault();
    const index = options.findIndex((option) => option.value === value);
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? options.length - 1
          : (index + (forward ? 1 : -1) + options.length) % options.length;
    groupRef.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
    onChange(options[next].value);
  };
  return (
    <div
      ref={groupRef}
      class={`ctl-seg ${variant}`}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            title={option.label}
            tabIndex={selected ? 0 : -1}
            class={`ctl-seg__option ${selected ? "is-selected" : ""}`}
            onClick={() => onChange(option.value)}
          >
            {option.content}
          </button>
        );
      })}
    </div>
  );
}
