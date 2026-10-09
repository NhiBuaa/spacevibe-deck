import type { ComponentChildren } from "preact";
import { Rows } from "@phosphor-icons/react";
import { CHROME_ICON, DeckIcon } from "../../../../ui/controls/deck-icon";
import { AgentMark } from "../../settings-redesign/agent-mark";
import {
  SCROLLBACK_CHOICES,
  agentById,
  type CursorStyle,
  type DemoAgent,
  type DemoSettings,
} from "../../settings-redesign/model";
import { Part, Region } from "./canvas-region";
import "./canvas-terminal.css";

/*
 * The two terminal panes. Text is drawn at the real font, size and line height
 * (a 13 to 14 change must show), anchored to the bottom like a terminal, so a
 * bigger font pushes older lines off the top and the cursor line stays put.
 */

/** Thumb height of the pane's scroll track, by scrollback choice: longer history, smaller thumb. */
const THUMB_PERCENT: readonly number[] = [46, 34, 24, 14, 8];
const SCROLLBACK_LINES: readonly number[] = SCROLLBACK_CHOICES;

function Cursor({ shape, blink }: { readonly shape: CursorStyle; readonly blink: boolean }) {
  return (
    <Part region="pane" id="cursor" class="cv-cursor-slot">
      <span
        key={`${shape}-${blink}`}
        class={`cv-cursor is-${shape} ${blink ? "is-blinking" : ""}`}
      />
    </Part>
  );
}

function agentTitle(agent: DemoAgent | undefined): string {
  if (agent === undefined) return "";
  return [agent.label, agent.model, agent.effort].filter((part) => part !== null).join(" · ");
}

function PaneBar({
  id,
  agent,
  shown,
  interactive,
  changed,
}: {
  readonly id: string;
  readonly agent: DemoAgent | undefined;
  readonly shown: boolean;
  readonly interactive: boolean;
  readonly changed: boolean;
}) {
  return (
    <Region
      region="panebar"
      instance={`bar:${id}`}
      interactive={interactive}
      ghost={!shown}
      changed={changed && id === "a"}
      class="cv-panebar"
      tip="above"
    >
      {shown && agent !== undefined ? (
        <>
          <AgentMark agent={agent} />
          <span class="cv-panebar__title">{agentTitle(agent)}</span>
        </>
      ) : (
        <>
          <DeckIcon icon={Rows} size={CHROME_ICON} />
          <span class="cv-ghost-label">Pane bar</span>
        </>
      )}
    </Region>
  );
}

interface PaneFrameProps {
  readonly id: "a" | "b";
  readonly agentId: string;
  readonly s: DemoSettings;
  readonly interactive: boolean;
  readonly changedPane: boolean;
  readonly changedBar: boolean;
  readonly children: ComponentChildren;
}

function PaneFrame({
  id,
  agentId,
  s,
  interactive,
  changedPane,
  changedBar,
  children,
}: PaneFrameProps) {
  const focused = id === "a";
  return (
    <Region
      region="pane"
      instance={`pane:${id}`}
      interactive={interactive}
      changed={changedPane && focused}
      class={`cv-pane ${focused ? "is-focused" : "is-idle"}`}
    >
      <PaneBar
        id={id}
        agent={agentById(agentId, s)}
        shown={s.showPaneBar}
        interactive={interactive}
        changed={changedBar}
      />
      {children}
    </Region>
  );
}

export function PaneClaude(props: Omit<PaneFrameProps, "id" | "agentId" | "children">) {
  const { s } = props;
  const thumb = THUMB_PERCENT[Math.max(0, SCROLLBACK_LINES.indexOf(s.scrollback))];
  return (
    <PaneFrame {...props} id="a" agentId="claude">
      <Part region="pane" id="text" class="cv-term">
        <div class="cv-line">
          <span class="is-cwd">~/spacevibe-deck</span>
          {"  "}
          <span class="is-branch">main</span>
        </div>
        <div class="cv-line">$ claude</div>
        <div class="cv-line">
          <span class="is-prompt">❯</span> Refine the settings UI
        </div>
        <div class="cv-line is-dim">• Read settings-schema.ts</div>
        <div class="cv-line is-dim">• Read settings-screen.tsx</div>
        <div class="cv-line is-dim">{"  "}⎿ 2 files, 1184 lines</div>
        <div class="cv-line">• Grouping by what changes:</div>
        <div class="cv-line">{"  "}· text, cursor: terminal</div>
        <div class="cv-line">{"  "}· tabs, bars: layout</div>
        <div class="cv-line">{"  "}· alerts: notifications</div>
        <div class="cv-line">• Update(settings-schema.ts)</div>
        <div class="cv-line is-dim">{"  "}⎿ +12 -3 lines</div>
        <div class="cv-line is-ok">
          ✓ Found{" "}
          <Part region="pane" id="copy" class="cv-select">
            8 setting pages
          </Part>
        </div>
        <div class="cv-line">
          $ <Cursor shape={s.cursorStyle} blink={s.cursorBlink} />
        </div>
      </Part>
      <Part region="pane" id="scroll" class="cv-track">
        <span class="cv-thumb" style={{ height: `${thumb ?? 24}%` }} />
      </Part>
      <span class={`cv-copied ${s.copyOnSelect ? "is-on" : ""}`}>Copied</span>
    </PaneFrame>
  );
}

export function PaneCodex(props: Omit<PaneFrameProps, "id" | "agentId" | "children">) {
  return (
    <PaneFrame {...props} id="b" agentId="codex">
      <Part region="pane" id="text" class="cv-term">
        <div class="cv-line">
          <span class="is-cwd">~/spacevibe-api</span>
          {"  "}
          <span class="is-branch">main</span>
        </div>
        <div class="cv-line">$ codex</div>
        <div class="cv-line is-dim">• Planning the migration</div>
        <div class="cv-line is-dim">{"  "}⎿ 3 steps</div>
        <div class="cv-line">• Update(schema.prisma)</div>
        <div class="cv-line is-dim">{"  "}⎿ +8 lines</div>
        <div class="cv-line is-warn">? Run npm test [y/n]</div>
      </Part>
    </PaneFrame>
  );
}
