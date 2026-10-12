import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hookScriptSource } from "./claude-hooks-file";
import { codexHookScript } from "./codex-integration";

const scratch: string[] = [];
const listeners: http.Server[] = [];
afterEach(async () => {
  await Promise.all(listeners.splice(0).map((l) => new Promise((done) => l.close(done))));
  await Promise.all(scratch.splice(0).map((dir) => fs.rm(dir, { recursive: true })));
});

/** A listener that counts the posts it gets; the scripts under test post to it. */
async function listener() {
  const posts: string[] = [];
  const server = http.createServer((request, response) => {
    request.on("data", () => {});
    request.on("end", () => {
      posts.push(request.url ?? "");
      response.statusCode = 204;
      response.end();
    });
  });
  listeners.push(server);
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  return { posts, port: (server.address() as AddressInfo).port };
}

/**
 * Run a script under `/bin/sh` with a minimal env. It never inherits the shell's: that one
 * carries a live Deck's DECK_PANE_ID / DECK_HOOK_TOKEN / DECK_HOOK_PORT.
 */
async function runScript(source: string, env: Record<string, string>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deck-nesting-test-"));
  scratch.push(dir);
  const file = path.join(dir, "hook.sh");
  await fs.writeFile(file, source, { mode: 0o700 });
  return new Promise<number | null>((resolve, reject) => {
    const child = spawn("/bin/sh", [file, "Stop"], {
      env: { PATH: "/usr/bin:/bin", ...env },
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("error", reject);
    child.on("close", resolve);
    // A guard that exits early never reads stdin; that EPIPE is the case under test.
    child.stdin.on("error", () => {});
    child.stdin.end(JSON.stringify({ hook_event_name: "Stop", session_id: "s-1" }));
  });
}

const cases = [
  { agent: "claude", source: hookScriptSource(), path: "/hook" },
  { agent: "codex", source: codexHookScript(), path: "/hook/codex" },
] as const;

describe.skipIf(process.platform === "win32").each(cases)(
  "$agent hook script — nesting filter",
  ({ agent, source, path: endpoint }) => {
    const paneEnv = (port: number) => ({
      DECK_PANE_ID: "7",
      DECK_HOOK_TOKEN: "secret",
      DECK_HOOK_PORT: String(port),
    });

    it("posts exactly once from a plain pane env", async () => {
      const { posts, port } = await listener();
      expect(await runScript(source, paneEnv(port))).toBe(0);
      expect(posts).toEqual([endpoint]);
    });

    it("posts once when the pane's agent identity is its own", async () => {
      const { posts, port } = await listener();
      await runScript(source, { ...paneEnv(port), DECK_AGENT_ID: agent });
      expect(posts).toEqual([endpoint]);
    });

    it("sends nothing from a nested agent", async () => {
      const { posts, port } = await listener();
      const env = { ...paneEnv(port), DECK_AGENT_ID: agent, DECK_AGENT_NESTED: "1" };
      expect(await runScript(source, env)).toBe(0);
      expect(posts).toEqual([]);
    });

    it("sends nothing when the pane's identity is another agent", async () => {
      const { posts, port } = await listener();
      const other = agent === "claude" ? "codex" : "claude";
      expect(await runScript(source, { ...paneEnv(port), DECK_AGENT_ID: other })).toBe(0);
      expect(posts).toEqual([]);
    });
  },
);
