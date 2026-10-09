import { ColorModeCards } from "./color-mode-cards";
import { LivePreview } from "./live-preview";
import {
  FONT_CHOICES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  settings,
  update,
} from "./model";
import { Action, Choice, Group, PageIntro, SettingRow, Step, Switch } from "./primitives";
import "./page-appearance.css";

const FONT_OPTIONS = FONT_CHOICES.map((font) => ({ value: font, label: font }));
const TAB_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "top", label: "Top" },
];
const LINE_HEIGHT_STEP = 0.05;
// SettingRow carries no tooltip prop, so the hint rides on the value.
const SIZE_HINT = "⌘+ and ⌘− change this too";

export function AppearancePage() {
  const current = settings.value;
  return (
    <>
      <PageIntro page="appearance" />
      <div class="srd-appearance-layout">
        <div class="srd-appearance-controls">
          <Group title="Color">
            <ColorModeCards />
          </Group>

          <Group
            title="Text"
            more={
              <SettingRow k="lineHeight">
                <Step
                  label="Line height"
                  value={current.lineHeight}
                  min={LINE_HEIGHT_MIN}
                  max={LINE_HEIGHT_MAX}
                  step={LINE_HEIGHT_STEP}
                  format={(n) => n.toFixed(2)}
                  onChange={(lineHeight) => update({ lineHeight })}
                />
              </SettingRow>
            }
          >
            <SettingRow k="fontFamily">
              <Choice
                label="Font"
                value={current.fontFamily}
                options={FONT_OPTIONS}
                onChange={(fontFamily) => update({ fontFamily })}
              />
            </SettingRow>
            <SettingRow k="fontSize">
              <span title={SIZE_HINT}>
                <Step
                  label="Size"
                  value={current.fontSize}
                  min={FONT_SIZE_MIN}
                  max={FONT_SIZE_MAX}
                  format={(n) => `${n}px`}
                  onChange={(fontSize) => update({ fontSize })}
                />
              </span>
            </SettingRow>
          </Group>

          <Group
            title="Layout"
            more={
              <SettingRow k="focusExpand">
                <Switch
                  label="Expand focused pane"
                  checked={current.focusExpand}
                  onChange={(focusExpand) => update({ focusExpand })}
                />
              </SettingRow>
            }
          >
            <SettingRow k="tabBarPosition">
              <Choice
                label="Tabs"
                value={current.tabBarPosition}
                options={TAB_OPTIONS}
                onChange={(value) => update({ tabBarPosition: value === "top" ? "top" : "left" })}
              />
            </SettingRow>
            <SettingRow k="showPaneBar">
              <Switch
                label="Pane bar"
                checked={current.showPaneBar}
                onChange={(showPaneBar) => update({ showPaneBar })}
              />
            </SettingRow>
            <SettingRow k="showStatusBar">
              <Switch
                label="Status bar"
                checked={current.showStatusBar}
                onChange={(showStatusBar) => update({ showStatusBar })}
              />
            </SettingRow>
          </Group>

          <Group title="Identity">
            <SettingRow k="customLogo">
              {current.customLogo && <span class="srd-appearance-state">custom</span>}
              <Action onClick={() => update({ customLogo: true })}>Choose…</Action>
            </SettingRow>
          </Group>
        </div>
        <div class="srd-appearance-aside">
          <LivePreview focus="appearance" />
        </div>
      </div>
    </>
  );
}
