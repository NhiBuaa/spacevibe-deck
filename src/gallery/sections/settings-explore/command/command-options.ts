import {
  EXTERNAL_APPS,
  FONT_CHOICES,
  SCROLLBACK_CHOICES,
  registryEntry,
  type ColorMode,
  type CursorStyle,
  type SettingKey,
} from "../../settings-redesign/model";

/* Command direction: the choices, labels and validation the value controls share. */

export const MODE_OPTIONS: readonly { readonly value: ColorMode; readonly label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "Match system" },
];
export const CURSOR_OPTIONS: readonly { readonly value: CursorStyle; readonly label: string }[] = [
  { value: "bar", label: "Bar" },
  { value: "block", label: "Block" },
  { value: "underline", label: "Underline" },
];
export const FONT_OPTIONS = FONT_CHOICES.map((font) => ({ value: font, label: font }));
export const TAB_BAR_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "top", label: "Top" },
];
export const SCROLLBACK_OPTIONS = SCROLLBACK_CHOICES.map((lines) => ({
  value: String(lines),
  label: `${lines / 1000}k lines`,
}));
export const TAB_SIZE_OPTIONS = [2, 4, 8].map((size) => ({
  value: String(size),
  label: String(size),
}));
export const APP_OPTIONS = EXTERNAL_APPS.map(({ id, label }) => ({ value: id, label }));
export const NOTIFY_WHEN_OPTIONS = [
  { value: "always", label: "Always" },
  { value: "background", label: "Only in background" },
];

export const LINE_HEIGHT_STEP = 0.05;
export const BOOLEAN_KEYS: ReadonlySet<SettingKey> = new Set<SettingKey>([
  "showPaneBar",
  "showStatusBar",
  "focusExpand",
  "cursorBlink",
  "copyOnSelect",
  "editorWordWrap",
  "notifications",
  "notifyNeedsYou",
  "notifyFinished",
  "notifyErrors",
]);
/** Switched off together with the master notifications switch. */
export const NOTIFY_CHILDREN: ReadonlySet<SettingKey> = new Set<SettingKey>([
  "notifyNeedsYou",
  "notifyFinished",
  "notifyErrors",
  "notifyWhileFocused",
]);

/** Where the registry's one-word labels would be ambiguous outside their page. */
export const LABEL_OVERRIDES: Readonly<Partial<Record<SettingKey, string>>> = {
  fontSize: "Text size",
  tabBarPosition: "Tab bar",
  cursorBlink: "Cursor blink",
  editorTabSize: "Editor tab size",
  notifyWhileFocused: "Notify",
  externalApp: "Open paths with",
  browserHome: "Browser home",
  scrollback: "Scrollback",
};

export const rowLabel = (key: SettingKey): string =>
  LABEL_OVERRIDES[key] ?? registryEntry(key).label;

export const HOME_PROBLEM = "Use an http:// or https:// address";
export const WEB_PROTOCOLS: readonly string[] = ["http:", "https:"];

/** `new URL` alone accepts `localhost:3000` as a scheme, so the protocol is checked too. */
export function homeProblem(draft: string): string | null {
  try {
    return WEB_PROTOCOLS.includes(new URL(draft.trim()).protocol) ? null : HOME_PROBLEM;
  } catch {
    return HOME_PROBLEM;
  }
}

export const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;
