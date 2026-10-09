import type { ComponentChildren } from "preact";
import {
  Bell,
  Cursor,
  Desktop,
  Minus,
  Moon,
  Palette,
  Plus,
  Rows,
  SquareHalfBottom,
  Sun,
  TextAa,
  type Icon,
} from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import { toFontStack } from "../../../../terminal/pane";
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  isModified,
  resetKeys,
  settings,
  update,
  type ColorMode,
  type CursorStyle,
  type SettingKey,
} from "../../settings-redesign/model";
import { ChangedDot, ControlReset, IconSegments, type SegmentOption } from "./control-parts";
import { ToggleTile } from "./control-toggle-tile";

/*
 * Quick controls: the handful of settings people change most, operable where
 * they are. Every tile shows its changed state and resets on hover or focus.
 */

const COLOR_OPTIONS: readonly SegmentOption<ColorMode>[] = [
  { value: "light", label: "Light", content: <Mode icon={Sun} text="Light" /> },
  { value: "dark", label: "Dark", content: <Mode icon={Moon} text="Dark" /> },
  { value: "system", label: "System", content: <Mode icon={Desktop} text="System" /> },
];

const CURSOR_OPTIONS: readonly SegmentOption<CursorStyle>[] = (
  [
    ["bar", "Bar"],
    ["block", "Block"],
    ["underline", "Line"],
  ] as const
).map(([value, text]) => ({
  value,
  label: value === "underline" ? "Underline" : text,
  content: (
    <>
      <span class={`ctl-cursor is-${value}`} aria-hidden="true" />
      {text}
    </>
  ),
}));

function Mode({ icon, text }: { readonly icon: Icon; readonly text: string }) {
  return (
    <>
      <DeckIcon icon={icon} size={ROW_ICON} />
      {text}
    </>
  );
}

/** The shell of a tile whose value is not a plain switch. */
function QuickTile({
  k,
  icon,
  label,
  wide,
  children,
}: {
  readonly k: SettingKey;
  readonly icon: Icon;
  readonly label: string;
  readonly wide?: boolean;
  readonly children: ComponentChildren;
}) {
  const modified = isModified(k);
  return (
    <div class={`ctl-q ${wide === true ? "ctl-q--wide" : ""} ${modified ? "is-modified" : ""}`}>
      <div class="ctl-q__head">
        <DeckIcon icon={icon} size={ROW_ICON} />
        <span class="ctl-q__label">{label}</span>
        {modified && <ChangedDot />}
      </div>
      {children}
      {modified && <ControlReset label={label} onReset={() => resetKeys([k])} />}
    </div>
  );
}

function SizeTile() {
  const { fontSize, fontFamily } = settings.value;
  const set = (next: number): void => update({ fontSize: next });
  return (
    <QuickTile k="fontSize" icon={TextAa} label="Size">
      <div class="ctl-size">
        <span
          class="ctl-size__sample"
          style={{ fontFamily: toFontStack(fontFamily), fontSize }}
          aria-hidden="true"
        >
          Aa
        </span>
        <div class="ctl-stepper" role="group" aria-label="Font size">
          <button
            type="button"
            aria-label="Decrease font size"
            disabled={fontSize <= FONT_SIZE_MIN}
            onClick={() => set(fontSize - 1)}
          >
            <DeckIcon icon={Minus} size={ROW_ICON} />
          </button>
          <output class="ctl-stepper__value" aria-live="polite">
            {fontSize}px
          </output>
          <button
            type="button"
            aria-label="Increase font size"
            disabled={fontSize >= FONT_SIZE_MAX}
            onClick={() => set(fontSize + 1)}
          >
            <DeckIcon icon={Plus} size={ROW_ICON} />
          </button>
        </div>
      </div>
    </QuickTile>
  );
}

export function QuickControls() {
  const s = settings.value;
  return (
    <div class="ctl-quick" role="group" aria-label="Quick controls">
      <QuickTile k="colorMode" icon={Palette} label="Color" wide>
        <IconSegments
          label="Color mode"
          value={s.colorMode}
          options={COLOR_OPTIONS}
          onChange={(colorMode) => update({ colorMode })}
        />
      </QuickTile>
      <SizeTile />
      <ToggleTile
        k="notifications"
        icon={Bell}
        label="Notifications"
        checked={s.notifications}
        onChange={(notifications) => update({ notifications })}
      />
      <ToggleTile
        k="showPaneBar"
        icon={Rows}
        label="Pane bar"
        checked={s.showPaneBar}
        onChange={(showPaneBar) => update({ showPaneBar })}
      />
      <ToggleTile
        k="showStatusBar"
        icon={SquareHalfBottom}
        label="Status bar"
        checked={s.showStatusBar}
        onChange={(showStatusBar) => update({ showStatusBar })}
      />
      <QuickTile k="cursorStyle" icon={Cursor} label="Cursor" wide>
        <IconSegments
          label="Cursor style"
          value={s.cursorStyle}
          options={CURSOR_OPTIONS}
          onChange={(cursorStyle) => update({ cursorStyle })}
        />
      </QuickTile>
    </div>
  );
}
