/**
 * The clone service: validates a request in main, hands `git clone` to a job,
 * and keeps one snapshot per owning window.
 *
 * Rules it holds (docs/plans/2026-10-20-clone-workspace-mvp.md):
 * - one active job per owner, a process-wide lock per destination;
 * - a repeated `requestId` returns the retained job, never a second clone;
 * - nothing existing is touched: an occupied destination is rejected, and a
 *   clone that ends badly leaves its files and says where;
 * - `releaseOwner` and `dispose` signal the process group before their first
 *   `await`, because `dispose` also runs from `process.on("exit")`.
 */
import path from "node:path";
import {
  isTerminalPhase,
  type CloneError,
  type CloneJob,
  type CloneOwner,
  type CloneResult,
  type CloneService,
  type CloneStartRequest,
} from "../../src/lib/clone-contract";
import { defaultCloneDeps, type CloneDeps } from "./clone-deps";
import { buildCloneArgs, buildCloneEnv } from "./clone-git";
import { classifySpawnFailure } from "./clone-failure";
import { validateCloneRequest } from "./clone-input";
import { runCloneJob, type CloneSnapshotPatch, type RunningCloneJob } from "./clone-job";

interface OwnerRecord {
  readonly owner: CloneOwner;
  snapshot: CloneJob;
  job: RunningCloneJob | null;
  /** Released owners keep finishing quietly: no events for a window that is gone. */
  silenced: boolean;
}

const reject = (error: CloneError): CloneResult => ({ ok: false, error });

/** Case- and normalisation-insensitive filesystems must not be given two keys for one folder. */
function lockKey(platform: NodeJS.Platform, canonical: string): string {
  const normal = canonical.normalize("NFC");
  return platform === "darwin" || platform === "win32" ? normal.toLowerCase() : normal;
}

