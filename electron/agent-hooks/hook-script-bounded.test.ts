import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hookScriptSource } from "./claude-hooks-file";
import {
  cleanupHookHarness,
  runHookScript,
  startListener,
  SCRIPT_TEST_TIMEOUT_MS,
} from "./hook-script-harness";

vi.setConfig({ testTimeout: SCRIPT_TEST_TIMEOUT_MS });
afterEach(cleanupHookHarness);

const SESSION = "11111111-2222-3333-4444-555555555555";

/** Claude's key order: everything the script reads precedes the first nested value. */
function payload(event: string, extra: Record<string, unknown> = {}, head: object = {}) {
  return JSON.stringify({
    session_id: SESSION,
    transcript_path: "/home/dev/.claude/projects/x/s.jsonl",
    cwd: "/home/dev/project",
    prompt_id: "p-1",
    permission_mode: "default",
    ...head,
    effort: { level: "high" },
    hook_event_name: event,
    ...extra,
  });
}

const BASH = { tool_name: "Bash", tool_input: { command: "echo hi" } };

async function run(event: string, stdin: string, shellFlags: string[] = []) {
  const { posts, port } = await startListener();
  const env = { DECK_PANE_ID: "7", DECK_HOOK_TOKEN: "secret", DECK_HOOK_PORT: String(port) };
  const code = await runHookScript(hookScriptSource(), { env, event, stdin, shellFlags });
  return { code, posts };
}

describe.skipIf(process.platform === "win32")("claude hook script — bounded events", () => {
  it("posts a small body for a PostToolUse with a 1 MiB tool_response", async () => {
    const stdin = payload("PostToolUse", {
      ...BASH,
      tool_response: { stdout: "x".repeat(1 << 20), stderr: "", interrupted: false },
    });
    const { code, posts } = await run("PostToolUse", stdin);
    expect(code).toBe(0);
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("/hook");
    expect(posts[0].body.length).toBeLessThan(1024);
    expect(posts[0].body).not.toContain("tool_response");
    expect(JSON.parse(posts[0].body)).toEqual({
      hook_event_name: "PostToolUse",
      session_id: SESSION,
      tool_name: "Bash",
    });
  });

  it("posts a PostToolUseFailure the same way", async () => {
    const stdin = payload("PostToolUseFailure", { ...BASH, error: "Exit code 1" });
    const { posts } = await run("PostToolUseFailure", stdin);
    expect(posts.map((post) => JSON.parse(post.body))).toEqual([
      { hook_event_name: "PostToolUseFailure", session_id: SESSION, tool_name: "Bash" },
    ]);
  });

  it("posts event and session only for a UserPromptSubmit with a 200 KiB prompt", async () => {
    const prompt = "SECRET-PROMPT ".repeat(15_000);
    const { posts } = await run("UserPromptSubmit", payload("UserPromptSubmit", { prompt }));
    expect(posts).toHaveLength(1);
    expect(posts[0].body).not.toContain("SECRET-PROMPT");
    expect(JSON.parse(posts[0].body)).toEqual({
      hook_event_name: "UserPromptSubmit",
      session_id: SESSION,
    });
  });

  it("posts nothing for a payload with no session_id or no event", async () => {
    const noSession = JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash" });
    const noEvent = JSON.stringify({ session_id: SESSION, tool_name: "Bash" });
    expect((await run("PostToolUse", noSession)).posts).toEqual([]);
    expect((await run("PostToolUse", noEvent)).posts).toEqual([]);
    expect((await run("PostToolUse", "not json")).posts).toEqual([]);
  });

  it("posts nothing from inside a subagent (top-level agent_id)", async () => {
    const stdin = payload(
      "PostToolUse",
      { ...BASH, tool_response: {} },
      { agent_id: "ad901b04391a0b8e0", agent_type: "general-purpose" },
    );
    const { code, posts } = await run("PostToolUse", stdin);
    expect(code).toBe(0);
    expect(posts).toEqual([]);
  });

  it("still posts a main-loop event whose tool_input holds an agent_id", async () => {
    const stdin = payload("PostToolUse", {
      tool_name: "Agent",
      tool_input: { agent_id: "x", prompt: 'a "agent_id":"y" string' },
      tool_response: { agent_id: "z" },
    });
    const { posts } = await run("PostToolUse", stdin);
    expect(posts.map((post) => JSON.parse(post.body).tool_name)).toEqual(["Agent"]);
  });

  it("is not fooled by an agent_id inside a prompt string", async () => {
    const prompt = 'say ","agent_id":"x", and {"agent_id":"y"}';
    const { posts } = await run("UserPromptSubmit", payload("UserPromptSubmit", { prompt }));
    expect(posts).toHaveLength(1);
  });

  it("keeps an MCP tool name and leaves out one that is capped or escaped", async () => {
    const tool = async (name: string) => {
      const { posts } = await run("PostToolUse", payload("PostToolUse", { tool_name: name }));
      return JSON.parse(posts[0].body).tool_name;
    };
    expect(await tool("mcp__srv__do.thing")).toBe("mcp__srv__do.thing");
    expect(await tool("t".repeat(65))).toBeUndefined();
    expect(await tool('bad"name')).toBeUndefined();
    expect(await tool("é")).toBeUndefined();
  });

  it("reads a payload split across lines", async () => {
    const stdin = payload("PostToolUse", BASH).replace(/,/g, ",\n");
    const { posts } = await run("PostToolUse", stdin);
    expect(posts).toHaveLength(1);
  });

  it("works under an inherited set -u", async () => {
    const { posts } = await run("PostToolUse", payload("PostToolUse", BASH), ["-u"]);
    expect(posts).toHaveLength(1);
  });

  it("forwards stdin untouched for an event it forwards today", async () => {
    const stdin = payload("Stop", { last_assistant_message: "done" });
    const { posts } = await run("Stop", stdin);
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toBe(stdin);
  });

  it("counts only Deck posts: a probe of its port, as a running Deck's dev-server scanner makes, is ignored", async () => {
    const { posts, port } = await startListener();
    await new Promise<void>((done) => {
      http
        .request({ host: "127.0.0.1", port, method: "HEAD", path: "/", agent: false }, (res) => {
          res.resume();
          res.on("end", done);
        })
        .end();
    });
    expect(posts).toEqual([]);
  });

  it("posts straight to the loopback listener whatever proxy the environment names", async () => {
    const dead = "http://127.0.0.1:1";
    const proxy = { http_proxy: dead, HTTP_PROXY: dead, ALL_PROXY: dead, all_proxy: dead };
    for (const [event, stdin] of [
      ["PostToolUse", payload("PostToolUse", BASH)], // the bounded post
      ["Stop", payload("Stop")], // the forwarded post
    ] as const) {
      const { posts, port } = await startListener();
      const env = {
        DECK_PANE_ID: "7",
        DECK_HOOK_TOKEN: "secret",
        DECK_HOOK_PORT: String(port),
        ...proxy,
      };
      await runHookScript(hookScriptSource(), { env, event, stdin });
      expect(posts, event).toHaveLength(1);
    }
  });
});

