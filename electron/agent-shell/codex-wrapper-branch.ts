/**
 * The part of the Codex wrapper that adds flags (CX2). It runs after the real
 * binary is resolved and identity is set, and before the wrapper `exec`s.
 *
 * - A daemon command (`agents`, `app-server`, `remote-control`, any `--remote`
 *   form) starts or reaches Codex's shared app-server daemon, which keeps the
 *   environment of whoever started it. It runs without the pane's `DECK_*`
 *   credentials whether Codex Signals is on or off.
 * - Otherwise, while the runtime marker exists (Codex Signals is on), the real
 *   binary's `--help` decides what it accepts. Only a Codex that accepts the
 *   hook-trust bypass gets `--dangerously-bypass-hook-trust`, and only its
 *   interactive forms also get `--no-daemon` (see `src/lib/codex-launch-form.ts`
 *   for why). An older Codex runs unchanged. `--enable hooks` is never added:
 *   it would override a user's `[features] hooks = false`, and hooks are on by
 *   default in every Codex that accepts the bypass.
 * - `-h`, `--help`, `-V` and `--version` pass through untouched.
 *
 * The argument classification mirrors `classifyCodexArgs`; both read the same
 * tables. `--help` is probed on every launch (about 12 ms): a cached answer
 * would go stale across a Codex upgrade, and the wrapper has no cheap identity
 * for the binary.
 */
import { shellQuote } from "../agent-hooks/claude-hooks-file";
import {
  CODEX_BYPASS_FLAG,
  CODEX_DAEMON_SUBCOMMANDS,
  CODEX_INFO_OPTIONS,
  CODEX_MULTI_VALUE_OPTIONS,
  CODEX_NON_TUI_SUBCOMMANDS,
  CODEX_NO_DAEMON_FLAG,
  CODEX_VALUE_OPTIONS,
} from "../../src/lib/codex-launch-form";

const REMOTE_OPTIONS = ["--remote", "--remote-auth-token-env"];

export function codexWrapperBranch(markerPath: string): string[] {
  const valueOptions = CODEX_VALUE_OPTIONS.filter((option) => !REMOTE_OPTIONS.includes(option));
  return [
    "passthrough=",
    "has_bypass=",
    "has_no_daemon=",
    "remote=",
    "sub=",
    "take=",
    "take_many=",
    'for arg in "$@"; do',
    '  [ "$arg" = -- ] && break',
    '  if [ -n "$take" ]; then take=; continue; fi',
    '  if [ -n "$take_many" ]; then',
    "    case $arg in -*) take_many= ;; *) continue ;; esac",
    "  fi",
    "  case $arg in",
    `    ${CODEX_INFO_OPTIONS.join("|")}) passthrough=1 ;;`,
    `    ${CODEX_BYPASS_FLAG}) has_bypass=1 ;;`,
    `    ${CODEX_NO_DAEMON_FLAG}) has_no_daemon=1 ;;`,
    `    ${REMOTE_OPTIONS.join("|")}) remote=1; take=1 ;;`,
    `    ${REMOTE_OPTIONS.map((option) => `${option}=*`).join("|")}) remote=1 ;;`,
    `    ${valueOptions.join("|")}) take=1 ;;`,
    `    ${CODEX_MULTI_VALUE_OPTIONS.join("|")}) take_many=1 ;;`,
    "    -*) ;;",
    '    *) [ -n "$sub" ] || sub=$arg ;;',
    "  esac",
    "done",
    'daemon="$remote"',
    "case $sub in",
    `  ${CODEX_DAEMON_SUBCOMMANDS.join("|")}) daemon=1 ;;`,
    "esac",
    "interactive=1",
    "case $sub in",
    `  ${CODEX_NON_TUI_SUBCOMMANDS.join("|")}) interactive= ;;`,
    "esac",
    'if [ -n "$passthrough" ]; then',
    "  :",
    'elif [ -n "$daemon" ]; then',
    "  unset DECK_PANE_ID DECK_HOOK_TOKEN DECK_HOOK_PORT",
    `elif [ -e ${shellQuote(markerPath)} ]; then`,
    '  help=$("$real" --help 2>/dev/null </dev/null) || help=',
    "  case $help in",
    `    *${CODEX_BYPASS_FLAG}*)`,
    `      [ -n "$has_bypass" ] || set -- ${CODEX_BYPASS_FLAG} "$@"`,
    '      if [ -n "$interactive" ] && [ -z "$has_no_daemon" ]; then',
    `        case $help in *${CODEX_NO_DAEMON_FLAG}*) set -- ${CODEX_NO_DAEMON_FLAG} "$@" ;; esac`,
    "      fi",
    "      ;;",
    "  esac",
    "fi",
  ];
}
