import { describe, expect, it } from "vitest";
import { createAgentAttentionTracker, CONTRACT_FRESHNESS_MS } from "./agent-attention";
import { contractSignalOf, type HookEvent } from "../lib/agent-signal-map";

function setup() {
  let now = 100_000;
  const tracker = createAgentAttentionTracker({ now: () => now });
  tracker.noteProcess(1, "claude", true);
  const send = (event: string, detail: string | null = null) => {
    const signal = contractSignalOf({
      paneId: 1,
      source: "hook",
      agent: "claude",
      event,
      sessionId: "session-1",
      cwd: "/repo",
      message: "Finished.",
      detail,
      receivedAt: ++now,
    } as HookEvent);
    return signal === null ? null : tracker.noteContract(1, signal);
  };
  const heuristic = (phase: "working" | "idle") =>
    tracker.noteActivity(1, {
      phase,
      source: "output-heuristic",
      severity: null,
      oscState: null,
      observedAt: ++now,
      evidenceStartedAt: now,
    });
  return { tracker, send, heuristic, advance: (ms: number) => (now += ms) };
}

describe("Claude turn hooks — working clears its own request", () => {
  it("a PostToolUse after a hook PermissionRequest clears the request and reads working", () => {
    const { tracker, send } = setup();
    send("UserPromptSubmit");
    send("PermissionRequest", "Bash");
    expect(tracker.snapshot(1)).toMatchObject({ attention: "requested", source: "hook" });
    send("PostToolUse", "Bash");
    expect(tracker.snapshot(1)).toMatchObject({
      phase: "working",
      phaseConfidence: "explicit",
      attention: "none",
      source: null,
      detail: null,
    });
    send("Stop");
    expect(tracker.snapshot(1)).toMatchObject({ phase: "idle", attention: "completed" });
  });

  it("keeps a requested the registry raised, and a warning or an error", () => {
    const { tracker, send } = setup();
    tracker.noteRegistry(1, { sessionId: "session-1", waiting: true, detail: "Bash" });
    send("PostToolUse", "Bash");
    expect(tracker.snapshot(1)).toMatchObject({
      phase: "working",
      attention: "requested",
      source: "registry",
    });

    const warned = setup();
    warned.tracker.noteActivity(1, {
      phase: "working",
      source: "osc-progress",
      severity: "warning",
      oscState: 4,
      observedAt: warned.advance(1),
    });
    warned.send("UserPromptSubmit");
    expect(warned.tracker.snapshot(1)?.attention).toBe("warning");

    const failed = setup();
    failed.send("StopFailure", "rate_limit");
    failed.send("PostToolUseFailure", "Bash");
    expect(failed.tracker.snapshot(1)).toMatchObject({ phase: "working", attention: "error" });
  });
});

describe("Claude turn hooks — a fresh hook phase outranks the heuristic", () => {
  it("an inferred idle between two hook working signals changes nothing and latches no completion", () => {
    const { tracker, send, heuristic } = setup();
    send("UserPromptSubmit");
    expect(heuristic("idle")).toBeNull();
    expect(tracker.snapshot(1)).toMatchObject({
      phase: "working",
      phaseConfidence: "explicit",
      attention: "none",
    });
    send("PostToolUse", "Bash");
    expect(heuristic("working")).toBeNull();
    expect(tracker.snapshot(1)).toMatchObject({ phase: "working", phaseConfidence: "explicit" });
  });

  it("the silence resync's idle (no evidence start) is refused too", () => {
    const { tracker, send, advance } = setup();
    send("UserPromptSubmit");
    expect(
      tracker.noteActivity(1, {
        phase: "idle",
        source: "output-heuristic",
        severity: null,
        oscState: null,
        observedAt: advance(3_200),
      }),
    ).toBeNull();
    expect(tracker.snapshot(1)?.attention).toBe("none");
  });

  it("applies again once tick has hollowed a silent contract phase", () => {
    const { tracker, send, heuristic, advance } = setup();
    send("UserPromptSubmit");
    advance(CONTRACT_FRESHNESS_MS + 1);
    expect(tracker.tick(100_000 + CONTRACT_FRESHNESS_MS + 100)).toEqual([1]);
    expect(tracker.snapshot(1)?.phaseConfidence).toBe("inferred");
    expect(heuristic("idle")).toMatchObject({ phase: "idle", attention: "completed" });
  });

  it("OSC 9;4 is not refused", () => {
    const { tracker, send, advance } = setup();
    send("UserPromptSubmit");
    tracker.noteActivity(1, {
      phase: "idle",
      source: "osc-progress",
      severity: null,
      oscState: 0,
      observedAt: advance(1),
    });
    expect(tracker.snapshot(1)).toMatchObject({ phase: "idle", attention: "completed" });
  });

  it("a heuristic still drives a pane no hook has spoken for", () => {
    const { tracker, heuristic } = setup();
    expect(heuristic("working")?.phase).toBe("working");
    expect(tracker.snapshot(1)?.phaseConfidence).toBe("inferred");
  });
});

