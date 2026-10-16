/**
 * The two sides of one Changes entry's diff (plan 2026-10-10-diff-column, D6,
 * D7).
 *
 * `HEAD` comes from the git channel, the working side from the file channel; both
 * arrive through injected ports, so this stays free of the bridge and a test
 * drives it with fakes. It answers one typed view: both texts, or the reason
 * there is nothing to diff. A side is never read once the other is known to be
 * unreadable, and a working file over the editing limit is never read at all.
 * Newest request wins: a slower, older read is dropped, never published.
 */
import { signal, type ReadonlySignal } from "@preact/signals";
import type { ChangeEntry, HeadFileReply } from "../../host/git-changes-host";
import { languageForPath } from "../editor-host";
import type { FileStatResult, ReadFileResponse } from "../file-client";
import { BINARY_REFUSAL, MAX_EDITABLE_BYTES } from "../file-content";
import { absolutePath } from "./changes-model";

export interface DiffSidesPorts {
  statFiles(root: string, paths: readonly string[]): Promise<readonly FileStatResult[]>;
  readFile(root: string, path: string): Promise<ReadFileResponse>;
  /** `path` is root-relative with `/`, as `ChangeEntry.path`. */
  readHeadFile(root: string, path: string): Promise<HeadFileReply>;
}

export interface DiffSide {
  readonly text: string;
  /** Monaco's language id, or null for plain text. */
  readonly language: string | null;
}

export type DiffSidesView =
  | {
      readonly kind: "text";
      readonly original: DiffSide;
      readonly modified: DiffSide;
      /** One side is empty by design (added, deleted, unborn): always unified. */
      readonly oneSided: boolean;
      /** A line for the header's tooltip, or null. */
      readonly note: string | null;
    }
  | { readonly kind: "binary" }
  | { readonly kind: "too-large"; readonly bytes: number }
  | { readonly kind: "failed"; readonly message: string };

export interface DiffSidesRequest {
  readonly root: string;
  readonly entry: ChangeEntry;
  /** An unborn branch: there is no `HEAD` to read. */
  readonly initial: boolean;
}

const BINARY: DiffSidesView = { kind: "binary" };
const OUTSIDE_NOTE = "Renamed from outside this folder";
const ABSENT_MESSAGE = "This file is not in HEAD.";
const MISSING_MESSAGE = "This file is no longer on disk.";

const failed = (message: string): DiffSidesView => ({ kind: "failed", message });

/** A refused read is a binary file or a reason worth printing. */
function refusal(reason: string): DiffSidesView {
  return reason === BINARY_REFUSAL ? BINARY : failed(reason);
}

function headVerdict(reply: HeadFileReply): DiffSidesView | null {
  switch (reply.kind) {
    case "ok":
      return null;
    case "too-large":
      return { kind: "too-large", bytes: reply.bytes };
    case "refused":
      return refusal(reply.reason);
    case "absent":
      return failed(ABSENT_MESSAGE);
    default:
      return failed(reply.message);
  }
}

function workVerdict(stat: FileStatResult | undefined): DiffSidesView | null {
  if (stat === undefined || !stat.exists) {
    return failed(MISSING_MESSAGE);
  }
  const bytes = stat.size ?? 0;
  return bytes > MAX_EDITABLE_BYTES ? { kind: "too-large", bytes } : null;
}

/** Which paths feed each side; null is an empty side. */
function sidePaths(entry: ChangeEntry, initial: boolean) {
  const oneSidedHead = initial || entry.status === "added" || entry.status === "untracked";
  const head = oneSidedHead ? null : entry.status === "renamed" ? entry.oldPath : entry.path;
  const work = entry.status === "deleted" ? null : entry.path;
  const note = entry.status === "renamed" && entry.oldPath === null ? OUTSIDE_NOTE : null;
  return { head, work, note };
}

async function loadSides(ports: DiffSidesPorts, request: DiffSidesRequest): Promise<DiffSidesView> {
  const { root, entry, initial } = request;
  if (entry.binary) {
    return BINARY;
  }
  const { head, work, note } = sidePaths(entry, initial);
  const workPath = work === null ? null : absolutePath(root, work);

  // Both size checks come before the working file is read: `HEAD`'s answers its
  // own size without sending the blob, and `stat` is the working side's.
  const [stats, headReply] = await Promise.all([
    workPath === null ? null : ports.statFiles(root, [workPath]),
    head === null ? null : ports.readHeadFile(root, head),
  ]);
  const verdicts = [
    headReply === null ? null : headVerdict(headReply),
    stats === null ? null : workVerdict(stats[0]),
  ].filter((verdict): verdict is DiffSidesView => verdict !== null);
  const blocked = verdicts.find((verdict) => verdict.kind !== "too-large") ?? verdicts[0];
  if (blocked !== undefined) {
    return blocked;
  }

  let modifiedText = "";
  if (workPath !== null) {
    const read = await ports.readFile(root, workPath);
    if (read.kind === "refused") {
      return refusal(read.reason);
    }
    modifiedText = read.content;
  }
  return {
    kind: "text",
    original: {
      text: headReply?.kind === "ok" ? headReply.content : "",
      language: languageForPath(head ?? entry.path),
    },
    modified: { text: modifiedText, language: languageForPath(work ?? entry.path) },
    oneSided: head === null || work === null,
    note,
  };
}

export interface DiffSides {
  /** Null until the first reply for the file on screen. */
  readonly view: ReadonlySignal<DiffSidesView | null>;
  /**
   * Reads the entry's sides. Never rejects. A different file empties `view` at
   * once; the same file keeps showing its last view until the new one differs.
   */
  load(request: DiffSidesRequest): Promise<void>;
  /** Drops the view and any read still in flight. */
  clear(): void;
}

export function createDiffSides(ports: DiffSidesPorts): DiffSides {
  const view = signal<DiffSidesView | null>(null);
  let newest = 0;
  let shown: string | null = null;
  return {
    view,
    async load(request) {
      const ticket = (newest += 1);
      const key = `${request.root}\0${request.entry.path}`;
      if (key !== shown) {
        shown = key;
        view.value = null;
      }
      let next: DiffSidesView;
      try {
        next = await loadSides(ports, request);
      } catch (error) {
        next = failed(error instanceof Error ? error.message : "Could not read the file");
      }
      if (ticket !== newest) {
        return;
      }
      // An unchanged re-read is not a new model.
      if (JSON.stringify(next) !== JSON.stringify(view.peek())) {
        view.value = next;
      }
    },
    clear() {
      newest += 1;
      shown = null;
      view.value = null;
    },
  };
}
