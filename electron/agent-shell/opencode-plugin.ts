/**
 * Deck's opencode plugin (OC1, slice 4 of the agent-status queue). opencode loads every
 * file in `<OPENCODE_CONFIG_DIR>/plugin/`; the opencode wrapper points that variable at
 * Deck's directory only while opencode Signals is on. The plugin runs INSIDE opencode, so it
 * is as small as it can be (RISK4): it reads the pane's `DECK_*` credentials from the
 * environment, speaks only to `127.0.0.1`, never shells out, and sends two fields plus a
 * capped error message.
 *
 * It writes the POST on a raw `node:net` socket, not `fetch` or `node:http`: both honour
 * `HTTP_PROXY` inside opencode, which would send the pane's token to the user's proxy instead
 * of loopback and lose the signal (verified on opencode 1.18.34). Header values are checked
 * against a strict pattern first, so nothing from the environment can inject a header.
 *
 * The shape follows Superset's plugin: only the pane's root session speaks (a child session
 * is a subagent, SUB1), Start and Stop fire on idle/busy transitions, and events are posted
 * in arrival order.
 *
 * Two differences from Superset:
 * - Deck's generation check refuses a non-`SessionStart` post for a session other than the
 *   pane's current one, so every `Start` is preceded by a `SessionStart` for its session.
 * - The event hook returns before the post finishes. opencode never waits on Deck, and a
 *   failed post is dropped.
 *
 * The wire names are the seven `OPENCODE_HOOK_EVENTS` in `hook-request.ts`.
 */

export const OPENCODE_PLUGIN_FILE = "deck-signals.js";

/** Longest error message the plugin sends; the endpoint caps it again. */
const ERROR_MESSAGE_MAX = 500;
const POST_TIMEOUT_MS = 2000;

