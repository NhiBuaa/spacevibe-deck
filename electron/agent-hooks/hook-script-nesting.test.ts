import { afterEach, describe, expect, it } from "vitest";
import { hookScriptSource } from "./claude-hooks-file";
import { codexHookScript } from "./codex-integration";
import { cleanupHookHarness, runHookScript, startListener } from "./hook-script-harness";

afterEach(cleanupHookHarness);

/** The posted URLs of a listener's recorded posts. */
const urls = (posts: readonly { url: string }[]) => posts.map((post) => post.url);

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
      const { posts, port } = await startListener();
      expect(await runHookScript(source, { env: paneEnv(port) })).toBe(0);
      expect(urls(posts)).toEqual([endpoint]);
    });

    it("posts once when the pane's agent identity is its own", async () => {
      const { posts, port } = await startListener();
      await runHookScript(source, { env: { ...paneEnv(port), DECK_AGENT_ID: agent } });
      expect(urls(posts)).toEqual([endpoint]);
    });

    it("sends nothing from a nested agent", async () => {
      const { posts, port } = await startListener();
      const env = { ...paneEnv(port), DECK_AGENT_ID: agent, DECK_AGENT_NESTED: "1" };
      expect(await runHookScript(source, { env })).toBe(0);
      expect(urls(posts)).toEqual([]);
    });

    // `sh -u` is `set -u`; SHELLOPTS is how a user's exported `set -u` reaches a child sh.
    describe.each([
      ["sh -u", { flags: ["-u"], env: {} }],
      ["SHELLOPTS=nounset", { flags: [], env: { SHELLOPTS: "nounset" } }],
    ])("under %s", (_label, { flags, env: extra }) => {
      it("still posts exactly once from a plain pane env", async () => {
        const { posts, port } = await startListener();
        expect(
          await runHookScript(source, { env: { ...paneEnv(port), ...extra }, shellFlags: flags }),
        ).toBe(0);
        expect(urls(posts)).toEqual([endpoint]);
      });

      it("still sends nothing from a nested agent", async () => {
        const { posts, port } = await startListener();
        const env = { ...paneEnv(port), ...extra, DECK_AGENT_ID: agent, DECK_AGENT_NESTED: "1" };
        expect(await runHookScript(source, { env, shellFlags: flags })).toBe(0);
        expect(urls(posts)).toEqual([]);
      });
    });

    it("sends nothing when the pane's identity is another agent", async () => {
      const { posts, port } = await startListener();
      const other = agent === "claude" ? "codex" : "claude";
      expect(await runHookScript(source, { env: { ...paneEnv(port), DECK_AGENT_ID: other } })).toBe(
        0,
      );
      expect(urls(posts)).toEqual([]);
    });
  },
);
