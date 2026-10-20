import { describe, expect, it } from "vitest";
import {
  SIGNAL_ADAPTERS_REVISION,
  resolveSignalAdapters,
  signalAdaptersPatch,
  storedSignalAdapterOn,
} from "./signal-adapter-choice";

const DEFAULTS = { claude: false, codex: false, opencode: false };

describe("resolveSignalAdapters", () => {
  it("defaults all three adapters to false for anything that is not a trusted settings file", () => {
    expect(SIGNAL_ADAPTERS_REVISION).toBe(6);
    expect(resolveSignalAdapters(undefined)).toEqual(DEFAULTS);
    expect(resolveSignalAdapters({})).toEqual(DEFAULTS);
    expect(resolveSignalAdapters(null)).toEqual(DEFAULTS);
    expect(resolveSignalAdapters("settings")).toEqual(DEFAULTS);
  });

  it("treats legacy settings files with revisions 1 through 5 as unverified defaults", () => {
    const all = { claude: true, codex: true, opencode: true };
    // Missing revision
    expect(resolveSignalAdapters({ agentSignalAdapters: all })).toEqual(DEFAULTS);
    // Legacy revisions 1..5 which had automatic upstream ladder enabling
    for (let rev = 1; rev <= 5; rev++) {
      expect(
        resolveSignalAdapters({ signalAdaptersRevision: rev, agentSignalAdapters: all }),
      ).toEqual(DEFAULTS);
    }
  });

  it("keeps stored values as they are under a trusted revision (revision >= 6)", () => {
    expect(
      resolveSignalAdapters({
        signalAdaptersRevision: 6,
        agentSignalAdapters: { claude: true, codex: false, opencode: true },
      }),
    ).toEqual({ claude: true, codex: false, opencode: true });
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
  it("defaults all three adapters to false on a fresh install with no settings file", () => {
    expect(storedSignalAdapterOn(undefined, "claude")).toBe(false);
    expect(storedSignalAdapterOn(undefined, "codex")).toBe(false);
    expect(storedSignalAdapterOn(undefined, "opencode")).toBe(false);
    expect(storedSignalAdapterOn(undefined, "toString")).toBe(false);
  });

  it("returns true when explicitly enabled by user in settings with trusted revision", () => {
    const legacy = {
      signalAdaptersRevision: 5,
      agentSignalAdapters: { claude: true, codex: true, opencode: true },
    };
    expect(storedSignalAdapterOn(legacy, "claude")).toBe(false);

    const stored = {
      signalAdaptersRevision: SIGNAL_ADAPTERS_REVISION,
      agentSignalAdapters: { claude: true, codex: false, opencode: false },
    };
    expect(storedSignalAdapterOn(stored, "claude")).toBe(true);
    expect(storedSignalAdapterOn(stored, "codex")).toBe(false);
    expect(storedSignalAdapterOn(stored, "opencode")).toBe(false);
  });

  it("keeps a switch patch chosen once merged into a file", () => {
    const stored = {
      fontSize: 14,
      agentSignalAdapters: { claude: false, codex: false, opencode: false },
    };
    const merged = {
      ...stored,
      ...signalAdaptersPatch({ claude: true, codex: false, opencode: false }),
    };
    expect(storedSignalAdapterOn(merged, "claude")).toBe(true);
    expect(storedSignalAdapterOn(merged, "codex")).toBe(false);
  });
});
