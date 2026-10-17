import { signal } from "@preact/signals";
import { settingsOpen } from "../../chrome/events";
import type { Settings } from "../../settings/settings-schema";
import { activeCategory, type CategoryId } from "./active-category-store";

/** The rail's search field. Window-scoped like `activeCategory` (R5). */
export const settingsQuery = signal("");

/** A row a deep link asked to reveal; the row scrolls to itself and highlights. */
export const settingsTarget = signal<keyof Settings | null>(null);

/** Opens Settings on a page, and on one row of it when `key` is given (SET-3). */
export function openSettingsAt(page: CategoryId, key?: keyof Settings): void {
  settingsQuery.value = "";
  activeCategory.value = page;
  settingsTarget.value = key ?? null;
  settingsOpen.value = true;
}
