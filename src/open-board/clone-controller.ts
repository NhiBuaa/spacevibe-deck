import { signal } from "@preact/signals";
import { acceptsSnapshot, isTerminalPhase, type CloneJob } from "../lib/clone-contract";
import type {
  CloneControllerState,
  CloneRegistration,
  CreateCloneController,
} from "./clone-controller-types";

/**
 * The window-scoped owner of one clone: it outlives the form, reconciles the
 * host's events against `status()` and `start()` replies, and registers the
 * workspace exactly once per job. The form renders `state` and nothing else.
 */
export const createCloneController: CreateCloneController = (deps) => {
  const state = signal<CloneControllerState>({
    job: null,
    registration: "idle",
    starting: false,
    rejection: null,
    lastParent: deps.initialParent ?? null,
  });
  // What happened to each job's workspace registration. A job that is in here
  // never calls `addWorkspace` again, whoever re-delivers its `succeeded`.
  const registrations = new Map<string, CloneRegistration>();
  // The parent each request was started with: a job adopted after a reload
  // has none, so it never updates `lastParent`.
  const parents = new Map<string, string>();
  let awaitedRequestId: string | null = null;
  let unsubscribe: (() => void) | null = null;
  let disposed = false;

  const patch = (change: Partial<CloneControllerState>): void => {
    state.value = { ...state.value, ...change };
  };

  /** Writes the outcome for `job`, and onto the screen only while it is the shown job. */
  const settle = (job: CloneJob, registration: CloneRegistration): void => {
    registrations.set(job.jobId, registration);
    if (state.value.job?.jobId === job.jobId) {
      patch({ registration });
    }
  };

  const register = async (job: CloneJob): Promise<void> => {
    settle(job, "adding-workspace");
    try {
      await deps.addWorkspace(job.destination);
    } catch (cause: unknown) {
      console.warn("Clone: adding the workspace failed:", cause);
      if (!disposed) settle(job, "workspace-save-failed");
      return;
    }
    if (disposed) return;
    settle(job, "ready");
    const parent = parents.get(job.requestId);
    if (parent !== undefined) {
      patch({ lastParent: parent });
      deps.rememberParent?.(parent);
    }
  };

  const reconcile = (incoming: CloneJob): void => {
    if (disposed) return;
    const { job: current } = state.value;
    if (!acceptsSnapshot(current, incoming, awaitedRequestId)) return;
    patch({
      job: incoming,
      registration: registrations.get(incoming.jobId) ?? "idle",
      starting: false,
      rejection: null,
    });
    if (incoming.phase === "succeeded" && !registrations.has(incoming.jobId)) {
      void register(incoming);
    }
  };

  return {
    state,

    async init() {
      if (disposed || unsubscribe !== null) return;
      // Subscribe first: an event that lands while `status()` is in flight must
      // not be lost, and the reply must not overwrite it.
      unsubscribe = deps.client.subscribe(reconcile);
      try {
        const job = await deps.client.status();
        if (job !== null) reconcile(job);
      } catch (cause: unknown) {
        console.warn("Clone: reading the current job failed:", cause);
      }
    },

    async start(input) {
      if (disposed || state.value.starting) return;
      const requestId = deps.newRequestId?.() ?? crypto.randomUUID();
      awaitedRequestId = requestId;
      parents.set(requestId, input.parent);
      patch({ starting: true, rejection: null });
      try {
        const result = await deps.client.start({ requestId, ...input });
        if (disposed) return;
        if (result.ok) {
          reconcile(result.job);
        } else {
          patch({ rejection: result.error });
        }
      } catch (cause: unknown) {
        console.warn("Clone: starting failed:", cause);
        if (!disposed) patch({ rejection: "unknown" });
      } finally {
        if (awaitedRequestId === requestId) awaitedRequestId = null;
        if (!disposed) patch({ starting: false });
      }
    },

    async cancel() {
      const { job } = state.value;
      if (disposed || job === null) return;
      try {
        const result = await deps.client.cancel(job.jobId);
        if (disposed) return;
        if (result.ok) {
          reconcile(result.job);
        } else {
          patch({ rejection: result.error });
        }
      } catch (cause: unknown) {
        console.warn("Clone: cancelling failed:", cause);
        if (!disposed) patch({ rejection: "unknown" });
      }
    },

    async retryAddWorkspace() {
      const { job, registration } = state.value;
      if (disposed || job === null || registration !== "workspace-save-failed") return;
      await register(job);
    },

    reset() {
      const { job, registration, starting } = state.value;
      const active =
        starting ||
        registration === "adding-workspace" ||
        (job !== null && !isTerminalPhase(job.phase));
      if (disposed || active) return;
      patch({ job: null, registration: "idle", rejection: null });
    },

    dispose() {
      disposed = true;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
};
