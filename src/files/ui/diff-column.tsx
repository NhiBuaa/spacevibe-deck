/**
 * The diff column: the selected change's diff in a column left of the dock
 * (plan 2026-10-10-diff-column, DIFF1–DIFF5; DL-19.11).
 *
 * `DiffColumn` is mounted once by `App` beside `DockPanel` and renders nothing
 * while no file is selected. Open, it owns four things and nothing else:
 *
 *  - **Placement.** It measures the stage with one `ResizeObserver`, only while
 *    open, asks `diffColumnLayout` where to stand and publishes the stage's
 *    extra right inset. The inset is one CSS variable; each pane refits through
 *    its own observer, so no layout, tab or PTY module is involved.
 *  - **Sides.** It loads the selection's two sides through `diff-sides` and
 *    re-reads on every completed list read (`readCount`), not on `state`: an
 *    edit that keeps a file's counts leaves the snapshot unchanged.
 *  - **Keys**, only while focus is inside it: `n` / `p` the next and previous
 *    change, `]` / `[` the next and previous file, Esc closes. They are caught
 *    before Monaco sees them, are never modified (so ⌘C and ⌘W pass through) and
 *    never reach a terminal, because focus is in a read-only editor.
 *  - **Its life.** It closes from its close button and from Esc, with the list
 *    that opened it (the Explorer's own effect), and when it folds over a
 *    document that holds the keyboard.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "preact/hooks";
import type { FileSurfaceController } from "../file-surface-controller";
import { defaultFileClient } from "../file-client";
import { activeFileTab } from "../file-surface-store";
import { readHeadFile } from "../../host/git-changes-host";
import { changesController, type ChangesController } from "../changes/changes-controller";
import { absolutePath } from "../changes/changes-model";
import { closeDiffColumn, diffFocusRequested } from "../changes/diff-column-focus";
import {
  diffColumnFolded,
  diffColumnInsetFor,
  diffColumnLayout,
  publishDiffColumnInset,
  type DiffColumnLayout,
} from "../changes/diff-layout";
import {
  diffSelection,
  type DiffSelection,
  type DiffSelectionStore,
  type DiffView,
} from "../changes/diff-selection";
import { createDiffSides, type DiffSidesPorts, type DiffSidesView } from "../changes/diff-sides";
import { DiffColumnHeader } from "./diff-column-header";
import { DiffEditor, type DiffEditorControls } from "./diff-editor";

/** The sides' two reads, over the window's real file channel and git channel. */
export const defaultDiffSidesPorts: DiffSidesPorts = {
  statFiles: (root, paths) => defaultFileClient.statFiles(root, paths),
  readFile: (root, path) => defaultFileClient.readFile(root, path),
  readHeadFile,
};

export interface DiffColumnProps {
  /** Opens the working file for the header's Open file. */
  readonly controller: FileSurfaceController;
  /** The dock's live width: the column halves what the stage has left of it. */
  readonly dockWidth: number;
  /** Test and gallery seams; the window's own otherwise. */
  readonly selection?: DiffSelectionStore;
  readonly changes?: ChangesController;
  readonly ports?: DiffSidesPorts;
  /** Where the stage's extra right inset goes; the window's own signal otherwise. */
  readonly onInset?: (inset: number) => void;
  /** Takes focus when the column unmounts while holding it, so it does not fall
   * to `<body>`. Esc and the close button return it to the row instead. */
  readonly onFocusReleased?: () => void;
}

const BYTES_PER_MB = 1024 * 1024;

type Line = { readonly text: string; readonly failure: boolean };

/** DL-19.5's line under the header: what is true of the file, or why there is no diff. */
function statusLine(view: DiffView | null, sides: DiffSidesView | null): Line | null {
  if (view?.kind === "gone") {
    return { text: "No longer changed", failure: false };
  }
  if (sides?.kind === "failed") {
    return { text: sides.message, failure: true };
  }
  return null;
}

/** The body's one line for a file that cannot be diffed (DIFF4), or null. */
function noteFor(view: DiffView | null, sides: DiffSidesView | null): string | null {
  if (view?.kind === "gone") {
    return null;
  }
  if (sides?.kind === "binary") {
    return "Binary file";
  }
  if (sides?.kind === "too-large") {
    return `Too large to diff · ${(sides.bytes / BYTES_PER_MB).toFixed(1)} MB`;
  }
  return null;
}

