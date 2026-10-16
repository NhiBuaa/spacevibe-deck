import { describe, expect, it } from "vitest";
import {
  HOOK_MAX_BODY_BYTES,
  nextPaneSession,
  parseHookBody,
  tokensMatch,
  validateHookHead,
} from "./hook-request";

const TOKEN = "0123456789abcdef0123456789abcdef";
const tokenFor = (paneId: number) => (paneId === 7 ? TOKEN : null);
const TTY = "ttys009";
const ttyFor = (paneId: number) => (paneId === 7 ? TTY : null);

function head(over: {
  method?: string;
  url?: string;
  headers?: Record<string, string | undefined>;
}) {
  return {
    method: over.method ?? "POST",
    url: over.url ?? "/hook",
    headers: {
      "x-deck-pane": "7",
      "x-deck-token": TOKEN,
      "content-type": "application/json",
      ...over.headers,
    },
  };
}

describe("validateHookHead", () => {
  it("accepts a POST to /hook from a live pane with its own token", () => {
    expect(validateHookHead(head({}), tokenFor, ttyFor)).toEqual({ ok: true, paneId: 7 });
    expect(validateHookHead(head({ url: "/hook?x=1" }), tokenFor, ttyFor)).toEqual({
      ok: true,
      paneId: 7,
    });
  });

  it("answers 404 for any other path and 405 for any other method", () => {
    expect(validateHookHead(head({ url: "/" }), tokenFor, ttyFor).ok).toBe(false);
    expect(validateHookHead(head({ url: "/hooks" }), tokenFor, ttyFor)).toMatchObject({
      status: 404,
    });
    expect(validateHookHead(head({ method: "GET" }), tokenFor, ttyFor)).toMatchObject({
      status: 405,
    });
  });

  it("refuses a missing or malformed pane header with 400", () => {
    expect(
      validateHookHead(head({ headers: { "x-deck-pane": undefined } }), tokenFor, ttyFor),
    ).toMatchObject({
      status: 400,
    });
    expect(
      validateHookHead(head({ headers: { "x-deck-pane": "0" } }), tokenFor, ttyFor),
    ).toMatchObject({
      status: 400,
    });
    expect(
      validateHookHead(head({ headers: { "x-deck-pane": "7; rm" } }), tokenFor, ttyFor),
    ).toMatchObject({
      status: 400,
    });
  });

  it("answers one 403 for an unknown pane, a wrong token and a missing token alike", () => {
    expect(
      validateHookHead(head({ headers: { "x-deck-pane": "8" } }), tokenFor, ttyFor),
    ).toMatchObject({
      status: 403,
    });
    expect(
      validateHookHead(
        head({ headers: { "x-deck-token": TOKEN.replace("0", "1") } }),
        tokenFor,
        ttyFor,
      ),
    ).toMatchObject({ status: 403 });
    expect(
      validateHookHead(head({ headers: { "x-deck-token": undefined } }), tokenFor, ttyFor),
    ).toMatchObject({ status: 403 });
    expect(
      validateHookHead(head({ headers: { "x-deck-token": "" } }), tokenFor, ttyFor),
    ).toMatchObject({
      status: 403,
    });
  });

  it("refuses an oversize Content-Length with 413 before any body is read", () => {
    expect(
      validateHookHead(
        head({ headers: { "content-length": String(HOOK_MAX_BODY_BYTES + 1) } }),
        tokenFor,
        ttyFor,
      ),
    ).toMatchObject({ status: 413 });
    expect(
      validateHookHead(
        head({ headers: { "content-length": String(HOOK_MAX_BODY_BYTES) } }),
        tokenFor,
        ttyFor,
      ).ok,
    ).toBe(true);
  });
});

describe("validateHookHead — Codex tty guard", () => {
  const codex = (headers: Record<string, string | undefined>) =>
    head({ url: "/hook/codex", headers: { "x-deck-tty": TTY, ...headers } });

  it("accepts a Codex post whose host process is on the pane's tty", () => {
    expect(validateHookHead(codex({}), tokenFor, ttyFor)).toEqual({ ok: true, paneId: 7 });
  });

  it.each([
    ["a missing header", undefined],
    ["an empty header", ""],
    ["a daemon with no tty on macOS", "??"],
    ["a daemon with no tty on Linux", "?"],
    ["another pane's tty", "ttys010"],
  ])("refuses %s with 403", (_label, value) => {
    expect(validateHookHead(codex({ "x-deck-tty": value }), tokenFor, ttyFor)).toMatchObject({
      ok: false,
      status: 403,
    });
  });

  it("refuses when the pane's own tty is unknown", () => {
    expect(validateHookHead(codex({}), tokenFor, () => null)).toMatchObject({ status: 403 });
    expect(validateHookHead(codex({}), tokenFor, () => "")).toMatchObject({ status: 403 });
  });

  it("does not ask Claude's endpoint for a tty", () => {
    expect(validateHookHead(head({}), tokenFor, () => null)).toEqual({ ok: true, paneId: 7 });
  });
});

