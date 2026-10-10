/**
 * The diff column's forms, side by side, for the eye review of plan
 * 2026-10-10-diff-column (Task 0, hard stop 1).
 *
 * Every frame is a whole Deck window at its real pixel size: the real `.stage`,
 * `DockPanel`, `ExplorerSwitch` and `ChangesList` around fake data, and a real
 * Monaco diff in the column. The frames pose three decisions: D1 (diff colour),
 * D2 / D11 (where the column sits) and D3 (when the two sides split). The card
 * under each names the design-language rule it amends; an invariant it would
 * break says `fork`. Never imported by shipping code (R7).
 */
import type { ComponentChildren } from "preact";
import { SectionHead } from "../specimen";
import {
  BINARY_ENTRY,
  ENTRIES,
  LARGE_ENTRY,
  SELECTION_PATH,
  SIDES,
} from "./diff-column-specimens-data";
import { DiffColumnSpecimen, type ColumnSpec } from "./diff-column-specimens-column";
import {
  dockedGeometry,
  SpecimenWindow,
  type Placement,
  type WindowSpec,
} from "./diff-column-specimens-window";
import "./diff-column-specimens.css";

const HEIGHT = 640;
/** Monaco's own side-by-side switch (D3 a) and the narrower one D3 (b) proposes. */
const MONACO_BREAKPOINT = 900;
const NARROW_BREAKPOINT = 640;
const SIDEBAR_SHOWN = 275;
/** DL-27.29: the Electron sidebar collapses to an avatar column, not to nothing. */
const SIDEBAR_COLUMN = 52;
const DOCK_DEFAULT = 420;

/** The file the column has open in every window frame: `2/5`, modified. */
const OPEN: ColumnSpec = {
  entry: ENTRIES[1],
  position: "2/5",
  body: { kind: "diff", sides: SIDES.selection },
  openFile: true,
  breakpoint: MONACO_BREAKPOINT,
};

interface Frame {
  readonly id: string;
  /** The rule each frame amends, in one line; `fork` marks an invariant it would break. */
  readonly rule: ComponentChildren;
  readonly fork?: boolean;
  readonly neutralWash?: boolean;
  readonly window: WindowSpec;
}

function windowSpec(
  width: number,
  over: Omit<Partial<WindowSpec>, "placement"> & { readonly placement: Placement["kind"] },
): WindowSpec {
  const { placement, ...rest } = over;
  return {
    width,
    height: HEIGHT,
    sidebar: SIDEBAR_SHOWN,
    dock: DOCK_DEFAULT,
    placement: { kind: placement },
    column: OPEN,
    openPath: SELECTION_PATH,
    ...rest,
  };
}

const FRAMES: readonly Frame[] = [
  {
    id: "docked-wash-a",
    fork: true,
    rule: "D1 (a) · DL-3.2: added lines on a low green wash, removed on a low red wash. New §19 rule: the column docks left of the Explorer.",
    window: windowSpec(1728, { placement: "docked" }),
  },
  {
    id: "docked-wash-b",
    neutralWash: true,
    rule: "D1 (b) · DL-3.2 unchanged: one neutral wash for both sides, told apart by the + and − marks.",
    window: windowSpec(1728, { placement: "docked" }),
  },
  {
    id: "folded",
    rule: "D2 (a) · new §19 rule: under 400px per half, the column lies over the Explorer below the dock's tab row and the grid keeps its width.",
    window: windowSpec(1100, { placement: "docked" }),
  },
  {
    id: "dock-slot-420",
    rule: "D11 (b) · DL-19.10: the diff takes the document slot at the default dock; no grid change, always unified.",
    window: windowSpec(1728, { placement: "slot" }),
  },
  {
    id: "dock-slot-720",
    rule: "D11 (b) · DL-19.10: the same slot at the widest dock.",
    window: windowSpec(1728, { placement: "slot", dock: 720 }),
  },
  {
    id: "with-document",
    rule: "D11 (a) · DL-19.10 stands: grid, diff column, then the list and an open document.",
    window: windowSpec(1728, {
      placement: "docked",
      document: { path: "src/files/changes/diff-layout.ts", text: SIDES.layout.modified },
    }),
  },
  {
    id: "d3-640",
    rule: "D3 (b) · new §19 rule: a 640px breakpoint splits at 1728px only with no sidebar column (top-tab layout, 0px).",
    window: windowSpec(1728, {
      placement: "docked",
      sidebar: 0,
      column: { ...OPEN, breakpoint: NARROW_BREAKPOINT },
    }),
  },
  {
    id: "d3-640-electron",
    rule: "D3 (b) · Electron keeps a 52px avatar column when the sidebar collapses: 628px, so 640 still reads unified.",
    window: windowSpec(1728, {
      placement: "docked",
      sidebar: SIDEBAR_COLUMN,
      column: { ...OPEN, breakpoint: NARROW_BREAKPOINT },
    }),
  },
  {
    id: "d3-900",
    rule: "D3 (a) · new §19 rule: Monaco's 900px splits from a 2560px window.",
    window: windowSpec(2560, { placement: "docked" }),
  },
];

