import { computed, signal } from "@preact/signals";
import {
  AppWindow,
  ArrowLineDown,
  Bell,
  Database,
  FolderOpen,
  Info,
  Keyboard,
  Robot,
  Rows,
  SquaresFour,
  Tabs,
  TerminalWindow,
} from "@phosphor-icons/react";
import type { DeckIconComponent } from "../../../../ui/controls/deck-icon";
import { addingAgent, selectAgent } from "../../settings-redesign/agents-state";
import { focusTarget, type PageId, type SettingKey } from "../../settings-redesign/model";

/*
 * The Canvas direction's spine: which part of the miniature owns which setting,
 * and the signals the miniature and the inspector use to point at each other.
 * Every registry key has exactly one home here; `Record<SettingKey, …>` makes a
 * new setting without one fail the typecheck.
 */

export type RegionId =
  "window" | "tabs" | "agents" | "pane" | "panebar" | "statusbar" | "toast" | "whole";

export type WholeSub = Extract<PageId, "files" | "shortcuts" | "about" | "data">;

export interface RegionMeta {
  readonly id: RegionId;
  readonly label: string;
  /** Narrow chips and the tooltip use this. */
  readonly short: string;
  readonly icon: DeckIconComponent;
}

export const REGIONS: Readonly<Record<RegionId, RegionMeta>> = {
  window: { id: "window", label: "Window", short: "Window", icon: AppWindow },
  tabs: { id: "tabs", label: "Tabs", short: "Tabs", icon: Tabs },
  agents: { id: "agents", label: "Agents", short: "Agents", icon: Robot },
  pane: { id: "pane", label: "Text & terminal", short: "Terminal", icon: TerminalWindow },
  panebar: { id: "panebar", label: "Pane bar", short: "Pane bar", icon: Rows },
  statusbar: { id: "statusbar", label: "Status bar", short: "Status", icon: ArrowLineDown },
  toast: { id: "toast", label: "Notifications", short: "Alerts", icon: Bell },
  whole: { id: "whole", label: "Whole app", short: "App", icon: SquaresFour },
};

/** Order the chips and the arrow keys walk. */
export const REGION_ORDER: readonly RegionId[] = [
  "window",
  "tabs",
  "agents",
  "pane",
  "panebar",
  "statusbar",
  "toast",
  "whole",
];

export interface WholeSubMeta {
  readonly id: WholeSub;
  readonly label: string;
  readonly short: string;
  readonly icon: DeckIconComponent;
}

export const WHOLE_SUBS: readonly WholeSubMeta[] = [
  { id: "files", label: "Files & browser", short: "Files", icon: FolderOpen },
  { id: "shortcuts", label: "Shortcuts", short: "Keys", icon: Keyboard },
  { id: "about", label: "About", short: "About", icon: Info },
  { id: "data", label: "Data & reset", short: "Data", icon: Database },
];

export interface KeyTarget {
  readonly region: RegionId;
  readonly sub?: WholeSub;
  /** The piece of the region the setting changes; the miniature outlines it. */
  readonly part?: string;
}

export const KEY_TARGET: Readonly<Record<SettingKey, KeyTarget>> = {
  colorMode: { region: "window" },
  customLogo: { region: "window", part: "logo" },
  fontFamily: { region: "pane", part: "text" },
  fontSize: { region: "pane", part: "text" },
  lineHeight: { region: "pane", part: "text" },
  focusExpand: { region: "pane" },
  scrollback: { region: "pane", part: "scroll" },
  cursorStyle: { region: "pane", part: "cursor" },
  cursorBlink: { region: "pane", part: "cursor" },
  copyOnSelect: { region: "pane", part: "copy" },
  tabBarPosition: { region: "tabs" },
  showPaneBar: { region: "panebar" },
  showStatusBar: { region: "statusbar" },
  agents: { region: "agents" },
  promptTemplates: { region: "agents" },
  notifications: { region: "toast" },
  notifyNeedsYou: { region: "toast", part: "needs" },
  notifyFinished: { region: "toast", part: "finished" },
  notifyErrors: { region: "toast", part: "errors" },
  notifyWhileFocused: { region: "toast" },
  externalApp: { region: "whole", sub: "files" },
  editorTabSize: { region: "whole", sub: "files" },
  editorWordWrap: { region: "whole", sub: "files" },
  browserHome: { region: "whole", sub: "files" },
  keybindings: { region: "whole", sub: "shortcuts" },
  sidebarWidth: { region: "whole", sub: "data" },
  dockWidth: { region: "whole", sub: "data" },
  railOrder: { region: "whole", sub: "data" },
};

