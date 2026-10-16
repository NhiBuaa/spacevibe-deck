import { describe, expect, it, vi } from "vitest";
import { PROBE_RETRY_MS, createCodexCapabilities, parseCodexHelp } from "./codex-capabilities";

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

    it("does nothing before a first probe", async () => {
      const discover = vi.fn(async () => "/bin/codex");
      const caps = createCodexCapabilities({ discover });
      await caps.revalidate();
      expect(discover).not.toHaveBeenCalled();
    });

    describe("after a probe that found nothing", () => {
      function flaky() {
        let clock = 1_000;
        let fail = true;
        const discover = vi.fn(async () => "/bin/codex");
        const caps = createCodexCapabilities({
          discover,
          identity: async () => "v1",
          help: async () => {
            if (fail) throw new Error("timeout under load");
            return HELP_0_162;
          },
          log: () => {},
          now: () => clock,
        });
        return {
          caps,
          discover,
          recover: () => (fail = false),
          wait: (ms: number) => (clock += ms),
        };
      }

      it("recovers from a timeout once the retry interval has passed", async () => {
        const { caps, discover, recover, wait } = flaky();
        await caps.refresh();
        expect(caps.current()).toEqual({ bypassHookTrust: false, noDaemon: false });
        recover();
        // Too soon: the failed answer stands and nothing is spawned again.
        wait(PROBE_RETRY_MS - 1);
        await caps.revalidate();
        expect(discover).toHaveBeenCalledTimes(1);
        expect(caps.current().bypassHookTrust).toBe(false);
        wait(1);
        await caps.revalidate();
        expect(discover).toHaveBeenCalledTimes(2);
        expect(caps.current()).toEqual({ bypassHookTrust: true, noDaemon: true });
      });

      it("keeps retrying, but never more than once per interval", async () => {
        const { caps, discover, wait } = flaky();
        await caps.refresh();
        for (let i = 0; i < 3; i += 1) {
          await caps.revalidate();
          await caps.revalidate();
          wait(PROBE_RETRY_MS);
        }
        // The first refresh, then one retry for each of the two later intervals.
        expect(discover).toHaveBeenCalledTimes(3);
      });

      it("notices a Codex installed after a probe found none", async () => {
        let installed: string | null = null;
        let clock = 0;
        const caps = createCodexCapabilities({
          discover: async () => installed,
          identity: async () => "v1",
          help: async () => HELP_0_162,
          now: () => clock,
        });
        await caps.refresh();
        installed = "/bin/codex";
        clock += PROBE_RETRY_MS;
        await caps.revalidate();
        expect(caps.current().bypassHookTrust).toBe(true);
      });
    });
  });

  describe("forLaunch", () => {
    const WAITED = "waited";
    // Settles after every microtask, so only an answer that never waited on a probe beats it.
    const nextTask = () => new Promise<string>((resolve) => setTimeout(resolve, 0, WAITED));

    function gated() {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      const caps = createCodexCapabilities({
        discover: async () => "/bin/codex",
        identity: async () => "v1",
        help: async () => {
          await gate;
          return HELP_0_162;
        },
      });
      return { caps, release };
    }

    it("answers at once where a wrapper runs, while a probe is still in flight", async () => {
      const { caps, release } = gated();
      void caps.refresh();
      expect(await Promise.race([caps.forLaunch(true), nextTask()])).toEqual({
        bypassHookTrust: false,
        noDaemon: false,
      });
      release();
      await caps.settled();
    });

    it("waits for the probe in flight where no wrapper runs", async () => {
      const { caps, release } = gated();
      void caps.refresh();
      const answer = caps.forLaunch(false);
      expect(await Promise.race([answer, nextTask()])).toBe(WAITED);
      release();
      expect(await answer).toEqual({ bypassHookTrust: true, noDaemon: true });
    });

    it("never rediscovers where a wrapper runs, even after a probe that found nothing", async () => {
      let clock = 0;
      const discover = vi.fn(async () => null);
      const caps = createCodexCapabilities({ discover, now: () => clock });
      await caps.refresh();
      clock += PROBE_RETRY_MS;
      await caps.forLaunch(true);
      expect(discover).toHaveBeenCalledTimes(1);
      await caps.forLaunch(false);
      expect(discover).toHaveBeenCalledTimes(2);
    });
  });
});
