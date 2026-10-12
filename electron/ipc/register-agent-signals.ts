/**
 * The agent-signal contract layer's own IPC (stage 2): the config a launch
 * needs to augment a command. The hook endpoint and the event push live beside
 * it in `electron/agent-hooks/`; this module only registers the one
 * request/response channel.
 */
import { ipcMain } from "electron";
import { CHANNELS } from "./channels";
import { hooksSupported } from "../agent-hooks/hooks-supported";

/** What a launch needs to augment a command; `hooksSupported` is added on the way out. */
export interface LaunchSignalConfig {
  /** The `--settings` file for a Claude launch, or null when it could not be written or the host is not POSIX. */
  readonly claudeSettingsPath: string | null;
  /** The hook endpoint's port, or null when the listener could not bind. */
  readonly hookPort: number | null;
  /** Pane shells start through Deck's bootstrap, so the agent wrappers are on PATH (slice 1). */
  readonly shellBootstrap: boolean;
  /** The installed Codex lists `--dangerously-bypass-hook-trust` (CX2). */
  readonly codexBypassHookTrust: boolean;
  /** The installed Codex lists `--no-daemon`. */
  readonly codexNoDaemon: boolean;
}

export interface AgentSignalConfig extends LaunchSignalConfig {
  /** Whether this host registers agent hooks at all — false on Windows, which ships no hook script. */
  readonly hooksSupported: boolean;
}

export interface RegisterAgentSignalsDeps {
  /** May wait for a Codex probe still in flight, so a launch never reads a stale answer. */
  readonly config: () => LaunchSignalConfig | Promise<LaunchSignalConfig>;
  /** Test seam; defaults to the platform answer both hook integrations use. */
  readonly hooksSupported?: () => boolean;
}

export function registerAgentSignals(deps: RegisterAgentSignalsDeps): void {
  ipcMain.handle(CHANNELS.agentSignalConfig, async (): Promise<AgentSignalConfig> => ({
    ...(await deps.config()),
    hooksSupported: (deps.hooksSupported ?? hooksSupported)(),
  }));
}
