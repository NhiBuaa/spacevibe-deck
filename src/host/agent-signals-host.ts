/**
 * Renderer facade for the agent-signal contract layer's stage-2 channels:
 * the launch config (`agent_signal_config`) and the `hook:event` push. Electron-only, like
 * `agent-registry-host.ts`: `available` is the same host-presence check, and
 * every function degrades to "no adapter" where the host cannot answer, so a
 * Tauri or browser-preview launch is typed exactly as before.
 *
 * Flat payload keys per R6 — the object literal is what
 * `scripts/electron-ipc-contract.test.ts` reads.
 */
import { invoke, listen, type UnlistenFn } from "./bridge";
import { parseHookEvent, type HookEvent } from "../lib/agent-signal-map";

export const available: boolean =
  typeof globalThis !== "undefined" &&
  (globalThis as { __deckHost?: unknown }).__deckHost !== undefined;

export interface AgentSignalConfig {
  readonly claudeSettingsPath: string | null;
  readonly hookPort: number | null;
  /** Pane shells start through Deck's bootstrap, so the agent wrappers run. False when unknown. */
  readonly shellBootstrap: boolean;
  /** The installed Codex accepts `--dangerously-bypass-hook-trust`. False when unknown. */
  readonly codexBypassHookTrust: boolean;
  /** The installed Codex lists `--no-daemon`. False when unknown. */
  readonly codexNoDaemon: boolean;
  /**
   * Whether the host registers agent hooks at all (false on Windows, which
   * ships no hook script). TRUE when the host does not say — a host that
   * predates the field, Tauri, a failed call — so only an explicit `false`
   * ever takes a control away.
   */
  readonly hooksSupported: boolean;
}

export const NO_SIGNAL_CONFIG: AgentSignalConfig = Object.freeze({
  claudeSettingsPath: null,
  hookPort: null,
  shellBootstrap: false,
  codexBypassHookTrust: false,
  codexNoDaemon: false,
  hooksSupported: true,
});

/** Never rejects: a host that cannot answer has no adapters. */
export async function agentSignalConfig(): Promise<AgentSignalConfig> {
  if (!available) {
    return NO_SIGNAL_CONFIG;
  }
  try {
    const raw = await invoke<unknown>("agent_signal_config");
    if (typeof raw !== "object" || raw === null) {
      return NO_SIGNAL_CONFIG;
    }
    const node = raw as Record<string, unknown>;
    return {
      claudeSettingsPath:
        typeof node.claudeSettingsPath === "string" && node.claudeSettingsPath !== ""
          ? node.claudeSettingsPath
          : null,
      hookPort:
        typeof node.hookPort === "number" &&
        Number.isSafeInteger(node.hookPort) &&
        node.hookPort > 0
          ? node.hookPort
          : null,
      shellBootstrap: node.shellBootstrap === true,
      codexBypassHookTrust: node.codexBypassHookTrust === true,
      codexNoDaemon: node.codexNoDaemon === true,
      hooksSupported:
        typeof node.hooksSupported === "boolean"
          ? node.hooksSupported
          : NO_SIGNAL_CONFIG.hooksSupported,
    };
  } catch (error) {
    console.warn("agent_signal_config failed:", error);
    return NO_SIGNAL_CONFIG;
  }
}

/** Subscribe to accepted hook posts for this window's panes. */
export async function listenHookEvents(handler: (event: HookEvent) => void): Promise<UnlistenFn> {
  if (!available) {
    return () => {};
  }
  return listen<unknown>("hook:event", ({ payload }) => {
    const event = parseHookEvent(payload);
    if (event !== null) {
      handler(event);
    }
  });
}
