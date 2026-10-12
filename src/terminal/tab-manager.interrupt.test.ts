// @vitest-environment jsdom
/** INT1 through `TabManager`'s own seam: the pane reports Escape / Ctrl+C, the rail row follows. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaneProcessInfo } from "../lib/process-info";
import type { HookEvent } from "../lib/agent-signal-map";
import { tabViews } from "./tabs-store";
import { settings } from "../settings/settings-store";
import { DEFAULT_SETTINGS } from "../settings/settings-schema";
import { processInfo, setupControllable } from "./tab-manager.fixtures";

const SESSION_ID = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  vi.useFakeTimers();
  settings.value = DEFAULT_SETTINGS;
});
afterEach(() => {
  vi.useRealTimers();
});

describe("createTabManager — interrupt key (INT1)", () => {
  it("clears a hook-backed turn to idle on Escape, and leaves a quiet pane alone", async () => {
    let handler: ((event: HookEvent) => void) | null = null;
    const infos = new Map<number, PaneProcessInfo>([
      [1, processInfo(1, "/repo", "claude", "agent", "claude")],
    ]);
    const { tm, pty, emitInterruptKey } = setupControllable(infos, {
      hookEvents: async (next) => {
        handler = next;
        return () => {
          handler = null;
        };
      },
    });
    const hook = (event: string) =>
      handler?.({
        paneId: 1,
        source: "hook",
        agent: "claude",
        event,
        sessionId: SESSION_ID,
        cwd: "/repo",
        message: null,
        detail: null,
        receivedAt: Date.now(),
      });
    const pane = () => tabViews.value[0]?.panes?.[0];
    try {
      await tm.init();
      await tm.materialize({ layout: null, cwds: ["/repo"], agent: "claude" });
      await vi.advanceTimersByTimeAsync(0);
      pty.emitOutput(1, "$ ");
      await vi.advanceTimersByTimeAsync(2000);
      hook("SessionStart");
      emitInterruptKey(1);
      expect(pane()).toMatchObject({ phase: "unknown" });

      hook("UserPromptSubmit");
      expect(pane()).toMatchObject({ phase: "working", phaseConfidence: "explicit" });
      const written = pty.writes.length;
      emitInterruptKey(1);
      // The session id stays: the session tail store reads it to tell an interrupt from a new
      // occupant, which `hasRun` alone cannot.
      expect(pane()).toMatchObject({
        phase: "idle",
        hasRun: false,
        attention: "none",
        sessionId: SESSION_ID,
      });
      // The tracker never writes: what the key sends to the PTY is the pane's own business.
      expect(pty.writes).toHaveLength(written);

      hook("PostToolUse");
      expect(pane()).toMatchObject({ phase: "working", hasRun: true });
    } finally {
      tm.dispose();
    }
  });
});
