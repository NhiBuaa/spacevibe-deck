import { useEffect } from "preact/hooks";
import {
  cloneFormRequest,
  getCloneController,
  pendingCloneSelection,
  takeCloneFormRequest,
} from "./clone-session";

export interface CloneBoardHooks {
  /** Show the Clone form. */
  openForm(): void;
  isFormOpen(): boolean;
  /** Leave the form for the board's home. */
  leaveForm(): void;
  selectWorkspace(path: string): Promise<void>;
}

/**
 * The board's two ways into the clone flow that do not start on a button: the
 * File menu asking for the form, and a finished clone asking to be selected.
 * Selecting never starts an agent (plan: Starting an agent remains separate).
 */
export function useCloneBoard(hooks: CloneBoardHooks): void {
  /* oxlint-disable react-hooks/exhaustive-deps -- keyed on the two signals; the hooks object is rebuilt every render */
  useEffect(() => {
    if (takeCloneFormRequest()) {
      hooks.openForm();
    }
  }, [cloneFormRequest.value]);

  useEffect(() => {
    const path = pendingCloneSelection.value;
    if (path === null) {
      return;
    }
    pendingCloneSelection.value = null;
    const warned = (getCloneController().state.value.job?.warnings.length ?? 0) > 0;
    void hooks.selectWorkspace(path).then(() => {
      // A warning is read on the form, so it stays up; the plain success leaves
      // like the create-workspace form does.
      if (hooks.isFormOpen() && !warned) {
        hooks.leaveForm();
      }
    });
  }, [pendingCloneSelection.value]);
  /* oxlint-enable react-hooks/exhaustive-deps */
}
