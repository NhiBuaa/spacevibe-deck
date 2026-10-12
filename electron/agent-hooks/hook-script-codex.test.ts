import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { codexHookScript } from "./codex-integration";
import {
  cleanupHookHarness,
  runHookScript,
  startListener,
  writeFakePs,
  SCRIPT_TEST_TIMEOUT_MS,
} from "./hook-script-harness";

vi.setConfig({ testTimeout: SCRIPT_TEST_TIMEOUT_MS });

const scratch: string[] = [];
afterEach(async () => {
  await cleanupHookHarness();
  await Promise.all(scratch.splice(0).map((dir) => fs.rm(dir, { recursive: true })));
});

const SESSION = "11111111-2222-3333-4444-555555555555";
const TURN = "turn-1";

/** Codex's key order: the fields the script reads precede the first nested value. */
function payload(event: string, extra: Record<string, unknown> = {}, head: object = {}) {
  return JSON.stringify({
    session_id: SESSION,
    transcript_path: "/home/dev/.codex/sessions/s.jsonl",
    cwd: "/home/dev/project",
    hook_event_name: event,
    model: "gpt-5",
    permission_mode: "default",
    ...head,
    turn_id: TURN,
    ...extra,
  });
}

const SHELL = { tool_name: "shell", tool_input: { command: "echo hi" } };
/** The hook's parent is `codex` on the pane's tty, as under `codex --no-daemon`. */
const ON_PANE_TTY = ["- 300 ttys009 sh", "300 200 ttys009 codex", "200 1 ttys001 zsh"];

async function run(event: string, stdin: string, psRows: readonly string[] = ON_PANE_TTY) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deck-codex-script-test-"));
  scratch.push(dir);
  const bin = await writeFakePs(dir, psRows);
  const { posts, port } = await startListener();
  const env = {
    DECK_PANE_ID: "7",
    DECK_HOOK_TOKEN: "secret",
    DECK_HOOK_PORT: String(port),
    PATH: `${bin}:/usr/bin:/bin`,
  };
  const code = await runHookScript(codexHookScript(), { env, event, stdin });
  return { code, posts };
}

describe.skipIf(process.platform === "win32")("codex hook script — bounded events", () => {
  it("posts a small body for a PostToolUse with a 1 MiB tool_response", async () => {
    const stdin = payload("PostToolUse", {
      ...SHELL,
      tool_response: { output: "x".repeat(1 << 20) },
    });
    const { code, posts } = await run("PostToolUse", stdin);
    expect(code).toBe(0);
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("/hook/codex");
    expect(posts[0].body.length).toBeLessThan(1024);
    expect(posts[0].body).not.toContain("tool_response");
    expect(JSON.parse(posts[0].body)).toEqual({
      hook_event_name: "PostToolUse",
      session_id: SESSION,
      turn_id: TURN,
      tool_name: "shell",
    });
  });

  it("keeps the turn on a UserPromptSubmit and leaves the prompt out", async () => {
    const prompt = "SECRET-PROMPT ".repeat(15_000);
    const { posts } = await run("UserPromptSubmit", payload("UserPromptSubmit", { prompt }));
    expect(posts[0].body).not.toContain("SECRET-PROMPT");
    expect(JSON.parse(posts[0].body)).toEqual({
      hook_event_name: "UserPromptSubmit",
      session_id: SESSION,
      turn_id: TURN,
    });
  });

  it("posts a session-scoped event that has no turn_id", async () => {
    const stdin = JSON.stringify({ session_id: SESSION, hook_event_name: "SessionStart" });
    const { posts } = await run("SessionStart", stdin);
    expect(JSON.parse(posts[0].body)).toEqual({
      hook_event_name: "SessionStart",
      session_id: SESSION,
    });
  });

  it("forwards a top-level agent_id so the endpoint can drop it", async () => {
    const stdin = payload(
      "PostToolUse",
      { ...SHELL },
      { agent_id: "agent-1", agent_type: "worker" },
    );
    const { posts } = await run("PostToolUse", stdin);
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0].body)).toHaveProperty("agent_id");
  });

  it("does not read an agent_id nested in tool_input as a subagent", async () => {
    const stdin = payload("PostToolUse", {
      tool_name: "shell",
      tool_input: { agent_id: "x", note: 'a "agent_id":"y" string' },
      tool_response: { agent_id: "z" },
    });
    const { posts } = await run("PostToolUse", stdin);
    expect(posts).toHaveLength(1);
    expect(JSON.parse(posts[0].body)).not.toHaveProperty("agent_id");
  });

  it("forwards stdin untouched for Stop, however long the message", async () => {
    const stdin = payload("Stop", { last_assistant_message: "done. ".repeat(40_000) });
    expect(stdin.length).toBeGreaterThan(200_000);
    const { posts } = await run("Stop", stdin);
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toBe(stdin);
  });

  it("posts nothing for a payload with no session_id or event", async () => {
    expect(
      (await run("PostToolUse", JSON.stringify({ hook_event_name: "PostToolUse" }))).posts,
    ).toEqual([]);
    expect((await run("PostToolUse", JSON.stringify({ session_id: SESSION }))).posts).toEqual([]);
    expect((await run("PostToolUse", "not json")).posts).toEqual([]);
  });
});

describe.skipIf(process.platform === "win32")("codex hook script — tty guard", () => {
  const ttyOf = async (rows: readonly string[]) => {
    const { posts } = await run("UserPromptSubmit", payload("UserPromptSubmit"), rows);
    expect(posts).toHaveLength(1);
    return posts[0].headers["x-deck-tty"];
  };

  it("reports the tty of the codex process the script runs under", async () => {
    expect(await ttyOf(ON_PANE_TTY)).toBe("ttys009");
  });

  it("matches a platform binary whose comm Linux truncated to 15 characters", async () => {
    const rows = ["- 300 pts/3 sh", "300 200 pts/3 codex-x86_64-un", "200 1 pts/1 bash"];
    expect(await ttyOf(rows)).toBe("pts/3");
  });

  it("matches a comm that macOS prints as a full path, spaces included", async () => {
    const rows = ["- 300 ttys009 sh", "300 200 ttys009 /Users/a b/.nvm/bin/codex", "200 1 ?? zsh"];
    expect(await ttyOf(rows)).toBe("ttys009");
  });

  it("climbs past a node launcher to the codex binary", async () => {
    const rows = [
      "- 400 ttys009 sh",
      "400 300 ttys009 codex",
      "300 200 ttys009 node",
      "200 1 ?? zsh",
    ];
    expect(await ttyOf(rows)).toBe("ttys009");
  });

  it("reports a daemon's missing tty, which the endpoint refuses", async () => {
    const rows = ["- 300 ?? sh", "300 200 ?? codex", "200 1 ?? launchd"];
    expect(await ttyOf(rows)).toBe("??");
  });

  it("sends no tty when no codex process is within four levels", async () => {
    const chain = [
      "- 600 ttys009 sh",
      "600 500 ttys009 a",
      "500 400 ttys009 b",
      "400 300 ttys009 c",
    ];
    const far = [...chain, "300 200 ttys009 codex", "200 1 ?? zsh"];
    // curl drops a header with an empty value, so the endpoint sees none and refuses.
    expect(await ttyOf(far)).toBeUndefined();
    expect(await ttyOf(["- 300 ttys009 sh", "300 1 ttys009 codexy"])).toBeUndefined();
  });

  it("sends no tty when ps fails", async () => {
    expect(await ttyOf([])).toBeUndefined();
  });
});
