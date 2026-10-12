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

/**
 * Line 2 of every wrapper. The wrapper also looks for it in each candidate, so
 * two installs whose directories it cannot recognise by name (`bin/../bin`, a
 * symlink) still never exec one another.
 */
export const WRAPPER_MARKER = "SpaceVibe Deck agent wrapper";
const MARKER_PROBE_BYTES = 120;

/** POSIX `sh` source of the wrapper for `agent`. */
export function agentWrapperSource(agent: WrappedAgent): string {
  return [
    "#!/bin/sh",
    `# ${WRAPPER_MARKER} (${agent}) - runs the real CLI after naming it for Deck's hooks.`,
    "# Written by Deck; edits are overwritten at the next launch.",
    // `set -f` keeps a glob character in a PATH entry from expanding below. It is
    // undone before `exec`: with an exported SHELLOPTS (`set -u; export SHELLOPTS`) it
    // would otherwise reach the CLI and every bash child as `noglob`.
    "case $- in *f*) noglob_before=1 ;; *) noglob_before= ;; esac",
    "set -f",
    'real=""',
    "old_ifs=$IFS",
    "IFS=:",
    // `${VAR-}` throughout: a user who exports `set -u` must not break the CLI.
    "for dir in ${PATH-}; do",
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
    `  candidate="$dir/${agent}"`,
    '  [ -x "$candidate" ] && [ ! -d "$candidate" ] || continue',
    // Cheap check first: never this very script, however its directory is spelled.
    '  [ "$candidate" -ef "$0" ] && continue',
    // Then any other install's wrapper, recognised by its content. `command -p`
    // finds head and grep even when PATH has no /usr/bin; without them this
    // check would pass every candidate and two installs could loop.
    `  command -p head -c ${MARKER_PROBE_BYTES} "$candidate" 2>/dev/null | command -p grep -q '${WRAPPER_MARKER}' && continue`,
    '  real="$candidate"',
    "  break",
    "done",
    "IFS=$old_ifs",
    'if [ -z "$real" ]; then',
    `  echo "deck: ${agent} not found on PATH" >&2`,
    "  exit 127",
    "fi",
    'if [ -z "${DECK_AGENT_ID-}" ]; then',
    `  DECK_AGENT_ID=${agent}`,
    "  export DECK_AGENT_ID",
    "  unset DECK_AGENT_NESTED",
    "else",
    "  DECK_AGENT_NESTED=1",
    "  export DECK_AGENT_NESTED",
    "fi",
    '[ -n "$noglob_before" ] || set +f',
    'exec "$real" "$@"',
    "",
  ].join("\n");
}
