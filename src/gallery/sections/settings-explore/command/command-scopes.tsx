import type { ComponentType } from "preact";
import { Check, Lightning, MagnifyingGlass, PencilSimpleLine } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../../ui/controls/deck-icon";
import { AboutPage } from "../../settings-redesign/page-about";
import { DataPage } from "../../settings-redesign/page-data";
import { LivePreview } from "../../settings-redesign/live-preview";
import { ConfirmAction } from "../../settings-redesign/misc-actions";
import {
  PAGES,
  SHORTCUT_ACTIONS,
  pageInfo,
  registryEntry,
  settings,
  shortcutConflicts,
  type PageId,
} from "../../settings-redesign/model";
import { AgentsScope } from "./command-agents";
import { activateRow, focusFieldFrom } from "./command-keys";
import { HitSection } from "./command-rows";
import { QUICK_KEYS, agentHit, settingHit, type Hit } from "./command-hits";
import {
  areaSettingHits,
  areaShortcutHits,
  changedHits,
  groupHits,
  inAreaOrder,
  resetHit,
  searchHits,
} from "./command-search";
import { AREA_ICONS, openArea, openChanged } from "./command-state";

/*
 * Command direction: what fills the column under the field. Home (area tokens and a few live
 * rows), results (a query), the changed list, and one scope per area. Every one of them is made
 * of the same rows.
 */

const HOME_AREAS: readonly PageId[] = PAGES.map((page) => page.id);

function Empty({ text }: { readonly text: string }) {
  return (
    <p class="cmd-empty" role="status">
      <DeckIcon icon={MagnifyingGlass} size={ROW_ICON} />
      {text}
    </p>
  );
}

// ── home ───────────────────────────────────────────────────────────────────

export function HomeView() {
  const changed = changedHits();
  const total = changed.length;
  return (
    <>
      <div class="cmd-tokens" role="group" aria-label="Areas">
        {HOME_AREAS.map((area) => {
          const page = pageInfo(area);
          return (
            <button
              key={area}
              type="button"
              class="cmd-token"
              title={page.lede}
              onClick={() => openArea(area)}
            >
              <DeckIcon icon={AREA_ICONS[area]} size={ROW_ICON} />
              {page.label}
              {changed.some((hit) => hit.area === area) && (
                <span class="srd-dot" role="img" aria-label="has changes" />
              )}
            </button>
          );
        })}
        <span class="cmd-tokens__rule" aria-hidden="true" />
        <button
          type="button"
          class="cmd-token cmd-token--changed"
          disabled={total === 0}
          title="Every setting that differs from its default"
          onClick={openChanged}
        >
          <DeckIcon icon={PencilSimpleLine} size={ROW_ICON} />
          Changed
          <span class="cmd-token__count">{total}</span>
        </button>
      </div>
      <HitSection
        label="Frequent"
        icon={Lightning}
        hits={QUICK_KEYS.map((key) => settingHit(key, "q"))}
        pathMode="area"
      />
      <HitSection
        label="Agents"
        icon={AREA_ICONS.agents}
        hits={settings.value.agents
          .filter((agent) => agent.installed)
          .map((agent) => agentHit(agent.id))}
        pathMode="none"
      />
    </>
  );
}

// ── results ────────────────────────────────────────────────────────────────

function GroupedByArea({
  hits,
  headed,
}: {
  readonly hits: readonly Hit[];
  readonly headed: boolean;
}) {
  return (
    <>
      {groupHits(hits, (hit) => hit.area).map((group) => {
        const area = group.key as PageId;
        return (
          <HitSection
            key={group.key}
            label={headed ? pageInfo(area).label : ""}
            icon={AREA_ICONS[area]}
            hits={group.hits}
            pathMode="group"
          />
        );
      })}
    </>
  );
}

export function ResultsView({ q, area }: { readonly q: string; readonly area: PageId | null }) {
  const hits = searchHits(q, area);
  if (hits.length === 0) return <Empty text={`Nothing matches “${q}”`} />;
  return (
    <>
      <span class="cmd-sr" role="status">
        {hits.length} {hits.length === 1 ? "result" : "results"}
      </span>
      <GroupedByArea hits={hits} headed={area === null} />
    </>
  );
}

