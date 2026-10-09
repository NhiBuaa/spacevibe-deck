import { LivePreview } from "./live-preview";
import { SCROLLBACK_CHOICES, settings, update, type CursorStyle } from "./model";
import { Choice, Group, PageIntro, SettingRow, Switch } from "./primitives";
import "./page-appearance.css";

const SCROLLBACK_OPTIONS = SCROLLBACK_CHOICES.map((lines) => ({
  value: String(lines),
  label: `${lines / 1000}k lines`,
}));
const CURSOR_OPTIONS: readonly { readonly value: CursorStyle; readonly label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "block", label: "Block" },
  { value: "underline", label: "Underline" },
];
// SettingRow carries no tooltip prop, so the hint rides on the value.
const COPY_HINT = "Selected text goes to the clipboard without ⌘C";

export function TerminalPage() {
  const current = settings.value;
  return (
    <>
      <PageIntro page="terminal" />
      <div class="srd-appearance-layout">
        <div class="srd-appearance-controls">
          <Group title="History">
            <SettingRow k="scrollback">
              <Choice
                label="Scrollback"
                value={String(current.scrollback)}
                options={SCROLLBACK_OPTIONS}
                onChange={(value) => update({ scrollback: Number(value) })}
              />
            </SettingRow>
          </Group>

          <Group title="Cursor">
            <SettingRow k="cursorStyle">
              <Choice
                label="Cursor shape"
                value={current.cursorStyle}
                options={CURSOR_OPTIONS}
                onChange={(value) => {
                  const shape = CURSOR_OPTIONS.find((option) => option.value === value);
                  if (shape !== undefined) update({ cursorStyle: shape.value });
                }}
              />
            </SettingRow>
            <SettingRow k="cursorBlink">
              <Switch
                label="Blink"
                checked={current.cursorBlink}
                onChange={(cursorBlink) => update({ cursorBlink })}
              />
            </SettingRow>
          </Group>

          <Group title="Selection">
            <SettingRow k="copyOnSelect">
              <span title={COPY_HINT}>
                <Switch
                  label="Copy on select"
                  checked={current.copyOnSelect}
                  onChange={(copyOnSelect) => update({ copyOnSelect })}
                />
              </span>
            </SettingRow>
          </Group>
        </div>
        <div class="srd-appearance-aside">
          <LivePreview focus="terminal" />
        </div>
      </div>
    </>
  );
}
