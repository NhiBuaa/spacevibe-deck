import { useSignal } from "@preact/signals";
import { useEffect } from "preact/hooks";
import { EMPTY_COUNTERS, type UsageBucket, type UsageSnapshot } from "../../lib/usage-snapshot";
import { activeTabIndex } from "../../terminal/tabs-store";
import { DesktopChrome } from "../../ui/desktop-chrome";
import { DockToggle } from "../../ui/dock/dock-toggle";
import { UsagePage } from "../../ui/usage/usage-page";
import { usageSnapshot } from "../../usage/usage-store";
import {
  agentRailNavigationSpecimen,
  deckToolbarSpecimen,
  NOOP,
  repositoryScopedTabStripSpecimen,
  sidebarFrameActionsSpecimen,
} from "../chrome-fixtures";
import { SectionHead, Specimen, StateLabel } from "../specimen";

const QUARTER_HOUR_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAYS_SHOWN = 14;

/** One model's daily token mix, scaled by a weekday-ish wobble so the bars differ. */
const FIXTURE_MODELS = [
  { agent: "claude", model: "claude-opus-4-5", input: 240_000, read: 5_200_000, output: 90_000 },
  { agent: "claude", model: "claude-sonnet-4-5", input: 120_000, read: 2_400_000, output: 60_000 },
  { agent: "codex", model: "gpt-5-codex", input: 180_000, read: 3_100_000, output: 70_000 },
] as const;

const FIXTURE_REPOS = [
  "/Users/dev/spacevibe/spacevibe-deck",
  "/Users/dev/spacevibe/spacevibe-bench",
  "/Users/dev/tools/tiny-cli",
] as const;

/** A fortnight of buckets so the overview has a shape; fixed shape, shifted to now. */
function fixtureSnapshot(now: number): UsageSnapshot {
  const buckets: UsageBucket[] = [];
  for (let day = 0; day < DAYS_SHOWN; day += 1) {
    const wobble = 0.35 + ((day * 37) % 11) / 11;
    const bucketStartMs = Math.floor((now - day * DAY_MS) / QUARTER_HOUR_MS) * QUARTER_HOUR_MS;
    for (const entry of FIXTURE_MODELS) {
      buckets.push({
        bucketStartMs,
        agent: entry.agent,
        model: entry.model,
        repo: FIXTURE_REPOS[(day + entry.input) % FIXTURE_REPOS.length],
        counters: {
          ...EMPTY_COUNTERS,
          cacheCreate5m: Math.round(entry.input * 0.4 * wobble),
          inputUncached: Math.round(entry.input * wobble),
          cacheRead: Math.round(entry.read * wobble),
          output: Math.round(entry.output * wobble),
        },
      });
    }
  }
  return {
    scannedAtMs: now,
    buckets,
    sources: [
      { agent: "claude", state: "ok", filesScanned: 412 },
      { agent: "codex", state: "ok", filesScanned: 96 },
    ],
    skippedLines: 0,
  };
}

function selectTab(index: number): void {
  activeTabIndex.value = index;
}

/**
 * The real rail and window shell with the real `UsagePage` over the stage's
 * content area. Back and Escape close it; the specimen re-opens on the next
 * frame so the page stays reviewable, as the Settings specimen does.
 */
function UsagePageFrame() {
  const open = useSignal(true);
  useEffect(() => {
    usageSnapshot.value = fixtureSnapshot(Date.now());
  }, []);
  const close = (): void => {
    open.value = false;
    requestAnimationFrame(() => {
      open.value = true;
    });
  };
  return (
    <DesktopChrome
      sidebar
      sidebarToggle={sidebarFrameActionsSpecimen()}
      toolbar={null}
      sidebarNavigation={agentRailNavigationSpecimen({
        onSelectTab: selectTab,
        onFocusPane: selectTab,
      })}
      topTabs={null}
      stage={
        <main class="stage stage--strip">
          <div class="stage__strip" data-tauri-drag-region>
            {repositoryScopedTabStripSpecimen()}
            <div class="stage__strip-actions">{deckToolbarSpecimen()}</div>
            <DockToggle open={false} onToggle={NOOP} />
          </div>
          <div class="stage__tabs" aria-hidden="true" />
          <UsagePage open={open.value} onClose={close} />
        </main>
      }
      status={null}
      onMacTitlebarDoubleClick={NOOP}
    />
  );
}

export function UsagePageSection() {
  return (
    <>
      <SectionHead
        title="Usage page"
        blurb="The details page opened from the dock's Usage tab: a card over the stage's content area with the rail and the stage strip left live beside it."
      />
      <Specimen
        name=".usage-screen"
        note="real rail · real strip · UsagePage over the content area · Back and Esc close it · content is the existing overview, the page's real content is a separate session"
        surface="none"
        tall
      >
        <UsagePageFrame />
      </Specimen>
      <StateLabel>fixture: 14 days, three models; no scan runs in the gallery</StateLabel>
    </>
  );
}
