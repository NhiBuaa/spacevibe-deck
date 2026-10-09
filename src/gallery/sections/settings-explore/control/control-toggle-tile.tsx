import type { Icon } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import { anchorId, isModified, resetKeys, type SettingKey } from "../../settings-redesign/model";
import { useJumpTarget } from "../../settings-redesign/use-jump-target";
import { ControlReset } from "./control-parts";

/**
 * A boolean setting drawn as a whole-tile switch: press anywhere to flip it.
 * The reset sits beside the switch button, never inside it, so each is its own
 * tab stop. Also the target of a search jump (anchor, scroll, flash).
 */
export function ToggleTile({
  k,
  icon,
  label,
  checked,
  disabled,
  title,
  onChange,
}: {
  readonly k: SettingKey;
  readonly icon: Icon;
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly title?: string;
  readonly onChange: (next: boolean) => void;
}) {
  const { ref, flash } = useJumpTarget<HTMLDivElement>(k, "button");
  const modified = isModified(k);
  return (
    <div
      ref={ref}
      id={anchorId(k)}
      class={`ctl-q ctl-q--toggle ${checked ? "is-on" : ""} ${modified ? "is-modified" : ""} ${flash ? "is-flash" : ""}`}
    >
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        title={title}
        disabled={disabled}
        class="ctl-q__main"
        onClick={() => onChange(!checked)}
      >
        <span class="ctl-q__head">
          <DeckIcon icon={icon} size={ROW_ICON} />
          <span class="ctl-q__label">{label}</span>
          {modified && <span class="ctl-dot" aria-hidden="true" />}
        </span>
        <span class="ctl-q__state" aria-hidden="true">
          <span class="ctl-q__word">{checked ? "On" : "Off"}</span>
          <span class="ctl-track">
            <span class="ctl-thumb" />
          </span>
        </span>
      </button>
      {modified && <ControlReset label={label} onReset={() => resetKeys([k])} />}
    </div>
  );
}
