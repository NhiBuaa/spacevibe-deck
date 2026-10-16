/**
 * The shipping diff column in every state it can be in (plan
 * 2026-10-10-diff-column, Task 4): the REAL `DiffColumn`, `ChangesList` and
 * `DockPanel` over fake ports and a fake controller that hold one state per frame.
 *
 * Two frames put the column docked beside the dock at its 360px floor and at
 * 520px; one folds it over the Explorer; the rest show DIFF4's representations
 * and DIFF5's two lines at the folded 360px width. The question they answer is a
 * browser one: does every state fit without overflow? Never imported by shipping
 * code (R7).
 */
import { useMemo } from "preact/hooks";
import { signal } from "@preact/signals";
import { DockPanel } from "../../ui/dock/dock-panel";
import { DOCK_TABS } from "../../ui/dock/dock-tab-registry";
import { DiffColumn } from "../../files/ui/diff-column";
import { ExplorerTab } from "../../files/ui/explorer-tab";
import type { FileSurfaceController } from "../../files/file-surface-controller";
import type { ChangesController, ChangesState } from "../../files/changes/changes-controller";
import { createDiffSelection } from "../../files/changes/diff-selection";
import type { DiffSidesPorts } from "../../files/changes/diff-sides";
import { MAX_EDITABLE_BYTES } from "../../files/file-content";
import type { ChangeEntry, HeadFileReply } from "../../host/git-changes-host";
import {
  BINARY_ENTRY,
  ENTRIES,
  LARGE_ENTRY,
  SELECTION_PATH,
  SIDES,
  SNAPSHOT,
} from "./explorer-changes-diff-data";

/** A repository the host stub answers for, so the Changes chip is enabled, and
 * with no document open in the gallery's file surface (the seeded workspace has
 * two, which would split the dock and narrow the list). */
const ROOT = "/Users/deck/deck-worktrees/electron-migration";
const DOC_OLD_PATH = "docs/internals/file-surface-old.md";
const DOC_PATH = "docs/internals/file-surface.md";
const LAYOUT_PATH = "src/files/changes/diff-layout.ts";
const GATE_PATH = "scripts/old-gate.mjs";
const LIST: readonly ChangeEntry[] = [...ENTRIES, BINARY_ENTRY, LARGE_ENTRY];

/** What git holds at `HEAD`, by path. */
const HEAD_TEXT = new Map<string, string>([
  [SELECTION_PATH, SIDES.selection.original],
  [DOC_OLD_PATH, SIDES.doc.original],
  [GATE_PATH, SIDES.gate.original],
]);
/** What the working tree holds, by path. */
const WORK_TEXT = new Map<string, string | null>([
  [SELECTION_PATH, SIDES.selection.modified],
  [LAYOUT_PATH, SIDES.layout.modified],
  [DOC_PATH, SIDES.doc.modified],
]);

const textReply = (content: string): HeadFileReply => ({
  kind: "ok",
  content,
  eol: "lf",
  encoding: "utf-8",
  bytes: content.length,
  mixedEol: false,
});

interface FrameSpec {
  readonly label: string;
  /** The stage's width: the window less the navigation sidebar. */
  readonly stage: number;
  readonly dock: number;
  readonly path: string;
  /** The Changes list in the dock, as it is beside a docked column. */
  readonly withList?: boolean;
  /** The fresh list leaves the file out. */
  readonly gone?: boolean;
  /** The working file's size, when it is not its text's. */
  readonly workSize?: number;
  readonly headFailure?: string;
}

function portsFor(spec: FrameSpec): DiffSidesPorts {
  return {
    statFiles: async (_root, paths) =>
      paths.map((path) => ({
        path,
        exists: true,
        mtimeMs: 1,
        size: spec.workSize ?? 1024,
      })),
    readFile: async (_root, path) => {
      const content = WORK_TEXT.get(relativeTo(path)) ?? "";
      return {
        kind: "ok",
        content,
        eol: "lf",
        encoding: "utf-8",
        bytes: content.length,
        mixedEol: false,
        readOnly: false,
        writable: true,
        reason: null,
        mtimeMs: 1,
        size: content.length,
      };
    },
    readHeadFile: async (_root, path) => {
      if (spec.headFailure !== undefined) {
        return { kind: "failed", message: spec.headFailure };
      }
      return textReply(HEAD_TEXT.get(path) ?? "");
    },
  };
}

