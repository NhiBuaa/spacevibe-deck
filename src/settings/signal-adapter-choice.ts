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
 * In SpaceDeck Local, privacy-first defaults apply: all agent signal adapters
 * default to false unless explicitly opted into by the user under trusted
 * revision >= 6. Legacy settings from upstream releases (revisions 1 through 5),
 * which automatically forced adapters on via upgrade ladder rungs, are treated
 * as unverified defaults and resolve to false for all adapters.
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

/**
 * First revision whose stored booleans represent an explicit user opt-in in this fork.
 * Upstream SpaceVibe Deck automatically enabled adapters through ladder rungs
 * (3 for claude, 4 for codex, 5 for opencode), saving revision 5 with auto-enabled
 * `true` values.
 *
 * SpaceDeck Local treats revisions <= 5 as legacy unverified defaults, resetting them
 * to false. Revision 6 or higher represents an explicit choice in this fork.
 */
export const FIRST_TRUSTED_REVISION = 6;

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
