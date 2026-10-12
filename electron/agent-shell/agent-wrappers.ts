/**
 * The `claude` / `codex` / `opencode` wrappers Deck puts first on a pane's
 * `PATH` (shell bootstrap and agent wrappers, slice 1 of the agent-status
 * queue). Each one names the agent for the hooks and then runs the real CLI.
 *
 * The wrapper EXECS. Process classification reads `ps args` of the tty's
 * foreground process group, and Claude's session registry joins on the
 * foreground pid. A wrapper that stayed alive as a parent would change both,
 * so the real binary replaces the wrapper's process: same pid, same group.
 *
 * Identity is first-wins. The outermost wrapper exports `DECK_AGENT_ID`; an
 * agent that launches another one from its tool calls passes through a second
 * wrapper, which only raises `DECK_AGENT_NESTED`. The hook scripts use the two
 * variables to ignore events from the inner agent.
 */

export const WRAPPED_AGENTS = ["claude", "codex", "opencode"] as const;
export type WrappedAgent = (typeof WRAPPED_AGENTS)[number];

/** Every install's wrapper directory ends like this, dev and release alike. */
export const WRAPPER_DIR_SUFFIX = "/agent-shell/bin";

/** POSIX `sh` source of the wrapper for `agent`. */
export function agentWrapperSource(agent: WrappedAgent): string {
  return [
    "#!/bin/sh",
    `# SpaceVibe Deck agent wrapper (${agent}) - runs the real CLI after naming it for Deck's hooks.`,
    "# Written by Deck; edits are overwritten at the next launch.",
    // `set -f` keeps a glob character in a PATH entry from expanding below.
    "set -f",
    'real=""',
    "old_ifs=$IFS",
    "IFS=:",
    "for dir in $PATH; do",
    '  [ -z "$dir" ] && continue',
    // Normalize `bin/`, `bin//` and `bin/.` so they cannot evade the skip below.
    "  while :; do",
    '    case "$dir" in',
    '      */.) dir="${dir%/.}" ;;',
    '      */) dir="${dir%/}" ;;',
    "      *) break ;;",
    "    esac",
    "  done",
    // Skip every Deck install's wrapper directory, or this script would find itself.
    '  case "$dir" in',
    `    *${WRAPPER_DIR_SUFFIX}) continue ;;`,
    "  esac",
    // Whatever spelling reached this script (`bin/../bin`), it is never its own target.
    `  if [ -x "$dir/${agent}" ] && [ ! -d "$dir/${agent}" ] && ! [ "$dir/${agent}" -ef "$0" ]; then`,
    `    real="$dir/${agent}"`,
    "    break",
    "  fi",
    "done",
    "IFS=$old_ifs",
    'if [ -z "$real" ]; then',
    `  echo "deck: ${agent} not found on PATH" >&2`,
    "  exit 127",
    "fi",
    'if [ -z "$DECK_AGENT_ID" ]; then',
    `  DECK_AGENT_ID=${agent}`,
    "  export DECK_AGENT_ID",
    "  unset DECK_AGENT_NESTED",
    "else",
    "  DECK_AGENT_NESTED=1",
    "  export DECK_AGENT_NESTED",
    "fi",
    'exec "$real" "$@"',
    "",
  ].join("\n");
}