/** The root-relative path of an absolute one under `ROOT`. */
function relativeTo(absolute: string): string {
  return absolute.startsWith(`${ROOT}/`) ? absolute.slice(ROOT.length + 1) : absolute;
}

function buildFrame(spec: FrameSpec) {
  const entries = spec.gone ? LIST.filter((entry) => entry.path !== spec.path) : LIST;
  const state = signal<ChangesState>({
    root: ROOT,
    snapshot: { ...SNAPSHOT, entries },
    failure: null,
    reading: false,
  });
  const changes: ChangesController = {
    state,
    readCount: signal(1),
    setShown: () => {},
    setWindowVisible: () => {},
    trigger: () => {},
    turnEnded: () => {},
    dispose: () => {},
  };
  const diff = createDiffSelection(state);
  diff.open(ROOT, spec.path);
  return { changes, diff, ports: portsFor(spec) };
}

const FRAMES: readonly FrameSpec[] = [
  {
    label: "diff column docked, dock at 360px",
    stage: 1400,
    dock: 360,
    path: SELECTION_PATH,
    withList: true,
  },
  {
    label: "diff column docked, dock at 520px",
    stage: 1400,
    dock: 520,
    path: SELECTION_PATH,
    withList: true,
  },
  {
    label: "folded over the Explorer: half the room is under 400px",
    stage: 760,
    dock: 360,
    path: SELECTION_PATH,
    withList: true,
  },
  { label: "binary", stage: 760, dock: 360, path: BINARY_ENTRY.path },
  {
    label: "too large to diff",
    stage: 760,
    dock: 360,
    path: LARGE_ENTRY.path,
    workSize: MAX_EDITABLE_BYTES * 1.7,
  },
  { label: "deleted: old side only", stage: 760, dock: 360, path: GATE_PATH },
  { label: "added: new side only", stage: 760, dock: 360, path: LAYOUT_PATH },
  { label: "renamed: old to new", stage: 760, dock: 360, path: DOC_PATH },
  {
    label: "failed read: red status line",
    stage: 760,
    dock: 360,
    path: SELECTION_PATH,
    headFailure: "Could not read HEAD: git cat-file failed",
  },
  { label: "no longer changed", stage: 760, dock: 360, path: SELECTION_PATH, gone: true },
];

const noop = () => {};

function FrameStage(props: {
  readonly spec: FrameSpec;
  readonly controller: FileSurfaceController;
}) {
  const { spec } = props;
  const frame = useMemo(() => buildFrame(spec), [spec]);
  return (
    <figure class="gx-changes-frame" data-frame={spec.label}>
      <figcaption class="gx-changes-label">{spec.label}</figcaption>
      <div class="gx-diff-stage" style={{ width: `${spec.stage}px`, "--dock-w": `${spec.dock}px` }}>
        <div class="gx-diff-grid" aria-hidden="true">
          <i />
          <i />
        </div>
        <DockPanel
          tabs={DOCK_TABS}
          activeTab="explorer"
          width={spec.dock}
          onWidthChange={noop}
          onClose={noop}
          onSelectTab={noop}
        >
          {spec.withList === true ? (
            <ExplorerTab
              controller={props.controller}
              workspacePath={ROOT}
              canCreate
              changesAvailable
              changes={frame.changes}
              diff={frame.diff}
            />
          ) : null}
        </DockPanel>
        <DiffColumn
          controller={props.controller}
          dockWidth={spec.dock}
          selection={frame.diff}
          changes={frame.changes}
          ports={frame.ports}
          onInset={noop}
        />
      </div>
    </figure>
  );
}

export function DiffColumnFrames(props: { readonly controller: FileSurfaceController }) {
  return (
    <div class="gx-changes-frames gx-diff-frames">
      {FRAMES.map((spec) => (
        <FrameStage key={spec.label} spec={spec} controller={props.controller} />
      ))}
    </div>
  );
}
