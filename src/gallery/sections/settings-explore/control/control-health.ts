import {
  ArrowCircleUp,
  Bell,
  FloppyDisk,
  PencilSimple,
  Pulse,
  Robot,
  type Icon,
} from "@phosphor-icons/react";
import {
  EXTERNAL_APPS,
  SHORTCUT_ACTIONS,
  agentScan,
  failHooks,
  loadMode,
  rescanAgents,
  retrySave,
  saveStatus,
  settings,
  shortcutConflicts,
  signalStatus,
  type DemoSettings,
  type PageId,
} from "../../settings-redesign/model";
import { changeItems } from "./control-changes";
import type { Destination } from "./control-nav";

/*
 * The state of the whole setup, derived from the same signals the pages read.
 * Two outputs: six health tiles (one fact each) and a one-line live summary per
 * area. A tone is only `warn` or `error` where something is actually wrong.
 */

export type Tone = "ok" | "warn" | "error" | "idle";

export interface HealthFix {
  readonly label: string;
  readonly run: () => void;
}

export interface HealthTile {
  readonly id: "agents" | "signals" | "notifications" | "file" | "changed" | "updates";
  readonly label: string;
  readonly icon: Icon;
  readonly fact: string;
  readonly detail: string;
  readonly tone: Tone;
  readonly to: Destination;
  readonly fix?: HealthFix;
}

export const APP_VERSION = "2.9.0";
const LOADING_FACT = "…";

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;

/** Leaves the load error the way the real retry does: back to ready, temporary notice gone. */
export function retryLoad(): void {
  loadMode.value = "ready";
  if (saveStatus.value.kind === "temporary") saveStatus.value = { kind: "idle", failedKeys: [] };
}

function agentsTile(s: DemoSettings): HealthTile {
  const installed = s.agents.filter((agent) => agent.installed).length;
  const count = `${installed} of ${s.agents.length} installed`;
  const base = { id: "agents", label: "Agents", icon: Robot, to: area("agents") } as const;
  const scan = agentScan.value;
  if (scan === "failed")
    return {
      ...base,
      fact: "Scan failed",
      detail: count,
      tone: "error",
      fix: { label: "Retry", run: rescanAgents },
    };
  if (scan === "scanning") return { ...base, fact: "Scanning…", detail: count, tone: "idle" };
  return {
    ...base,
    fact: count,
    detail: installed === 0 ? "None on your PATH" : "",
    tone: installed === 0 ? "warn" : "ok",
  };
}

function signalsTile(s: DemoSettings): HealthTile {
  const statuses = s.agents.map((agent) => ({ agent, status: signalStatus(agent) }));
  const failed = statuses.filter((entry) => entry.status === "failed");
  const active = statuses.filter((entry) => entry.status === "active").length;
  const unsupported = statuses.some((entry) => entry.status === "unsupported");
  const base = { id: "signals", label: "Signals", icon: Pulse } as const;
  if (failed.length > 0)
    return {
      ...base,
      fact: `${failed.length} failed`,
      detail: `${plural(active, "agent")} reporting`,
      tone: "error",
      to: { kind: "area", page: "agents", agentId: failed[0].agent.id },
      fix: {
        label: "Retry",
        run: () => {
          failHooks.value = false;
        },
      },
    };
  if (active > 0)
    return {
      ...base,
      fact: `${active} active`,
      detail: "Reporting their own status",
      tone: "ok",
      to: area("agents"),
    };
  return {
    ...base,
    fact: unsupported ? "Not on Windows" : "None active",
    detail: "Estimated from output",
    tone: "idle",
    to: area("agents"),
  };
}

function notificationsTile(s: DemoSettings): HealthTile {
  const rule = s.notifyWhileFocused ? "Even when Deck is in front" : "Only in the background";
  const base = {
    id: "notifications",
    label: "Notifications",
    icon: Bell,
    to: area("notifications"),
  } as const;
  if (!s.notifications) return { ...base, fact: "Off", detail: rule, tone: "idle" };
  const events = [s.notifyNeedsYou, s.notifyFinished, s.notifyErrors].filter(Boolean).length;
  if (events === 0) return { ...base, fact: "On", detail: "No events chosen", tone: "warn" };
  return { ...base, fact: "On", detail: rule, tone: "ok" };
}

function fileTile(): HealthTile {
  const base = { id: "file", label: "Settings file", icon: FloppyDisk, to: area("data") } as const;
  const status = saveStatus.value;
  if (status.kind === "error")
    return {
      ...base,
      fact: "Not saved",
      detail: "Changes are temporary",
      tone: "error",
      fix: { label: "Try again", run: retrySave },
    };
  if (loadMode.value === "error" || status.kind === "temporary")
    return {
      ...base,
      fact: "Temporary",
      detail: "Can't read settings.json",
      tone: "warn",
      fix: { label: "Retry", run: retryLoad },
    };
  if (status.kind === "saving")
    return { ...base, fact: "Saving…", detail: "settings.json", tone: "idle" };
  return { ...base, fact: "Saved", detail: "settings.json", tone: "ok" };
}

