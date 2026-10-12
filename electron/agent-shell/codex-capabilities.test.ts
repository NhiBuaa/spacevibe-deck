import { describe, expect, it, vi } from "vitest";
import { createCodexCapabilities, parseCodexHelp } from "./codex-capabilities";

const HELP_0_162 = `Options:
      --dangerously-bypass-hook-trust
          Run enabled hooks without requiring persisted hook trust
      --no-daemon
          Run without the shared background server
`;

describe("parseCodexHelp", () => {
  it("reads each flag from the help text", () => {
    expect(parseCodexHelp(HELP_0_162)).toEqual({ bypassHookTrust: true, noDaemon: true });
    expect(parseCodexHelp("--no-daemon")).toEqual({ bypassHookTrust: false, noDaemon: true });
    expect(parseCodexHelp("Usage: codex [OPTIONS]")).toEqual({
      bypassHookTrust: false,
      noDaemon: false,
    });
  });
});

describe("createCodexCapabilities", () => {
  it("knows nothing until it is refreshed", () => {
    const caps = createCodexCapabilities({
      discover: async () => "/bin/codex",
      identity: async () => "1",
    });
    expect(caps.current()).toEqual({ bypassHookTrust: false, noDaemon: false });
  });

  it("probes the discovered binary and follows a later answer", async () => {
    let help = "";
    const probe = vi.fn(async (_binary: string) => help);
    const caps = createCodexCapabilities({
      discover: async () => "/bin/codex",
      help: probe,
      identity: async () => "1",
    });
    await caps.refresh();
    expect(caps.current().bypassHookTrust).toBe(false);
    help = HELP_0_162;
    await caps.refresh();
    expect(caps.current()).toEqual({ bypassHookTrust: true, noDaemon: true });
    expect(probe).toHaveBeenCalledWith("/bin/codex");
  });

  it("answers nothing when Codex is not installed", async () => {
    const help = vi.fn(async () => HELP_0_162);
    const caps = createCodexCapabilities({ discover: async () => null, help });
    await caps.refresh();
    expect(caps.current()).toEqual({ bypassHookTrust: false, noDaemon: false });
    expect(help).not.toHaveBeenCalled();
  });

  it("never rejects: a failed probe answers nothing and is logged", async () => {
    const log = vi.fn();
    const caps = createCodexCapabilities({
      discover: async () => "/bin/codex",
      identity: async () => "1",
      help: async () => {
        throw new Error("timeout");
      },
      log,
    });
    await expect(caps.refresh()).resolves.toBeUndefined();
    expect(caps.current()).toEqual({ bypassHookTrust: false, noDaemon: false });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("settles after the latest probe, so a launch never reads a stale answer", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const caps = createCodexCapabilities({
      discover: async () => "/bin/codex",
      identity: async () => "1",
      help: async () => {
        await gate;
        return HELP_0_162;
      },
    });
    void caps.refresh();
    const settled = caps.settled().then(() => caps.current());
    release();
    expect(await settled).toEqual({ bypassHookTrust: true, noDaemon: true });
  });

  describe("revalidate", () => {
    const OLD = "Usage: codex [OPTIONS]";

    function installed() {
      const state = { help: OLD, identity: "v1", present: true };
      const discover = vi.fn(async () => "/bin/codex");
      const help = vi.fn(async () => state.help);
      const identity = vi.fn(async () => {
        if (!state.present) throw new Error("ENOENT");
        return state.identity;
      });
      return { state, discover, help, caps: createCodexCapabilities({ discover, help, identity }) };
    }

    it("follows an upgrade and then a downgrade without rediscovering", async () => {
      const { state, discover, help, caps } = installed();
      await caps.refresh();
      expect(caps.current().bypassHookTrust).toBe(false);
      state.help = HELP_0_162;
      state.identity = "v2";
      await caps.revalidate();
      expect(caps.current()).toEqual({ bypassHookTrust: true, noDaemon: true });
      state.help = OLD;
      state.identity = "v3";
      await caps.revalidate();
      expect(caps.current()).toEqual({ bypassHookTrust: false, noDaemon: false });
      expect(discover).toHaveBeenCalledTimes(1);
      expect(help).toHaveBeenCalledTimes(3);
    });

    it("does not run --help again while the binary is unchanged", async () => {
      const { help, caps } = installed();
      await caps.refresh();
      await caps.revalidate();
      await caps.revalidate();
      expect(help).toHaveBeenCalledTimes(1);
    });

    it("rediscovers when the binary has gone", async () => {
      const { state, discover, caps } = installed();
      await caps.refresh();
      state.present = false;
      await caps.revalidate();
      expect(discover).toHaveBeenCalledTimes(2);
    });

    it("does nothing before a first probe, or when no Codex was found", async () => {
      const discover = vi.fn(async () => null);
      const caps = createCodexCapabilities({ discover });
      await caps.revalidate();
      await caps.refresh();
      await caps.revalidate();
      expect(discover).toHaveBeenCalledTimes(1);
      expect(caps.current()).toEqual({ bypassHookTrust: false, noDaemon: false });
    });
  });
});