export function opencodePluginSource(): string {
  return `// SpaceVibe Deck opencode plugin - reports this pane's session state to Deck on 127.0.0.1.
// Written by Deck; edits are overwritten at the next launch.
import net from "node:net";

function signals(lookup) {
  const env = process.env;
  // Read once at load: the credentials of the pane opencode was started in.
  const pane = env.DECK_PANE_ID || "";
  const token = env.DECK_HOOK_TOKEN || "";
  const port = env.DECK_HOOK_PORT || "";
  // A nested opencode (one an agent started from its tool calls) never speaks for the pane.
  if (
    !/^[0-9]{1,10}$/.test(pane) ||
    !/^[A-Za-z0-9._-]{1,200}$/.test(token) ||
    !/^[0-9]{1,5}$/.test(port) ||
    Number(port) < 1 || Number(port) > 65535 ||
    env.DECK_AGENT_NESTED ||
    env.DECK_AGENT_ID !== "opencode"
  ) {
    return null;
  }
  let active = true;
  const sockets = new Set();
  const post = (name, sessionID, message) =>
    new Promise((resolve) => {
      if (!active) return resolve();
      const body = JSON.stringify({
        hook_event_name: name,
        session_id: String(sessionID).slice(0, 128),
        ...(typeof message === "string" && message.trim()
          ? { message: message.slice(0, ${ERROR_MESSAGE_MAX}) }
          : {}),
      });
      const head =
        "POST /hook/opencode HTTP/1.1\\r\\nHost: 127.0.0.1\\r\\nX-Deck-Pane: " + pane +
        "\\r\\nX-Deck-Token: " + token +
        "\\r\\nContent-Type: application/json\\r\\nContent-Length: " + Buffer.byteLength(body) +
        "\\r\\nConnection: close\\r\\n\\r\\n";
      // Best effort: Deck being gone, slow or refusing must never reach opencode.
      const socket = net.connect({ host: "127.0.0.1", port: Number(port) });
      sockets.add(socket);
      socket.setTimeout(${POST_TIMEOUT_MS}, () => socket.destroy());
      socket.on("error", () => {});
      socket.on("close", () => { sockets.delete(socket); resolve(); });
      socket.on("connect", () => { if (active) socket.end(head + body); else socket.destroy(); });
      socket.resume();
    });

  let state = "idle"; // "idle" | "busy"
  let root = null; // the pane's root session

  // Deck drops a post for a session it has not been told is current, and it can miss a post
  // (Signals switched off for a while), so every turn names its session first. Repeating it
  // for the current session is accepted.
  const announce = (id) => post("SessionStart", id);

  // A session is a child (subagent) when it has a parent. Unknown counts as a child, so a
  // failed lookup can never make a subagent speak for the pane.
  const childCache = new Map();
  const isChild = async (id) => {
    if (childCache.has(id)) return childCache.get(id);
    try {
      const session = await lookup(id);
      if (!session) return true;
      childCache.set(id, Boolean(session.parentID));
      return childCache.get(id);
    } catch {
      return true;
    }
  };

  const handleBusy = async (id) => {
    // A busy root after an idle turn is a conversation switch; creating or deleting another
    // session is not.
    if (!root || state === "idle") root = id;
    if (id !== root || state !== "idle") return;
    state = "busy";
    await announce(id);
    await post("Start", id);
  };

  const handleStop = async (id, failed, message) => {
    if (id !== root || state !== "busy") return;
    state = "idle";
    await post(failed ? "Failed" : "Stop", id, message);
  };

  const handleAsk = async (id) => {
    if (id === root) await post("PermissionRequest", id);
  };

  // Events can arrive while an earlier post is in flight; keep them in arrival order.
  let pending = Promise.resolve();
  const enqueue = (handle) => {
    pending = pending.then(() => active ? handle() : undefined).catch(() => {});
  };

  // The only events that can change what Deck shows; everything else is skipped before any
  // session lookup, so a streaming reply costs nothing.
  const SPOKEN = new Set([
    "permission.asked",
    "question.asked",
    "permission.replied",
    "question.replied",
    "question.rejected",
    "session.status",
    "session.busy",
    "session.idle",
    "session.error",
  ]);

  const onEvent = async (event) => {
    const properties = event.properties || {};
    const id = properties.sessionID ?? properties.info?.id;
    if (!id) return;

    if (event.type === "session.created") {
      const child = Boolean(properties.info?.parentID);
      childCache.set(id, child);
      if (child) return;
      if (!root) root = id;
      if (id === root) await announce(id);
      return;
    }
    if (event.type === "session.deleted") {
      childCache.delete(id);
      if (id !== root) return;
      root = null;
      state = "idle";
      await post("SessionEnd", id);
      return;
    }
    if (!SPOKEN.has(event.type) || (await isChild(id))) return;

    switch (event.type) {
      case "permission.asked":
      case "question.asked":
        return handleAsk(id);
      case "permission.replied":
      case "question.replied":
      case "question.rejected":
        if (id === root) await post("PermissionReplied", id);
        return;
      case "session.status":
        if (properties.status?.type === "busy") return handleBusy(id);
        if (properties.status?.type === "idle") return handleStop(id, false);
        return;
      case "session.busy":
        return handleBusy(id);
      case "session.idle":
        return handleStop(id, false);
      case "session.error":
        return handleStop(id, true, properties.error?.data?.message ?? properties.error?.message);
    }
  };

  return {
    dispose: () => {
      active = false;
      for (const socket of sockets) socket.destroy();
      childCache.clear();
    },
    event: ({ event }) => {
      enqueue(() => onEvent(event));
    },
    // Older opencode versions call this instead of publishing permission.asked.
    "permission.ask": (permission, output) => {
      enqueue(async () => {
        const id = permission?.sessionID ?? root;
        if (output?.status === "ask" && id && !(await isChild(id))) await handleAsk(id);
      });
    },
  };
}

// V1 >= 1.18.29 calls server(); V2 calls setup(). No runtime package import is needed.
export default {
  id: "deck-signals",
  async server({ client }) {
    return signals(async (id) => {
      const sessions = await client?.session?.list?.();
      return sessions?.data?.find((session) => session.id === id);
    }) || {};
  },
  setup(ctx) {
    const hooks = signals((sessionID) => ctx.session.get({ sessionID }));
    if (!hooks) return;
    const controller = new AbortController();
    const seen = new Set();
    const types = {
      "session.execution.started": "session.busy",
      "session.execution.succeeded": "session.idle",
      "session.execution.interrupted": "session.idle",
      "session.execution.failed": "session.error",
      "form.created": "question.asked",
      "form.replied": "question.replied",
      "form.cancelled": "question.rejected",
      "permission.asked": "permission.asked",
      "permission.replied": "permission.replied",
      "session.created": "session.created",
      "session.deleted": "session.deleted",
    };
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (controller.signal.aborted) break;
          const type = types[event.type];
          if (!type) continue;
          // Public event IDs dedupe replayed delivery without retaining an unbounded history.
          if (event.id) {
            if (seen.has(event.id)) continue;
            seen.add(event.id);
            if (seen.size > 256) seen.delete(seen.values().next().value);
          }
          const data = event.data || {};
          hooks.event({ event: { type, properties: {
            sessionID: data.sessionID ?? data.form?.sessionID,
            ...(type === "session.created" ? { info: { id: data.sessionID, parentID: data.parentID } } : {}),
            error: data.error,
          } } });
        }
      } catch {
        // Abort and server shutdown are normal; subscription failures remain best effort.
      }
    })();
    return () => { hooks.dispose(); controller.abort(); seen.clear(); };
  },
};
`;
}
