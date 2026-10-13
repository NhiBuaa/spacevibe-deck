/**
 * Arm-time augmentation — the flags Deck appends to the user's launch
 * command so the CLI reports to Deck (agent-signal contract layer, stage 2;
 * spec §4 "The mechanism, once"). Pure.
 *
 * The user's command is a `launch-profile.ts` string, and `commandProblem`
 * refuses quotes, `$` and backslashes at the door — so a path with a space
 * (macOS `userData` is `…/Application Support/SpaceVibe Deck/`) cannot be
 * typed by a USER. Deck's own additions are not a profile: they are composed
 * HERE, exempt from that gate, shell-quoted, and never written to a profile,
 * the journal or the strip — restore re-applies them at arm time from the
 * journal's stored USER command. The result reaches `AgentLauncher.arm` and
 * nothing else.
 *
 * Per agent, v1:
 * - **claude** — unchanged. User-level guarded hooks and the session registry
 *   cover both launcher and manual invocations.
 * - **codex** — where a wrapper runs (the pane shell was bootstrapped), nothing:
 *   the wrapper adds the hook-trust bypass and `--no-daemon` itself. Without
 *   one, on a POSIX host whose Codex accepts the bypass, the same flags are
 *   inserted right after `codex` (CX2). Otherwise
 *   `-c tui.notification_condition=always`, so Codex's BEL rings for
 *   `approval-requested` and `agent-turn-complete` whether or not the pane is
 *   focused (spec §10.6's default: the mark is worth the beep). A daemon
 *   command (`agents`, `app-server`, `remote-control`, `--remote`) is launched
 *   with the pane's `DECK_*` credentials emptied, so the shared daemon never
 *   keeps them.
 * - **opencode** — nothing: Deck's plugin loads through the wrapper's
 *   `OPENCODE_CONFIG_DIR`, never through the typed command.
 *
 * A flag the user already typed is never doubled (spec §6): Deck's addition
 * is skipped and the row stays inferred for that half. Typed VISIBLY
 * (spec §10.3): the user sees exactly what Deck runs.
 */
import { CODEX_BYPASS_FLAG, CODEX_NO_DAEMON_FLAG, classifyCodexArgs } from "./codex-launch-form";
import { commandAgentId, commandFlags } from "./launch-profile";

export interface SignalAdapters {
  readonly claude: boolean;
  readonly codex: boolean;
  readonly opencode: boolean;
}

export interface AugmentContext {
  readonly adapters: SignalAdapters;
  /** POSIX hosts only: the hook script is `sh` + `curl`. */
  readonly platform: "macos" | "windows" | "unsupported";
  readonly claudeSettingsPath: string | null;
  /** A uuid minted for a fresh Claude launch, or null to leave the id to Claude. */
  readonly sessionId: string | null;
  /** The host registers hooks at all (false on Windows). */
  readonly hooksSupported: boolean;
  /** Pane shells start through Deck's bootstrap, so the agent wrappers run. */
  readonly shellBootstrap: boolean;
  /** The installed Codex accepts `--dangerously-bypass-hook-trust`. */
  readonly codexBypassHookTrust: boolean;
  /** The installed Codex lists `--no-daemon`. */
  readonly codexNoDaemon: boolean;
}

export interface Augmented {
  readonly command: string;
  /** The session id the command carries, when Deck minted one. */
  readonly sessionId: string | null;
}

/** POSIX single-quoting — `'` is the only character that needs escaping inside `'…'`. */
export function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function tokens(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean);
}

/** Whether a `-c key=value` / `--config key=value` pair for `key` was typed. */
function hasConfigKey(command: string, key: string): boolean {
  const parts = tokens(command);
  return parts.some(
    (token, index) =>
      (token === "-c" || token === "--config") && (parts[index + 1] ?? "").startsWith(`${key}=`),
  );
}

/**
 * Unsets the pane's credentials for a daemon command. `env -u` works in sh, csh and fish
 * alike, which a `NAME= command` prefix does not (csh rejects it), and exists in BSD and GNU env.
 */
const CLEARED_PANE_CREDENTIALS = "env -u DECK_PANE_ID -u DECK_HOOK_TOKEN -u DECK_HOOK_PORT";

/** Codex's flags for a composed command where no wrapper runs: after the `codex` word. */
function insertCodexFlags(command: string, flags: readonly string[]): string {
  const rest = commandFlags(command);
  const head = command.trim().split(/\s+/)[0] ?? "";
  return [head, ...flags, ...(rest === "" ? [] : [rest])].join(" ");
}

export function augmentLaunchCommand(command: string, context: AugmentContext): Augmented {
  const agent = commandAgentId(command);
  const extra: string[] = [];
  const sessionId: string | null = null;

  if (agent === "codex") {
    const form = classifyCodexArgs(tokens(command).slice(1));
    // Only a POSIX host registers hooks; Windows keeps today's behaviour. With a
    // bootstrapped shell the wrapper does the work (and the daemon strip) itself.
    const posix = context.platform !== "windows" && context.hooksSupported;
    const unwrapped = posix && !context.shellBootstrap;
    // The wrapper decides everything, including what an old Codex gets: nothing is added here
    // even when main's probe failed, since a `-c` override alone makes Codex skip the shared
    // daemon (and `codex queue` then refuses to run while one is up).
    if (posix && context.shellBootstrap) {
      return { command, sessionId };
    }
    if (unwrapped && form.daemon && !form.infoOnly) {
      return { command: `${CLEARED_PANE_CREDENTIALS} ${command.trim()}`, sessionId };
    }
    // No path ever adds a flag to a command that talks to the shared daemon.
    if (form.daemon) {
      return { command, sessionId };
    }
    if (context.adapters.codex) {
      if (posix && context.codexBypassHookTrust) {
        if (unwrapped && !form.infoOnly) {
          const flags = [
            ...(form.interactive && !form.remote && !form.hasNoDaemon && context.codexNoDaemon
              ? [CODEX_NO_DAEMON_FLAG]
              : []),
            ...(form.hasBypass ? [] : [CODEX_BYPASS_FLAG]),
          ];
          return { command: insertCodexFlags(command, flags), sessionId };
        }
      } else if (!hasConfigKey(command, "tui.notification_condition")) {
        extra.push("-c", "tui.notification_condition=always");
      }
    }
  }

  return {
    command: extra.length === 0 ? command : `${command.trim()} ${extra.join(" ")}`,
    sessionId,
  };
}
