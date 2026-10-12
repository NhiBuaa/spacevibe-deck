import { describe, expect, it } from "vitest";
import {
  SIGNAL_ADAPTERS_REVISION,
  resolveSignalAdapters,
  signalAdaptersPatch,
  storedSignalAdapterOn,
} from "./signal-adapter-choice";

const CLAUDE_ONLY = { claude: true, codex: false, opencode: false };

describe("resolveSignalAdapters", () => {
  it("is Claude on, the rest off, for anything that is not a trusted settings file", () => {
    expect(SIGNAL_ADAPTERS_REVISION).toBe(3);
    expect(resolveSignalAdapters(undefined)).toEqual(CLAUDE_ONLY);
    expect(resolveSignalAdapters({})).toEqual(CLAUDE_ONLY);
    expect(resolveSignalAdapters(null)).toEqual(CLAUDE_ONLY);
    expect(resolveSignalAdapters("settings")).toEqual(CLAUDE_ONLY);
  });

  it("reads a 1.1.x file's stored trues as unchosen (DECK-102)", () => {
    const all = { claude: true, codex: true, opencode: true };
    expect(resolveSignalAdapters({ agentSignalAdapters: all })).toEqual(CLAUDE_ONLY);
    expect(resolveSignalAdapters({ signalAdaptersRevision: 1, agentSignalAdapters: all })).toEqual(
      CLAUDE_ONLY,
    );
  });

  it("switches Claude on once under revision 2 and keeps every other stored value", () => {
    const stored = (agentSignalAdapters: unknown) => ({
      signalAdaptersRevision: 2,
      agentSignalAdapters,
    });
    expect(resolveSignalAdapters(stored({ claude: false, codex: true }))).toEqual({
      claude: true,
      codex: true,
      opencode: false,
    });
    expect(resolveSignalAdapters(stored({ opencode: true }))).toEqual({
      claude: true,
      codex: false,
      opencode: true,
    });
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
      ).toEqual(CLAUDE_ONLY);
    }
  });
});

describe("storedSignalAdapterOn", () => {
  it("registers Claude's hooks on a fresh install with no settings file", () => {
    expect(storedSignalAdapterOn(undefined, "claude")).toBe(true);
    expect(storedSignalAdapterOn(undefined, "codex")).toBe(false);
    expect(storedSignalAdapterOn(undefined, "toString")).toBe(false);
  });

  it("follows the ladder for a revision-2 file", () => {
    const stored = {
      signalAdaptersRevision: 2,
      agentSignalAdapters: { claude: false, codex: true },
    };
    expect(storedSignalAdapterOn(stored, "claude")).toBe(true);
    expect(storedSignalAdapterOn(stored, "codex")).toBe(true);
    expect(storedSignalAdapterOn(stored, "opencode")).toBe(false);
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
