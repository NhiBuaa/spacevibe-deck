import { signal } from "@preact/signals";
import { cloneClient } from "../host/clone-host";
import { ensureRepositoriesScanned } from "../repositories/repositories-store";
import { createCloneController } from "./clone-controller";
import type { CloneController } from "./clone-controller-types";
import { addWorkspaceDurably, lastCloneParent, rememberCloneParent } from "./workspaces-store";

/**
 * The window's one clone controller. Lazy, because the remembered parent folder
 * is read from `workspaces.json` by `initWorkspaces`, which finishes before the
 * first render but after this module loads.
 */
let controller: CloneController | null = null;

export function getCloneController(): CloneController {
  controller ??= createCloneController({
    client: cloneClient,
    addWorkspace: addClonedWorkspace,
    initialParent: lastCloneParent(),
    rememberParent: rememberCloneParent,
  });
  return controller;
}

/** The registry action id the File menu sends. */
export const CLONE_REPOSITORY_ACTION = "clone-repository";

/** Set by the File menu: the Open Board opens on the Clone form. Consumed by the board. */
export const cloneFormRequest = signal(0);

let consumedFormRequests = 0;

/** True once per `cloneFormRequest` bump, however many boards mount or re-render. */
export function takeCloneFormRequest(): boolean {
  if (cloneFormRequest.value <= consumedFormRequests) {
    return false;
  }
  consumedFormRequests = cloneFormRequest.value;
  return true;
}

/**
 * A cloned workspace waiting to become the Open Board's selection. Set only
 * after the workspace is saved; the board consumes it whenever it is mounted,
 * so a clone that finishes while the user is in a terminal selects on the next
 * open instead of pulling the board over their work.
 */
export const pendingCloneSelection = signal<string | null>(null);

async function addClonedWorkspace(path: string): Promise<void> {
  await addWorkspaceDurably(path);
  ensureRepositoriesScanned([path]);
  pendingCloneSelection.value = path;
}

/** Test seam, like `resetLauncherStore`. */
export function resetCloneSession(): void {
  controller?.dispose();
  controller = null;
  cloneFormRequest.value = 0;
  consumedFormRequests = 0;
  pendingCloneSelection.value = null;
}