describe("Claude turn hooks — an interrupt key clears explicit work (INT1)", () => {
  it("clears hook-backed working to idle with no run and no completion", () => {
    const { tracker, send } = setup();
    send("SessionStart");
    send("UserPromptSubmit");
    const snap = tracker.noteInterrupt(1);
    expect(snap).toMatchObject({
      phase: "idle",
      phaseConfidence: "explicit",
      hasRun: false,
      attention: "none",
      sessionId: "session-1",
    });
  });

  it("clears a hook request, and a later working signal re-applies", () => {
    const { tracker, send } = setup();
    send("PermissionRequest", "Bash");
    expect(tracker.noteInterrupt(1)).toMatchObject({
      phase: "idle",
      attention: "none",
      source: null,
      detail: null,
      hasRun: false,
    });
    expect(send("PostToolUse", "Bash")).toMatchObject({ phase: "working", hasRun: true });
  });

  it("ignores working the heuristic inferred on a pane no hook has spoken for", () => {
    const { tracker, heuristic } = setup();
    heuristic("working");
    expect(tracker.noteInterrupt(1)).toBeNull();
    expect(tracker.snapshot(1)?.phase).toBe("working");
  });

  it("ignores a request the registry or the terminal raised", () => {
    const { tracker } = setup();
    tracker.noteRegistry(1, { sessionId: "session-1", waiting: true, detail: null });
    expect(tracker.noteInterrupt(1)).toBeNull();
    expect(tracker.snapshot(1)?.attention).toBe("requested");
  });

  it("keeps an error", () => {
    const { tracker, send } = setup();
    send("UserPromptSubmit");
    send("StopFailure", "rate_limit");
    send("PostToolUse", "Bash");
    expect(tracker.snapshot(1)?.attention).toBe("error");
    expect(tracker.noteInterrupt(1)).toMatchObject({ phase: "idle", attention: "error" });
  });

  it("still clears after an OSC 9;4 working replaced the hook's phase", () => {
    const { tracker, send, advance } = setup();
    send("UserPromptSubmit");
    tracker.noteActivity(1, {
      phase: "working",
      source: "osc-progress",
      severity: null,
      oscState: 1,
      observedAt: advance(1),
    });
    expect(tracker.noteInterrupt(1)).toMatchObject({ phase: "idle", hasRun: false });
  });

  it("does nothing after Stop, an error or a new session", () => {
    const { tracker, send } = setup();
    send("UserPromptSubmit");
    send("Stop");
    expect(tracker.noteInterrupt(1)).toBeNull();
    send("UserPromptSubmit");
    send("SessionStart");
    expect(tracker.noteInterrupt(1)).toBeNull();
    expect(tracker.snapshot(1)?.phase).toBe("working");
  });

  it("does nothing on a pane whose gate is closed, or after it already cleared", () => {
    const { tracker, send } = setup();
    expect(tracker.noteInterrupt(99)).toBeNull();
    tracker.noteProcess(2, "zsh", false);
    expect(tracker.noteInterrupt(2)).toBeNull();
    send("UserPromptSubmit");
    tracker.noteInterrupt(1);
    expect(tracker.noteInterrupt(1)).toBeNull();
  });

  it("holds off the heuristic the way any fresh contract phase does", () => {
    const { tracker, send, heuristic } = setup();
    send("UserPromptSubmit");
    tracker.noteInterrupt(1);
    expect(heuristic("working")).toBeNull();
    expect(tracker.snapshot(1)?.phase).toBe("idle");
  });

  it("ages the cleared phase, so the heuristic is not refused forever after a stale turn", () => {
    const { tracker, send, heuristic, advance } = setup();
    send("UserPromptSubmit");
    advance(CONTRACT_FRESHNESS_MS + 1);
    expect(tracker.tick(100_000 + CONTRACT_FRESHNESS_MS + 100)).toEqual([1]);
    expect(tracker.noteInterrupt(1)).toMatchObject({ phase: "idle", phaseConfidence: "explicit" });
    expect(heuristic("working")).toBeNull();
    advance(CONTRACT_FRESHNESS_MS + 1);
    expect(tracker.tick(100_000 + 2 * CONTRACT_FRESHNESS_MS + 200)).toEqual([1]);
    expect(tracker.snapshot(1)?.phaseConfidence).toBe("inferred");
    expect(heuristic("working")).toMatchObject({ phase: "working" });
  });
});
