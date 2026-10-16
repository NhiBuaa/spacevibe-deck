/**
 * What the installed Codex accepts, read from its own `--help` (CX2). Main
 * probes the discovered absolute `codex` at boot and on each Codex Signals sync;
 * the renderer's composed-command path (`launch-augment.ts`) reads the answer
 * through `agent_signal_config`. The wrapper probes for itself at exec time.
 */
import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
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
  /** Identity of the binary on disk; throws when it is gone. Test seam. */
  readonly identity?: (binary: string) => Promise<string>;
  readonly log?: (message: string, error: unknown) => void;
  /** Clock for the retry interval, in milliseconds. Test seam. */
  readonly now?: () => number;
}

/**
 * How long a probe that found nothing (it failed, or no Codex was installed) is trusted. A
 * slow machine can time out the login shell discovery runs; without a retry, composed launches
 * would go without the flags until the switch flipped or Deck restarted.
 */
export const PROBE_RETRY_MS = 30_000;

/** Path-resolved modification time and size: an upgrade or downgrade changes at least one. */
async function fileIdentity(binary: string): Promise<string> {
  const info = await stat(binary);
  return `${info.mtimeMs}:${info.size}:${info.ino}`;
}

export function createCodexCapabilities(deps: CapabilitiesDeps = {}) {
  let current = NONE;
  let queue: Promise<void> = Promise.resolve();
  let probed: { readonly binary: string; readonly identity: string } | null = null;
  let lastAttemptAt: number | null = null;
  const now = deps.now ?? Date.now;
  const identityOf = deps.identity ?? fileIdentity;
  const log = deps.log ?? console.warn;

  async function probe(binary: string): Promise<void> {
    const identity = await identityOf(binary);
    current = parseCodexHelp(await (deps.help ?? readHelp)(binary));
    probed = { binary, identity };
  }

  async function discoverAndProbe(): Promise<void> {
    probed = null;
    lastAttemptAt = now();
    const binary = await (deps.discover ?? discoverCodex)();
    if (binary === null) current = NONE;
    else await probe(binary);
  }

  function enqueue(work: () => Promise<void>): Promise<void> {
    queue = queue.then(async () => {
      try {
        await work();
      } catch (error) {
        current = NONE;
        probed = null;
        log("Deck: the Codex flags could not be probed.", error);
      }
    });
    return queue;
  }

  /**
   * Re-probe when the binary last probed changed on disk (an upgrade or downgrade while Deck
   * runs) or is gone, and do nothing otherwise: it is one `stat`, cheap enough for every
   * launch. When the last attempt found nothing it is retried, at most once per
   * `PROBE_RETRY_MS`, so a timeout under load or a Codex installed later is picked up.
   */
  function revalidate(): Promise<void> {
    return enqueue(async () => {
      if (probed === null) {
        if (lastAttemptAt !== null && now() - lastAttemptAt >= PROBE_RETRY_MS) {
          await discoverAndProbe();
        }
        return;
      }
      const known = probed;
      let identity: string;
      try {
        identity = await identityOf(known.binary);
      } catch {
        await discoverAndProbe();
        return;
      }
      if (identity !== known.identity) await probe(known.binary);
    });
  }

  return {
    current: (): CodexCapabilities => current,
    /** Resolves once every probe requested so far has finished. */
    settled: (): Promise<void> => queue,
    /** Rediscover and re-probe the installed Codex. Never rejects: a failure answers "accepts nothing". */
    refresh: (): Promise<void> => enqueue(discoverAndProbe),
    revalidate,
    /**
     * The answer a launch reads. Where the pane shell is bootstrapped (`wrapped`) the wrapper
     * probes Codex at exec time and this answer goes unread, so it comes back at once rather
     * than after a login shell. Otherwise every probe requested so far lands first, then
     * `revalidate` runs.
     */
    forLaunch: async (wrapped: boolean): Promise<CodexCapabilities> => {
      if (!wrapped) {
        await queue;
        await revalidate();
      }
      return current;
    },
  };
}
