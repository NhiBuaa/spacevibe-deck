/**
 * What the installed Codex accepts, read from its own `--help` (CX2). Main
 * probes the discovered absolute `codex` at boot and on each Codex Signals sync;
 * the renderer's composed-command path (`launch-augment.ts`) reads the answer
 * through `agent_signal_config`. The wrapper probes for itself at exec time.
 */
import { execFile } from "node:child_process";
import { discoverAgents } from "../agents";
import { CODEX_BYPASS_FLAG, CODEX_NO_DAEMON_FLAG } from "../../src/lib/codex-launch-form";
import { WRAPPER_DIR_SUFFIX } from "./agent-wrappers";

export interface CodexCapabilities {
  /** Lists `--dangerously-bypass-hook-trust`. */
  readonly bypassHookTrust: boolean;
  /** Lists `--no-daemon`. */
  readonly noDaemon: boolean;
}

const NONE: CodexCapabilities = { bypassHookTrust: false, noDaemon: false };
const PROBE_TIMEOUT_MS = 5000;
const HELP_MAX_BYTES = 4 * 1024 * 1024;

export function parseCodexHelp(help: string): CodexCapabilities {
  return {
    bypassHookTrust: help.includes(CODEX_BYPASS_FLAG),
    noDaemon: help.includes(CODEX_NO_DAEMON_FLAG),
  };
}

/** The first `codex` the login shell resolves, unless it is one of Deck's own wrappers. */
async function discoverCodex(): Promise<string | null> {
  const found = await discoverAgents(["codex"]);
  const path = found.find((agent) => agent.name === "codex")?.path ?? null;
  return path === null || path.includes(`${WRAPPER_DIR_SUFFIX}/`) ? null : path;
}

function readHelp(binary: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      binary,
      ["--help"],
      { encoding: "utf8", timeout: PROBE_TIMEOUT_MS, maxBuffer: HELP_MAX_BYTES },
      (error, stdout) => (error === null ? resolve(String(stdout)) : reject(error)),
    );
    child.stdin?.end();
  });
}

interface CapabilitiesDeps {
  readonly discover?: () => Promise<string | null>;
  readonly help?: (binary: string) => Promise<string>;
  readonly log?: (message: string, error: unknown) => void;
}

export function createCodexCapabilities(deps: CapabilitiesDeps = {}) {
  let current = NONE;
  let queue: Promise<void> = Promise.resolve();
  return {
    current: (): CodexCapabilities => current,
    /** Resolves once every probe requested so far has finished. */
    settled: (): Promise<void> => queue,
    /** Re-probe the installed Codex. Never rejects: a failure answers "accepts nothing". */
    refresh(): Promise<void> {
      queue = queue.then(async () => {
        try {
          const binary = await (deps.discover ?? discoverCodex)();
          current = binary === null ? NONE : parseCodexHelp(await (deps.help ?? readHelp)(binary));
        } catch (error) {
          current = NONE;
          (deps.log ?? console.warn)("Deck: the Codex flags could not be probed.", error);
        }
      });
      return queue;
    },
  };
}
