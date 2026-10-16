import http from "node:http";
import net, { type AddressInfo } from "node:net";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { OPENCODE_PLUGIN_FILE, opencodePluginSource } from "./opencode-plugin";

const ROOT = mkdtempSync(path.join(tmpdir(), "deck-opencode-plugin-"));
/** What `client.session.list()` knows by default: two root sessions, found by lookup. */
const ROOTS = [{ id: "ses_a" }, { id: "ses_b" }];
const EXPORT = "export const DeckSignalsPlugin = ";

interface Post {
  readonly pane: string;
  readonly token: string;
  readonly path: string;
  readonly body: Record<string, unknown>;
}

interface Hooks {
  readonly event?: (input: { event: unknown }) => unknown;
  readonly "permission.ask"?: (permission: unknown, output: unknown) => unknown;
}

/** Counts only the POSTs that carry the pane header: a running Deck probes loopback with HEAD. */
const posts: Post[] = [];
let listener: http.Server;
let port: number;

beforeAll(async () => {
  listener = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const pane = request.headers["x-deck-pane"];
      if (request.method === "POST" && typeof pane === "string") {
        posts.push({
          pane,
          token: String(request.headers["x-deck-token"]),
          path: request.url ?? "",
          body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
        });
      }
      response.statusCode = 204;
      response.end();
    });
  });
  await new Promise<void>((resolve) => listener.listen(0, "127.0.0.1", resolve));
  port = (listener.address() as AddressInfo).port;
});
afterAll(async () => {
  await new Promise((resolve) => listener.close(resolve));
  rmSync(ROOT, { recursive: true, force: true });
});
afterEach(() => {
  posts.length = 0;
});

const DECK_ENV: Record<string, string | undefined> = {
  DECK_PANE_ID: "7",
  DECK_HOOK_TOKEN: "tok-7",
  DECK_AGENT_ID: "opencode",
  DECK_AGENT_NESTED: undefined,
};

