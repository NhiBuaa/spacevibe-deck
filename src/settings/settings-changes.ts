import { SETTINGS_REGISTRY, type SettingScope, type SettingsPage } from "./settings-registry";
import { DEFAULT_SETTINGS, type Settings } from "./settings-schema";

type SettingKey = keyof Settings;

/** Registry keys of one scope, optionally only those mounted on one page. */
export function keysFor(scope: SettingScope, page?: SettingsPage): SettingKey[] {
  return (Object.keys(SETTINGS_REGISTRY) as SettingKey[]).filter((key) => {
    const entry = SETTINGS_REGISTRY[key];
    return entry.scope === scope && (page === undefined || entry.page === page);
  });
}

/** Settings are plain JSON, so structural equality is a string compare. */
export function isChanged(settings: Settings, key: SettingKey): boolean {
  return JSON.stringify(settings[key]) !== JSON.stringify(DEFAULT_SETTINGS[key]);
}

export function changedKeys(settings: Settings, keys: readonly SettingKey[]): SettingKey[] {
  return keys.filter((key) => isChanged(settings, key));
}

export function defaultsFor(keys: readonly SettingKey[]): Partial<Settings> {
  return Object.fromEntries(keys.map((key) => [key, DEFAULT_SETTINGS[key]])) as Partial<Settings>;
}