export function createCloneService(overrides: Partial<CloneDeps> = {}): CloneService {
  const deps: CloneDeps = { ...defaultCloneDeps(), ...overrides };
  const records = new Map<CloneOwner, OwnerRecord>();
  const starting = new Map<CloneOwner, { requestId: string; result: Promise<CloneResult> }>();
  const generations = new Map<CloneOwner, number>();
  const running = new Set<RunningCloneJob>();
  const listeners = new Set<(owner: CloneOwner, job: CloneJob) => void>();
  let disposed = false;

  function notify(record: OwnerRecord): void {
    if (record.silenced) {
      return;
    }
    for (const listener of [...listeners]) {
      try {
        listener(record.owner, record.snapshot);
      } catch (error) {
        deps.log("Deck: clone listener failed", { error: String(error) });
      }
    }
  }

  /** Folds a patch in as the next revision; a patch that changes nothing emits nothing. */
  function commit(record: OwnerRecord, patch: CloneSnapshotPatch): void {
    const current = record.snapshot;
    const next = { ...current, ...patch };
    const unchanged =
      next.phase === current.phase &&
      next.percent === current.percent &&
      next.error === current.error &&
      next.leftoverPath === current.leftoverPath &&
      next.warnings.join() === current.warnings.join();
    if (unchanged) {
      return;
    }
    record.snapshot = { ...next, revision: current.revision + 1 };
    notify(record);
  }

  async function begin(owner: CloneOwner, request: CloneStartRequest): Promise<CloneResult> {
    const valid = validateCloneRequest(request, deps.platform, deps.parseRepository);
    if (valid === null) {
      return reject("invalid-input");
    }
    const generation = generations.get(owner) ?? 0;
    const aborted = () => disposed || (generations.get(owner) ?? 0) !== generation;

    let canonicalParent: string;
    try {
      if (!(await deps.fs.stat(valid.parent)).isDirectory()) {
        return reject("invalid-input");
      }
      canonicalParent = await deps.fs.realpath(valid.parent);
    } catch {
      return reject("invalid-input");
    }
    if (aborted()) {
      return reject("job-unavailable");
    }
    // Check and take in one synchronous step: two windows cannot both pass.
    const key = lockKey(deps.platform, path.join(canonicalParent, valid.name));
    if (deps.locks.has(key)) {
      return reject("destination-busy");
    }
    deps.locks.add(key);
    let handedOver = false;
    try {
      try {
        await deps.fs.lstat(valid.destination); // A dangling symlink also occupies it.
        return reject("destination-exists");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "EACCES" || code === "EPERM") {
          return reject("permission-denied");
        }
        if (code !== "ENOENT") {
          return reject("unknown");
        }
      }
      const git = await deps.resolveGit();
      if (aborted()) {
        return reject("job-unavailable");
      }
      const child = deps.spawn(git, buildCloneArgs(valid.remoteUrl, valid.destination), {
        cwd: valid.parent,
        env: buildCloneEnv(deps.env()),
        stdio: ["ignore", "ignore", "pipe"],
        // Its own process group, so one signal reaches git, ssh and helpers.
        detached: deps.platform !== "win32",
        windowsHide: true,
      });
      if (child.pid === undefined) {
        const code = await new Promise<string | undefined>((resolve) => {
          child.on("error", (error) => resolve((error as NodeJS.ErrnoException).code));
        });
        return reject(classifySpawnFailure(code));
      }
      const record: OwnerRecord = {
        owner,
        job: null,
        silenced: false,
        snapshot: {
          jobId: deps.newId(),
          requestId: request.requestId,
          revision: 1,
          phase: "connecting",
          destination: valid.destination,
          percent: null,
          error: null,
          leftoverPath: null,
          warnings: [],
        },
      };
      records.set(owner, record);
      handedOver = true;
      const job = runCloneJob(child, deps, valid.destination, {
        update: (patch) => commit(record, patch),
        release: () => deps.locks.delete(key),
      });
      record.job = job;
      running.add(job);
      void job.done.then(() => running.delete(job));
      notify(record);
      return { ok: true, job: record.snapshot };
    } catch (error) {
      deps.log("Deck: clone start failed", { error: String(error) });
      return reject(classifySpawnFailure((error as NodeJS.ErrnoException).code));
    } finally {
      if (!handedOver) {
        deps.locks.delete(key);
      }
    }
  }

  function start(owner: CloneOwner, request: CloneStartRequest): Promise<CloneResult> {
    const retained = records.get(owner);
    if (retained !== undefined && retained.snapshot.requestId === request.requestId) {
      return Promise.resolve({ ok: true, job: retained.snapshot });
    }
    const pending = starting.get(owner);
    if (pending !== undefined) {
      return pending.requestId === request.requestId
        ? pending.result
        : Promise.resolve(reject("job-busy"));
    }
    if (retained !== undefined && !isTerminalPhase(retained.snapshot.phase)) {
      return Promise.resolve(reject("job-busy"));
    }
    if (disposed) {
      return Promise.resolve(reject("job-unavailable"));
    }
    const result = begin(owner, request).finally(() => starting.delete(owner));
    starting.set(owner, { requestId: request.requestId, result });
    return result;
  }

  async function cancel(owner: CloneOwner, jobId: string): Promise<CloneResult> {
    const record = records.get(owner);
    if (record === undefined || record.snapshot.jobId !== jobId) {
      return reject("job-unavailable");
    }
    if (!isTerminalPhase(record.snapshot.phase)) {
      record.job?.requestStop();
    }
    return { ok: true, job: record.snapshot };
  }

  async function releaseOwner(owner: CloneOwner): Promise<void> {
    generations.set(owner, (generations.get(owner) ?? 0) + 1);
    const record = records.get(owner);
    records.delete(owner);
    if (record === undefined) {
      return;
    }
    record.silenced = true;
    record.job?.requestStop(); // Synchronous: the signal is out before the await below.
    await record.job?.done;
  }

  async function dispose(): Promise<void> {
    disposed = true;
    const jobs = [...running];
    for (const job of jobs) {
      job.requestStop();
    }
    await Promise.all(jobs.map((job) => job.done));
  }

  return {
    start,
    status: (owner) => records.get(owner)?.snapshot ?? null,
    cancel,
    onChanged(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    releaseOwner,
    dispose,
  };
}
