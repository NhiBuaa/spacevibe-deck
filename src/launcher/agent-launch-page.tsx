import { useLayoutEffect, useRef } from "preact/hooks";
import { ArrowLeft } from "@phosphor-icons/react";
import type { AgentOption } from "../lib/agent-catalog";
import type { AgentLaunchTarget } from "../terminal/agent-launch-target";
import { AgentLaunchCards } from "./agent-launch-cards";
import { eventInOpenLaunchPopover } from "./agent-launch-page-store";
import { AgentLaunchContext, type AgentLaunchContextProps } from "./agent-launch-context";
import { DeckIcon } from "../ui/controls/deck-icon";
import "./agent-launch-page.css";

export interface AgentLaunchPageProps {
  readonly target: AgentLaunchTarget;
  /** The context row: workspace, checkout and placement chip (DL-32.6). */
  readonly contextRow: AgentLaunchContextProps;
  readonly agents: readonly AgentOption[];
  readonly resolved: boolean;
  readonly pending: boolean;
  readonly error: string | null;
  readonly active?: boolean;
  readonly onRun: (agentId: string) => void;
  /**
   * Run in a space of its own. Offered only when the target is a split — a
   * folder with no tab starts one anyway, so there is nothing to choose.
   */
  readonly onRunInNewSpace?: (agentId: string) => void;
  readonly onBack: () => void;
  readonly onSettings: () => void;
}

/** DL-32.6: a transient stage page; no dialog, tab slot or PTY ownership. */
export function AgentLaunchPage(props: AgentLaunchPageProps) {
  const root = useRef<HTMLElement>(null);
  const active = props.active !== false;
  useLayoutEffect(() => {
    if (!active) return;
    const control = root.current?.querySelector<HTMLElement>(
      "[data-launch-primary]:not(:disabled)",
    );
    (control ?? root.current)?.focus();
  }, [active, props.resolved]);
  return (
    <section
      class="agent-launch-page"
      ref={root}
      tabIndex={-1}
      aria-label="Quick agent launcher"
      onKeyDownCapture={(event) => {
        // An open popover answers its own Escape before the page does.
        if (
          active &&
          event.key === "Escape" &&
          !event.isComposing &&
          !eventInOpenLaunchPopover(event.target)
        ) {
          event.preventDefault();
          event.stopPropagation();
          props.onBack();
        }
      }}
    >
      <div class="agent-launch-page__inner">
        <button class="agent-launch-page__back" onClick={props.onBack}>
          <DeckIcon icon={ArrowLeft} size={15} /> Back <kbd>Esc</kbd>
        </button>
        <AgentLaunchContext {...props.contextRow} />
        {!props.resolved ? <p role="status">Looking for installed agents…</p> : null}
        {props.resolved && props.agents.every((agent) => agent.missing) ? (
          <div class="agent-launch-page__empty">
            <p>No quick agents available.</p>
            <button data-launch-primary onClick={props.onSettings}>
              Choose agents
            </button>
          </div>
        ) : null}
        <AgentLaunchCards
          agents={props.agents}
          pending={props.pending}
          onRun={props.onRun}
          onRunInNewSpace={props.target.kind === "split" ? props.onRunInNewSpace : undefined}
          terminal
        />
        {props.pending ? <p role="status">Opening agent…</p> : null}
        {props.error ? (
          <p class="agent-launch-page__error" role="alert">
            {props.error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
