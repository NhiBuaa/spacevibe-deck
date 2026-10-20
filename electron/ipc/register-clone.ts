/**
 * Clone IPC handlers over the main-owned `CloneService`
 * (docs/plans/2026-10-20-clone-workspace-mvp.md).
 *
 * The owner of a job is the window that sent the request, resolved here with
 * `labelOf`; no payload field names one. Handlers only check payload TYPES —
 * content validation (repository text, folder name, destination) belongs to the
 * service, which re-parses everything because the renderer is not the trust
 * boundary. Replies never reject for a clone failure: they are `CloneResult`.
 */
import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { CloneJob, CloneResult, CloneService } from "../../src/lib/clone-contract";
import { CHANNELS, EVENTS } from "./channels";

export interface RegisterCloneDeps {
  readonly service: CloneService;
  readonly labelOf: (event: IpcMainInvokeEvent) => string;
  readonly emitTo: (label: string, event: string, payload: unknown) => boolean;
}

const MAX_FIELD_LENGTH = 4096;

function text(value: unknown): string | null {
  return typeof value === "string" && value.length <= MAX_FIELD_LENGTH ? value : null;
}

const INVALID_INPUT: CloneResult = { ok: false, error: "invalid-input" };

export function registerClone(deps: RegisterCloneDeps): void {
  const { service } = deps;
  service.onChanged((owner: string, job: CloneJob) => {
    deps.emitTo(owner, EVENTS.cloneChanged, job);
  });

  ipcMain.handle(CHANNELS.cloneStart, async (event, { requestId, repository, parent, name }) => {
    const request = {
      requestId: text(requestId),
      repository: text(repository),
      parent: text(parent),
      name: text(name),
    };
    if (
      request.requestId === null ||
      request.requestId === "" ||
      request.repository === null ||
      request.parent === null ||
      request.name === null
    ) {
      return INVALID_INPUT;
    }
    return service.start(deps.labelOf(event), {
      requestId: request.requestId,
      repository: request.repository,
      parent: request.parent,
      name: request.name,
    });
  });
  ipcMain.handle(CHANNELS.cloneStatus, (event) => service.status(deps.labelOf(event)));
  ipcMain.handle(CHANNELS.cloneCancel, async (event, { jobId }) => {
    const id = text(jobId);
    return id === null || id === "" ? INVALID_INPUT : service.cancel(deps.labelOf(event), id);
  });
}
