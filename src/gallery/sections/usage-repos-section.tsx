/**
 * Candidates and states for the usage details page's repository table (plan
 * 2026-10-14-usage-page-content, task 4). The real `UsageRepoTable` over fixture
 * data: nothing here reads the scanner. Three looks compete on the same data;
 * the states below use the plain look. Never imported by shipping code (R7).
 */
import { formatUsd } from "../../lib/usage-pricing";
import type { ComponentChildren } from "preact";
import { buildRepoTable, type RepoTable, type RepoUsage } from "../../ui/usage/usage-by-repo";
import { EM_DASH } from "../../ui/usage/usage-format";
import {
  DEFAULT_REPO_LOOK,
  UsageRepoTable,
  type RepoTableLook,
} from "../../ui/usage/usage-repo-table";
import { SectionHead, Specimen } from "../specimen";
import {
  REPOS_AWKWARD,
  REPOS_MANY_LINES,
  REPOS_MIXED,
  REPOS_NO_REPO_DATA,
  REPOS_TYPICAL,
} from "./usage-repos-data";
import { LeadBarsLayout, OneLineLayout, TilesLayout } from "./usage-repos-layouts";
import "./usage-repos-section.css";

const LOOK_B: RepoTableLook = {
  indent: "leader",
  repoWeight: "strong",
  bar: "agent",
  mix: false,
};
const LOOK_C: RepoTableLook = {
  indent: "leader",
  repoWeight: "regular",
  bar: "neutral",
  mix: true,
};

interface FrameProps {
  readonly repos: readonly RepoUsage[];
  readonly look?: RepoTableLook;
  readonly width?: number;
  readonly emptyLabel?: string;
  readonly note?: string;
  /** Replaces the stacked table with another layout of the same rows. */
  readonly render?: (table: RepoTable) => ComponentChildren;
}

/** The totals line the page puts above the table, then the table. */
function Frame({
  repos,
  look = DEFAULT_REPO_LOOK,
  width = 760,
  emptyLabel = "No usage in the last 7 local days",
  note,
  render,
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
      {render === undefined ? (
        <UsageRepoTable table={table} look={look} emptyLabel={emptyLabel} note={note} />
      ) : (
        render(table)
      )}
    </div>
  );
}

export function UsageReposSection() {
  return (
    <>
      <SectionHead
        title="Usage by repository"
        blurb="The details page's table over fixture data. Three looks on the same repos, then the states. Cost is the priced part; a dash means no price, never zero."
      />
      <Specimen
        name="D · bars lead: one row per repo, agent-coloured bar scaled to the biggest repo"
        note="The eye reads the bars first and the numbers second. Models fold into one faint line, so a twelve-model repo is no taller than a one-model repo."
        surface="chrome-2"
      >
        <Frame
          repos={REPOS_MIXED}
          width={880}
          render={(table) => <LeadBarsLayout table={table} />}
        />
      </Specimen>
      <Specimen
        name="E · one line per repo, no bars"
        note="Quietest layout: a narrow table so each number sits close to its name, tokens shortened (466.6M, not 466,617,000)."
        surface="chrome-2"
      >
        <Frame
          repos={REPOS_MIXED}
          width={680}
          render={(table) => <OneLineLayout table={table} />}
        />
      </Specimen>
      <Specimen
        name="F · tiles, two across"
        note="Reads as a set of projects rather than a ledger. Each tile carries cost, share, the agent split and what it ran."
        surface="chrome-2"
      >
        <Frame
          repos={REPOS_TYPICAL}
          width={760}
          render={(table) => <TilesLayout table={table} />}
        />
      </Specimen>
      <Specimen
        name="A · plain indent, one neutral bar, regular name (the stacked list)"
        note="Quietest. Children hang by indent alone; hierarchy is ink and size."
        surface="chrome-2"
      >
        <Frame repos={REPOS_TYPICAL} />
      </Specimen>
      <Specimen
        name="B · hairline leader, agent-colour bar, strong name"
        note="Clearest hierarchy. The bar takes the colour of the agent that spent most, so a mixed repo reads as its dominant one."
        surface="chrome-2"
      >
        <Frame repos={REPOS_TYPICAL} look={LOOK_B} />
      </Specimen>
      <Specimen
        name="C · hairline leader, neutral bar, agent mix strip"
        note="The strip under the name shows how the agents split a repo without opening it."
        surface="chrome-2"
      >
        <Frame repos={REPOS_TYPICAL} look={LOOK_C} />
      </Specimen>
      <Specimen
        name="Same name, unpriced model, long path"
        note="Two repos called app told apart by their folder; gpt-6-preview has no price so its cost is a dash and the footnote says so."
        surface="chrome-2"
      >
        <Frame repos={REPOS_AWKWARD} />
      </Specimen>
      <Specimen
        name="Twelve agent/model lines in one repository"
        note="The length case. Decides whether lines need a cap with an Other row."
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
        name="Empty period"
        note="Header row plus one spanning cell that names the period (DL-15.8)."
        surface="chrome-2"
      >
        <Frame repos={[]} emptyLabel="No usage today" />
      </Specimen>
      <Specimen
        name="Narrowest window · 480px"
        note="The table scrolls inside its own container; the page and the type do not change."
        surface="chrome-2"
      >
        <Frame repos={REPOS_TYPICAL} width={480} />
      </Specimen>
    </>
  );
}
