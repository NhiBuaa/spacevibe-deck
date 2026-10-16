import { describe, expect, it } from "vitest";
import { augmentLaunchCommand, shellQuote, type AugmentContext } from "./launch-augment";

const ALL_ON = { claude: true, codex: true, opencode: true };
const SETTINGS = "/Users/dev/Library/Application Support/SpaceVibe Deck/agent-hooks/claude.json";
const UUID = "11111111-2222-4333-8444-555555555555";

function context(over: Partial<AugmentContext> = {}): AugmentContext {
  return {
    adapters: ALL_ON,
    platform: "macos",
    claudeSettingsPath: SETTINGS,
    sessionId: UUID,
    hooksSupported: true,
    shellBootstrap: false,
    codexBypassHookTrust: false,
    codexNoDaemon: false,
    ...over,
  };
}

describe("augmentLaunchCommand — claude", () => {
  it("preserves fresh, resume and user-configured commands even with Signals on", () => {
    for (const command of [
      "claude",
      "claude --dangerously-skip-permissions",
      "claude --resume abc",
      "claude -c",
      "claude --settings /me/x.json",
      `claude --session-id ${UUID}`,
      "claude --resume abc --fork-session",
    ]) {
      expect(augmentLaunchCommand(command, context())).toEqual({ command, sessionId: null });
      expect(augmentLaunchCommand(command, context({ platform: "windows" })).command).toBe(command);
    }
  });
});

describe("augmentLaunchCommand — codex and opencode", () => {
  it("sets codex's notification condition unless the user set it", () => {
    expect(augmentLaunchCommand("codex --full-auto", context()).command).toBe(
      "codex --full-auto -c tui.notification_condition=always",
    );
    expect(
      augmentLaunchCommand("codex -c tui.notification_condition=unfocused", context()).command,
    ).toBe("codex -c tui.notification_condition=unfocused");
    expect(
      augmentLaunchCommand("codex --config tui.notification_condition=always", context()).command,
    ).toBe("codex --config tui.notification_condition=always");
    // A different -c key is not the same flag.
    expect(augmentLaunchCommand("codex -c model=gpt-5", context()).command).toBe(
      "codex -c model=gpt-5 -c tui.notification_condition=always",
    );
  });

  it("adds nothing to opencode: its plugin loads through the wrapper, not the command", () => {
    expect(augmentLaunchCommand("opencode", context())).toEqual({
      command: "opencode",
      sessionId: null,
    });
    expect(augmentLaunchCommand("opencode -c", context()).command).toBe("opencode -c");
  });

  it("leaves every other agent untouched", () => {
    for (const command of ["gemini", "agy -p", "cursor-agent --force", "aider --watch"]) {
      expect(augmentLaunchCommand(command, context())).toEqual({ command, sessionId: null });
    }
  });
});

describe("shellQuote", () => {
  it("wraps in single quotes and escapes an embedded one", () => {
    expect(shellQuote("/a b/c")).toBe("'/a b/c'");
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });
});

