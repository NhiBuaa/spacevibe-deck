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
    const caps = createCodexCapabilities({ discover: async () => "/bin/codex" });
    expect(caps.current()).toEqual({ bypassHookTrust: false, noDaemon: false });
  });

  it("probes the discovered binary and follows a later answer", async () => {
    let help = "";
    const probe = vi.fn(async (_binary: string) => help);
    const caps = createCodexCapabilities({ discover: async () => "/bin/codex", help: probe });
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
});
