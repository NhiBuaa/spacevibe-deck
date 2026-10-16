import { describe, expect, it } from "vitest";
import {
  SIGNAL_ADAPTERS_REVISION,
  resolveSignalAdapters,
  signalAdaptersPatch,
  storedSignalAdapterOn,
} from "./signal-adapter-choice";

const DEFAULTS = { claude: true, codex: true, opencode: true };

describe("resolveSignalAdapters", () => {
  it("is all three on for anything that is not a trusted settings file", () => {
    expect(SIGNAL_ADAPTERS_REVISION).toBe(5);
    expect(resolveSignalAdapters(undefined)).toEqual(DEFAULTS);
    expect(resolveSignalAdapters({})).toEqual(DEFAULTS);
    expect(resolveSignalAdapters(null)).toEqual(DEFAULTS);
    expect(resolveSignalAdapters("settings")).toEqual(DEFAULTS);
  });

  it("reads a 1.1.x file's stored trues as unchosen (DECK-102)", () => {
    const all = { claude: true, codex: true, opencode: true };
    expect(resolveSignalAdapters({ agentSignalAdapters: all })).toEqual(DEFAULTS);
    expect(resolveSignalAdapters({ signalAdaptersRevision: 1, agentSignalAdapters: all })).toEqual(
      DEFAULTS,
    );
  });

  it("switches all three on once under revision 2", () => {
    const stored = (agentSignalAdapters: unknown) => ({
      signalAdaptersRevision: 2,
      agentSignalAdapters,
    });
    expect(resolveSignalAdapters(stored({ claude: false, codex: false, opencode: false }))).toEqual(
      DEFAULTS,
    );
  });

  it("switches Codex and opencode on under revision 3 and keeps Claude's value", () => {
    const stored = (agentSignalAdapters: unknown) => ({
      signalAdaptersRevision: 3,
      agentSignalAdapters,
    });
    expect(resolveSignalAdapters(stored({ claude: false, codex: false, opencode: false }))).toEqual(
      { claude: false, codex: true, opencode: true },
    );
    expect(resolveSignalAdapters(stored({ claude: true, codex: true }))).toEqual(DEFAULTS);
  });

  it("switches only opencode on under revision 4 and keeps Claude's and Codex's values", () => {
    expect(
      resolveSignalAdapters({
        signalAdaptersRevision: 4,
        agentSignalAdapters: { claude: false, codex: false, opencode: false },
      }),
    ).toEqual({ claude: false, codex: false, opencode: true });
  });

  it("keeps an opencode switch the user turned off under revision 5", () => {
    expect(
      resolveSignalAdapters({
        signalAdaptersRevision: 5,
        agentSignalAdapters: { claude: true, codex: true, opencode: false },
      }),
    ).toEqual({ claude: true, codex: true, opencode: false });
  });

  it("keeps a Codex switch the user turned off under revision 5", () => {
    expect(
      resolveSignalAdapters({
        signalAdaptersRevision: 5,
        agentSignalAdapters: { claude: true, codex: false, opencode: true },
      }),
    ).toEqual({ claude: true, codex: false, opencode: true });
  });

  it("keeps a stored choice under the current revision", () => {
    expect(
      resolveSignalAdapters({
        signalAdaptersRevision: SIGNAL_ADAPTERS_REVISION,
        agentSignalAdapters: { claude: false, codex: true, opencode: "yes" },
      }),
    ).toEqual({ claude: false, codex: true, opencode: true });
  });

  it("keeps stored values as they are under a newer revision", () => {
    expect(
      resolveSignalAdapters({
        signalAdaptersRevision: 9,
        agentSignalAdapters: { claude: false, codex: true, opencode: false },
      }),
    ).toEqual({ claude: false, codex: true, opencode: false });
  });

  it("takes the defaults for a non-object adapter field", () => {
    for (const agentSignalAdapters of ["on", [], null]) {
      expect(
        resolveSignalAdapters({
          signalAdaptersRevision: SIGNAL_ADAPTERS_REVISION,
          agentSignalAdapters,
        }),
      ).toEqual(DEFAULTS);
    }
  });
});

describe("storedSignalAdapterOn", () => {
  it("registers all three adapters on a fresh install with no settings file", () => {
    expect(storedSignalAdapterOn(undefined, "claude")).toBe(true);
    expect(storedSignalAdapterOn(undefined, "codex")).toBe(true);
    expect(storedSignalAdapterOn(undefined, "opencode")).toBe(true);
    expect(storedSignalAdapterOn(undefined, "toString")).toBe(false);
  });

  it("follows the ladder for a revision-3 file", () => {
    const stored = {
      signalAdaptersRevision: 3,
      agentSignalAdapters: { claude: false, codex: false, opencode: false },
    };
    expect(storedSignalAdapterOn(stored, "claude")).toBe(false);
    expect(storedSignalAdapterOn(stored, "codex")).toBe(true);
    expect(storedSignalAdapterOn(stored, "opencode")).toBe(true);
  });

  it("keeps a switch patch chosen once merged into a file saved before the revision", () => {
    // Main merges the renderer's patch into the stored object (settings-merge.ts).
    const stored11x = {
      fontSize: 14,
      agentSignalAdapters: { claude: true, codex: true, opencode: true },
    };
    const merged = {
      ...stored11x,
      ...signalAdaptersPatch({ claude: false, codex: true, opencode: false }),
    };
    expect(storedSignalAdapterOn(merged, "claude")).toBe(false);
    expect(storedSignalAdapterOn(merged, "codex")).toBe(true);
  });
});
