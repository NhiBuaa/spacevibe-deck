/**
 * The diff column as the specimens draw it (plan 2026-10-10-diff-column, Task 0):
 * a header, DL-19.5's status line and a body. Task 3 builds the shipping
 * `DiffColumn`; this one exists so the owner can judge the form first. Never
 * imported by shipping code (R7).
 */
import { useRef } from "preact/hooks";
import { CaretLeft, CaretRight, FileText, X, type Icon } from "@phosphor-icons/react";
import { CHROME_ICON, DeckIcon } from "../../ui/controls/deck-icon";
import {
  ActionTooltip,
  tooltipTriggerProps,
  useTooltipVisibility,
} from "../../ui/controls/action-tooltip";
import { DiffCounts } from "../../files/ui/changes-list";
import {
  baseName,
  countsFor,
  dirName,
  entryTitle,
  STATUS_MARK,
  STATUS_WORD,
} from "../../files/changes/changes-model";
import type { ChangeEntry } from "../../host/git-changes-host";
import { DiffBody } from "./diff-column-specimens-monaco";
import type { SidePair } from "./diff-column-specimens-data";

/** What fills the column under its header. */
export type ColumnBody =
  | { readonly kind: "diff"; readonly sides: SidePair }
  | { readonly kind: "note"; readonly text: string }
  | { readonly kind: "empty" };

export interface ColumnSpec {
  readonly entry: ChangeEntry;
  /** "2/5". */
  readonly position: string;
  readonly body: ColumnBody;
  /** DL-19.5's line under the header; a failure is red, anything else faint. */
  readonly status?: { readonly text: string; readonly failure: boolean };
  /** Open file is absent for a deleted file (D4). */
  readonly openFile: boolean;
  /** Monaco's side-by-side breakpoint in px (D3). */
  readonly breakpoint: number;
  /** One-sided cases are always unified (D6). */
  readonly unified?: boolean;
}

function HeadAction(props: {
  readonly id: string;
  readonly icon: Icon;
  readonly label: string;
  readonly shortcut: string | null;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const tooltip = useTooltipVisibility();
  return (
    <>
      <button
        ref={ref}
        type="button"
        class="iconbtn gx-dcs-head__btn"
        aria-label={props.label}
        aria-describedby={tooltip.anchor === null ? undefined : props.id}
        {...tooltipTriggerProps(tooltip, ref)}
      >
        <DeckIcon icon={props.icon} size={CHROME_ICON} />
      </button>
      {tooltip.anchor !== null && (
        <ActionTooltip
          id={props.id}
          label={props.label}
          shortcut={props.shortcut}
          reason={null}
          anchor={tooltip.anchor}
        />
      )}
    </>
  );
}

/** A rename shows `old -> new`; every other status shows the name alone. */
function headName(entry: ChangeEntry): string {
  return entry.status === "renamed" && entry.oldPath !== null
    ? `${baseName(entry.oldPath)} → ${baseName(entry.path)}`
    : baseName(entry.path);
}

function Head(props: { readonly spec: ColumnSpec; readonly id: string }) {
  const { entry } = props.spec;
  const counts = countsFor(entry);
  const directory = dirName(entry.path);
  return (
    <header class="gx-dcs-head">
      <span class="changes-row__mark" title={STATUS_WORD[entry.status]} aria-hidden="true">
        {STATUS_MARK[entry.status]}
      </span>
      <span class="gx-dcs-head__name" title={directory === "" ? entryTitle(entry) : entry.path}>
        {headName(entry)}
      </span>
      {counts.kind === "counts" && (
        <span class="gx-dcs-head__counts">
          <DiffCounts added={counts.added} removed={counts.removed} />
        </span>
      )}
      <span class="gx-dcs-head__pos" title="Position in the list">
        {props.spec.position}
      </span>
      <HeadAction id={`${props.id}-prev`} icon={CaretLeft} label="Previous file" shortcut="[" />
      <HeadAction id={`${props.id}-next`} icon={CaretRight} label="Next file" shortcut="]" />
      {props.spec.openFile && (
        <HeadAction id={`${props.id}-open`} icon={FileText} label="Open file" shortcut={null} />
      )}
      <HeadAction id={`${props.id}-close`} icon={X} label="Close" shortcut="Esc" />
    </header>
  );
}

function Body({ spec }: { readonly spec: ColumnSpec }) {
  const { body } = spec;
  if (body.kind === "empty") {
    return <div class="gx-dcs-body" />;
  }
  if (body.kind === "note") {
    return (
      <div class="gx-dcs-body">
        <p class="gx-dcs-note">{body.text}</p>
      </div>
    );
  }
  const oneSided = body.sides.original === null || body.sides.modified === null;
  return (
    <div class="gx-dcs-body">
      <DiffBody
        path={spec.entry.path}
        original={body.sides.original}
        modified={body.sides.modified}
        unified={oneSided || spec.unified === true}
        breakpoint={spec.breakpoint}
      />
    </div>
  );
}

export function DiffColumnSpecimen(props: {
  readonly id: string;
  readonly spec: ColumnSpec;
  readonly placement: "docked" | "folded" | "slot" | "free";
}) {
  const { spec } = props;
  return (
    <section
      class={`gx-dcs-col gx-dcs-col--${props.placement}`}
      aria-label="Diff column"
      data-column={props.placement}
    >
      <Head spec={spec} id={props.id} />
      {spec.status !== undefined && (
        <p
          class={`file-tree-shell__status${spec.status.failure ? " is-failure" : ""}`}
          role="status"
        >
          {spec.status.text}
        </p>
      )}
      <Body spec={spec} />
    </section>
  );
}
