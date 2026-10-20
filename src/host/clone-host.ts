/**
 * The clone service over the host bridge (docs/plans/2026-10-20-clone-workspace-mvp.md).
 *
 * Electron-only: a browser `npm run dev` preview has no bridge, so `available`
 * is false and the entry points hide. Payloads are flat (R6) and written as
 * literals so `scripts/electron-ipc-contract.test.ts` can read them; main
 * derives the owning window from the sender, so no owner key is ever sent.
 */
import {
  CLONE_ERRORS,
  CLONE_PHASES,
  type CloneClient,
  type CloneError,
  type CloneJob,
  type CloneResult,
  type CloneStartRequest,
} from "../lib/clone-contract";
import { invoke, listen } from "./bridge";

export const available: boolean =
  typeof globalThis !== "undefined" &&
  (globalThis as { __deckHost?: unknown }).__deckHost !== undefined;

const CLONE_CHANGED_EVENT = "clone:changed";

function isError(value: unknown): value is CloneError {
  return CLONE_ERRORS.includes(value as CloneError);
}

/** Narrow a main-process snapshot; anything malformed is null, not a guess. */
export function asCloneJob(raw: unknown): CloneJob | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const job = raw as Record<string, unknown>;
  if (
    typeof job.jobId !== "string" ||
    typeof job.requestId !== "string" ||
    typeof job.revision !== "number" ||
    typeof job.destination !== "string" ||
    !CLONE_PHASES.includes(job.phase as CloneJob["phase"]) ||
    !(job.percent === null || typeof job.percent === "number") ||
    !(job.error === null || isError(job.error)) ||
    !(job.leftoverPath === null || typeof job.leftoverPath === "string") ||
    !Array.isArray(job.warnings)
  ) {
    return null;
  }
  return {
    jobId: job.jobId,
    requestId: job.requestId,
    revision: job.revision,
    phase: job.phase as CloneJob["phase"],
    destination: job.destination,
    percent: job.percent,
    error: job.error,
    leftoverPath: job.leftoverPath,
    warnings: job.warnings.filter(
      (w): w is "submodules-not-initialized" => w === "submodules-not-initialized",
    ),
  };
}

function asResult(raw: unknown): CloneResult {
  const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  if (source.ok === true) {
    const job = asCloneJob(source.job);
    return job === null ? { ok: false, error: "unknown" } : { ok: true, job };
  }
  return { ok: false, error: isError(source.error) ? source.error : "unknown" };
}

export const cloneClient: CloneClient = {
  async start(request: CloneStartRequest): Promise<CloneResult> {
    return asResult(
      await invoke<unknown>("clone_start", {
        requestId: request.requestId,
        repository: request.repository,
        parent: request.parent,
        name: request.name,
      }),
    );
  },
  async status(): Promise<CloneJob | null> {
    return asCloneJob(await invoke<unknown>("clone_status", {}));
  },
  async cancel(jobId: string): Promise<CloneResult> {
    return asResult(await invoke<unknown>("clone_cancel", { jobId }));
  },
  subscribe(listener: (job: CloneJob) => void): () => void {
    // `listen` resolves with the unlisten function; hold the promise so an
    // unsubscribe that arrives first still detaches once it settles.
    const attached = listen<unknown>(CLONE_CHANGED_EVENT, ({ payload }) => {
      const job = asCloneJob(payload);
      if (job !== null) {
        listener(job);
      }
    });
    return () => void attached.then((unlisten) => unlisten());
  },
};