/** Run the script with `env` as the whole environment, answering its exit code and stdout. */
function runCapturingStdout(env: Record<string, string>, event: string, stdin: string) {
  return new Promise<{ code: number | null; stdout: string }>((resolve, reject) => {
    const child = spawn("/bin/sh", ["-c", hookScriptSource(), "deck-hook.sh", event], { env });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout }));
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}

// A `write-out` in the user's ~/.curlrc would print to stdout, which Claude adds to the
// conversation on these two events, and a `proxy` there would receive the pane token.
describe.skipIf(process.platform === "win32")("claude hook script — the user's ~/.curlrc", () => {
  const scratch: string[] = [];
  afterEach(async () => {
    await Promise.all(scratch.splice(0).map((dir) => fs.rm(dir, { recursive: true })));
  });

  /** A fake HOME, Deck's listener and a proxy listener that should never be reached. */
  async function setup() {
    const home = await fs.mkdtemp(path.join(os.tmpdir(), "deck-hook-curlrc-"));
    scratch.push(home);
    const deck = await startListener();
    const proxy = await startListener();
    const env = {
      PATH: "/usr/bin:/bin",
      HOME: home,
      DECK_PANE_ID: "7",
      DECK_HOOK_TOKEN: "secret",
      DECK_HOOK_PORT: String(deck.port),
      NO_PROXY: "",
      no_proxy: "",
    };
    return { deck, proxy, env, proxyUrl: `http://127.0.0.1:${proxy.port}` };
  }

  // One bounded and one forwarded event: each path runs its own curl.
  const EVENTS = [
    ["UserPromptSubmit", payload("UserPromptSubmit", { prompt: "hi" })],
    ["SessionStart", payload("SessionStart", { source: "startup" })],
  ];

  it.each(EVENTS)("ignores ~/.curlrc and prints nothing on %s", async (event, stdin) => {
    const { deck, proxy, env, proxyUrl } = await setup();
    await fs.writeFile(
      path.join(env.HOME, ".curlrc"),
      `write-out = "INJECTED %{http_code}\\n"\nproxy = ${proxyUrl}\n`,
    );
    expect(await runCapturingStdout(env, event, stdin)).toEqual({ code: 0, stdout: "" });
    expect(proxy.posts).toEqual([]);
    expect(deck.posts).toHaveLength(1);
  });
});
