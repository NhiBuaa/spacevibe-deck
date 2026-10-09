import type { ComponentType } from "preact";
import { DeckIcon, RAIL_ICON } from "../../../../ui/controls/deck-icon";
import { pageInfo, settings, type PageId } from "../../settings-redesign/model";
import { ConfirmAction } from "../../settings-redesign/misc-actions";
import { AboutPage } from "../../settings-redesign/page-about";
import { FilesPage } from "../../settings-redesign/page-files";
import { ShortcutsPage } from "../../settings-redesign/page-shortcuts";
import { TerminalPage } from "../../settings-redesign/page-terminal";
import { AppearanceArea } from "./control-area-appearance";
import { AgentsArea } from "./control-area-agents";
import { DataArea } from "./control-area-data";
import { AreaNav } from "./control-area-nav";
import { NotificationsArea } from "./control-area-notifications";
import { AREA_ICON } from "./control-areas";
import { changedItems, resetItems } from "./control-changes";
import { focusHeading } from "./control-nav";
import { areaSummary } from "./control-health";
import { ToneIcon } from "./control-parts";
import "./control-area.css";

/**
 * Appearance, Agents and Notifications are laid out for this direction. The
 * other five keep the shared page content: this direction changes how you get
 * there and what you see first, not what a keymap or a privacy notice is.
 */
const CONTENT: Readonly<Record<PageId, ComponentType>> = {
  appearance: AppearanceArea,
  terminal: TerminalPage,
  agents: AgentsArea,
  notifications: NotificationsArea,
  files: FilesPage,
  shortcuts: ShortcutsPage,
  about: AboutPage,
  data: DataArea,
};

export function AreaPage({ page }: { readonly page: PageId }) {
  const Content = CONTENT[page];
  const info = pageInfo(page);
  const summary = areaSummary(page, settings.value);
  const changed = changedItems(page);
  const flagged = summary.tone === "warn" || summary.tone === "error";
  return (
    <div class="ctl-page">
      <AreaNav current={page} />
      <header class="ctl-pagehead">
        <h2 class="ctl-pagehead__title" tabIndex={-1} data-ctl-heading>
          <DeckIcon icon={AREA_ICON[page]} size={RAIL_ICON} />
          {info.label}
        </h2>
        <p class="ctl-pagehead__summary">
          {flagged && <ToneIcon tone={summary.tone} />}
          {summary.text}
        </p>
        {changed.length > 0 && (
          <div class="ctl-pagehead__end">
            <span class="ctl-dot" aria-hidden="true" />
            <span>{changed.length} changed</span>
            <span title={changed.map((item) => item.label).join(", ")}>
              <ConfirmAction
                confirmLabel={`Reset ${changed.length}?`}
                resultLabel="Reset"
                onConfirm={() => {
                  resetItems(changed);
                  focusHeading();
                }}
              >
                Reset area
              </ConfirmAction>
            </span>
          </div>
        )}
      </header>
      <div class="ctl-page__body">
        <Content />
      </div>
    </div>
  );
}
