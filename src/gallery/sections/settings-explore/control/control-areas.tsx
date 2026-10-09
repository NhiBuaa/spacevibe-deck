import {
  Bell,
  CaretRight,
  Database,
  FolderSimple,
  Info,
  Keyboard,
  PaintBrush,
  Robot,
  TerminalWindow,
  type Icon,
} from "@phosphor-icons/react";
import { DeckIcon, RAIL_ICON, ROW_ICON } from "../../../../ui/controls/deck-icon";
import { PAGES, loadMode, settings, type PageId } from "../../settings-redesign/model";
import { changedItems } from "./control-changes";
import { areaSummary } from "./control-health";
import { openArea } from "./control-nav";
import { ToneIcon, toneWord } from "./control-parts";

export const AREA_ICON: Readonly<Record<PageId, Icon>> = {
  appearance: PaintBrush,
  terminal: TerminalWindow,
  agents: Robot,
  notifications: Bell,
  files: FolderSimple,
  shortcuts: Keyboard,
  about: Info,
  data: Database,
};

function AreaCard({ page, label }: { readonly page: PageId; readonly label: string }) {
  const loading = loadMode.value === "loading";
  const summary = areaSummary(page, settings.value);
  const changed = loading ? 0 : changedItems(page).length;
  const flagged = !loading && (summary.tone === "warn" || summary.tone === "error");
  return (
    <button
      type="button"
      class={`ctl-area ${flagged ? `is-${summary.tone}` : ""}`}
      data-ctl-focus-id={`area:${page}`}
      aria-label={`${label}, ${loading ? "loading" : summary.text}${flagged ? `, ${toneWord(summary.tone)}` : ""}`}
      onClick={() => openArea(page)}
    >
      <span class="ctl-area__icon">
        <DeckIcon icon={AREA_ICON[page]} size={RAIL_ICON} />
      </span>
      <span class="ctl-area__text">
        <span class="ctl-area__name">
          {label}
          {changed > 0 && (
            <span class="ctl-count" title={`${changed} changed from default`}>
              <span class="ctl-dot" aria-hidden="true" />
              {changed}
            </span>
          )}
        </span>
        <span class="ctl-area__summary">
          {flagged && <ToneIcon tone={summary.tone} />}
          <span class="ctl-area__summary-text">{summary.text}</span>
        </span>
      </span>
      <DeckIcon icon={CaretRight} size={ROW_ICON} class="ctl-area__go" />
    </button>
  );
}

export function AreaCards() {
  return (
    <div class="ctl-areas" role="group" aria-label="Areas">
      {PAGES.map((page) => (
        <AreaCard key={page.id} page={page.id} label={page.label} />
      ))}
    </div>
  );
}
