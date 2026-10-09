import { CaretLeft } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import { PAGES, settings, type PageId } from "../../settings-redesign/model";
import { changedItems } from "./control-changes";
import { areaSummary } from "./control-health";
import { goOverview, openArea } from "./control-nav";
import { ToneIcon } from "./control-parts";

/**
 * The way around once you are inside: back to the Overview, or straight to a
 * sibling area. A sibling that has a problem shows it, so the state-first
 * view does not stop at the Overview.
 */
export function AreaNav({ current }: { readonly current: PageId | "changed" }) {
  const s = settings.value;
  return (
    <nav class="ctl-nav" aria-label="Settings areas">
      <button type="button" class="ctl-nav__home" onClick={goOverview}>
        <DeckIcon icon={CaretLeft} size={ROW_ICON} />
        Overview
      </button>
      <ul class="ctl-nav__chips">
        {PAGES.map((page) => {
          const summary = areaSummary(page.id, s);
          const flagged = summary.tone === "warn" || summary.tone === "error";
          const changed = changedItems(page.id, s).length > 0;
          return (
            <li key={page.id}>
              <button
                type="button"
                class={`ctl-nav__chip ${current === page.id ? "is-current" : ""}`}
                data-ctl-focus-id={`nav:${page.id}`}
                aria-current={current === page.id ? "page" : undefined}
                onClick={() => openArea(page.id)}
              >
                {page.label}
                {flagged ? (
                  <ToneIcon tone={summary.tone} />
                ) : (
                  changed && <span class="ctl-dot" title="Changed from default" />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
