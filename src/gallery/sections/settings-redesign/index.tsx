import { SectionHead } from "../../specimen";
import { DemoToolbar } from "./demo-toolbar";
import { SettingsFrame } from "./shell";
import "./settings-redesign.css";
import "./settings-redesign-demo.css";
import "./settings-redesign-rail.css";

/**
 * The proposed Settings screen on in-memory data (plan:
 * docs/plans/2026-10-04-settings-redesign.md, step 4). The toolbar is gallery
 * chrome; everything inside the frame is what the product would ship.
 */
export function SettingsRedesignSection() {
  return (
    <div class="srd-stage">
      <SectionHead
        title="Settings redesign · prototype"
        blurb="The proposed structure on in-memory data: nothing here is saved. The demo controls only force states the real screen reaches — loading, a failed read, failed saves, an edit from another window."
      />
      <DemoToolbar />
      <SettingsFrame />
    </div>
  );
}
