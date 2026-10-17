import { reportPersistError } from "../../chrome/events";
import { ask } from "../../host/dialog-host";
import { SETTINGS_REGISTRY } from "../../settings/settings-registry";
import type { Settings } from "../../settings/settings-schema";
import { resetSettingsKeys } from "../../settings/settings-store";

/**
 * Names what a reset will change and what it leaves, asks, then resets exactly
 * those keys (FBK-3). A failed prompt resets nothing and says so.
 */
export async function confirmReset(
  keys: readonly (keyof Settings)[],
  title: string,
  keeps: string,
): Promise<void> {
  const labels = keys.map((key) => SETTINGS_REGISTRY[key].label).join(", ");
  try {
    const confirmed = await ask(`Resets: ${labels}.\nKeeps: ${keeps}.\nThis can't be undone.`, {
      title,
      kind: "warning",
      okLabel: "Reset",
      cancelLabel: "Cancel",
    });
    if (confirmed) {
      resetSettingsKeys(keys);
    }
  } catch {
    reportPersistError("Couldn't confirm the reset — nothing was changed.");
  }
}
