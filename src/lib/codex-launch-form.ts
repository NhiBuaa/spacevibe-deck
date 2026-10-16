/**
 * Which kind of launch a `codex` argument list is, so the two places that
 * add flags (the shell wrapper in `electron/agent-shell/`, and
 * `launch-augment.ts` for composed commands) agree. Pure.
 *
 * The tables below come from `codex --help` (0.162.1) and are the only copy:
 * the wrapper's shell script is generated from them. A new Codex option that
 * takes a value belongs in `CODEX_VALUE_OPTIONS`, or the word after it is
 * mistaken for a subcommand.
 *
 * Why it matters: Codex 0.162 hosts an interactive session in a shared
 * background daemon whose hooks carry the DAEMON's environment, so Deck adds
 * `--no-daemon` to the interactive forms (bare, `resume`, `fork`). Codex
 * rejects that flag with `agents` and with `--remote`, and `exec`/`review`
 * already run in-process. The daemon commands themselves start or reach the
 * daemon, so they must not carry a pane's credentials.
 */

/** Options that consume the next argument. */
export const CODEX_VALUE_OPTIONS: readonly string[] = [
  "-c",
  "--config",
  "--enable",
  "--disable",
  "--remote",
  "--remote-auth-token-env",
  "-m",
  "--model",
  "--local-provider",
  "-p",
  "--profile",
  "-s",
  "--sandbox",
  "-C",
  "--cd",
  "--add-dir",
  "-a",
  "--ask-for-approval",
];

/** `-i <FILE>...` consumes arguments up to the next option. */
export const CODEX_MULTI_VALUE_OPTIONS: readonly string[] = ["-i", "--image"];

/** Options that make Codex print something and exit; the wrapper leaves them untouched. */
export const CODEX_INFO_OPTIONS: readonly string[] = ["-h", "--help", "-V", "--version"];

/** Subcommands that are not the interactive TUI. Anything else first-positional is a prompt. */
export const CODEX_NON_TUI_SUBCOMMANDS: readonly string[] = [
  "agents",
  "exec",
  "e",
  "review",
  "login",
  "logout",
  "mcp",
  "plugin",
  "app-server",
  "remote-control",
  "app",
  "completion",
  "update",
  "doctor",
  "sandbox",
  "debug",
  "apply",
  "a",
  "queue",
  "archive",
  "delete",
  "migrate-rollouts",
  "unarchive",
  "cloud",
  "exec-server",
  "features",
  "help",
];

/**
 * Subcommands that start or reach the shared daemon. `queue`, `archive`, `unarchive` and
 * `delete` open a session through the daemon Codex finds running; a config override that
 * excludes the daemon (the bypass among them, `config_exclusion` in `daemon_startup.rs`)
 * makes them write through a separate embedded server instead, and `queue` refuses that.
 * They get no flags.
 */
export const CODEX_DAEMON_SUBCOMMANDS: readonly string[] = [
  "agents",
  "app-server",
  "remote-control",
  "queue",
  "archive",
  "unarchive",
  "delete",
];

export const CODEX_BYPASS_FLAG = "--dangerously-bypass-hook-trust";
export const CODEX_NO_DAEMON_FLAG = "--no-daemon";

export interface CodexLaunchForm {
  /** `-h`, `--help`, `-V` or `--version` was typed: nothing is added. */
  readonly infoOnly: boolean;
  readonly hasBypass: boolean;
  readonly hasNoDaemon: boolean;
  /** Any `--remote…` option: Codex rejects `--no-daemon` with it. */
  readonly remote: boolean;
  /** The first positional argument: a subcommand or a prompt, null when there is none. */
  readonly subcommand: string | null;
  /** The TUI forms: no subcommand, `resume`, `fork`, or a prompt. */
  readonly interactive: boolean;
  /** `agents`, `app-server`, `remote-control` or any `--remote` form. */
  readonly daemon: boolean;
}

/** Classify the arguments that follow the `codex` word. */
export function classifyCodexArgs(args: readonly string[]): CodexLaunchForm {
  let infoOnly = false;
  let hasBypass = false;
  let hasNoDaemon = false;
  let remote = false;
  let subcommand: string | null = null;
  let takeNext = false;
  let takeMany = false;
  for (const arg of args) {
    if (arg === "--") break;
    if (takeNext) {
      takeNext = false;
      continue;
    }
    if (takeMany) {
      if (!arg.startsWith("-")) continue;
      takeMany = false;
    }
    if (CODEX_INFO_OPTIONS.includes(arg)) infoOnly = true;
    else if (arg === CODEX_BYPASS_FLAG) hasBypass = true;
    else if (arg === CODEX_NO_DAEMON_FLAG) hasNoDaemon = true;
    else if (arg.startsWith("--remote=") || arg.startsWith("--remote-auth-token-env=")) {
      remote = true;
    } else if (arg === "--remote" || arg === "--remote-auth-token-env") {
      remote = true;
      takeNext = true;
    } else if (CODEX_VALUE_OPTIONS.includes(arg)) takeNext = true;
    else if (CODEX_MULTI_VALUE_OPTIONS.includes(arg)) takeMany = true;
    else if (!arg.startsWith("-") && subcommand === null && arg !== "") subcommand = arg;
  }
  const daemon = remote || (subcommand !== null && CODEX_DAEMON_SUBCOMMANDS.includes(subcommand));
  const interactive = subcommand === null || !CODEX_NON_TUI_SUBCOMMANDS.includes(subcommand);
  return { infoOnly, hasBypass, hasNoDaemon, remote, subcommand, interactive, daemon };
}
