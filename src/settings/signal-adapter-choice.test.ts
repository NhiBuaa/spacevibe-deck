import { describe, expect, it } from "vitest";
import {
  SIGNAL_ADAPTERS_REVISION,
  resolveSignalAdapters,
  signalAdaptersPatch,
  storedSignalAdapterOn,
} from "./signal-adapter-choice";

const DEFAULTS = { claude: true, codex: true, opencode: false };

describe("resolveSignalAdapters", () => {
  it("is Claude and Codex on, opencode off, for anything that is not a trusted settings file", () => {
    expect(SIGNAL_ADAPTERS_REVISION).toBe(4);
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

  it("switches Claude and Codex on once under revision 2 and keeps opencode's stored value", () => {
    const stored = (agentSignalAdapters: unknown) => ({
      signalAdaptersRevision: 2,
      agentSignalAdapters,
    });
    expect(resolveSignalAdapters(stored({ claude: false, codex: false }))).toEqual(DEFAULTS);
    expect(resolveSignalAdapters(stored({ opencode: true }))).toEqual({
      claude: true,
      codex: true,
      opencode: true,
    });
  });

  it("switches only Codex on under revision 3 and keeps Claude's and opencode's values", () => {
    const stored = (agentSignalAdapters: unknown) => ({
      signalAdaptersRevision: 3,
      agentSignalAdapters,
    });
    expect(resolveSignalAdapters(stored({ claude: false, codex: false, opencode: true }))).toEqual({
      claude: false,
      codex: true,
      opencode: true,
    });
    expect(resolveSignalAdapters(stored({ claude: true, codex: true }))).toEqual(DEFAULTS);
  });

  it("keeps a Codex switch the user turned off under revision 4", () => {
    expect(
      resolveSignalAdapters({
        signalAdaptersRevision: 4,
        agentSignalAdapters: { claude: true, codex: false, opencode: false },
      }),
    ).toEqual({ claude: true, codex: false, opencode: false });
  });

  it("keeps a stored choice under the current revision", () => {
    expect(
      resolveSignalAdapters({
        signalAdaptersRevision: SIGNAL_ADAPTERS_REVISION,
        agentSignalAdapters: { claude: false, codex: true, opencode: "yes" },
      }),
    ).toEqual({ claude: false, codex: true, opencode: false });
  });

  it("keeps stored values as they are under a newer revision", () => {
    expect(
      resolveSignalAdapters({
        signalAdaptersRevision: 9,
        agentSignalAdapters: { claude: false, codex: true, opencode: true },
      }),
    ).toEqual({ claude: false, codex: true, opencode: true });
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
  it("registers Claude's and Codex's hooks on a fresh install with no settings file", () => {
    expect(storedSignalAdapterOn(undefined, "claude")).toBe(true);
    expect(storedSignalAdapterOn(undefined, "codex")).toBe(true);
    expect(storedSignalAdapterOn(undefined, "opencode")).toBe(false);
    expect(storedSignalAdapterOn(undefined, "toString")).toBe(false);
  });

  it("follows the ladder for a revision-3 file", () => {
    const stored = {
      signalAdaptersRevision: 3,
      agentSignalAdapters: { claude: false, codex: false, opencode: true },
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
