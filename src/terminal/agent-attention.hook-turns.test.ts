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