describe("tokensMatch", () => {
  it("compares the whole token and never matches an empty one", () => {
    expect(tokensMatch(TOKEN, TOKEN)).toBe(true);
    expect(tokensMatch(TOKEN, TOKEN.slice(0, -1))).toBe(false);
    expect(tokensMatch(TOKEN, `${TOKEN}0`)).toBe(false);
    expect(tokensMatch("", "")).toBe(false);
  });
});

describe("parseHookBody", () => {
  const stop = {
    session_id: "11111111-2222-4333-8444-555555555555",
    transcript_path: "/Users/dev/.claude/projects/x/11111111.jsonl",
    cwd: "/w",
    prompt_id: "p1",
    permission_mode: "auto",
    hook_event_name: "Stop",
    stop_hook_active: false,
    last_assistant_message: "Suite is green.\n\nNext: the build.",
    background_tasks: [],
  };

  it("keeps the fields the renderer reads and drops the rest", () => {
    expect(parseHookBody(7, JSON.stringify(stop))).toEqual({
      paneId: 7,
      event: "Stop",
      sessionId: "11111111-2222-4333-8444-555555555555",
      cwd: "/w",
      message: "Suite is green.",
      detail: null,
    });
  });

  it("reads the detail off a Notification and a PermissionRequest", () => {
    expect(
      parseHookBody(
        7,
        JSON.stringify({
          ...stop,
          hook_event_name: "Notification",
          notification_type: "permission_prompt",
        }),
      )?.detail,
    ).toBe("permission_prompt");
    expect(
      parseHookBody(
        7,
        JSON.stringify({ ...stop, hook_event_name: "PermissionRequest", tool_name: "Bash" }),
      )?.detail,
    ).toBe("Bash");
  });

  it("refuses anything that is not a hook payload", () => {
    expect(parseHookBody(7, "not json")).toBeNull();
    expect(parseHookBody(7, "[1,2]")).toBeNull();
    expect(parseHookBody(7, JSON.stringify({ ...stop, hook_event_name: "Stop; rm" }))).toBeNull();
    expect(parseHookBody(7, JSON.stringify({ ...stop, session_id: "../x" }))).toBeNull();
    expect(parseHookBody(7, JSON.stringify({ ...stop, session_id: undefined }))).toBeNull();
    expect(parseHookBody(7, JSON.stringify({ ...stop, hook_event_name: 1 }))).toBeNull();
  });

  it("refuses a body over the cap even when Content-Length lied", () => {
    const huge = JSON.stringify({
      ...stop,
      last_assistant_message: "x".repeat(HOOK_MAX_BODY_BYTES),
    });
    expect(parseHookBody(7, huge)).toBeNull();
  });

  it("caps a very long message to one line of bounded length", () => {
    const post = parseHookBody(
      7,
      JSON.stringify({ ...stop, last_assistant_message: `${"y".repeat(5000)}\nsecond` }),
    );
    expect(post?.message?.length).toBe(2000);
    expect(post?.message?.endsWith("…")).toBe(true);
  });
});

describe("nextPaneSession — the generation check", () => {
  it("SessionStart names the occupant, SessionEnd ends it", () => {
    expect(nextPaneSession(null, { event: "SessionStart", sessionId: "a" })).toEqual({
      accept: true,
      current: "a",
    });
    expect(nextPaneSession("a", { event: "SessionEnd", sessionId: "a" })).toEqual({
      accept: true,
      current: null,
    });
    // A late end from a previous occupant is dropped and changes nothing.
    expect(nextPaneSession("b", { event: "SessionEnd", sessionId: "a" })).toEqual({
      accept: false,
      current: "b",
    });
  });

  it("accepts the first post a pane ever makes, then only the same session", () => {
    expect(nextPaneSession(null, { event: "Stop", sessionId: "a" })).toEqual({
      accept: true,
      current: "a",
    });
    expect(nextPaneSession("a", { event: "Stop", sessionId: "a" }).accept).toBe(true);
    expect(nextPaneSession("a", { event: "Stop", sessionId: "z" })).toEqual({
      accept: false,
      current: "a",
    });
  });

  it("a new SessionStart rotates the occupant, and the old one's late posts are dropped", () => {
    const rotated = nextPaneSession("a", { event: "SessionStart", sessionId: "b" });
    expect(rotated).toEqual({ accept: true, current: "b" });
    expect(nextPaneSession(rotated.current, { event: "Stop", sessionId: "a" }).accept).toBe(false);
  });
});

