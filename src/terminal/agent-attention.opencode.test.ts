import { describe, expect, it } from "vitest";
import { createAgentAttentionTracker } from "./agent-attention";
import { contractSignalOf, type HookEvent } from "../lib/agent-signal-map";

function setup(label = "opencode") {
  let now = 100_000;
  const tracker = createAgentAttentionTracker({ now: () => now });
  tracker.noteProcess(1, label, true);
  const send = (event: string, sessionId: string, detail: string | null = null) => {
    const signal = contractSignalOf({
      paneId: 1,
      source: "hook",
      agent: "opencode",
      event,
      sessionId,
      cwd: null,
      message: null,
      detail,
      receivedAt: ++now,
    } as HookEvent);
    return signal === null ? null : tracker.noteContract(1, signal);
  };
  return { tracker, send };
}

describe("AgentAttentionTracker — opencode plugin signals (OC1, SUB1)", () => {
  it("Start works the pane under its session, Stop completes it explicitly", () => {
    const { tracker, send } = setup();
    send("SessionStart", "ses_a");
    expect(send("Start", "ses_a")).toMatchObject({
      phase: "working",
      phaseConfidence: "explicit",
      sessionId: "ses_a",
    });
    expect(send("PermissionRequest", "ses_a")).toMatchObject({ attention: "requested" });
    expect(send("PermissionReplied", "ses_a")?.attention).toBe("none");
    expect(send("Stop", "ses_a")).toMatchObject({ phase: "idle", attention: "completed" });
    expect(tracker.snapshot(1)?.sessionId).toBe("ses_a");
  });

  it("follows A -> B -> A when each switch announces its session first", () => {
    const { tracker, send } = setup();
    send("SessionStart", "ses_a");
    send("Start", "ses_a");
    send("Stop", "ses_a");
    send("SessionStart", "ses_b");
    expect(send("Start", "ses_b")).toMatchObject({ phase: "working", sessionId: "ses_b" });
    send("Stop", "ses_b");
    send("SessionStart", "ses_a");
    expect(send("Start", "ses_a")).toMatchObject({ phase: "working", sessionId: "ses_a" });
    expect(tracker.snapshot(1)?.sessionId).toBe("ses_a");
  });

  it("drops a state for a session the pane has not been told about", () => {
    const { tracker, send } = setup();
    send("SessionStart", "ses_a");
    expect(send("Start", "ses_b")).toBeNull();
    expect(tracker.snapshot(1)?.sessionId).toBe("ses_a");
    expect(tracker.snapshot(1)?.phase).not.toBe("working");
  });

  it("drops a signal on a pane whose label is another agent", () => {
    const claude = setup("claude");
    expect(claude.send("Start", "ses_a")).toBeNull();
    expect(claude.tracker.snapshot(1)?.phase).not.toBe("working");
    const codex = setup("codex");
    expect(codex.send("SessionStart", "ses_a")).toBeNull();
  });
});