// ── changed ────────────────────────────────────────────────────────────────

/** The count of what is shown and one confirm-in-place reset for all of it. */
function ChangeBar({ hits, action }: { readonly hits: readonly Hit[]; readonly action: string }) {
  if (hits.length === 0) return null;
  return (
    <div class="cmd-bar">
      <span class="cmd-bar__count">
        <span class="srd-dot" aria-hidden="true" />
        {hits.length} changed
      </span>
      <ConfirmAction
        confirmLabel={`Reset ${hits.length}?`}
        onConfirm={() => {
          // The confirm pill is about to unmount with the rows it reset; keep the keyboard.
          const from = document.activeElement;
          hits.forEach(resetHit);
          focusFieldFrom(from);
        }}
      >
        {action}
      </ConfirmAction>
    </div>
  );
}

export function ChangedView({ q }: { readonly q: string }) {
  const hits = inAreaOrder(changedHits(q));
  return (
    <>
      <ChangeBar hits={hits} action="Reset all shown" />
      {hits.length === 0 ? (
        <p class="cmd-empty" role="status">
          <DeckIcon icon={Check} size={ROW_ICON} />
          {q === "" ? "Nothing differs from the defaults" : `No changed setting matches “${q}”`}
        </p>
      ) : (
        <GroupedByArea hits={hits} headed />
      )}
    </>
  );
}

// ── area scopes ────────────────────────────────────────────────────────────

/** Appearance and Terminal pair their rows with the live preview they change. */
function previewFor(area: PageId) {
  if (area === "appearance") return <LivePreview focus="appearance" />;
  if (area === "terminal") return <LivePreview focus="terminal" />;
  return null;
}

function RegistryScope({ area }: { readonly area: PageId }) {
  const groups = groupHits(areaSettingHits(area), (hit) =>
    hit.type === "setting" ? registryEntry(hit.key).group : "",
  );
  const preview = previewFor(area);
  return (
    <div class={`cmd-split ${preview === null ? "" : "has-aside"}`}>
      <div class="cmd-split__main">
        {groups.map((group) => (
          <HitSection
            key={group.key}
            label={groups.length > 1 ? group.key : ""}
            hits={group.hits}
            pathMode="none"
          />
        ))}
      </div>
      {preview !== null && <aside class="cmd-split__aside">{preview}</aside>}
    </div>
  );
}

function ShortcutsScope() {
  const conflicts = shortcutConflicts(settings.value);
  const first = SHORTCUT_ACTIONS.find((action) => conflicts.has(action.id));
  const groupOf = (hit: Hit): string =>
    hit.type === "shortcut"
      ? (SHORTCUT_ACTIONS.find((action) => action.id === hit.actionId)?.group ?? "")
      : "";
  return (
    <>
      {first !== undefined && (
        <button
          type="button"
          class="cmd-conflict"
          title="Show the first one"
          onClick={() => activateRow(`cmd-row-k:${first.id}`)}
        >
          <span class="cmd-conflict__dot" aria-hidden="true" />
          {conflicts.size} shortcuts conflict
        </button>
      )}
      {groupHits(areaShortcutHits(), groupOf).map((group) => (
        <HitSection key={group.key} label={group.key} hits={group.hits} pathMode="none" />
      ))}
    </>
  );
}

/** About and Data keep the shared pages' content; their own page headers are hidden by CSS. */
function SharedPage({ Page }: { readonly Page: ComponentType }) {
  return (
    <div class="cmd-legacy cmd-nav">
      <Page />
    </div>
  );
}

function AreaBody({ area }: { readonly area: PageId }) {
  switch (area) {
    case "agents":
      return <AgentsScope />;
    case "shortcuts":
      return <ShortcutsScope />;
    case "about":
      return <SharedPage Page={AboutPage} />;
    case "data":
      return <SharedPage Page={DataPage} />;
    default:
      return <RegistryScope area={area} />;
  }
}

export function AreaScope({ area }: { readonly area: PageId }) {
  return (
    <>
      <ChangeBar hits={changedHits("", area)} action="Reset area" />
      <AreaBody area={area} />
    </>
  );
}