describe("parseHookBody — Codex events", () => {
  const base = { session_id: "session-1", turn_id: "turn-1" };
  const parse = (body: object) => parseHookBody(7, JSON.stringify(body), "codex");

  it("accepts the eight registered events", () => {
    for (const event of [
      "SessionStart",
      "SessionEnd",
      "UserPromptSubmit",
      "PreToolUse",
      "PostToolUse",
      "PermissionRequest",
      "Stop",
      "Interrupt",
    ]) {
      expect(parse({ ...base, hook_event_name: event })).toMatchObject({ event, agent: "codex" });
    }
    expect(parse({ ...base, hook_event_name: "SubagentStop" })).toBeNull();
    expect(parse({ ...base, hook_event_name: "PreCompact" })).toBeNull();
  });

  it("needs a safe turn_id on every event except the two session-scoped ones", () => {
    const { turn_id: _turn, ...noTurn } = base;
    expect(parse({ ...noTurn, hook_event_name: "PostToolUse" })).toBeNull();
    expect(parse({ ...noTurn, hook_event_name: "PermissionRequest" })).toBeNull();
    expect(parse({ ...base, turn_id: "../x", hook_event_name: "PostToolUse" })).toBeNull();
    expect(parse({ ...noTurn, hook_event_name: "SessionEnd" })).toMatchObject({
      event: "SessionEnd",
    });
    expect(parse({ ...noTurn, hook_event_name: "SessionStart" })).toMatchObject({
      event: "SessionStart",
    });
  });

  it("drops any post that carries an agent_id, whatever its event", () => {
    for (const event of ["PostToolUse", "Stop", "SessionStart", "PermissionRequest"]) {
      expect(parse({ ...base, hook_event_name: event, agent_id: "agent-1" })).toBeNull();
    }
    expect(parse({ ...base, hook_event_name: "Stop", agent_id: null })).not.toBeNull();
  });

  it("reads the tool name of a PreToolUse as the detail", () => {
    expect(
      parse({ ...base, hook_event_name: "PreToolUse", tool_name: "request_user_input" }),
    ).toMatchObject({ detail: "request_user_input" });
  });
});

describe("opencode endpoint (OC1)", () => {
  const opencodeHead = (headers: Record<string, string | undefined> = {}) =>
    head({ url: "/hook/opencode", headers });
  const parse = (body: object) => parseHookBody(7, JSON.stringify(body), "opencode");
  const base = { session_id: "ses_abc" };

  it("accepts a POST from a live pane with its token, and asks for no tty", () => {
    expect(validateHookHead(opencodeHead(), tokenFor, () => null)).toEqual({ ok: true, paneId: 7 });
    expect(
      validateHookHead(opencodeHead({ "x-deck-token": "nope" }), tokenFor, ttyFor),
    ).toMatchObject({ status: 403 });
    expect(validateHookHead(head({ url: "/hook/opencode/x" }), tokenFor, ttyFor)).toMatchObject({
      status: 404,
    });
  });

  it("holds the 64 KiB cap that Claude's endpoint has", () => {
    expect(
      validateHookHead(
        opencodeHead({ "content-length": String(HOOK_MAX_BODY_BYTES + 1) }),
        tokenFor,
        ttyFor,
      ),
    ).toMatchObject({ status: 413 });
    expect(
      parseHookBody(
        7,
        JSON.stringify({ ...base, hook_event_name: "Stop", pad: "x".repeat(HOOK_MAX_BODY_BYTES) }),
        "opencode",
      ),
    ).toBeNull();
  });

  it("accepts the seven wire names and nothing else", () => {
    for (const event of [
      "SessionStart",
      "SessionEnd",
      "Start",
      "Stop",
      "Failed",
      "PermissionRequest",
      "PermissionReplied",
    ]) {
      expect(parse({ ...base, hook_event_name: event })).toMatchObject({
        event,
        agent: "opencode",
        sessionId: "ses_abc",
      });
    }
    for (const event of ["session.status", "UserPromptSubmit", "PostToolUse", "SubagentStop"]) {
      expect(parse({ ...base, hook_event_name: event })).toBeNull();
    }
  });

  it("needs a safe session id", () => {
    expect(parse({ hook_event_name: "Start" })).toBeNull();
    expect(parse({ hook_event_name: "Start", session_id: "../x" })).toBeNull();
  });

  it("reads only the error message of a Failed, first line and capped", () => {
    expect(
      parse({ ...base, hook_event_name: "Failed", message: "Rate limited\nstack", tool_name: "x" }),
    ).toMatchObject({ detail: "Rate limited", message: null, cwd: null });
    expect(
      parse({ ...base, hook_event_name: "Stop", message: "ignored", last_assistant_message: "no" }),
    ).toMatchObject({ detail: null, message: null });
  });
});