function OpenColumn(
  props: DiffColumnProps & {
    readonly store: DiffSelectionStore;
    readonly changes: ChangesController;
    readonly open: DiffSelection;
  },
) {
  const { store, changes, open } = props;
  const rootRef = useRef<HTMLElement>(null);
  const controls = useRef<DiffEditorControls | null>(null);
  const sides = useMemo(() => createDiffSides(props.ports ?? defaultDiffSidesPorts), [props.ports]);
  const view = store.view.value;
  const reads = changes.readCount.value;
  const sidesView = sides.view.value;

  // Placement: the stage's width, read at once and then watched while open.
  const [stageWidth, setStageWidth] = useState<number | null>(null);
  useLayoutEffect(() => {
    const stage = rootRef.current?.parentElement;
    if (stage === null || stage === undefined) {
      return;
    }
    setStageWidth(stage.clientWidth);
    const observer = new ResizeObserver(() => setStageWidth(stage.clientWidth));
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  const layout: DiffColumnLayout | null =
    stageWidth === null ? null : diffColumnLayout(stageWidth, props.dockWidth);
  const inset = layout === null ? 0 : diffColumnInsetFor(layout);
  const publish = useRef(props.onInset ?? publishDiffColumnInset);
  publish.current = props.onInset ?? publishDiffColumnInset;
  useLayoutEffect(() => publish.current(inset), [inset]);
  // Closing hands the room back at once.
  useLayoutEffect(() => () => publish.current(0), []);
  const folded = layout?.kind === "folded";
  // Folding over a document that holds the keyboard (the window narrowed, the
  // sidebar opened) would leave the user typing into a file they cannot see, so
  // the column closes, as `App` closes it before a document takes the keyboard.
  // A press that opens the column has taken focus from the document first.
  useLayoutEffect(() => {
    diffColumnFolded.value = folded;
    if (folded && activeFileTab.value !== null) {
      closeDiffColumn(store);
    }
  }, [folded, store]);
  useLayoutEffect(
    () => () => {
      diffColumnFolded.value = false;
    },
    [],
  );

  // The sides: one read per selection, and one more after every completed list
  // read. `entryView` changes with the snapshot the counter rose with, in the
  // same render, so a list read is one load, not two.
  const entryView = view?.kind === "entry" ? view : null;
  const gone = view?.kind === "gone";
  useEffect(() => {
    if (entryView !== null) {
      void sides.load({ root: open.root, entry: entryView.entry, initial: entryView.initial });
    } else if (gone) {
      sides.clear();
    }
  }, [sides, open.root, entryView, reads, gone]);
  useEffect(() => () => sides.clear(), [sides]);

  // A press asks for focus, answered once the column is placed: until then it
  // is `visibility: hidden`, where `focus()` does nothing and the key the user
  // types next (⌘W among them) goes to whatever kept focus. The root takes it
  // first; the editor takes it from the root as soon as it shows a text.
  const focusRequested = diffFocusRequested.value;
  const placed = layout !== null;
  useEffect(() => {
    if (focusRequested && placed) {
      diffFocusRequested.value = false;
      rootRef.current?.focus();
      controls.current?.focus();
    }
  }, [focusRequested, placed]);
  useEffect(
    () => () => {
      diffFocusRequested.value = false;
    },
    [],
  );

  // Unmounted while holding focus (the dock closed under it), the column hands
  // focus to the stage; after the removal, because until then focus still reads
  // as inside the column and the stage would give it straight back.
  const release = useRef(props.onFocusReleased);
  release.current = props.onFocusReleased;
  useLayoutEffect(() => {
    const root = rootRef.current;
    return () => {
      if (root?.contains(document.activeElement) === true) {
        queueMicrotask(() => release.current?.());
      }
    };
  }, []);

  function step(direction: "next" | "previous"): void {
    // Focus stays in the column while the editor is swapped: parked on the root,
    // which the new editor hands over to Monaco when it mounts.
    const root = rootRef.current;
    const hadFocus = root?.contains(document.activeElement) === true;
    if (hadFocus) {
      root.focus();
    }
    if (!store.step(direction) && hadFocus) {
      controls.current?.focus();
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing) {
      return;
    }
    const handled = (run: () => void): void => {
      event.preventDefault();
      event.stopPropagation();
      run();
    };
    switch (event.key) {
      case "Escape":
        return handled(() => closeDiffColumn(store));
      case "]":
        return handled(() => step("next"));
      case "[":
        return handled(() => step("previous"));
      case "n":
        return handled(() => controls.current?.goToChange("next"));
      case "p":
        return handled(() => controls.current?.goToChange("previous"));
    }
  }

  const entry = entryView?.entry ?? null;
  const previous = view === null || view.kind === "unknown" ? null : view.previous;
  const next = view === null || view.kind === "unknown" ? null : view.next;
  const line = statusLine(view, sidesView);
  const note = noteFor(view, sidesView);
  const placement = layout?.kind ?? "pending";
  return (
    <section
      ref={rootRef}
      class={`diff-column diff-column--${placement}`}
      data-diff-column=""
      aria-label="Diff"
      tabIndex={-1}
      style={layout?.kind === "docked" ? { width: `${layout.width}px` } : undefined}
      onKeyDownCapture={onKeyDown}
    >
      <DiffColumnHeader
        id="diff-column"
        entry={entry}
        path={open.path}
        position={entryView === null ? null : `${entryView.position}/${entryView.total}`}
        onPrevious={previous === null ? null : () => step("previous")}
        onNext={next === null ? null : () => step("next")}
        onOpenFile={
          entry === null || entry.status === "deleted"
            ? null
            : () =>
                void props.controller.openFile(
                  open.root,
                  absolutePath(open.root, entry.path),
                  false,
                )
        }
        onClose={() => closeDiffColumn(store)}
      />
      {line !== null && (
        <p class={`file-tree-shell__status${line.failure ? " is-failure" : ""}`} role="status">
          {line.text}
        </p>
      )}
      <div class="diff-column__body">
        {note !== null && <p class="diff-column__note">{note}</p>}
        {view?.kind !== "gone" && sidesView?.kind === "text" && (
          <DiffEditor
            sides={sidesView}
            fileKey={`${open.root}\0${open.path}`}
            controls={controls}
          />
        )}
      </div>
    </section>
  );
}

export function DiffColumn(props: DiffColumnProps) {
  const store = props.selection ?? diffSelection();
  const changes = props.changes ?? changesController();
  const open = store.selection.value;
  if (open === null) {
    return null;
  }
  return <OpenColumn {...props} store={store} changes={changes} open={open} />;
}
