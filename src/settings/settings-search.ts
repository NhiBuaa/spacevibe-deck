import { SETTINGS_REGISTRY, type SettingsPage } from "./settings-registry";
import type { Settings } from "./settings-schema";

export interface SettingsSearchResult {
  /** Keys whose row matches; empty for a blank query (nothing is filtered). */
  readonly keys: ReadonlySet<keyof Settings>;
  /** Match count per page, only pages with at least one match. */
  readonly pages: ReadonlyMap<SettingsPage, number>;
}

const NO_MATCHES: SettingsSearchResult = { keys: new Set(), pages: new Map() };

/**
 * Every whitespace-separated word of the query must appear in the setting's
 * label or keywords (SET-2). Keys with no Settings row are never offered.
 */
export function searchSettings(query: string): SettingsSearchResult {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return NO_MATCHES;
  }
  const keys = new Set<keyof Settings>();
  const pages = new Map<SettingsPage, number>();
  for (const [key, entry] of Object.entries(SETTINGS_REGISTRY) as [
    keyof Settings,
    (typeof SETTINGS_REGISTRY)[keyof Settings],
  ][]) {
    if (entry.page === null) {
      continue;
    }
    const haystack = [entry.label, ...entry.keywords].join(" ").toLowerCase();
    if (words.every((word) => haystack.includes(word))) {
      keys.add(key);
      pages.set(entry.page, (pages.get(entry.page) ?? 0) + 1);
    }
  }
  return { keys, pages };
}
