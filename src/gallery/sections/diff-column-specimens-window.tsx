/**
 * One Deck window at a fixed size, for the diff column specimens (plan
 * 2026-10-10-diff-column, Task 0): a sidebar stand-in, the real `.stage` with
 * two placeholder pane cards, the real `DockPanel` around the real
 * `ExplorerSwitch` and `ChangesList`, and the column where the frame puts it.
 *
 * It is not `.window` (that is `100vw` by `100vh`) and it mounts none of the
 * file-surface or repository stores. The column width follows D2 and lives here
 * as arithmetic; Task 2 owns the shipping `diffColumnLayout`. Never imported by
 * shipping code (R7).
 */
import type { ComponentChildren } from "preact";
import { DockPanel } from "../../ui/dock/dock-panel";
import { DOCK_TABS } from "../../ui/dock/dock-tab-registry";
import { ExplorerSwitch } from "../../files/ui/explorer-switch";
import { ChangesList } from "../../files/ui/changes-list";
import { SNAPSHOT } from "./diff-column-specimens-data";
import { DocumentBody } from "./diff-column-specimens-monaco";
import { DiffColumnSpecimen, type ColumnSpec } from "./diff-column-specimens-column";

/** D2 (a): half the space left of the dock, at most 960, while that half is 400 or more. */
const MIN_DOCKED = 400;
const MAX_DOCKED = 960;

export type Placement =
  /** No column. */
  | { readonly kind: "none" }
  /** Docked left of the dock; the grid is inset by the column. */
  | { readonly kind: "docked" }
  /** Over the Explorer below the dock's tab row; the grid keeps its width. */
  | { readonly kind: "folded" }
  /** In the dock's document slot (D11 b); the grid keeps its width. */
  | { readonly kind: "slot" };

export interface WindowSpec {
  readonly width: number;
  readonly height: number;
  /** The sidebar's painted width: 275 shown, 52 the Electron avatar column, 0 gone. */
  readonly sidebar: number;
  readonly dock: number;
  readonly placement: Placement;
  readonly column?: ColumnSpec;
  /** A read-only document beside the list in the dock (D11 a). */
  readonly document?: { readonly path: string; readonly text: string };
  /** The list row to wash as the open one. */
  readonly openPath?: string;
}

export interface Geometry {
  /** The column's width in px, or 0 when it takes none of the grid. */
  readonly column: number;
  readonly placement: "none" | "docked" | "folded" | "slot";
}

/** Where D2 puts the column for a window, the arithmetic shown on the card. */
export function dockedGeometry(spec: WindowSpec): Geometry {
  const half = Math.floor((spec.width - spec.sidebar - spec.dock) / 2);
  if (spec.placement.kind === "docked") {
    return half >= MIN_DOCKED
      ? { column: Math.min(half, MAX_DOCKED), placement: "docked" }
      : { column: 0, placement: "folded" };
  }
  return { column: 0, placement: spec.placement.kind };
}

const noop = () => {};

/** The open row's DL-21.1 wash, until `ChangesList` carries a selected row (Task 4). */
function OpenRowWash({ frame, path }: { readonly frame: string; readonly path: string }) {
  return (
    <style>{`[data-frame="${frame}"] .changes-row[data-path="${path}"] {
      background: var(--tab-active-bg);
      border-radius: var(--radius-tab);
      color: var(--text-primary);
    }`}</style>
  );
}

function DockList({ children }: { readonly children?: ComponentChildren }) {
  return (
    <div class={`explorer-tab${children === undefined ? "" : " explorer-tab--document"}`}>
      <div class="explorer-tab__list">
        <ExplorerSwitch
          view="changes"
          changesTotals={SNAPSHOT.totals}
          changesDisabledReason={null}
          onSelect={noop}
        />
        <ChangesList
          state={{
            root: "/Users/deck/spacevibe-deck",
            snapshot: SNAPSHOT,
            failure: null,
            reading: false,
          }}
          onOpen={noop}
          onRefresh={noop}
        />
      </div>
      {children}
    </div>
  );
}

function DocumentSlot({ document }: { readonly document: { path: string; text: string } }) {
  return (
    <section class="file-panel" aria-label="File contents">
      <header class="file-panel__header">
        <span class="file-panel__files gx-dcs-doc-name">{document.path.split("/").pop()}</span>
      </header>
      <div class="file-panel__content">
        <DocumentBody path={document.path} text={document.text} />
      </div>
    </section>
  );
}

function PaneCard({ active }: { readonly active: boolean }) {
  return (
    <div class={`pane-slot${active ? " is-active" : ""}`}>
      <div class="pane gx-dcs-pane" aria-hidden="true">
        {[44, 71, 28, 63, 36, 52, 20].map((share) => (
          <i key={share} style={{ width: `${share}%` }} />
        ))}
      </div>
    </div>
  );
}

function SidebarStandIn({ width }: { readonly width: number }) {
  if (width === 0) {
    return null;
  }
  return (
    <div class="gx-dcs-side" style={{ width: `${width}px` }} data-collapsed={width < 100}>
      {[0, 1, 2, 3].map((row) => (
        <i key={row} />
      ))}
    </div>
  );
}

export function SpecimenWindow(props: { readonly id: string; readonly spec: WindowSpec }) {
  const { spec } = props;
  const geometry = dockedGeometry(spec);
  const column = spec.column;
  const slot = spec.placement.kind === "slot" && column !== undefined;
  const document = spec.document;
  return (
    <div
      class="gx-dcs-win"
      style={{ width: `${spec.width}px`, height: `${spec.height}px` }}
      data-window={props.id}
    >
      {spec.openPath !== undefined && <OpenRowWash frame={props.id} path={spec.openPath} />}
      <SidebarStandIn width={spec.sidebar} />
      <main
        class="stage stage--strip stage--dock gx-dcs-stage"
        data-seam={spec.sidebar > 0}
        style={{
          "--dock-w": `${spec.dock}px`,
          "--gx-diff-w": `${geometry.column}px`,
        }}
      >
        <div class="stage__strip">
          <i class="gx-dcs-chip is-active" />
          <i class="gx-dcs-chip" />
        </div>
        <div class="stage__tabs">
          <PaneCard active />
          <div class="split__divider" />
          <PaneCard active={false} />
        </div>
        {geometry.placement === "docked" && column !== undefined && (
          <DiffColumnSpecimen id={props.id} spec={column} placement="docked" />
        )}
        <DockPanel
          tabs={DOCK_TABS}
          activeTab="explorer"
          width={spec.dock}
          onWidthChange={noop}
          onClose={noop}
          onSelectTab={noop}
        >
          {slot ? (
            <DockList>
              <DiffColumnSpecimen id={props.id} spec={column} placement="slot" />
            </DockList>
          ) : document !== undefined ? (
            <DockList>
              <DocumentSlot document={document} />
            </DockList>
          ) : (
            <DockList />
          )}
        </DockPanel>
        {geometry.placement === "folded" && column !== undefined && (
          <DiffColumnSpecimen id={props.id} spec={column} placement="folded" />
        )}
      </main>
    </div>
  );
}
