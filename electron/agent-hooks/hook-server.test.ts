import { afterEach, describe, expect, it } from "vitest";
import { createHookServer, type HookEventPayload, type HookServer } from "./hook-server";

const TOKEN = "0123456789abcdef0123456789abcdef";
const servers: HookServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function start() {
  const events: HookEventPayload[] = [];
  const server = createHookServer({
    tokenFor: (paneId) => (paneId === 7 ? TOKEN : null),
    emitToOwner: (_paneId, payload) => events.push(payload),
    log: () => {},
  });
  servers.push(server);
  const port = await server.listen();
  const post = async (agent: "claude" | "codex", event: string, sessionId: string) => {
    const response = await fetch(
      `http://127.0.0.1:${port}${agent === "codex" ? "/hook/codex" : "/hook"}`,
      {
        method: "POST",
        headers: { "x-deck-pane": "7", "x-deck-token": TOKEN },
        body: JSON.stringify({ hook_event_name: event, session_id: sessionId, turn_id: "t-1" }),
      },
    );
    expect(response.status).toBe(204);
  };
  return { server, events, post };
}

describe("hook server — generation per pane and agent", () => {
  it("a Codex SessionStart does not evict the pane's Claude occupant", async () => {
    const { events, post } = await start();
    await post("claude", "SessionStart", "claude-1");
    await post("codex", "SessionStart", "codex-1");
    await post("claude", "Stop", "claude-1");
    expect(events.map((e) => [e.agent, e.event])).toEqual([
      ["claude", "SessionStart"],
      ["codex", "SessionStart"],
      ["claude", "Stop"],
    ]);
  });

  it("still drops a previous occupant of the same agent", async () => {
    const { events, post } = await start();
    await post("claude", "SessionStart", "claude-1");
    await post("claude", "SessionStart", "claude-2");
    await post("claude", "Stop", "claude-1");
    expect(events.map((e) => e.sessionId)).toEqual(["claude-1", "claude-2"]);
  });

  it("forgetPane clears every agent's generation for the pane", async () => {
    const { server, events, post } = await start();
    await post("claude", "SessionStart", "claude-1");
    await post("codex", "SessionStart", "codex-1");
    server.forgetPane(7);
    // With no memory, a first post is accepted whatever its session.
    await post("claude", "Stop", "claude-2");
    await post("codex", "Stop", "codex-2");
    expect(events.slice(2).map((e) => [e.agent, e.sessionId])).toEqual([
      ["claude", "claude-2"],
      ["codex", "codex-2"],
    ]);
  });
});
