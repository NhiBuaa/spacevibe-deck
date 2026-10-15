import { ArrowLeft, CaretRight } from "@phosphor-icons/react";
import "../../launcher/agent-launch-page.css";
import { DeckIcon, ROW_ICON } from "../../ui/controls/deck-icon";
import { SectionHead, Specimen } from "../specimen";
import "./small-buttons-section.css";

/**
 * `.sbtn`, the small ghost button (07-config-rows.css), for the owner to judge by eye. Back
 * and Details are the two shipped uses; `--lead` / `--trail` take 2px back on the glyph's side.
 */
export function SmallButtonsSection() {
  return (
    <>
      <SectionHead
        title="small buttons"
        blurb="One 24px ghost button for the actions that leave a surface: Back and Details."
      />
      <Specimen name=".sbtn" note="rest · hover and focus are live · disabled" surface="chrome-2">
        <div class="sb-place">
          <div class="agent-launch-page sb-today">
            <button type="button" class="sbtn sbtn--lead">
              <DeckIcon icon={ArrowLeft} size={ROW_ICON} /> Back <kbd>Esc</kbd>
            </button>
          </div>
          <button type="button" class="sbtn sbtn--lead">
            <DeckIcon icon={ArrowLeft} size={ROW_ICON} /> Back
          </button>
          <button type="button" class="sbtn sbtn--trail">
            Details
            <DeckIcon icon={CaretRight} size={ROW_ICON} />
          </button>
          <button type="button" class="sbtn" disabled>
            Details
          </button>
        </div>
      </Specimen>
    </>
  );
}
