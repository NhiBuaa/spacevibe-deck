import type { Signal } from "@preact/signals";
import {
  FRAME_WIDTHS,
  failHooks,
  failSaves,
  failScan,
  frameSize,
  loadMode,
  restartDemo,
  simulateRemoteEdit,
  windowsHost,
  type FrameSize,
  type LoadMode,
} from "./model";

/*
 * Gallery chrome above the frame — not part of the product. Styled with the
 * gallery's own fixed palette (`.srd-demo*` in settings-redesign.css), so it
 * holds still while the frame below flips theme.
 */

const SIZE_OPTIONS: readonly { value: FrameSize; label: string }[] = [
  { value: "wide", label: "Wide" },
  { value: "medium", label: "Medium" },
  { value: "narrow", label: "Narrow" },
];

const LOAD_OPTIONS: readonly { value: LoadMode; label: string }[] = [
  { value: "ready", label: "Ready" },
  { value: "loading", label: "Loading" },
  { value: "error", label: "Load error" },
];

const TOGGLES: readonly { label: string; state: Signal<boolean> }[] = [
  { label: "Saves fail", state: failSaves },
  { label: "Hook install fails", state: failHooks },
  { label: "Windows host", state: windowsHost },
  { label: "Agent scan fails", state: failScan },
];

interface SegmentsProps<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { value: T; label: string; hint?: string }[];
  readonly onChange: (next: T) => void;
}

function Segments<T extends string>({ label, value, options, onChange }: SegmentsProps<T>) {
  return (
    <div class="srd-demo__group">
      <span class="srd-demo__label">{label}</span>
      <div class="srd-demo__segments" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            title={option.hint}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function DemoToolbar() {
  return (
    <section class="srd-demo" aria-label="Demo controls">
      <span class="srd-demo__badge">Demo controls</span>
      <div class="srd-demo__row">
        <Segments
          label="Frame width"
          value={frameSize.value}
          options={SIZE_OPTIONS.map((option) => ({
            ...option,
            hint: `${FRAME_WIDTHS[option.value]}px`,
          }))}
          onChange={(next) => {
            frameSize.value = next;
          }}
        />
        <Segments
          label="Settings file"
          value={loadMode.value}
          options={LOAD_OPTIONS}
          onChange={(next) => {
            loadMode.value = next;
          }}
        />
      </div>
      <div class="srd-demo__row">
        {TOGGLES.map(({ label, state }) => (
          <label key={label} class="srd-demo__toggle">
            <input
              type="checkbox"
              checked={state.value}
              onChange={(event) => {
                state.value = event.currentTarget.checked;
              }}
            />
            {label}
          </label>
        ))}
        <button type="button" class="srd-demo__action" onClick={simulateRemoteEdit}>
          Edit from another window
        </button>
        <button type="button" class="srd-demo__action" onClick={restartDemo}>
          Restart demo
        </button>
      </div>
    </section>
  );
}