function changedTile(): HealthTile {
  const items = changeItems();
  const changed = items.filter((item) => item.kind === "changed").length;
  const added = items.length - changed;
  return {
    id: "changed",
    label: "Changed",
    icon: PencilSimple,
    fact: changed === 0 ? "All default" : `${changed} changed`,
    detail: added === 0 ? "From default" : `+ ${added} of your own`,
    tone: "idle",
    to: { kind: "changed" },
  };
}

const UPDATES_TILE: HealthTile = {
  id: "updates",
  label: "Updates",
  icon: ArrowCircleUp,
  fact: "Up to date",
  detail: APP_VERSION,
  tone: "ok",
  to: area("about"),
};

function area(page: PageId): Destination {
  return { kind: "area", page };
}

/** While settings load, no fact is real yet: every tile is neutral and says so. */
function loadingTiles(): readonly HealthTile[] {
  return healthTilesFor(settings.value).map((tile) => ({
    ...tile,
    fact: LOADING_FACT,
    detail: "",
    tone: "idle",
    fix: undefined,
  }));
}

function healthTilesFor(s: DemoSettings): readonly HealthTile[] {
  return [
    agentsTile(s),
    signalsTile(s),
    notificationsTile(s),
    fileTile(),
    changedTile(),
    UPDATES_TILE,
  ];
}

export function healthTiles(): readonly HealthTile[] {
  return loadMode.value === "loading" ? loadingTiles() : healthTilesFor(settings.value);
}

// ── verdict ────────────────────────────────────────────────────────────────

export interface Problem {
  readonly id: string;
  readonly label: string;
  readonly tone: "warn" | "error";
  readonly to: Destination;
}

/** What needs a look right now: tiles that are not fine, plus shortcut conflicts. */
export function problems(tiles: readonly HealthTile[], s: DemoSettings): readonly Problem[] {
  const fromTiles = tiles.flatMap((tile): readonly Problem[] =>
    tile.tone === "error" || tile.tone === "warn"
      ? [
          {
            id: tile.id,
            label: `${tile.label} · ${tile.fact.toLowerCase()}`,
            tone: tile.tone,
            to: tile.to,
          },
        ]
      : [],
  );
  const conflicts = shortcutConflicts(s).size;
  return conflicts === 0 || loadMode.value === "loading"
    ? fromTiles
    : [
        ...fromTiles,
        {
          id: "shortcuts",
          label: `${plural(conflicts, "shortcut")} conflict`,
          tone: "warn",
          to: area("shortcuts"),
        },
      ];
}

// ── area summaries ─────────────────────────────────────────────────────────

export interface AreaSummary {
  readonly text: string;
  readonly tone: Tone;
}

function hostOf(address: string): string {
  try {
    return new URL(address).host;
  } catch {
    return address;
  }
}

function agentsSummary(s: DemoSettings): AreaSummary {
  const installed = s.agents.filter((agent) => agent.installed).length;
  const statuses = s.agents.map((agent) => signalStatus(agent));
  const failed = statuses.filter((status) => status === "failed").length;
  const active = statuses.filter((status) => status === "active").length;
  if (agentScan.value === "failed")
    return { text: `Scan failed · ${installed} installed`, tone: "error" };
  if (failed > 0)
    return { text: `${installed} installed · ${failed} signal failed`, tone: "error" };
  if (active > 0) return { text: `${installed} installed · ${active} signal active`, tone: "ok" };
  return { text: `${installed} installed`, tone: "idle" };
}

function notificationsSummary(s: DemoSettings): AreaSummary {
  if (!s.notifications) return { text: "Off", tone: "idle" };
  const events = [s.notifyNeedsYou, s.notifyFinished, s.notifyErrors].filter(Boolean).length;
  if (events === 0) return { text: "On · no events chosen", tone: "warn" };
  return {
    text: `On · ${plural(events, "event")} · ${s.notifyWhileFocused ? "always" : "background only"}`,
    tone: "ok",
  };
}

function shortcutsSummary(s: DemoSettings): AreaSummary {
  const rebound = Object.keys(s.keybindings).length;
  const conflicts = shortcutConflicts(s).size;
  const base = `${SHORTCUT_ACTIONS.length} actions`;
  const text = rebound === 0 ? base : `${rebound} rebound`;
  return conflicts > 0
    ? { text: `${text} · ${plural(conflicts, "conflict")}`, tone: "warn" }
    : { text, tone: "idle" };
}

export function areaSummary(page: PageId, s: DemoSettings = settings.value): AreaSummary {
  switch (page) {
    case "appearance":
      return { text: `${s.fontFamily} ${s.fontSize} · ${s.colorMode}`, tone: "idle" };
    case "terminal":
      return { text: `${s.scrollback / 1000}k lines · ${s.cursorStyle} cursor`, tone: "idle" };
    case "agents":
      return agentsSummary(s);
    case "notifications":
      return notificationsSummary(s);
    case "files": {
      const app = EXTERNAL_APPS.find((candidate) => candidate.id === s.externalApp)?.label;
      return {
        text: `${app ?? s.externalApp} · ${hostOf(s.browserHome)}`,
        tone: "idle",
      };
    }
    case "shortcuts":
      return shortcutsSummary(s);
    case "about":
      return { text: `${APP_VERSION} · up to date`, tone: "ok" };
    case "data": {
      const file = fileTile();
      return {
        text: `${file.fact} · settings.json`,
        tone: file.tone === "ok" ? "idle" : file.tone,
      };
    }
  }
}
