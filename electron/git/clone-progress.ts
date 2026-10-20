/**
 * Reads `git clone --progress` stderr as a stream: the CURRENT phase with its
 * percent, plus a bounded tail of the non-progress lines that failure
 * classification reads later.
 *
 * Git redraws a progress line with `\r` and ends it with `\n` once it is done,
 * so a chunk can hold several redraws, or stop in the middle of one. Both the
 * unfinished line and the diagnostic tail are capped: a hostile or runaway
 * remote can print forever, and the buffers must not grow with it.
 */
import type { ClonePhase } from "../../src/lib/clone-contract";

export type ProgressPhase = Extract<
  ClonePhase,
  "connecting" | "receiving" | "resolving" | "checkout"
>;

export interface CloneProgress {
  readonly phase: ProgressPhase;
  readonly percent: number | null;
}

/** Longest unfinished line kept while waiting for its terminator. */
export const MAX_PENDING_CHARS = 4096;
/** Diagnostic text kept for classification; the error is always at the end. */
export const MAX_TAIL_CHARS = 16 * 1024;

const PHASE_ORDER: readonly ProgressPhase[] = ["connecting", "receiving", "resolving", "checkout"];

const PROGRESS_LINE =
  /(Receiving objects|Resolving deltas|Updating files|Checking out files):\s+(\d{1,3})%/;

const PHASE_OF_LABEL: Readonly<Record<string, ProgressPhase>> = {
  "Receiving objects": "receiving",
  "Resolving deltas": "resolving",
  "Updating files": "checkout",
  "Checking out files": "checkout",
};

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*[A-Za-z]`, "g");

export interface ProgressParser {
  /** Feed decoded stderr text; returns the progress after it, or null when it did not change. */
  push(text: string): CloneProgress | null;
  /** Non-progress stderr, bounded, for classification and (redacted) logging. */
  tail(): string;
}

export function createProgressParser(): ProgressParser {
  let pending = "";
  let tail = "";
  let current: CloneProgress = { phase: "connecting", percent: null };

  function readLine(raw: string): CloneProgress | null {
    const line = raw.replace(ANSI, "");
    const match = PROGRESS_LINE.exec(line);
    if (match === null) {
      if (line.trim() !== "") {
        tail = `${tail}${line}\n`.slice(-MAX_TAIL_CHARS);
      }
      return null;
    }
    const phase = PHASE_OF_LABEL[match[1]];
    const percent = Math.min(100, Number(match[2]));
    // Never walk backwards: late "remote:" noise must not reopen a finished phase.
    if (PHASE_ORDER.indexOf(phase) < PHASE_ORDER.indexOf(current.phase)) {
      return null;
    }
    if (phase === current.phase && percent === current.percent) {
      return null;
    }
    current = { phase, percent };
    return current;
  }

  return {
    push(text) {
      const parts = `${pending}${text}`.split(/[\r\n]/);
      pending = (parts.pop() ?? "").slice(-MAX_PENDING_CHARS);
      let changed: CloneProgress | null = null;
      for (const part of parts) {
        changed = readLine(part) ?? changed;
      }
      return changed;
    },
    tail() {
      // The unfinished line is what git said last; fatal errors end with "\n" so it is usually empty.
      return pending === "" ? tail : `${tail}${pending.replace(ANSI, "")}`;
    },
  };
}
