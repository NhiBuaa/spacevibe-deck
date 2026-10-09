import { ArrowRight } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import { PAGES, pageInfo } from "../../settings-redesign/model";
import { ConfirmAction } from "../../settings-redesign/misc-actions";
import { AreaNav } from "./control-area-nav";
import { AREA_ICON } from "./control-areas";
import { changeItems, resetItems, type ChangeItem } from "./control-changes";
import { focusHeading, openArea } from "./control-nav";
import { ControlReset } from "./control-parts";
import "./control-area.css";

function ChangeRow({ item }: { readonly item: ChangeItem }) {
  const showFrom = item.from !== "" && item.from !== "Default";
  return (
    <li class="ctl-change">
      <button
        type="button"
        class="ctl-change__open"
        title={`Open ${pageInfo(item.page).label}`}
        onClick={() => openArea(item.page)}
      >
        <span class="ctl-change__label">{item.label}</span>
        <span class="ctl-change__values">
          {showFrom && (
            <>
              <span class="ctl-change__from">{item.from}</span>
              <DeckIcon icon={ArrowRight} size={ROW_ICON} />
            </>
          )}
          <span class="ctl-change__to">{item.to}</span>
        </span>
      </button>
      {item.reset !== null && <ControlReset label={item.label} onReset={item.reset} />}
    </li>
  );
}

function ChangeGroup({
  page,
  items,
}: {
  readonly page: (typeof PAGES)[number];
  readonly items: readonly ChangeItem[];
}) {
  return (
    <section class="ctl-module" aria-label={page.label}>
      <h3 class="ctl-module__title">
        <DeckIcon icon={AREA_ICON[page.id]} size={ROW_ICON} />
        {page.label}
      </h3>
      <ul class="ctl-changes">
        {items.map((item) => (
          <ChangeRow key={item.id} item={item} />
        ))}
      </ul>
    </section>
  );
}

/** Everything that differs from default, grouped by area, each with its own reset. */
export function ChangedView() {
  const items = changeItems();
  const changed = items.filter((item) => item.kind === "changed");
  const added = items.length - changed.length;
  const groups = PAGES.map((page) => ({
    page,
    items: items.filter((item) => item.page === page.id),
  })).filter((group) => group.items.length > 0);
  return (
    <div class="ctl-page">
      <AreaNav current="changed" />
      <header class="ctl-pagehead">
        <h2 class="ctl-pagehead__title" tabIndex={-1} data-ctl-heading>
          Changed
        </h2>
        <span class="ctl-pagehead__count">{changed.length}</span>
        {changed.length > 0 && (
          <div class="ctl-pagehead__end">
            <span title="Your own agents and prompt templates stay">
              <ConfirmAction
                confirmLabel={`Reset ${changed.length}?`}
                resultLabel="Reset"
                onConfirm={() => {
                  resetItems(changed);
                  focusHeading();
                }}
              >
                Reset all
              </ConfirmAction>
            </span>
          </div>
        )}
      </header>
      {groups.length === 0 && (
        <p class="ctl-empty" role="status">
          Everything is at its default
        </p>
      )}
      {added > 0 && changed.length === 0 && (
        <p class="ctl-empty" role="status">
          Only your own content differs
        </p>
      )}
      <div class="ctl-page__groups">
        {groups.map((group) => (
          <ChangeGroup key={group.page.id} page={group.page} items={group.items} />
        ))}
      </div>
    </div>
  );
}
