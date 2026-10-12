/**
 * The Deck-owned Claude hooks file and the script it runs (agent-signal
 * contract layer, stage 2; spec §4 "Per agent, v1 — Claude", §5 "Files Deck
 * owns").
 *
 * Written by main at startup into `<userData>/agent-hooks/` — NEVER under the
 * user's `~/.claude` (spec §3.1 point 3: no global injection). A Claude pane
 * is launched with `--settings <this file>`, which Claude documents as loading
 * ADDITIONAL settings for that session; verified on 2026-09-03 on the owner's
 * machine with thirteen user-level hook events present: Deck's `SessionStart`
 * and `Stop` hooks fired from the `--settings` file, beside the user's own.
 *
 * The hooks installed, and why each:
 * - `SessionStart` — names the occupant (the generation check's anchor).
 * - `Stop` — the turn ended, with `last_assistant_message` (the rail's
 *   sentence, no transcript read).
 * - `StopFailure` — the turn ended on an API error: the only producer of
 *   `failed` that is the CLI's own word.
 * - `SessionEnd` — the occupant left.
 * - `Notification` matched on `permission_prompt|idle_prompt` — Claude's own
 *   "needs input", which it otherwise sends nowhere under Deck's
 *   `TERM_PROGRAM` (trust audit §4.2).
 * - `PermissionRequest` — fires WHEN a tool call needs a decision, before the
 *   ~6 s `permission_prompt` delay.
 * - `UserPromptSubmit`, `PostToolUse *`, `PostToolUseFailure *` — a turn began
 *   or went on after a tool call: the explicit `working` mark, and the one that
 *   replaces a `requested` once the user approved. They carry the whole prompt
 *   and the whole tool response, so the script never forwards their stdin: it
 *   posts a small body of its own (see `BOUNDED_EVENTS`).
 * `SubagentStop` and `TeammateIdle` are deliberately NOT installed (Superset
 * #6641: a sub-agent's stop is not the row's state).
 *
 * The script is POSIX `sh` + `curl` (both ship with macOS and every Linux)
 * and exits 0 on every path, so a dead endpoint is never the CLI's failure.
 * When the post fails on a `Notification`, it prints the `terminalSequence`
 * Claude documents — an OSC 777 that the pane's existing handler already
 * turns into `requested` — so the fallback needs no endpoint at all.
 */
import fs from "node:fs/promises";
import path from "node:path";

export const AGENT_HOOKS_DIR = "agent-hooks";
export const CLAUDE_HOOKS_FILE = "claude.json";
export const HOOK_SCRIPT_FILE = "deck-hook.sh";

/** The events Deck installs, in the order they appear in the file. */
export const CLAUDE_HOOK_EVENTS = [
  "SessionStart",
  "Stop",
  "StopFailure",
  "SessionEnd",
  "Notification",
  "PermissionRequest",
  "UserPromptSubmit",
  "PostToolUse",
  "PostToolUseFailure",
] as const;

export const NOTIFICATION_MATCHER = "permission_prompt|idle_prompt";

/**
 * The matcher each event is registered with; an event absent here has none.
 * Shared by the `--settings` document and the user-settings registration, so
 * the two cannot drift.
 */
export const CLAUDE_HOOK_MATCHERS: Readonly<Record<string, string>> = {
  Notification: NOTIFICATION_MATCHER,
  PostToolUse: "*",
  PostToolUseFailure: "*",
};

/** Events whose stdin is too big to forward; the script posts a bounded body instead. */
const BOUNDED_EVENTS = ["UserPromptSubmit", "PostToolUse", "PostToolUseFailure"];
/** How much of stdin the scanner reads. Every key it needs precedes the first nested value. */
const BOUNDED_PREFIX_BYTES = 64 * 1024;
/** Tool names longer than this (an MCP name is the longest in practice) are left out. */
const TOOL_NAME_MAX = 64;

/** POSIX single-quoting: the only escape a `'…'` string needs is `'` itself. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * A POSIX `awk` scanner that reads only the string values at nesting depth 1 of
 * a JSON object. A tool argument named `agent_id` sits deeper, so it can never
 * read as the top-level one that marks a subagent. A string with an escape or
 * past 200 bytes is read as `?`, which no check below accepts. It prints a
 * body only for a payload with a safe event and session id and no top-level
 * `agent_id`.
 */
const BOUNDED_BODY_AWK = String.raw`
function keep(k, v) {
  if (k == "agent_id") { if (v != "") subagent = 1 }
  else if (k == "hook_event_name") ev = v
  else if (k == "session_id") sid = v
  else if (k == "tool_name") tool = v
}
{
  n = length($0)
  for (i = 1; i <= n; i++) {
    c = substr($0, i, 1)
    if (instr) {
      if (esc) esc = 0
      else if (c == "\\") { esc = 1; bad = 1 }
      else if (c == "\"") {
        instr = 0
        if (depth == 1) {
          if (bad) buf = "?"
          if (colon) keep(key, buf); else lastkey = buf
        }
      } else if (depth == 1) {
        if (length(buf) < 200) buf = buf c; else bad = 1
      }
    }
    else if (c == "\"") { instr = 1; buf = ""; bad = 0 }
    else if (c == "{" || c == "[") depth++
    else if (c == "}" || c == "]") { if (--depth == 0) exit }
    else if (depth == 1 && c == ":") { key = lastkey; colon = 1 }
    else if (depth == 1 && c == ",") colon = 0
  }
}
END {
  if (subagent || ev !~ /^[A-Za-z]+$/ || length(ev) > 64) exit
  if (sid !~ /^[A-Za-z0-9._-]+$/ || length(sid) > 128) exit
  out = "{\"hook_event_name\":\"" ev "\",\"session_id\":\"" sid "\""
  if (tool ~ /^[A-Za-z0-9_.:-]+$/ && length(tool) <= ${TOOL_NAME_MAX}) out = out ",\"tool_name\":\"" tool "\""
  printf "%s}", out
}
`;