// ── pointing signals ───────────────────────────────────────────────────────

/** One element of the miniature: its region, which copy of it, and which piece. */
export interface Spot {
  readonly region: RegionId;
  readonly instance: string;
  readonly part?: string;
}

export interface Pointer {
  readonly region: RegionId;
  readonly part?: string;
}

/** null = the overview (nothing selected). */
export const selectedRegion = signal<RegionId | null>("pane");
export const wholeSub = signal<WholeSub | null>(null);
/** Pointer over the miniature. */
export const pointerAt = signal<Spot | null>(null);
/** Keyboard focus inside the miniature. */
export const focusAt = signal<Spot | null>(null);
/** Pointer over a control or result in the inspector. */
export const hoverLink = signal<Pointer | null>(null);
/** Keyboard focus on a control or result in the inspector. */
export const focusLink = signal<Pointer | null>(null);
/** A search hit's arrival: the region stays lit for a moment. */
export const pulse = signal<{ readonly region: RegionId; readonly nonce: number } | null>(null);
/** The roving tab stop of the miniature: the one element Tab lands on. */
export const tabStop = signal("win");
/** Bumped by "Send test": the toasts play their arrival again. */
export const testNonce = signal(0);
export const searchText = signal("");
/** The user has pointed at the miniature once; the hint then drops its words. */
export const pointed = signal(false);

export type HotSource = "own" | "linked";

export interface Hot {
  readonly region: RegionId;
  readonly part?: string;
  readonly instance?: string;
  /** `own`: the user is on that very element. `linked`: a control elsewhere points at it. */
  readonly source: HotSource;
}

/** What is lit right now: the pointer, then keyboard focus, then an inspector link, then a pulse. */
export const hot = computed<Hot | null>(() => {
  const own = pointerAt.value ?? focusAt.value;
  if (own !== null) return { ...own, source: "own" };
  const link = hoverLink.value ?? focusLink.value;
  if (link !== null) return { ...link, source: "linked" };
  const arrival = pulse.value;
  return arrival === null ? null : { region: arrival.region, source: "linked" };
});

/** Does this element of the miniature light up for what is hot? */
export function isLit(current: Hot | null, region: RegionId, part: string | undefined): boolean {
  if (current === null || current.region !== region) return false;
  if (current.source === "own") return (current.part ?? "") === (part ?? "");
  // A pointer with no part lights the region's own pieces, never one agent's row.
  if (current.part === undefined) return part?.startsWith("agent:") !== true;
  return part === undefined || part === current.part;
}

/** Does this inner piece (cursor, text, logo…) light up? */
export function isPartLit(current: Hot | null, region: RegionId, part: string): boolean {
  return (
    current !== null &&
    current.source === "linked" &&
    current.region === region &&
    current.part === part
  );
}

// ── actions ────────────────────────────────────────────────────────────────

const PULSE_MS = 1700;
let pulseTimer: ReturnType<typeof setTimeout> | undefined;

function pulseRegion(region: RegionId): void {
  const nonce = Date.now();
  pulse.value = { region, nonce };
  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => {
    if (pulse.peek()?.nonce === nonce) pulse.value = null;
  }, PULSE_MS);
}

/** A click or Enter on the miniature, or a chip. */
export function selectRegion(region: RegionId, part?: string): void {
  selectedRegion.value = region;
  if (region === "agents" && part?.startsWith("agent:") === true) selectAgent(part.slice(6));
  else if (region === "agents") addingAgent.value = false;
}

export function openWhole(sub: WholeSub | null): void {
  selectedRegion.value = "whole";
  wholeSub.value = sub;
}

/** A search hit: select its region, flash the row, and light the region in the miniature. */
export function goToSetting(key: SettingKey): void {
  const target = KEY_TARGET[key];
  if (target.region === "whole") openWhole(target.sub ?? null);
  else selectRegion(target.region);
  focusTarget.value = { key, nonce: Date.now() };
  searchText.value = "";
  hoverLink.value = null;
  focusLink.value = null;
  pulseRegion(target.region);
}
