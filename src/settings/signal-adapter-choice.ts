import type { SignalAdapters } from "../lib/launch-augment";

/**
 * Which stored Signals switches count as the user's choice (DECK-102, DEF1).
 *
 * 1.1.x shipped every adapter on and saved the whole settings object on any
 * change, so a file it wrote says `true` for all three whether or not anyone
 * touched the switch. A settings file therefore carries
 * `signalAdaptersRevision`; a file without a revision of at least 2 reads as the
 * defaults, whatever it stores.
 *
 * Each agent's slice turns Signals on by default through a rung of
 * `SIGNAL_ADAPTER_LADDER`. A file saved under an older revision keeps every
 * stored value and has the agents of the rungs above its revision forced on
 * once; from the current revision on, stored values are the user's choice.
 * Revision 2 cannot tell a chosen "off" from the old default, so that one
 * agent comes back on (DEF1).
 *
 * The renderer's settings validator and main's boot-time hook sync share
 * `resolveSignalAdapters`, because main reads the stored file before any
 * window has validated it. Pure on purpose: main imports it.
 */
export const DEFAULT_SIGNAL_ADAPTERS: SignalAdapters = {
  claude: false,
  codex: false,
  opencode: false,
};

/** First revision whose stored booleans are trusted at all. */
const FIRST_TRUSTED_REVISION = 2;

export const SIGNAL_ADAPTERS_REVISION = FIRST_TRUSTED_REVISION;

/** The adapters a stored (unvalidated) settings value stands for. */
export function resolveSignalAdapters(settings: unknown): SignalAdapters {
  if (typeof settings !== "object" || settings === null) return DEFAULT_SIGNAL_ADAPTERS;
  const source = settings as Record<string, unknown>;
  const revision = source.signalAdaptersRevision;
  if (typeof revision !== "number" || !(revision >= FIRST_TRUSTED_REVISION)) {
    return DEFAULT_SIGNAL_ADAPTERS;
  }
  const stored = source.agentSignalAdapters;
  const record =
    typeof stored === "object" && stored !== null && !Array.isArray(stored)
      ? (stored as Record<string, unknown>)
      : {};
  const flag = (key: keyof SignalAdapters): boolean =>
    typeof record[key] === "boolean" ? (record[key] as boolean) : DEFAULT_SIGNAL_ADAPTERS[key];
  return { claude: flag("claude"), codex: flag("codex"), opencode: flag("opencode") };
}

/**
 * The settings patch for a Signals switch. It carries the revision because
 * main merges a patch into the STORED file: adapters alone, merged into a file
 * saved before the revision, would read as unchosen again — main would register
 * nothing and the merged broadcast would flip the switch back off.
 */
export function signalAdaptersPatch<T>(adapters: T): {
  readonly agentSignalAdapters: T;
  readonly signalAdaptersRevision: number;
} {
  return { agentSignalAdapters: adapters, signalAdaptersRevision: SIGNAL_ADAPTERS_REVISION };
}

/** Whether stored (unvalidated) `settings` switch `agent`'s adapter on. */
export function storedSignalAdapterOn(settings: unknown, agent: string): boolean {
  const adapters = resolveSignalAdapters(settings);
  return Object.hasOwn(adapters, agent) && adapters[agent as keyof SignalAdapters];
}