// vite-node cannot import a file outside the project, so the source is evaluated as written
// minus its import (`net` is passed in) and `export`; a separate test checks that the file parses as an ES module.
/** Load the plugin as opencode would, with the pane's environment at that moment only. */
async function load(
  env: Record<string, string | undefined> = {},
  sessions: { id: string; parentID?: string }[] = [...ROOTS],
): Promise<Hooks> {
  const merged = { ...DECK_ENV, DECK_HOOK_PORT: String(port), ...env };
  const saved = Object.fromEntries(Object.keys(merged).map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    const source = opencodePluginSource();
    const plugin = new Function(
      "net",
      `return ${source.slice(source.indexOf(EXPORT) + EXPORT.length)}`,
    )(net);
    return await plugin({
      client: { session: { list: async () => ({ data: sessions }) } },
    });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const status = (sessionID: string, type: string) => ({
  type: "session.status",
  properties: { sessionID, status: { type } },
});
const created = (id: string, parentID?: string) => ({
  type: "session.created",
  properties: { info: { id, ...(parentID ? { parentID } : {}) } },
});
const ask = (type: string, sessionID: string) => ({ type, properties: { sessionID } });

/** Feed events and wait until the posts stop arriving; they go out in arrival order. */
async function feed(hooks: Hooks, events: unknown[]): Promise<string[]> {
  for (const event of events) hooks.event?.({ event });
  await settle();
  return posts.map((post) => `${post.body.hook_event_name}:${post.body.session_id}`);
}

async function settle(): Promise<void> {
  for (let quiet = 0, seen = -1; quiet < 3;) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    quiet = posts.length === seen ? quiet + 1 : 0;
    seen = posts.length;
  }
}

async function waitFor(done: () => boolean): Promise<void> {
  for (let tries = 0; tries < 200 && !done(); tries++) await new Promise((r) => setTimeout(r, 10));
  expect(done()).toBe(true);
}

describe("opencode plugin — guard (RISK4)", () => {
  it.each([
    ["no pane", { DECK_PANE_ID: undefined }],
    ["a pane id that could inject a header", { DECK_PANE_ID: "7\r\nX-Evil: 1" }],
    ["a token that could inject a header", { DECK_HOOK_TOKEN: "tok\r\nX-Evil: 1" }],
    ["no token", { DECK_HOOK_TOKEN: undefined }],
    ["no port", { DECK_HOOK_PORT: undefined }],
    ["a port that is not a number", { DECK_HOOK_PORT: "80/evil" }],
    ["a nested opencode", { DECK_AGENT_NESTED: "1" }],
    ["another agent's pane", { DECK_AGENT_ID: "claude" }],
    ["a pane with no agent", { DECK_AGENT_ID: undefined }],
  ])("loads inert for %s", async (_label, env) => {
    expect(await load(env)).toEqual({});
  });

  it("is a valid ES module under the file name opencode scans", () => {
    const file = path.join(ROOT, OPENCODE_PLUGIN_FILE.replace(/\.js$/, ".mjs"));
    writeFileSync(file, opencodePluginSource());
    expect(() => execFileSync(process.execPath, ["--check", file])).not.toThrow();
    expect(opencodePluginSource()).toContain(EXPORT);
  });

  it("speaks only to 127.0.0.1, with the pane's headers", async () => {
    const source = opencodePluginSource();
    expect(source.match(/host: "[^"]*"/g)).toEqual(['host: "127.0.0.1"']);
    expect(source).not.toMatch(/https?:\/\/|fetch\(|child_process|\$`|Bun\.spawn|require\(/);
    const hooks = await load();
    await feed(hooks, [status("ses_a", "busy")]);
    expect(posts.every((post) => post.pane === "7" && post.token === "tok-7")).toBe(true);
    expect(posts.every((post) => post.path === "/hook/opencode")).toBe(true);
  });

  it("returns from the event hook before the post finishes", async () => {
    const hooks = await load();
    expect(hooks.event?.({ event: status("ses_a", "busy") })).toBeUndefined();
    await waitFor(() => posts.length === 2);
  });
});

describe("opencode plugin — root session events", () => {
  it("posts SessionStart, Start and Stop for a root's busy/idle turn", async () => {
    const hooks = await load();
    expect(
      await feed(hooks, [created("ses_a"), status("ses_a", "busy"), status("ses_a", "idle")]),
    ).toEqual(["SessionStart:ses_a", "SessionStart:ses_a", "Start:ses_a", "Stop:ses_a"]);
  });

  it("names the session before every Start, and dedupes repeated edges", async () => {
    const hooks = await load();
    expect(
      await feed(hooks, [
        status("ses_a", "busy"),
        { type: "session.busy", properties: { sessionID: "ses_a" } },
        status("ses_a", "idle"),
        { type: "session.idle", properties: { sessionID: "ses_a" } },
        status("ses_a", "busy"),
      ]),
    ).toEqual([
      "SessionStart:ses_a",
      "Start:ses_a",
      "Stop:ses_a",
      "SessionStart:ses_a",
      "Start:ses_a",
    ]);
  });

  it("posts nothing for a child session, however it is learned to be one", async () => {
    const hooks = await load({}, [...ROOTS, { id: "ses_listed", parentID: "ses_a" }]);
    expect(
      await feed(hooks, [
        created("ses_child", "ses_a"),
        status("ses_child", "busy"),
        status("ses_child", "idle"),
        status("ses_listed", "busy"),
        ask("permission.asked", "ses_listed"),
        status("ses_unknown", "busy"),
        ask("question.asked", "ses_unknown"),
        { type: "session.deleted", properties: { info: { id: "ses_child" } } },
      ]),
    ).toEqual([]);
  });

  it("posts PermissionRequest for permission.asked and question.asked, and PermissionReplied", async () => {
    const hooks = await load();
    expect(
      await feed(hooks, [
        status("ses_a", "busy"),
        ask("permission.asked", "ses_a"),
        ask("permission.replied", "ses_a"),
        ask("question.asked", "ses_a"),
      ]),
    ).toEqual([
      "SessionStart:ses_a",
      "Start:ses_a",
      "PermissionRequest:ses_a",
      "PermissionReplied:ses_a",
      "PermissionRequest:ses_a",
    ]);
  });

  it("ends an ask when a question is answered or dismissed, root only", async () => {
    const hooks = await load({}, [...ROOTS, { id: "ses_child", parentID: "ses_a" }]);
    expect(
      await feed(hooks, [
        status("ses_a", "busy"),
        ask("question.asked", "ses_a"),
        ask("question.replied", "ses_a"),
        ask("question.asked", "ses_a"),
        ask("question.rejected", "ses_a"),
        ask("question.replied", "ses_child"),
        ask("question.rejected", "ses_b"),
      ]),
    ).toEqual([
      "SessionStart:ses_a",
      "Start:ses_a",
      "PermissionRequest:ses_a",
      "PermissionReplied:ses_a",
      "PermissionRequest:ses_a",
      "PermissionReplied:ses_a",
    ]);
  });

  it("answers the legacy permission.ask callback with PermissionRequest", async () => {
    const hooks = await load();
    await feed(hooks, [status("ses_a", "busy")]);
    posts.length = 0;
    await hooks["permission.ask"]?.({ sessionID: "ses_a" }, { status: "ask" });
    await waitFor(() => posts.length === 1);
    expect(posts[0].body.hook_event_name).toBe("PermissionRequest");
  });

  it("posts Failed with a capped message when a busy root errors, and not when idle", async () => {
    const hooks = await load();
    await feed(hooks, [
      {
        type: "session.error",
        properties: { sessionID: "ses_a", error: { data: { message: "x" } } },
      },
      status("ses_a", "busy"),
      {
        type: "session.error",
        properties: { sessionID: "ses_a", error: { data: { message: "m".repeat(5000) } } },
      },
    ]);
    const failed = posts.filter((post) => post.body.hook_event_name === "Failed");
    expect(failed).toHaveLength(1);
    expect(String(failed[0].body.message)).toHaveLength(500);
    expect(Object.keys(failed[0].body).sort()).toEqual([
      "hook_event_name",
      "message",
      "session_id",
    ]);
  });

  it("posts SessionEnd for the root being deleted, and then adopts the next one", async () => {
    const hooks = await load();
    expect(
      await feed(hooks, [
        status("ses_a", "busy"),
        { type: "session.deleted", properties: { info: { id: "ses_a" } } },
        status("ses_b", "busy"),
      ]),
    ).toEqual([
      "SessionStart:ses_a",
      "Start:ses_a",
      "SessionEnd:ses_a",
      "SessionStart:ses_b",
      "Start:ses_b",
    ]);
  });
});

describe("opencode plugin — root switch (SUB1)", () => {
  it("announces a new root with SessionStart before its Start, A -> B -> A", async () => {
    const hooks = await load();
    expect(
      await feed(hooks, [
        status("ses_a", "busy"),
        status("ses_a", "idle"),
        created("ses_b"),
        status("ses_b", "busy"),
        status("ses_b", "idle"),
        status("ses_a", "busy"),
      ]),
    ).toEqual([
      "SessionStart:ses_a",
      "Start:ses_a",
      "Stop:ses_a",
      "SessionStart:ses_b",
      "Start:ses_b",
      "Stop:ses_b",
      "SessionStart:ses_a",
      "Start:ses_a",
    ]);
  });

  it("re-announces the current session at every turn, so a missed SessionStart cannot strand it", async () => {
    const hooks = await load();
    const sent = await feed(hooks, [
      status("ses_a", "busy"),
      status("ses_a", "idle"),
      status("ses_b", "busy"),
      status("ses_b", "idle"),
      status("ses_b", "busy"),
      status("ses_b", "idle"),
    ]);
    // Whatever subset of these posts Deck received, a Start is never the first post it sees
    // for its session: the SessionStart for that session comes immediately before it.
    sent.forEach((post, index) => {
      if (post.startsWith("Start:")) {
        expect(sent[index - 1]).toBe(`SessionStart:${post.slice("Start:".length)}`);
      }
    });
    expect(sent.filter((post) => post.startsWith("Start:"))).toHaveLength(3);
  });

  it("ignores another root's events while the current root is busy", async () => {
    const hooks = await load();
    expect(
      await feed(hooks, [
        status("ses_a", "busy"),
        status("ses_b", "busy"),
        status("ses_b", "idle"),
        ask("permission.asked", "ses_b"),
        status("ses_a", "idle"),
      ]),
    ).toEqual(["SessionStart:ses_a", "Start:ses_a", "Stop:ses_a"]);
  });
});
