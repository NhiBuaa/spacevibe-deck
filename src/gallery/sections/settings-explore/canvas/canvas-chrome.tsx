import { ArrowLineDown, Folder, Plus, Planet, Sparkle } from "@phosphor-icons/react";
import { CHROME_ICON, DeckIcon } from "../../../../ui/controls/deck-icon";
import { AgentMark } from "../../settings-redesign/agent-mark";
import {
  agentById,
  agentModified,
  effectiveCommand,
  signalStatus,
  type DemoAgent,
  type DemoSettings,
} from "../../settings-redesign/model";
import { Part, Region } from "./canvas-region";
import type { RegionId } from "./canvas-regions";

/*
 * The parts of the miniature that are not terminal text: title bar, the tab
 * strip (a sidebar column on the left, a strip along the top), the agent rail,
 * the status bar and the notification toasts. Anything the settings switch off
 * is drawn as a dashed slot, so it stays a region you can point at.
 */

type SessionState = "working" | "asked" | "done";
type Interactive = { readonly interactive: boolean };
type Changes = { readonly changed: ReadonlySet<RegionId> };

const SPACES: readonly string[] = ["deck", "api", "bench"];
const SESSIONS: readonly { readonly id: string; readonly state: SessionState }[] = [
  { id: "claude", state: "working" },
  { id: "codex", state: "asked" },
  { id: "opencode", state: "done" },
];

// ── title bar ──────────────────────────────────────────────────────────────

export function TitleBar({ s, changed }: { readonly s: DemoSettings } & Changes) {
  return (
    <div class="cv-titlebar">
      <span class="cv-lights" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <Part region="window" id="logo" class="cv-logo">
        <DeckIcon icon={s.customLogo ? Sparkle : Planet} size={CHROME_ICON} />
        Deck
      </Part>
      {changed.has("window") && <span class="cv-dot" aria-hidden="true" />}
    </div>
  );
}

// ── agent rows ─────────────────────────────────────────────────────────────

function AgentRow({
  agent,
  state,
  interactive,
}: { readonly agent: DemoAgent; readonly state: SessionState } & Interactive) {
  const status = signalStatus(agent);
  return (
    <Region
      region="agents"
      instance={`row:${agent.id}`}
      part={`agent:${agent.id}`}
      label={agent.label}
      interactive={interactive}
      changed={agent.kind === "builtin" && agentModified(agent.id)}
      class="cv-row"
      tip="above"
    >
      <span class="cv-mark">
        <AgentMark agent={agent} />
        <span class={`cv-badge is-${state}`} />
      </span>
      <span class="cv-row__text">
        <span class="cv-row__name">{agent.label}</span>
        <span class="cv-row__cmd">{effectiveCommand(agent)}</span>
      </span>
      {(status === "active" || status === "failed") && <span class={`cv-signal is-${status}`} />}
    </Region>
  );
}

function LaunchChip({ agent, interactive }: { readonly agent: DemoAgent } & Interactive) {
  return (
    <Region
      region="agents"
      instance={`launch:${agent.id}`}
      part={`agent:${agent.id}`}
      label={`${agent.label} in pickers`}
      interactive={interactive}
      class="cv-launch"
      tip="above"
    >
      <AgentMark agent={agent} />
    </Region>
  );
}

// ── the rail (sidebar column) ──────────────────────────────────────────────

function Rail({ s, changed, interactive }: { readonly s: DemoSettings } & Changes & Interactive) {
  const pickers = s.agents.filter((agent) => agent.installed && agent.enabled);
  return (
    <Region
      region="agents"
      instance="rail"
      interactive={interactive}
      changed={changed.has("agents")}
      class="cv-rail"
    >
      <div class="cv-rail__head">
        <DeckIcon icon={Folder} size={CHROME_ICON} />
        spacevibe-deck
      </div>
      {SESSIONS.map(({ id, state }) => {
        const agent = agentById(id, s);
        return agent === undefined ? null : (
          <AgentRow key={id} agent={agent} state={state} interactive={interactive} />
        );
      })}
      <div class="cv-rail__launch">
        <span class="cv-launch-plus" aria-hidden="true">
          <DeckIcon icon={Plus} size={CHROME_ICON} />
        </span>
        {pickers.map((agent) => (
          <LaunchChip key={agent.id} agent={agent} interactive={interactive} />
        ))}
      </div>
    </Region>
  );
}

// ── tab strip + rail ───────────────────────────────────────────────────────

function SpaceTab({ name, active }: { readonly name: string; readonly active: boolean }) {
  return <span class={`cv-space ${active ? "is-active" : ""}`}>{name}</span>;
}

/** Left: a sidebar column with the spaces over the rail. Top: no column, a strip with agent chips. */
export function Navigation({
  s,
  changed,
  interactive,
}: { readonly s: DemoSettings } & Changes & Interactive) {
  const tabsChanged = changed.has("tabs");
  if (s.tabBarPosition === "top") {
    return (
      <Region
        region="tabs"
        instance="tabs"
        interactive={interactive}
        changed={tabsChanged}
        class="cv-tabs is-top"
        tip="above"
      >
        {SPACES.map((name, index) => (
          <SpaceTab key={name} name={name} active={index === 0} />
        ))}
        <span class="cv-tabs__agents">
          {SESSIONS.map(({ id, state }) => {
            const agent = agentById(id, s);
            return agent === undefined ? null : (
              <Region
                key={id}
                region="agents"
                instance={`row:${id}`}
                part={`agent:${id}`}
                label={agent.label}
                interactive={interactive}
                changed={agent.kind === "builtin" && agentModified(agent.id)}
                class="cv-achip"
                tip="above"
              >
                <span class="cv-mark">
                  <AgentMark agent={agent} />
                  <span class={`cv-badge is-${state}`} />
                </span>
              </Region>
            );
          })}
        </span>
      </Region>
    );
  }
  return (
    <div class="cv-side">
      <Region
        region="tabs"
        instance="tabs"
        interactive={interactive}
        changed={tabsChanged}
        class="cv-tabs is-left"
        tip="above"
      >
        {SPACES.map((name, index) => (
          <SpaceTab key={name} name={name} active={index === 0} />
        ))}
      </Region>
      <Rail s={s} changed={changed} interactive={interactive} />
    </div>
  );
}

// ── status bar ─────────────────────────────────────────────────────────────

export function StatusBar({
  s,
  changed,
  interactive,
}: { readonly s: DemoSettings } & Changes & Interactive) {
  return (
    <Region
      region="statusbar"
      instance="status"
      interactive={interactive}
      ghost={!s.showStatusBar}
      changed={changed.has("statusbar")}
      class="cv-status"
      tip="above"
    >
      {s.showStatusBar ? (
        <>
          <span>main · ~/spacevibe-deck</span>
          <span>claude working</span>
        </>
      ) : (
        <>
          <DeckIcon icon={ArrowLineDown} size={CHROME_ICON} />
          <span class="cv-ghost-label">Status bar</span>
        </>
      )}
    </Region>
  );
}
