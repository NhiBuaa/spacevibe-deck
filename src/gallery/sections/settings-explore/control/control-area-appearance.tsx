import { toFontStack } from "../../../../terminal/pane";
import { ColorModeCards } from "../../settings-redesign/color-mode-cards";
import { LivePreview } from "../../settings-redesign/live-preview";
import {
  FONT_CHOICES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  settings,
  update,
} from "../../settings-redesign/model";
import { Action, Choice, Step, Switch } from "../../settings-redesign/primitives";
import { IconSegments, type SegmentOption } from "./control-parts";
import { Module, Spot } from "./control-spot";

const TAB_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "top", label: "Top" },
];
const LINE_HEIGHT_STEP = 0.05;

const FONT_OPTIONS: readonly SegmentOption<string>[] = FONT_CHOICES.map((font) => ({
  value: font,
  label: font,
  content: (
    <>
      <span class="ctl-font__aa" style={{ fontFamily: toFontStack(font) }} aria-hidden="true">
        Aa
      </span>
      <span class="ctl-font__name">{font}</span>
    </>
  ),
}));

/** Color, text and layout as separate modules beside the preview that shows each change. */
export function AppearanceArea() {
  const s = settings.value;
  return (
    <div class="ctl-appearance">
      <div class="ctl-appearance__controls">
        <Module title="Color">
          <ColorModeCards />
        </Module>
        <Module title="Text">
          <Spot k="fontFamily" stack>
            <IconSegments
              label="Font"
              variant="ctl-seg--fonts"
              value={s.fontFamily}
              options={FONT_OPTIONS}
              onChange={(fontFamily) => update({ fontFamily })}
            />
          </Spot>
          <Spot k="fontSize">
            <span title="⌘+ and ⌘− change this too">
              <Step
                label="Size"
                value={s.fontSize}
                min={FONT_SIZE_MIN}
                max={FONT_SIZE_MAX}
                format={(n) => `${n}px`}
                onChange={(fontSize) => update({ fontSize })}
              />
            </span>
          </Spot>
          <Spot k="lineHeight">
            <Step
              label="Line height"
              value={s.lineHeight}
              min={LINE_HEIGHT_MIN}
              max={LINE_HEIGHT_MAX}
              step={LINE_HEIGHT_STEP}
              format={(n) => n.toFixed(2)}
              onChange={(lineHeight) => update({ lineHeight })}
            />
          </Spot>
        </Module>
        <Module title="Layout">
          <Spot k="tabBarPosition">
            <Choice
              label="Tabs"
              value={s.tabBarPosition}
              options={TAB_OPTIONS}
              onChange={(value) => update({ tabBarPosition: value === "top" ? "top" : "left" })}
            />
          </Spot>
          <Spot k="showPaneBar">
            <Switch
              label="Pane bar"
              checked={s.showPaneBar}
              onChange={(showPaneBar) => update({ showPaneBar })}
            />
          </Spot>
          <Spot k="showStatusBar">
            <Switch
              label="Status bar"
              checked={s.showStatusBar}
              onChange={(showStatusBar) => update({ showStatusBar })}
            />
          </Spot>
          <Spot k="focusExpand">
            <Switch
              label="Expand focused pane"
              checked={s.focusExpand}
              onChange={(focusExpand) => update({ focusExpand })}
            />
          </Spot>
        </Module>
        <Module title="Identity">
          <Spot k="customLogo">
            {s.customLogo && <span class="ctl-readout">custom</span>}
            <Action onClick={() => update({ customLogo: true })}>Choose…</Action>
          </Spot>
        </Module>
      </div>
      <div class="ctl-appearance__preview">
        <LivePreview focus="appearance" />
      </div>
    </div>
  );
}
