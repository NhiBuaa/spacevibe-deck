/**
 * The usage details page's repository tiles over fixture data (plan
 * 2026-10-14-usage-page-content, task 4). The real `UsageRepoTiles`: nothing
 * here reads the scanner. The tile layout was chosen by the owner on
 * 2026-10-15 from three candidates; the rejected ones are in git history
 * (commit 0494d8d7). Never imported by shipping code (R7).
 */
import { formatUsd } from "../../lib/usage-pricing";
import { buildRepoTable, type RepoUsage } from "../../ui/usage/usage-by-repo";
import { EM_DASH } from "../../ui/usage/usage-format";
import { UsageRepoTiles } from "../../ui/usage/usage-repo-tiles";
import { SectionHead, Specimen } from "../specimen";
import { UsageDockOverviewSpecimen } from "./usage-dock-overview-specimen";
import {
  REPOS_AWKWARD,
  REPOS_MANY_LINES,
  REPOS_MIXED,
  REPOS_NO_REPO_DATA,
  REPOS_TYPICAL,
} from "./usage-repos-data";
import "./usage-repos-section.css";

interface FrameProps {
  readonly repos: readonly RepoUsage[];
  readonly width?: number;
  readonly emptyLabel?: string;
  readonly note?: string;
  readonly loading?: boolean;
  readonly reloading?: boolean;
}

/** The totals line the page puts above the tiles, then the tiles. */
function Frame({
  repos,
  width = 760,
  emptyLabel = "No usage in the last 7 local days",
  note,
  loading,
  reloading,
}: FrameProps) {
  const table = buildRepoTable(repos);
  return (
    <div class="ur-frame" style={{ maxWidth: `${width}px` }}>
      <div class="usage-overview ur-totals">
        <p class="usage-hero__eyebrow">Estimated API cost</p>
        <p
          class={`usage-hero__figure ${table.totalCostUsd === null ? "usage-hero__figure--absent" : ""}`}
        >
          {table.totalCostUsd === null ? EM_DASH : formatUsd(table.totalCostUsd)}
        </p>
        <p class="usage-hero__footnote">API equivalent, not your subscription bill</p>
      </div>
      <UsageRepoTiles
        table={table}
        emptyLabel={emptyLabel}
        note={note}
        loading={loading}
        reloading={reloading}
      />
    </div>
  );
}

export function UsageReposSection() {
  return (
    <>
      <SectionHead
        title="Usage by repository"
        blurb="One tile per repository, read-only. The bar shows size against the biggest repo, split by agent. A dash means no price, never zero."
      />
      <Specimen
        name="Typical month"
        note="The default view: cost and share, a magnitude bar split by agent (orange Claude, blue Codex, the same in every theme), the models it ran, tokens. Switch themes in the top bar."
        surface="chrome-2"
      >
        <Frame repos={REPOS_MIXED} />
      </Specimen>
      <Specimen
        name="Same name, unpriced model, long path"
        note="Two repos called app told apart by their folder; one runs a model with no price, so its cost is partial and says how much is left out."
        surface="chrome-2"
      >
        <Frame repos={REPOS_AWKWARD} />
      </Specimen>
      <Specimen
        name="Twelve agent/model pairs in one repository"
        note="The old length problem: the summary names two and counts the rest, so the tile stays the same height."
        surface="chrome-2"
      >
        <Frame repos={REPOS_MANY_LINES} />
      </Specimen>
      <Specimen
        name="Scanner has no repository data yet"
        note="Everything lands in Unattributed so the total still holds; the footnote says why."
        surface="chrome-2"
      >
        <Frame
          repos={REPOS_NO_REPO_DATA}
          note="repository grouping starts after the next full scan"
        />
      </Specimen>
      <Specimen
        name="Reading again"
        note="A newer read is in flight: the last tiles stay, muted, so the page does not flash."
        surface="chrome-2"
      >
        <Frame repos={REPOS_TYPICAL} reloading />
      </Specimen>
      <Specimen
        name="First read"
        note="Placeholder tiles with no numbers and nothing moving."
        surface="chrome-2"
      >
        <Frame repos={[]} loading />
      </Specimen>
      <Specimen
        name="Empty period"
        note="One sentence that names the period (DL-16.7)."
        surface="chrome-2"
      >
        <Frame repos={[]} emptyLabel="No usage today" />
      </Specimen>
      <Specimen
        name="Narrowest window · 480px"
        note="One tile per row; nothing scrolls sideways."
        surface="chrome-2"
      >
        <Frame repos={REPOS_TYPICAL} width={480} />
      </Specimen>
      <Specimen
        name="Dock overview · same palette"
        note="The sidebar's Usage tab at its default 420px: agent bars, legend and cost-over-time columns all wear the orange and blue now."
        surface="chrome-2"
      >
        <UsageDockOverviewSpecimen />
      </Specimen>
      <Specimen
        name="Dock overview · period reloading"
        note="Cost figures stay visible and quiet while a new period loads; allowance does not dim."
        surface="chrome-2"
      >
        <UsageDockOverviewSpecimen loading />
      </Specimen>
    </>
  );
}
