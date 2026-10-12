/**
 * The agent-signal contract layer's own IPC (stage 2): the config a launch
 * needs to augment a command, and opencode's per-pane server attachment. The
 * hook endpoint and the event push live beside them in `electron/agent-hooks/`;
 * this module only registers the two request/response channels.
 */
import { ipcMain } from "electron";
import { CHANNELS } from "./channels";
import { hooksSupported } from "../agent-hooks/hooks-supported";
import type { OpencodeClients } from "../agent-hooks/opencode-client";

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
  readonly opencode: OpencodeClients;
  /** Throws when `windowLabel` does not own `paneId` — the PTY manager's own check. */
  readonly assertOwner: (paneId: number, windowLabel: string) => void;
  readonly labelOf: (event: Electron.IpcMainInvokeEvent) => string;
}

export function registerAgentSignals(deps: RegisterAgentSignalsDeps): void {
  ipcMain.handle(CHANNELS.agentSignalConfig, async (): Promise<AgentSignalConfig> => ({
    ...(await deps.config()),
    hooksSupported: (deps.hooksSupported ?? hooksSupported)(),
  }));
  // A pane may only be attached by the window that owns it: the port is typed
  // into that pane's shell, and a stranger reserving ports for someone else's
  // panes would be a way to make every opencode launch fail to bind.
  ipcMain.handle(CHANNELS.opencodeAttach, async (event, { paneId }) => {
    if (typeof paneId !== "number" || !Number.isSafeInteger(paneId) || paneId <= 0) {
      throw new TypeError("opencode_attach requires a positive integer paneId");
    }
    deps.assertOwner(paneId, deps.labelOf(event));
    const port = await deps.opencode.attach(paneId);
    return { port };
  });
}
