/**
 * Turning a grab into the text that reaches a terminal.
 *
 * This is the one place untrusted bytes cross into a PTY, so it is deliberately
 * a pure function with its own tests rather than a line inside the panel.
 *
 * The page the panel loaded is not Deck's, and it can dispatch the grab event
 * itself with any payload it likes. Two things follow:
 *
 *  - **Control characters are stripped.** A paste rides xterm's bracketed-paste
 *    path (`ESC[200~ … ESC[201~`), and text containing `ESC[201~` would close
 *    the bracket early and leave the rest of itself being interpreted as
 *    keystrokes by the agent's TUI. Stripping every C0 control except tab and
 *    newline removes that, and with it every other escape sequence a page could
 *    aim at the terminal — OSC 52 clipboard writes, cursor manipulation, title
 *    setting.
 *  - **Nothing here appends a newline.** Submitting is the caller's decision
 *    and Deck never makes it for a grab (see `browser-store.ts`).
 */

import { sanitizeTerminalPaste } from "../lib/terminal-paste";

/** Hard ceiling on what one grab may paste. The host caps at the same figure. */
export const MAX_GRAB_CHARS = 16_000;

export interface GrabLike {
  readonly text: string;
  readonly url: string;
  readonly count: number;
}

/**
 * Remove everything a terminal would read as an instruction.
 *
 * Tab and newline survive because they are content: the snippet is indented
 * HTML across several lines. Everything else in C0, plus DEL, goes.
 */
export function sanitizeGrabText(text: string): string {
  return sanitizeTerminalPaste(text)
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
}

/**
 * The paste body: the element context react-grab produced, plus the page it
 * came from.
 *
 * The URL is worth the extra line. The snippet names a source file, but a
 * component renders on some route with some state, and "which page was this"
 * is the first thing an agent otherwise has to ask.
 */
export function formatGrab(grab: GrabLike): string | null {
  const body = sanitizeGrabText(grab.text);
  if (body === "") {
    return null;
  }
  const url = sanitizeGrabText(grab.url).split("\n")[0]?.trim() ?? "";
  const withSource = url === "" ? body : `${body}\n\nPage: ${url}`;
  return withSource.slice(0, MAX_GRAB_CHARS);
}

/**
 * Status line under the address bar after a grab lands.
 *
 * The `clipboard` wording stopped being an apology on 2026-08-16: it is the
 * only outcome a successful grab has while `GRAB_PASTE_DISABLED` is up, and it
 * now fires with a focused pane sitting right there. The `pasted` branch is
 * kept for the revert that flips that constant back.
 */
export function grabSummary(count: number, outcome: "pasted" | "clipboard" | "failed"): string {
  const what = count > 1 ? `${count} elements` : "Element";
  if (outcome === "pasted") {
    return `${what} sent to the focused pane`;
  }
  if (outcome === "clipboard") {
    return `${what} copied to the clipboard`;
  }
  return `${what} could not be copied`;
}