describe("augmentLaunchCommand — codex without a wrapper (CX2)", () => {
  const bypass = { codexBypassHookTrust: true, codexNoDaemon: true };
  const flags = "--no-daemon --dangerously-bypass-hook-trust";
  const augment = (command: string, over: Partial<AugmentContext> = {}) =>
    augmentLaunchCommand(command, context({ ...bypass, ...over })).command;

  it("inserts the flags right after codex and drops the notification condition", () => {
    expect(augment("codex")).toBe(`codex ${flags}`);
    expect(augment("codex --full-auto")).toBe(`codex ${flags} --full-auto`);
    expect(augment("codex resume --last")).toBe(`codex ${flags} resume --last`);
    expect(augment("codex fork --last")).toBe(`codex ${flags} fork --last`);
  });

  it("leaves --no-daemon off every non-interactive and remote form", () => {
    const base = "--dangerously-bypass-hook-trust";
    expect(augment("codex exec say hi")).toBe(`codex ${base} exec say hi`);
    expect(augment("codex review")).toBe(`codex ${base} review`);
  });

  it("omits --no-daemon when this Codex does not list it", () => {
    expect(augment("codex resume", { codexNoDaemon: false })).toBe(
      "codex --dangerously-bypass-hook-trust resume",
    );
  });

  it("does not double what the user typed", () => {
    expect(augment("codex --dangerously-bypass-hook-trust --no-daemon")).toBe(
      "codex --dangerously-bypass-hook-trust --no-daemon",
    );
    expect(augment("codex -- --dangerously-bypass-hook-trust")).toBe(
      `codex ${flags} -- --dangerously-bypass-hook-trust`,
    );
  });

  it("adds nothing to an information flag", () => {
    expect(augment("codex --version")).toBe("codex --version");
    expect(augment("codex exec --help")).toBe("codex exec --help");
  });

  it("adds nothing when the shell is bootstrapped: the wrapper does it", () => {
    for (const command of ["codex", "codex resume", "codex exec go", "codex agents"]) {
      expect(augment(command, { shellBootstrap: true })).toBe(command);
    }
  });

  it("keeps today's notification condition when the bypass is not accepted and no wrapper runs", () => {
    expect(augment("codex --full-auto", { codexBypassHookTrust: false })).toBe(
      "codex --full-auto -c tui.notification_condition=always",
    );
  });

  it("leaves the command to the wrapper even when main's probe found no bypass", () => {
    for (const codexBypassHookTrust of [false, true]) {
      for (const command of [
        "codex --full-auto",
        "codex queue --thread abc --message hello",
        "codex agents",
      ]) {
        expect(augment(command, { codexBypassHookTrust, shellBootstrap: true })).toBe(command);
      }
    }
  });

  it.each([
    ["codex agents"],
    ["codex queue --thread abc --message hello"],
    ["codex archive abc"],
    ["codex --remote ws://h:1"],
  ])("never adds -c tui.notification_condition to %s, on any path", (command) => {
    const over = [
      { codexBypassHookTrust: false },
      { codexBypassHookTrust: false, shellBootstrap: true },
      { platform: "windows" as const },
      { hooksSupported: false },
    ];
    for (const context of over) {
      expect(augment(command, context)).not.toContain("notification_condition");
    }
  });

  it("adds nothing while the Codex adapter is off", () => {
    const adapters = { ...ALL_ON, codex: false };
    expect(augment("codex resume", { adapters })).toBe("codex resume");
  });

  it("leaves Windows and hook-less hosts exactly as they were", () => {
    for (const over of [{ platform: "windows" as const }, { hooksSupported: false }]) {
      expect(augment("codex --full-auto", over)).toBe(
        "codex --full-auto -c tui.notification_condition=always",
      );
      expect(augment("codex agents", over)).toBe("codex agents");
    }
  });

  it.each([
    ["codex agents"],
    ["codex app-server --listen ws://x"],
    ["codex remote-control start"],
    ["codex --remote ws://h:1"],
    ["codex resume --remote=ws://h:1"],
    ["codex queue --thread abc --message hello"],
    ["codex archive abc"],
    ["codex unarchive abc"],
    ["codex delete abc"],
  ])("clears the pane's credentials for %s, adding nothing else", (command) => {
    const cleared = `env -u DECK_PANE_ID -u DECK_HOOK_TOKEN -u DECK_HOOK_PORT ${command}`;
    expect(augment(command)).toBe(cleared);
    // Whatever the adapter, and whether or not this Codex accepts the bypass.
    expect(augment(command, { adapters: { ...ALL_ON, codex: false } })).toBe(cleared);
    expect(augment(command, { codexBypassHookTrust: false })).toBe(cleared);
  });

  it("never clears credentials for a launch that stays in-process", () => {
    expect(augment("codex exec go")).not.toContain("env -u");
  });
});
