/**
 * The interface between the window-scoped clone controller and the form that
 * renders it (docs/plans/2026-10-20-clone-workspace-mvp.md, UI lane). Types
 * only: the UI lane implements `createCloneController` against it and the form
 * consumes `CloneController` — the form never sees `CloneClient`, persistence or
 * Git.
 */
import type { ReadonlySignal } from "@preact/signals";
import type { CloneClient, CloneError, CloneJob } from "../lib/clone-contract";

/**
 * What happens to a clone after Git succeeded. `idle` until a `succeeded`
 * snapshot arrives; that snapshot moves it to `adding-workspace` exactly once
 * per job, then to `ready` or `workspace-save-failed`. Reopening the form never
 * clones or registers again.
 */
export type CloneRegistration = "idle" | "adding-workspace" | "ready" | "workspace-save-failed";

export interface CloneControllerState {
  /** Latest reconciled snapshot, kept after the form closes; null before any job. */
  readonly job: CloneJob | null;
  readonly registration: CloneRegistration;
  /** A `clone_start` is in flight and no snapshot has arrived yet. */
  readonly starting: boolean;
  /** `clone_start` / `clone_cancel` rejected before any job existed. */
  readonly rejection: CloneError | null;
  /** `deps.initialParent` until a clone succeeds, then that clone's parent. */
  readonly lastParent: string | null;
}

export interface CloneStartInput {
  readonly repository: string;
  readonly parent: string;
  readonly name: string;
}

export interface CloneController {
  readonly state: ReadonlySignal<CloneControllerState>;
  /** Subscribes, then reconciles `status()`; call once per window. */
  init(): Promise<void>;
  start(input: CloneStartInput): Promise<void>;
  cancel(): Promise<void>;
  /** Only valid in `workspace-save-failed`: calls `addWorkspace` again, never Git. */
  retryAddWorkspace(): Promise<void>;
  /** Forget a finished job so the form starts blank; no-op while a job is active. */
  reset(): void;
  dispose(): void;
}

export interface CloneControllerDeps {
  readonly client: CloneClient;
  /** Resolves only after the workspace is durably saved (and rejects otherwise). */
  addWorkspace(path: string): Promise<void>;
  /** The parent folder the form starts with; integration reads it from persisted state. */
  readonly initialParent?: string | null;
  /** Called with the parent folder of every clone that succeeded; integration persists it. */
  readonly rememberParent?: (parent: string) => void;
  /** Id source for `requestId`; defaults to `crypto.randomUUID`. */
  readonly newRequestId?: () => string;
}

export type CreateCloneController = (deps: CloneControllerDeps) => CloneController;