/**
 * The script. `$1` is the event name, passed so the fallback below fires for
 * `Notification` only. `--data-binary @-` forwards stdin — the CLI's payload
 * — untouched; the two headers are what the endpoint authenticates on.
 */
export function hookScriptSource(): string {
  return [
    "#!/bin/sh",
    "# SpaceVibe Deck agent hook — posts this CLI event to the Deck that launched the pane.",
    "# Written by Deck; edits are overwritten at the next launch. Exits 0 on every path.",
    // A nested agent (another CLI run by this pane's agent) is not the pane's occupant: its
    // hooks must not rotate the generation or draw its marks on the outer agent's row.
    // `${VAR-}`: an inherited `set -u` (SHELLOPTS) must not kill the hook on an unset variable.
    '[ -n "${DECK_AGENT_NESTED-}" ] && exit 0',
    '[ -n "${DECK_AGENT_ID-}" ] && [ "${DECK_AGENT_ID-}" != claude ] && exit 0',
    'EVENT="${1-}"',
    'if [ -z "${DECK_HOOK_PORT-}" ] || [ -z "${DECK_PANE_ID-}" ] || [ -z "${DECK_HOOK_TOKEN-}" ]; then',
    "  exit 0",
    "fi",
    // The three turn events carry the whole prompt or tool response: post a body built from a
    // bounded prefix of stdin instead, then drain the rest so Claude never sees a broken pipe.
    `case "$EVENT" in ${BOUNDED_EVENTS.join("|")})`,
    `  BODY=$(head -c ${BOUNDED_PREFIX_BYTES} | LC_ALL=C awk '${BOUNDED_BODY_AWK}')`,
    "  cat >/dev/null",
    '  [ -n "$BODY" ] && printf \'%s\' "$BODY" | curl -s -m 2 -o /dev/null --data-binary @- \\',
    '    -H "Content-Type: application/json" \\',
    '    -H "X-Deck-Pane: $DECK_PANE_ID" \\',
    '    -H "X-Deck-Token: $DECK_HOOK_TOKEN" \\',
    '    "http://127.0.0.1:$DECK_HOOK_PORT/hook"',
    "  exit 0 ;;",
    "esac",
    "if ! curl -s -m 2 -o /dev/null --data-binary @- \\",
    '    -H "Content-Type: application/json" \\',
    '    -H "X-Deck-Pane: $DECK_PANE_ID" \\',
    '    -H "X-Deck-Token: $DECK_HOOK_TOKEN" \\',
    '    "http://127.0.0.1:$DECK_HOOK_PORT/hook"; then',
    '  if [ "$EVENT" = "Notification" ]; then',
    // The OSC 777 notify form the pane's classifier already reads as
    // `requested`. JSON escapes carry the ESC and BEL bytes.
    `    printf '%s' '{"terminalSequence":"\\u001b]777;notify;Deck;needs input\\u0007"}'`,
    "  fi",
    "fi",
    "exit 0",
    "",
  ].join("\n");
}

/** The settings document Claude loads through `--settings`. */
export function claudeHooksDocument(scriptPath: string): Record<string, unknown> {
  const command = (event: string) => `${shellQuote(scriptPath)} ${event}`;
  const entry = (event: string) => [
    {
      ...(event in CLAUDE_HOOK_MATCHERS ? { matcher: CLAUDE_HOOK_MATCHERS[event] } : {}),
      hooks: [{ type: "command", command: command(event) }],
    },
  ];
  return { hooks: Object.fromEntries(CLAUDE_HOOK_EVENTS.map((event) => [event, entry(event)])) };
}

export interface ClaudeHooksFiles {
  readonly settingsPath: string;
  readonly scriptPath: string;
}

/**
 * Write both files under `userDataDir/agent-hooks/`, idempotently, and answer
 * their paths. A failure to write answers null: the renderer then augments no
 * Claude launch and the rail stays inferred for Claude, which is today.
 */
export async function writeClaudeHooksFiles(userDataDir: string): Promise<ClaudeHooksFiles | null> {
  const dir = path.join(userDataDir, AGENT_HOOKS_DIR);
  const scriptPath = path.join(dir, HOOK_SCRIPT_FILE);
  const settingsPath = path.join(dir, CLAUDE_HOOKS_FILE);
  try {
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    await fs.writeFile(scriptPath, hookScriptSource(), { encoding: "utf8", mode: 0o755 });
    await fs.chmod(scriptPath, 0o755);
    await fs.writeFile(
      settingsPath,
      `${JSON.stringify(claudeHooksDocument(scriptPath), null, 2)}\n`,
      { encoding: "utf8", mode: 0o644 },
    );
    return { settingsPath, scriptPath };
  } catch (error) {
    console.warn("Deck: the Claude hooks file could not be written:", error);
    return null;
  }
}
