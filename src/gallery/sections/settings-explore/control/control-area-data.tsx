import { registryEntry, settings, type SettingKey } from "../../settings-redesign/model";
import { DataPage } from "../../settings-redesign/page-data";
import { valueText } from "./control-changes";
import { Module, Spot } from "./control-spot";

/** Gesture-owned layout: shown here so search can land on it, changed only by dragging in the app. */
const LAYOUT_KEYS: readonly SettingKey[] = ["sidebarWidth", "dockWidth", "railOrder"];

export function DataArea() {
  const current = settings.value;
  return (
    <>
      <DataPage />
      <Module title="Layout">
        {LAYOUT_KEYS.map((key) => (
          <Spot key={key} k={key}>
            <span class="ctl-readout" title={registryEntry(key).label}>
              {valueText(key, current)}
            </span>
          </Spot>
        ))}
      </Module>
    </>
  );
}
