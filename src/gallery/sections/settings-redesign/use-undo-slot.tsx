import { useSignal, type Signal } from "@preact/signals";
import { useEffect } from "preact/hooks";

const UNDO_MS = 5000;

/**
 * One removable thing at a time stays recoverable for a few seconds. A second
 * removal replaces the first, which becomes final. Offering again restarts the
 * timer because every offer is a new object.
 */
export function useUndo<T>(): Signal<T | null> {
  const pending = useSignal<T | null>(null);
  useEffect(() => {
    if (pending.value === null) return;
    const timer = setTimeout(() => {
      pending.value = null;
    }, UNDO_MS);
    return () => clearTimeout(timer);
  }, [pending.value]);
  return pending;
}

/** The "Removed · Undo" line. The status region stays mounted so the change is announced. */
export function UndoSlot({
  what,
  onUndo,
}: {
  readonly what: string | null;
  readonly onUndo: () => void;
}) {
  return (
    <div class="srd-agents-undo-slot" role="status">
      {what !== null && (
        <div class="srd-agents-undo">
          <span class="srd-agents-undo__what">Removed {what}</span>
          <span aria-hidden="true">·</span>
          <button type="button" class="srd-agents-link" onClick={onUndo}>
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
