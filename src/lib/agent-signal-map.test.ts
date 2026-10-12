import { describe, expect, it } from "vitest";
import { contractSignalOf, parseHookEvent, type HookEvent } from "./agent-signal-map";

const SESSION = "11111111-2222-4333-8444-555555555555";

function claude(event: string, over: Partial<HookEvent> = {}): HookEvent {
  return {
    paneId: 7,
    source: "hook",
    agent: "claude",
    event,
    sessionId: SESSION,
    cwd: "/w",
    message: null,
    detail: null,
    receivedAt: 1000,
    ...over,
  };
}

function opencode(event: string, over: Partial<HookEvent> = {}): HookEvent {
  return claude(event, { source: "server", agent: "opencode", sessionId: "ses_abc", ...over });
}

describe("contractSignalOf — claude hooks", () => {
  it("Stop is a completion carrying the sentence", () => {
    expect(contractSignalOf(claude("Stop", { message: "Suite is green." }))).toEqual({
      source: "hook",
      kind: "completed",
      sessionId: SESSION,
      detail: null,
      message: "Suite is green.",
      observedAt: 1000,
    });
  });

  it("StopFailure is the only producer of an error", () => {
    expect(contractSignalOf(claude("StopFailure", { detail: null }))?.kind).toBe("error");
  });

  it("Notification is a request only for its two matched kinds", () => {
    expect(contractSignalOf(claude("Notification", { detail: "permission_prompt" }))).toMatchObject(
      {
        kind: "requested",
        detail: "permission prompt",
      },
    );
    expect(contractSignalOf(claude("Notification", { detail: "idle_prompt" }))).toMatchObject({
      kind: "requested",
      detail: "input needed",
    });
    expect(contractSignalOf(claude("Notification", { detail: "agent_completed" }))).toBeNull();
    expect(contractSignalOf(claude("Notification"))).toBeNull();
  });

  it("PermissionRequest is a request naming the tool", () => {
    expect(contractSignalOf(claude("PermissionRequest", { detail: "Bash" }))).toMatchObject({
      kind: "requested",
      detail: "permission prompt — Bash",
    });
  });

  it("UserPromptSubmit, PostToolUse and PostToolUseFailure are work, with no detail or sentence", () => {
    for (const event of ["UserPromptSubmit", "PostToolUse", "PostToolUseFailure"]) {
      expect(contractSignalOf(claude(event, { detail: "Bash" }))).toEqual({
        source: "hook",
        kind: "working",
        sessionId: SESSION,
        detail: null,
        message: null,
        observedAt: 1000,
      });
    }
  });

  it("SessionStart names the session; SessionEnd, SubagentStop and TeammateIdle say nothing", () => {
    expect(contractSignalOf(claude("SessionStart"))?.kind).toBe("session");
    expect(contractSignalOf(claude("SessionEnd"))).toBeNull();
    expect(contractSignalOf(claude("SubagentStop"))).toBeNull();
    expect(contractSignalOf(claude("TeammateIdle"))).toBeNull();
  });

  it("a hook from an agent the map does not know says nothing", () => {
    expect(contractSignalOf(claude("Stop", { agent: "codex" }))).toBeNull();
    expect(contractSignalOf(claude("Stop", { source: "server" }))).toBeNull();
  });
});

describe("contractSignalOf — codex hooks", () => {
  const codex = (event: string, over: Partial<HookEvent> = {}) =>
    claude(event, { agent: "codex", turnId: "turn-1", ...over });

  it("maps prompts and tool results to work, and approvals and questions to a request", () => {
    expect(contractSignalOf(codex("UserPromptSubmit"))?.kind).toBe("working");
    expect(contractSignalOf(codex("PostToolUse", { detail: "shell" }))).toMatchObject({
      kind: "working",
      detail: null,
    });
    expect(contractSignalOf(codex("PermissionRequest", { detail: "shell" }))).toMatchObject({
      kind: "requested",
      detail: "permission prompt — shell",
    });
    expect(contractSignalOf(codex("PreToolUse", { detail: "request_user_input" }))).toMatchObject({
      kind: "requested",
      detail: "input needed",
    });
  });

  it("needs a turn for every event but SessionStart, and says nothing on SessionEnd", () => {
    expect(contractSignalOf(codex("PostToolUse", { turnId: undefined }))).toBeNull();
    expect(contractSignalOf(codex("SessionStart", { turnId: undefined }))?.kind).toBe("session");
    expect(contractSignalOf(codex("SessionEnd", { turnId: undefined }))).toBeNull();
    expect(contractSignalOf(codex("SubagentStop"))).toBeNull();
  });
});

describe("contractSignalOf — opencode server", () => {
  it("maps status, idle, error and both permission spellings", () => {
    expect(contractSignalOf(opencode("session.status"))?.kind).toBe("working");
    expect(contractSignalOf(opencode("session.status", { detail: "idle" }))?.kind).toBe(
      "completed",
    );
    expect(contractSignalOf(opencode("session.idle"))?.kind).toBe("completed");
    expect(
      contractSignalOf(opencode("session.error", { detail: "ProviderAuthError" })),
    ).toMatchObject({
      kind: "error",
      detail: "ProviderAuthError",
    });
    expect(contractSignalOf(opencode("permission.asked", { detail: "bash" }))).toMatchObject({
      kind: "requested",
      detail: "permission — bash",
    });
    expect(contractSignalOf(opencode("permission.v2.asked"))).toMatchObject({
      kind: "requested",
      detail: "permission",
    });
    expect(contractSignalOf(opencode("permission.replied"))?.kind).toBe("answered");
    expect(contractSignalOf(opencode("permission.v2.replied"))?.kind).toBe("answered");
    expect(contractSignalOf(opencode("message.updated"))).toBeNull();
  });
});

describe("parseHookEvent", () => {
  it("accepts the flat wire shape and refuses anything else", () => {
    const wire = {
      paneId: 7,
      source: "hook",
      agent: "claude",
      event: "Stop",
      sessionId: SESSION,
      cwd: "/w",
      message: "done",
      detail: null,
      receivedAt: 5,
    };
    expect(parseHookEvent(wire)).toEqual({ ...wire, detail: null });
    expect(parseHookEvent({ ...wire, paneId: "7" })).toBeNull();
    expect(parseHookEvent({ ...wire, source: "other" })).toBeNull();
    expect(parseHookEvent({ ...wire, sessionId: "../x" })).toBeNull();
    expect(parseHookEvent(null)).toBeNull();
    expect(parseHookEvent({ ...wire, message: "", receivedAt: "x" })).toMatchObject({
      message: null,
      receivedAt: 0,
    });
  });
});
