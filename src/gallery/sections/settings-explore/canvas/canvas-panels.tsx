import type { ComponentChildren } from "preact";
import { ColorModeCards } from "../../settings-redesign/color-mode-cards";
import {
  FONT_CHOICES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  SCROLLBACK_CHOICES,
  registryEntry,
  settings,
  update,
  type CursorStyle,
  type DemoSettings,
  type SettingKey,
} from "../../settings-redesign/model";
import {
  Action,
  Choice,
  Group,
  PlainRow,
  SettingRow,
  Step,
  Switch,
} from "../../settings-redesign/primitives";
import { linkEvents } from "./canvas-link";
import { testNonce, type RegionId } from "./canvas-regions";

/*
 * The inspector's panels for the regions of the miniature. Each is a plain
 * column of the shared setting rows; what it adds is `linkEvents`, which lets a
 * hovered or focused control light the part of Deck it changes.
 */

const FONT_OPTIONS = FONT_CHOICES.map((font) => ({ value: font, label: font }));
const SCROLLBACK_OPTIONS = SCROLLBACK_CHOICES.map((lines) => ({
  value: String(lines),
  label: `${lines / 1000}k lines`,
}));
const CURSOR_OPTIONS: readonly { readonly value: CursorStyle; readonly label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "block", label: "Block" },
  { value: "underline", label: "Underline" },
];
const TAB_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "top", label: "Top" },
];
const FOCUS_OPTIONS = [
  { value: "false", label: "Background" },
  { value: "true", label: "Always" },
];
const LINE_HEIGHT_STEP = 0.05;
const EVENT_KEYS = ["notifyNeedsYou", "notifyFinished", "notifyErrors"] as const;
const SIZE_HINT = "⌘+ and ⌘− change this too";

function Panel({
  region,
  children,
}: {
  readonly region: RegionId;
  readonly children: ComponentChildren;
}) {
  return (
    <div class="cv-panel" {...linkEvents({ region })}>
      {children}
    </div>
  );
}

function SwitchRow({ k }: { readonly k: SettingKey & keyof DemoSettings }) {
  const checked = settings.value[k] === true;
  return (
    <SettingRow k={k}>
      <Switch
        label={registryEntry(k).label}
        checked={checked}
        onChange={(next) => update({ [k]: next } as Partial<DemoSettings>)}
      />
    </SettingRow>
  );
}

export function WindowPanel() {
  const s = settings.value;
  return (
    <Panel region="window">
      <Group title="Color">
        <ColorModeCards />
      </Group>
      <Group title="Identity">
        <SettingRow k="customLogo">
          {s.customLogo && <span class="cv-quiet">custom</span>}
          <Action onClick={() => update({ customLogo: true })}>Choose…</Action>
        </SettingRow>
      </Group>
    </Panel>
  );
}

export function TabsPanel() {
  return (
    <Panel region="tabs">
      <Group>
        <SettingRow k="tabBarPosition">
          <Choice
            label="Tabs"
            value={settings.value.tabBarPosition}
            options={TAB_OPTIONS}
            onChange={(value) => update({ tabBarPosition: value === "top" ? "top" : "left" })}
          />
        </SettingRow>
      </Group>
    </Panel>
  );
}

export function PanePanel() {
  const s = settings.value;
  return (
    <Panel region="pane">
      <Group title="Text">
        <SettingRow k="fontFamily">
          <Choice
            label="Font"
            value={s.fontFamily}
            options={FONT_OPTIONS}
            onChange={(fontFamily) => update({ fontFamily })}
          />
        </SettingRow>
        <SettingRow k="fontSize">
          <span title={SIZE_HINT}>
            <Step
              label="Size"
              value={s.fontSize}
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              format={(n) => `${n}px`}
              onChange={(fontSize) => update({ fontSize })}
            />
          </span>
        </SettingRow>
        <SettingRow k="lineHeight">
          <Step
            label="Line height"
            value={s.lineHeight}
            min={LINE_HEIGHT_MIN}
            max={LINE_HEIGHT_MAX}
            step={LINE_HEIGHT_STEP}
            format={(n) => n.toFixed(2)}
            onChange={(lineHeight) => update({ lineHeight })}
          />
        </SettingRow>
      </Group>
      <Group title="Cursor">
        <SettingRow k="cursorStyle">
          <Choice
            label="Cursor shape"
            value={s.cursorStyle}
            options={CURSOR_OPTIONS}
            onChange={(value) => {
              const shape = CURSOR_OPTIONS.find((option) => option.value === value);
              if (shape !== undefined) update({ cursorStyle: shape.value });
            }}
          />
        </SettingRow>
        <SwitchRow k="cursorBlink" />
      </Group>
      <Group title="Behavior">
        <SettingRow k="scrollback">
          <Choice
            label="Scrollback"
            value={String(s.scrollback)}
            options={SCROLLBACK_OPTIONS}
            onChange={(value) => update({ scrollback: Number(value) })}
          />
        </SettingRow>
        <SwitchRow k="copyOnSelect" />
        <SwitchRow k="focusExpand" />
      </Group>
    </Panel>
  );
}

/** The pane bar and the status bar are one switch each. */
export function BarPanel({ region }: { readonly region: "panebar" | "statusbar" }) {
  return (
    <Panel region={region}>
      <Group>
        <SwitchRow k={region === "panebar" ? "showPaneBar" : "showStatusBar"} />
      </Group>
    </Panel>
  );
}

export function ToastPanel() {
  const s = settings.value;
  return (
    <Panel region="toast">
      <Group title="Alerts">
        <SwitchRow k="notifications" />
        {EVENT_KEYS.map((key) => (
          <SettingRow key={key} k={key}>
            <Switch
              label={registryEntry(key).label}
              checked={s[key]}
              disabled={!s.notifications}
              onChange={(next) => update({ [key]: next } as Partial<DemoSettings>)}
            />
          </SettingRow>
        ))}
      </Group>
      <Group title="Delivery">
        <SettingRow k="notifyWhileFocused">
          <Choice
            label={registryEntry("notifyWhileFocused").label}
            value={String(s.notifyWhileFocused)}
            options={FOCUS_OPTIONS}
            onChange={(value) => update({ notifyWhileFocused: value === "true" })}
          />
        </SettingRow>
        <PlainRow label="Test notification">
          <Action
            disabled={!s.notifications}
            onClick={() => {
              testNonce.value += 1;
            }}
          >
            Send test
          </Action>
        </PlainRow>
      </Group>
    </Panel>
  );
}
