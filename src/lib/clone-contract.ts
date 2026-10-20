/**
 * The shared contract of "Clone & add workspace": pure types and two pure
 * reconciliation helpers. Imported by the renderer, the `src/host/` facade and
 * the main process (`electron/` may import `src/lib/` like `menu.ts` does), so
 * nothing here may touch the DOM, Electron or Node.
 *
 * Wire shape: every IPC payload is flat (R6) and main derives the owning window
 * from the sender — the renderer never names an owner.
 */

export const CLONE_PHASES = [
  "connecting",
  "receiving",
  "resolving",
  "checkout",
  "cancelling",
  "succeeded",
  "failed",
  "cancelled",
] as const;
export type ClonePhase = (typeof CLONE_PHASES)[number];

const TERMINAL_PHASES: readonly ClonePhase[] = ["succeeded", "failed", "cancelled"];

export function isTerminalPhase(phase: ClonePhase): boolean {
  return TERMINAL_PHASES.includes(phase);
}

/** Closed set: UI copy is chosen per code; raw stderr never crosses the wire. */
export const CLONE_ERRORS = [
  "invalid-input",
  "git-not-found",
  "destination-exists",
  "destination-busy",
  "job-busy",
  "job-unavailable",
  "authentication-required",
  "repository-unavailable",
  "network",
  "permission-denied",
  "disk-full",
  "timed-out",
  "incomplete-checkout",
  "unknown",
] as const;
export type CloneError = (typeof CLONE_ERRORS)[number];

export type CloneWarning = "submodules-not-initialized";

/** A full snapshot; every `clone:changed` event and every reply carries one. */
export interface CloneJob {
  readonly jobId: string;
  readonly requestId: string;
  /** Monotonic within one job. A snapshot with a lower revision is stale. */
  readonly revision: number;
  readonly phase: ClonePhase;
  /** Canonical absolute path the clone writes to. */
  readonly destination: string;
  /** 0–100 and only for the CURRENT phase; null when the phase has no measure. */
  readonly percent: number | null;
  readonly error: CloneError | null;
  /** Set when a failed/cancelled clone left files behind. Never deleted automatically. */
  readonly leftoverPath: string | null;
  readonly warnings: readonly CloneWarning[];
}

export interface CloneStartRequest {
  /** Client-chosen idempotency key: a repeat returns the retained job. */
  readonly requestId: string;
  /** Raw user input; main parses it with `parseGithubRepository`. */
  readonly repository: string;
  /** Absolute parent folder. */
  readonly parent: string;
  /** Single path segment for the new folder. */
  readonly name: string;
}

export type CloneResult =
  | { readonly ok: true; readonly job: CloneJob }
  | { readonly ok: false; readonly error: CloneError };

/** The renderer's door: implemented by `src/host/clone-host.ts`, by fakes in tests. */
export interface CloneClient {
  start(request: CloneStartRequest): Promise<CloneResult>;
  /** Latest job owned by THIS window, or null. */
  status(): Promise<CloneJob | null>;
  cancel(jobId: string): Promise<CloneResult>;
  /** Subscribe BEFORE calling `status()`; returns the unsubscribe. */
  subscribe(listener: (job: CloneJob) => void): () => void;
}

/** Window label; main-process only. */
export type CloneOwner = string;

/**
 * The main-process service (`electron/git/clone.ts`). One active job per owner,
 * a process-wide destination lock. `owner` is trusted: IPC derives it from the
 * sender and no payload field can supply it.
 */
export interface CloneService {
  start(owner: CloneOwner, request: CloneStartRequest): Promise<CloneResult>;
  status(owner: CloneOwner): CloneJob | null;
  /** Idempotent; a finished job stays finished. */
  cancel(owner: CloneOwner, jobId: string): Promise<CloneResult>;
  /** Every snapshot change, tagged with the owner it belongs to. */
  onChanged(listener: (owner: CloneOwner, job: CloneJob) => void): () => void;
  /**
   * The owning window is gone: cancel its job and drop its retained snapshot.
   * The kill signal to the git process group goes out BEFORE the first `await`.
   */
  releaseOwner(owner: CloneOwner): Promise<void>;
  /**
   * App quit: cancel every job. Also called from `process.on("exit")`, where
   * async work never runs — so every kill signal must be sent synchronously,
   * before the first `await`; the returned promise only waits for children to stop.
   */
  dispose(): Promise<void>;
}

/**
 * Whether `incoming` may replace `current` in a client that is reconciling
 * events against a status reply.
 *
 * - Same job: only a strictly higher revision wins, so a late reply cannot
 *   overwrite newer state.
 * - Another job: when the client has an outstanding request, only that request's
 *   job (matched by `requestId`) is accepted; without one, a different job is
 *   accepted only over nothing or a finished job (a reload adopting its job).
 */
export function acceptsSnapshot(
  current: CloneJob | null,
  incoming: CloneJob,
  expectedRequestId: string | null,
): boolean {
  if (current !== null && current.jobId === incoming.jobId) {
    return incoming.revision > current.revision;
  }
  if (expectedRequestId !== null) {
    return incoming.requestId === expectedRequestId;
  }
  return current === null || isTerminalPhase(current.phase);
}