function dims(spec: WindowSpec): string {
  const geometry = dockedGeometry(spec);
  const column =
    geometry.placement === "docked" ? `column ${geometry.column}` : `column ${geometry.placement}`;
  return `${spec.width} · sidebar ${spec.sidebar} · dock ${spec.dock} · ${column}`;
}

function FrameCard(props: { readonly frame: Frame }) {
  const { frame } = props;
  return (
    <figure
      class="gx-dcs-frame"
      data-frame={frame.id}
      data-wash={frame.neutralWash === true ? "neutral" : "tinted"}
      style={{ width: `${frame.window.width}px` }}
    >
      <figcaption class="gx-dcs-card">
        <span class="gx-dcs-card__dims">{dims(frame.window)}</span>
        <span class="gx-dcs-card__rule">
          {frame.fork === true && <b class="gx-dcs-card__fork">fork</b>}
          {frame.rule}
        </span>
      </figcaption>
      <SpecimenWindow id={frame.id} spec={frame.window} />
    </figure>
  );
}

/** DIFF4's seven cases at one column's width, each with its own one line. */
const STRIP: readonly { readonly id: string; readonly spec: ColumnSpec }[] = [
  {
    id: "binary",
    spec: {
      entry: BINARY_ENTRY,
      position: "1/6",
      body: { kind: "note", text: "Binary file" },
      openFile: true,
      breakpoint: MONACO_BREAKPOINT,
    },
  },
  {
    id: "too-large",
    spec: {
      entry: LARGE_ENTRY,
      position: "2/6",
      body: { kind: "note", text: "Too large to diff · 3.4 MB" },
      openFile: true,
      breakpoint: MONACO_BREAKPOINT,
    },
  },
  {
    id: "deleted",
    spec: {
      entry: ENTRIES[4],
      position: "5/5",
      body: { kind: "diff", sides: SIDES.gate },
      openFile: false,
      breakpoint: MONACO_BREAKPOINT,
    },
  },
  {
    id: "added",
    spec: {
      entry: ENTRIES[2],
      position: "3/5",
      body: { kind: "diff", sides: SIDES.layout },
      openFile: true,
      breakpoint: MONACO_BREAKPOINT,
    },
  },
  {
    id: "renamed",
    spec: {
      entry: ENTRIES[3],
      position: "4/5",
      body: { kind: "diff", sides: SIDES.doc },
      openFile: true,
      breakpoint: MONACO_BREAKPOINT,
    },
  },
  {
    id: "failed",
    spec: {
      ...OPEN,
      body: { kind: "empty" },
      status: { text: "Could not read HEAD: git cat-file failed", failure: true },
    },
  },
  {
    id: "no-longer-changed",
    spec: {
      ...OPEN,
      body: { kind: "empty" },
      status: { text: "No longer changed", failure: false },
    },
  },
];

function Strip() {
  return (
    <figure class="gx-dcs-frame gx-dcs-strip" data-frame="diff4-strip" data-wash="tinted">
      <figcaption class="gx-dcs-card">
        <span class="gx-dcs-card__dims">column 516</span>
        <span class="gx-dcs-card__rule">
          DL-19.5 · DIFF4: binary, too large, deleted, added, renamed, failed read, no longer
          changed — one short line each.
        </span>
      </figcaption>
      <div class="gx-dcs-strip__grid">
        {STRIP.map((item) => (
          <div key={item.id} class="gx-dcs-strip__cell" title={item.id}>
            <DiffColumnSpecimen id={`strip-${item.id}`} spec={item.spec} placement="free" />
          </div>
        ))}
      </div>
    </figure>
  );
}

export function DiffColumnSpecimensSection() {
  return (
    <>
      <SectionHead
        title="Diff column specimens"
        blurb="Whole windows at real size, a real Monaco diff, fake data. Pick by eye: D1 colour, D2 / D11 placement, D3 breakpoint."
      />
      <div class="gx-dcs-frames">
        {FRAMES.map((frame) => (
          <FrameCard key={frame.id} frame={frame} />
        ))}
        <Strip />
      </div>
    </>
  );
}
