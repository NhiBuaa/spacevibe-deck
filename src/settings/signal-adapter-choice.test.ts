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
    expect(SIGNAL_ADAPTERS_REVISION).toBe(2);
    expect(resolveSignalAdapters(undefined)).toEqual(DEFAULTS);
    expect(resolveSignalAdapters({})).toEqual(DEFAULTS);
    expect(resolveSignalAdapters(null)).toEqual(DEFAULTS);
    expect(resolveSignalAdapters("settings")).toEqual(DEFAULTS);
  });

  it("reads a 1.1.x file without trusted revision as defaults", () => {
    const all = { claude: true, codex: true, opencode: true };
    expect(resolveSignalAdapters({ agentSignalAdapters: all })).toEqual(DEFAULTS);
    expect(resolveSignalAdapters({ signalAdaptersRevision: 1, agentSignalAdapters: all })).toEqual(
      DEFAULTS,
    );
  });

  it("keeps stored values as they are under a trusted revision", () => {
    expect(
      resolveSignalAdapters({
        signalAdaptersRevision: SIGNAL_ADAPTERS_REVISION,
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

  it("returns true when explicitly enabled by user in settings", () => {
    const stored = {
      signalAdaptersRevision: 2,
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
