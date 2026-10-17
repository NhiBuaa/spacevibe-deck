import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { useSignal } from "@preact/signals";
import type { SettingScope } from "../../../settings/settings-registry";
import { changedKeys, keysFor } from "../../../settings/settings-changes";
import { settings } from "../../../settings/settings-store";
import { DeckIcon, ROW_ICON } from "../../controls/deck-icon";
import { ConfigRow } from "../../controls/config-row";
import { confirmReset } from "../confirm-reset";

interface ResetRowSpec {
  readonly scope: SettingScope;
  readonly label: string;
  readonly desc: string;
  readonly keeps: string;
}

/** Three independent resets, so none of them wipes more than its row says (FBK-3). */
const RESET_ROWS: readonly ResetRowSpec[] = [
  {
    scope: "preference",
    label: "Reset preferences",
    desc: "Theme, font, behavior, shortcuts, agent choices",
    keeps: "layout, declared agents and prompt templates",
  },
  {
    scope: "layout",
    label: "Reset layout",
    desc: "Sidebar, dock and rail order",
    keeps: "preferences, declared agents and prompt templates",
  },
  {
    scope: "data",
    label: "Reset agents and templates",
    desc: "Declared agents, launch profiles, models, prompts",
    keeps: "preferences and layout",
  },
];

/**
 * The reset category's rows, each guarded by the native prompt every
 * destructive path uses (red styling is a signifier, not a guard). A row is
 * disabled while nothing in its scope differs from the defaults, and the
 * prompt lists exactly the settings that differ. The custom logo is a
 * separate store and always stays.
 */
export function ResetSection() {
  // One prompt at a time across all three rows.
  const resetting = useSignal(false);

  const run = async (spec: ResetRowSpec, keys: ReturnType<typeof changedKeys>): Promise<void> => {
    if (resetting.value) {
      return;
    }
    resetting.value = true;
    try {
      await confirmReset(keys, spec.label, spec.keeps);
    } finally {
      resetting.value = false;
    }
  };

  return (
    <>
      {RESET_ROWS.map((spec) => {
        const keys = changedKeys(settings.value, keysFor(spec.scope));
        return (
          <ConfigRow key={spec.scope} label={spec.label} desc={spec.desc} danger>
            <button
              type="button"
              class="cfg-btn cfg-btn--danger"
              title={
                keys.length === 0 ? "Nothing to reset" : `${spec.label} — asks for confirmation`
              }
              disabled={resetting.value || keys.length === 0}
              onClick={() => void run(spec, keys)}
            >
              <DeckIcon icon={ArrowCounterClockwise} size={ROW_ICON} />
              reset
            </button>
          </ConfigRow>
        );
      })}
    </>
  );
}
