/**
 * The shared fixture matrix of the clone contract: the same snapshots drive the
 * Core service tests, the UI controller/form tests and the final run through the
 * real IPC boundary. Changing a type in `clone-contract.ts` means changing this
 * file and both lanes before work continues.
 *
 * Test support only — shipping modules must not import it.
 */
import type {
  CloneClient,
  CloneError,
  CloneJob,
  CloneResult,
  CloneStartRequest,
} from "./clone-contract";

export const FIXTURE_PARENT = "/Users/test/Code Projects";
export const FIXTURE_NAME = "Dự án mẫu";
export const FIXTURE_DESTINATION = `${FIXTURE_PARENT}/${FIXTURE_NAME}`;
export const FIXTURE_REQUEST: CloneStartRequest = {
  requestId: "req-1",
  repository: "octocat/hello-world",
  parent: FIXTURE_PARENT,
  name: FIXTURE_NAME,
};

export function cloneJob(overrides: Partial<CloneJob> = {}): CloneJob {
  return {
    jobId: "job-1",
    requestId: FIXTURE_REQUEST.requestId,
    revision: 1,
    phase: "connecting",
    destination: FIXTURE_DESTINATION,
    percent: null,
    error: null,
    leftoverPath: null,
    warnings: [],
    ...overrides,
  };
}

/** Every progress phase in order, each with a higher revision than the last. */
export const PROGRESS_SEQUENCE: readonly CloneJob[] = [
  cloneJob({ revision: 1, phase: "connecting" }),
  cloneJob({ revision: 2, phase: "receiving", percent: 0 }),
  cloneJob({ revision: 3, phase: "receiving", percent: 48 }),
  cloneJob({ revision: 4, phase: "resolving", percent: 100 }),
  cloneJob({ revision: 5, phase: "checkout", percent: 60 }),
];

export const SUCCEEDED = cloneJob({ revision: 6, phase: "succeeded", percent: 100 });

export const SUCCEEDED_WITH_SUBMODULES = cloneJob({
  revision: 6,
  phase: "succeeded",
  percent: 100,
  warnings: ["submodules-not-initialized"],
});

export function failedJob(error: CloneError, overrides: Partial<CloneJob> = {}): CloneJob {
  return cloneJob({ revision: 3, phase: "failed", error, ...overrides });
}

export const CANCELLING = cloneJob({ revision: 4, phase: "cancelling", percent: 30 });

export const CANCELLED_WITH_LEFTOVERS = cloneJob({
  revision: 5,
  phase: "cancelled",
  leftoverPath: FIXTURE_DESTINATION,
});

/** Results the matrix needs besides a job: start/cancel rejections. */
export const REJECTIONS: Readonly<Record<string, CloneResult>> = {
  gitMissing: { ok: false, error: "git-not-found" },
  authRequired: { ok: false, error: "authentication-required" },
  destinationExists: { ok: false, error: "destination-exists" },
  destinationBusy: { ok: false, error: "destination-busy" },
  jobBusy: { ok: false, error: "job-busy" },
  invalidInput: { ok: false, error: "invalid-input" },
};

export interface FakeCloneClient extends CloneClient {
  /** Deliver a snapshot to every subscriber, as a `clone:changed` event would. */
  emit(job: CloneJob): void;
  readonly calls: {
    readonly start: CloneStartRequest[];
    readonly status: number;
    readonly cancel: string[];
  };
}

export interface FakeCloneClientScript {
  start?: (request: CloneStartRequest) => CloneResult | Promise<CloneResult>;
  status?: () => CloneJob | null | Promise<CloneJob | null>;
  cancel?: (jobId: string) => CloneResult | Promise<CloneResult>;
}

/** A scriptable `CloneClient` for UI tests; the default answers like an idle window. */
export function createFakeCloneClient(script: FakeCloneClientScript = {}): FakeCloneClient {
  const listeners = new Set<(job: CloneJob) => void>();
  const calls = { start: [] as CloneStartRequest[], status: 0, cancel: [] as string[] };
  return {
    async start(request) {
      calls.start.push(request);
      return (
        script.start?.(request) ?? { ok: true, job: cloneJob({ requestId: request.requestId }) }
      );
    },
    async status() {
      calls.status += 1;
      return script.status?.() ?? null;
    },
    async cancel(jobId) {
      calls.cancel.push(jobId);
      return script.cancel?.(jobId) ?? { ok: true, job: CANCELLING };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(job) {
      for (const listener of [...listeners]) {
        listener(job);
      }
    },
    calls: {
      get start() {
        return calls.start;
      },
      get status() {
        return calls.status;
      },
      get cancel() {
        return calls.cancel;
      },
    },
  };
}
