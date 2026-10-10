import type { ComponentChildren } from "preact";
import { TERMINAL_LAUNCH_ID } from "../terminal/agent-launch-target";
import type { CardPreview } from "./agent-launch-cards";
import "./agent-launch-page.css";

export const LAUNCH_PREVIEW_HINT = "Hover or focus an agent to see the exact command";

/** Where a ⊕ press always lands, whatever the chip says. */
const NEW_SPACE_PLACEMENT = "New space";

interface LaunchCommandPreviewProps {
  /** The element the shown card's controls point `aria-describedby` at. */
  readonly id: string;
  readonly subject: CardPreview | null;
  /** The command a press of this agent would type, or null for the Terminal card and unknowns. */
  readonly commandFor: (agentId: string) => string | null;
  /** The checkout the launch lands in, as the context row prints it. */
  readonly folder: string;
  /** The same checkout in full: the line shortens `folder` with an ellipsis, this is its title. */
  readonly folderPath: string;
  /** The context row's chip: where a card press lands. */
  readonly placement: string;
  /** The profile chip, at the line's right end (DL-32.6). */
  readonly children?: ComponentChildren;
}

/**
 * DL-32.6 / DL-4.1: the exact command a card would type, followed by the folder
 * and the placement. A plain line, not a live region: it changes on every
 * hover, which a screen reader must not announce; a shown card's controls name
 * it with `aria-describedby` instead.
 */
export function LaunchCommandPreview(props: LaunchCommandPreviewProps) {
  const { subject } = props;
  const command = subject === null ? null : props.commandFor(subject.agentId);
  const shell = subject?.agentId === TERMINAL_LAUNCH_ID;
  const where = subject?.newSpace === true ? NEW_SPACE_PLACEMENT : props.placement;
  return (
    <div class="agent-launch-page__preview">
      <p id={props.id} class="agent-launch-page__preview-line">
        {subject === null || (command === null && !shell) ? (
          <span class="agent-launch-page__preview-faint">{LAUNCH_PREVIEW_HINT}</span>
        ) : (
          <>
            {shell ? <span>Opens a plain shell</span> : <code>{command}</code>}
            <span class="agent-launch-page__preview-path" title={props.folderPath}>
              in {props.folder}
            </span>
            <span class="agent-launch-page__preview-faint agent-launch-page__preview-where">
              · {where}
            </span>
          </>
        )}
      </p>
      {props.children}
    </div>
  );
}
