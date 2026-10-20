import { useEffect, useRef } from "preact/hooks";
import { useWorkspaceDrop } from "../open-board/use-workspace-drop";
import { reportPersistError } from "../chrome/events";

interface WorkspaceDropProps {
  readonly enabled: boolean;
  readonly onSelect: (path: string, paths: readonly string[]) => void;
  readonly onChecking: (checking: boolean) => void;
}

/** Board and terminal targets retain their own drop handlers. */
export function WorkspaceDrop({ enabled, onSelect, onChecking }: WorkspaceDropProps) {
  const drop = useWorkspaceDrop({
    enabled,
    onSelect,
    onChecking,
    onError: (message) => {
      if (message !== null) reportPersistError(message);
    },
  });
  const current = useRef(drop);
  current.current = drop;

  useEffect(() => {
    function delegated(event: DragEvent): boolean {
      return event.target instanceof Element && event.target.closest(".open-board, .pane") !== null;
    }
    function over(event: DragEvent) {
      if (delegated(event)) {
        current.current.handlers.onDragLeave(event);
        return;
      }
      current.current.handlers.onDragOver(event);
    }
    function leave(event: DragEvent) {
      if (event.relatedTarget === null) current.current.handlers.onDragLeave(event);
    }
    function accept(event: DragEvent) {
      if (!delegated(event)) current.current.handlers.onDrop(event);
    }
    window.addEventListener("dragover", over, true);
    window.addEventListener("dragleave", leave, true);
    window.addEventListener("drop", accept, true);
    return () => {
      window.removeEventListener("dragover", over, true);
      window.removeEventListener("dragleave", leave, true);
      window.removeEventListener("drop", accept, true);
    };
  }, []);

  return drop.dragging || drop.checking ? (
    <div class="workspace-drop-hint" role="status">
      {drop.checking ? "Adding workspaces…" : "Drop files or folders to add workspaces"}
    </div>
  ) : null;
}
