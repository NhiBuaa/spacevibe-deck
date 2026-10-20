import { useSignal } from "@preact/signals";
import { useLayoutEffect, useRef } from "preact/hooks";
import { MAX_RECENTS } from "../lib/workspace-recents";
import { canResolveDroppedPaths, grantDroppedWorkspace } from "../host/window-host";

interface WorkspaceDropOptions {
  readonly enabled: boolean;
  readonly onSelect: (path: string, paths: readonly string[]) => void | Promise<void>;
  readonly onError: (message: string | null) => void;
  readonly onChecking?: (checking: boolean) => void;
}

/** External paths are verified by the host before any workspace selection. */
export function useWorkspaceDrop(options: WorkspaceDropOptions) {
  const dragging = useSignal(false);
  const checking = useSignal(false);
  const current = useRef(options);
  current.current = options;
  const epoch = useRef(0);
  useLayoutEffect(
    () => () => {
      epoch.current += 1;
      current.current.onChecking?.(false);
    },
    [],
  );
  // Signal setters are stable; only availability invalidates an in-flight drop.
  /* oxlint-disable react-hooks/exhaustive-deps -- signal setters are stable; only availability invalidates the drop */
  useLayoutEffect(() => {
    if (!options.enabled) {
      epoch.current += 1;
      dragging.value = false;
      checking.value = false;
      current.current.onChecking?.(false);
    }
  }, [options.enabled]);
  /* oxlint-enable react-hooks/exhaustive-deps */

  // A host that cannot resolve paths leaves the drop untouched, so the
  // window-level handler and the Open folder fallback behave as before.
  function containsFiles(event: DragEvent): boolean {
    return (
      canResolveDroppedPaths() && Array.from(event.dataTransfer?.types ?? []).includes("Files")
    );
  }

  async function selectDrop(event: DragEvent): Promise<void> {
    if (!containsFiles(event)) return;
    event.preventDefault();
    event.stopPropagation();
    dragging.value = false;
    if (!current.current.enabled || checking.value) return;
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length === 0) {
      current.current.onError("Drop a file or folder from your computer.");
      return;
    }
    const token = ++epoch.current;
    checking.value = true;
    current.current.onChecking?.(true);
    current.current.onError(null);
    const isCurrent = () => token === epoch.current && current.current.enabled;
    try {
      const paths: string[] = [];
      for (const file of files) {
        const root = await grantDroppedWorkspace(file);
        if (!isCurrent()) return;
        if (root === null) {
          current.current.onError(
            "Couldn't open that file or folder — try again or use Open folder.",
          );
          return;
        }
        if (!paths.includes(root)) paths.push(root);
        if (paths.length > MAX_RECENTS) {
          current.current.onError(
            `Drop up to ${MAX_RECENTS} different workspace folders at a time.`,
          );
          return;
        }
      }
      if (!isCurrent()) return;
      await current.current.onSelect(paths[0]!, paths);
    } catch (error) {
      console.warn("Workspace drop failed:", error);
      if (isCurrent())
        current.current.onError(
          "Couldn't open that file or folder — try again or use Open folder.",
        );
    } finally {
      if (token === epoch.current) {
        checking.value = false;
        current.current.onChecking?.(false);
      }
    }
  }

  return {
    available: canResolveDroppedPaths(),
    dragging: dragging.value,
    checking: checking.value,
    isChecking: () => checking.value,
    handlers: {
      onDragOver(event: DragEvent) {
        if (!containsFiles(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.dataTransfer)
          event.dataTransfer.dropEffect = current.current.enabled ? "copy" : "none";
        dragging.value = current.current.enabled && !checking.value;
      },
      onDragLeave(event: DragEvent) {
        const target = event.currentTarget;
        if (
          !(target instanceof Node) ||
          !(event.relatedTarget instanceof Node) ||
          !target.contains(event.relatedTarget)
        ) {
          dragging.value = false;
        }
      },
      onDrop(event: DragEvent) {
        void selectDrop(event);
      },
    },
  };
}
