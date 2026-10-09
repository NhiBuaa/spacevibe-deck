import type { ComponentChildren } from "preact";
import { CLI_DEFAULT_CHOICE } from "../../../../ui/settings/agent-choice-value";
import {
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LINE_HEIGHT_MAX,
  LINE_HEIGHT_MIN,
  settings,
  signalStatus,
  update,
  updateAgent,
  type DemoAgent,
  type DemoSettings,
  type SettingKey,
} from "../../settings-redesign/model";
import { MenuValue } from "../../settings-redesign/menu-value";
import { Action, Choice, Step, Switch, TextValue } from "../../settings-redesign/primitives";
import type { AgentField } from "./command-hits";
import {
  APP_OPTIONS,
  BOOLEAN_KEYS,
  CURSOR_OPTIONS,
  FONT_OPTIONS,
  LINE_HEIGHT_STEP,
  MODE_OPTIONS,
  NOTIFY_CHILDREN,
  NOTIFY_WHEN_OPTIONS,
  SCROLLBACK_OPTIONS,
  TAB_BAR_OPTIONS,
  TAB_SIZE_OPTIONS,
  homeProblem,
  plural,
  rowLabel,
} from "./command-options";

/*
 * Command direction: the value half of a row. One function maps a registry key to the real
 * control (switch, choice, step, menu, text), so a result row, a quick row and an area scope
 * all draw the same setting the same way.
 */

/** A choice that is disabled as a whole while its parent switch is off. */
function Locked({
  locked,
  children,
}: {
  readonly locked: boolean;
  readonly children: ComponentChildren;
}) {
  return (
    <fieldset class="cmd-lock" disabled={locked}>
      {children}
    </fieldset>
  );
}

export function SettingValue({ k }: { readonly k: SettingKey }) {
  const s = settings.value;
  const label = rowLabel(k);

  if (BOOLEAN_KEYS.has(k)) {
    return (
      <Switch
        label={label}
        checked={s[k] === true}
        disabled={NOTIFY_CHILDREN.has(k) && !s.notifications}
        onChange={(next) => update({ [k]: next } as Partial<DemoSettings>)}
      />
    );
  }

  switch (k) {
    case "colorMode":
      return (
        <Choice
          label={label}
          value={s.colorMode}
          options={MODE_OPTIONS}
          onChange={(value) => {
            const mode = MODE_OPTIONS.find((option) => option.value === value);
            if (mode !== undefined) update({ colorMode: mode.value });
          }}
        />
      );
    case "fontFamily":
      return (
        <Choice
          label={label}
          value={s.fontFamily}
          options={FONT_OPTIONS}
          onChange={(fontFamily) => update({ fontFamily })}
        />
      );
    case "fontSize":
      return (
        <Step
          label={label}
          value={s.fontSize}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          format={(n) => `${n}px`}
          onChange={(fontSize) => update({ fontSize })}
        />
      );
    case "lineHeight":
      return (
        <Step
          label={label}
          value={s.lineHeight}
          min={LINE_HEIGHT_MIN}
          max={LINE_HEIGHT_MAX}
          step={LINE_HEIGHT_STEP}
          format={(n) => n.toFixed(2)}
          onChange={(lineHeight) => update({ lineHeight })}
        />
      );
    case "tabBarPosition":
      return (
        <Choice
          label={label}
          value={s.tabBarPosition}
          options={TAB_BAR_OPTIONS}
          onChange={(value) => update({ tabBarPosition: value === "top" ? "top" : "left" })}
        />
      );
    case "customLogo":
      return (
        <>
          {s.customLogo && <span class="cmd-readout">custom</span>}
          <Action onClick={() => update({ customLogo: true })}>Choose…</Action>
        </>
      );
    case "scrollback":
      return (
        <Choice
          label={label}
          value={String(s.scrollback)}
          options={SCROLLBACK_OPTIONS}
          onChange={(value) => update({ scrollback: Number(value) })}
        />
      );
    case "cursorStyle":
      return (
        <Choice
          label={label}
          value={s.cursorStyle}
          options={CURSOR_OPTIONS}
          onChange={(value) => {
            const shape = CURSOR_OPTIONS.find((option) => option.value === value);
            if (shape !== undefined) update({ cursorStyle: shape.value });
          }}
        />
      );
    case "notifyWhileFocused":
      return (
        <Locked locked={!s.notifications}>
          <Choice
            label={label}
            value={s.notifyWhileFocused ? "always" : "background"}
            options={NOTIFY_WHEN_OPTIONS}
            onChange={(value) => update({ notifyWhileFocused: value === "always" })}
          />
        </Locked>
      );
    case "externalApp":
      return (
        <Choice
          label={label}
          value={s.externalApp}
          options={APP_OPTIONS}
          onChange={(externalApp) => update({ externalApp })}
        />
      );
    case "editorTabSize":
      return (
        <Choice
          label={label}
          value={String(s.editorTabSize)}
          options={TAB_SIZE_OPTIONS}
          onChange={(size) => update({ editorTabSize: Number(size) })}
        />
      );
    case "browserHome":
      return (
        <TextValue
          label={label}
          value={s.browserHome}
          placeholder="http://localhost:3000"
          validate={homeProblem}
          onCommit={(browserHome) => update({ browserHome })}
        />
      );
    case "sidebarWidth":
      return <span class="cmd-readout">{s.sidebarWidth}px</span>;
    case "dockWidth":
      return <span class="cmd-readout">{s.dockWidth}px</span>;
    case "railOrder":
      return <span class="cmd-readout">{plural(s.railOrder.length, "project")}</span>;
    case "promptTemplates":
      return <span class="cmd-readout">{plural(s.promptTemplates.length, "template")}</span>;
    default:
      return null;
  }
}

/** One agent's field as a live control; the honest signal state sits beside its switch. */
export function AgentFieldValue({
  agent,
  field,
}: {
  readonly agent: DemoAgent;
  readonly field: AgentField;
}) {
  if (field === "pickers") {
    return (
      <Switch
        label={`Show ${agent.label} in pickers`}
        checked={agent.enabled}
        onChange={(enabled) => updateAgent(agent.id, { enabled })}
      />
    );
  }
  if (field === "signals") {
    const status = signalStatus(agent);
    const unsupported = status === "unsupported";
    const reporting = status === "active" || status === "failed";
    return (
      <>
        <span class={`cmd-status ${reporting ? `is-${status}` : ""}`}>
          {reporting && <span class={`srd-agents-signal is-${status}`} />}
          {status === "active" && "Reporting"}
          {status === "failed" && "Couldn't install hooks"}
          {status === "off" && "Estimated from output"}
          {unsupported && "Not on Windows"}
        </span>
        <Switch
          label={`${agent.label} agent-reported status`}
          checked={agent.signals === true && !unsupported}
          disabled={unsupported}
          onChange={(next) => updateAgent(agent.id, { signals: next })}
        />
      </>
    );
  }
  const isModel = field === "model";
  const values = isModel ? agent.models : (agent.efforts ?? []);
  return (
    // Model ids are long; a row of them is always a menu, whatever their count.
    <MenuValue
      label={`${agent.label} default ${field}`}
      value={(isModel ? agent.model : agent.effort) ?? ""}
      options={[CLI_DEFAULT_CHOICE, ...values.map((value) => ({ value, label: value }))]}
      onChange={(value) => {
        const next = value === "" ? null : value;
        updateAgent(agent.id, isModel ? { model: next } : { effort: next });
      }}
    />
  );
}
