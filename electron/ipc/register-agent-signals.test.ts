import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAgentSignals, type RegisterAgentSignalsDeps } from "./register-agent-signals";

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown, payload?: unknown) => unknown>(),
}));
vi.mock("electron", () => ({
  ipcMain: {
    handle: (name: string, callback: (event: unknown, payload?: unknown) => unknown) =>
      mocks.handlers.set(name, callback),
  },
}));

const LAUNCH_CONFIG = {
  claudeSettingsPath: null,
  hookPort: 45123,
  shellBootstrap: true,
  codexBypassHookTrust: true,
  codexNoDaemon: false,
};

function register(overrides: Partial<RegisterAgentSignalsDeps> = {}): void {
  registerAgentSignals({
    config: () => LAUNCH_CONFIG,
    ...overrides,
  });
}

function askConfig(): unknown {
  const handler = mocks.handlers.get("agent_signal_config");
  if (handler === undefined) {
    throw new Error("agent_signal_config was not registered");
  }
  return handler({ sender: {} });
}

beforeEach(() => {
  mocks.handlers.clear();
});

describe("agent_signal_config", () => {
  it("waits for a config that is still being computed, such as a Codex probe", async () => {
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => (finish = resolve));
    register({
      config: async () => {
        await pending;
        return { ...LAUNCH_CONFIG, codexNoDaemon: true };
      },
    });
    const answer = Promise.resolve(askConfig());
    finish();
    expect(await answer).toMatchObject({ codexNoDaemon: true });
  });

  it("still answers the launch config it always did", async () => {
    register();

    expect(await askConfig()).toMatchObject(LAUNCH_CONFIG);
  });

  it("adds hooksSupported: false where the host ships no hooks", async () => {
    register({ hooksSupported: () => false });

    expect(await askConfig()).toEqual({ ...LAUNCH_CONFIG, hooksSupported: false });
  });

  it("adds hooksSupported: true where it does", async () => {
    register({ hooksSupported: () => true });

    expect(await askConfig()).toEqual({ ...LAUNCH_CONFIG, hooksSupported: true });
  });

  it("answers with the one platform function the integrations use by default", async () => {
    register();
    const { hooksSupported } = await import("../agent-hooks/hooks-supported");

    expect(await askConfig()).toEqual({ ...LAUNCH_CONFIG, hooksSupported: hooksSupported() });
  });
});
