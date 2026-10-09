import { signal } from "@preact/signals";
import {
  Bell,
  Database,
  FolderSimple,
  Info,
  Keyboard,
  Palette,
  Robot,
  TerminalWindow,
} from "@phosphor-icons/react";
import type { DeckIconComponent } from "../../../../ui/controls/deck-icon";
import type { PageId } from "../../settings-redesign/model";

/*
 * Command direction: what the one field currently means. The query filters live rows;
 * the scope (an area, or the changed list) is a token chip inside the field.
 */

export type Scope = { readonly kind: "area"; readonly area: PageId } | { readonly kind: "changed" };

export const query = signal("");
export const scope = signal<Scope | null>(null);

export const AREA_ICONS: Readonly<Record<PageId, DeckIconComponent>> = {
  appearance: Palette,
  terminal: TerminalWindow,
  agents: Robot,
  notifications: Bell,
  files: FolderSimple,
  shortcuts: Keyboard,
  about: Info,
  data: Database,
};

export function openArea(area: PageId): void {
  query.value = "";
  scope.value = { kind: "area", area };
}

export function openChanged(): void {
  query.value = "";
  scope.value = { kind: "changed" };
}

export function leaveScope(): void {
  query.value = "";
  scope.value = null;
}

/** Stable text for effects that must re-run when the scope changes. */
export function scopeKey(current: Scope | null): string {
  if (current === null) return "home";
  return current.kind === "area" ? current.area : "changed";
}
