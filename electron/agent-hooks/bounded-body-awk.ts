/** The scanner and limits behind the bounded hook bodies; see `BOUNDED_BODY_AWK`. */

/** How much of stdin the scanner reads. Every key it needs precedes the first nested value. */
export const BOUNDED_PREFIX_BYTES = 64 * 1024;
/** Tool names longer than this (an MCP name is the longest in practice) are left out. */
const TOOL_NAME_MAX = 64;
/** The longest session or turn id the endpoint accepts. */
const ID_MAX = 128;

/**
 * The bounded body both hook scripts post for events that carry a prompt or a tool response
 * (CL1, CX1): a POSIX `awk` program over a bounded prefix of stdin.
 *
 * It reads only the string values at nesting depth 1 of a JSON object, so a tool argument named
 * `agent_id` (depth 3) can never read as the top-level one that marks a subagent. A string with
 * an escape or past 200 bytes reads as `?`, which no check below accepts. It prints a body only
 * for a payload with a safe event and session id: `hook_event_name`, `session_id`, and when
 * present and safe `tool_name` (capped) and `turn_id`.
 *
 * A top-level non-empty `agent_id` means the hook fired inside a subagent (SUB1). By default the
 * program prints nothing then; with `-v REPORT_SUBAGENT=1` it adds `"agent_id":"-"` so the
 * endpoint can drop the post (Codex).
 */
export const BOUNDED_BODY_AWK = String.raw`
function keep(k, v) {
  if (k == "agent_id") { if (v != "") subagent = 1 }
  else if (k == "hook_event_name") ev = v
  else if (k == "session_id") sid = v
  else if (k == "turn_id") turn = v
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
  if ((subagent && !REPORT_SUBAGENT) || ev !~ /^[A-Za-z]+$/ || length(ev) > 64) exit
  if (sid !~ /^[A-Za-z0-9._-]+$/ || length(sid) > ${ID_MAX}) exit
  out = "{\"hook_event_name\":\"" ev "\",\"session_id\":\"" sid "\""
  if (turn ~ /^[A-Za-z0-9._-]+$/ && length(turn) <= ${ID_MAX}) out = out ",\"turn_id\":\"" turn "\""
  if (tool ~ /^[A-Za-z0-9_.:-]+$/ && length(tool) <= ${TOOL_NAME_MAX}) out = out ",\"tool_name\":\"" tool "\""
  if (subagent) out = out ",\"agent_id\":\"-\""
  printf "%s}", out
}
`;
