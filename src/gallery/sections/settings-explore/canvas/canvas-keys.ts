/*
 * Roving focus for a group of buttons: one Tab stop, arrow keys move between
 * the members. The members are found by selector, in document order.
 */

const MOVE_KEYS: ReadonlySet<string> = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
]);

export function rovingKeyDown(event: KeyboardEvent, selector: string): void {
  if (!MOVE_KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
  const root = event.currentTarget as HTMLElement;
  const items = [...root.querySelectorAll<HTMLElement>(selector)];
  const index = items.indexOf(event.target as HTMLElement);
  if (index === -1) return;
  event.preventDefault();
  const last = items.length - 1;
  const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? last
        : Math.min(last, Math.max(0, index + (forward ? 1 : -1)));
  items[next]?.focus();
}
