/**
 * The one-shot loopback listener a sign-in redirects back to (A4, A5; RFC 8252
 * §7.3).
 *
 * It binds `127.0.0.1` on an OS-chosen port and accepts exactly `GET
 * /auth/callback` carrying a `code` or an `error`. Everything else — Deck's own
 * dev-server discovery sends `HEAD /` to every loopback port, and any local
 * process may send anything — gets a 404 and leaves the flow open. Query values
 * are never reflected: both pages are fixed text.
 *
 * The listener outlives the callback only until the owner of the flow has
 * answered the browser (`respond`), so the page can say whether the exchange
 * really worked. It closes on a result, on `cancel`, and after the timeout, and
 * no port stays bound once `result` has settled.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { CALLBACK_PATH } from "./model";

export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export type CallbackResult =
  /** The browser came back with an authorization code. */
  | { readonly kind: "code"; readonly code: string; respond(succeeded: boolean): void }
  /** The provider sent the browser back with an error. */
  | { readonly kind: "error"; readonly denied: boolean }
  | { readonly kind: "timeout" }
  | { readonly kind: "cancelled" };

export interface CallbackListener {
  /** `http://127.0.0.1:<port>/auth/callback`, the `redirectTo` for the flow. */
  readonly redirectTo: string;
  /** Settles once, with how the flow ended; the port is closed by then. */
  readonly result: Promise<CallbackResult>;
  cancel(): void;
}

const PAGE_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
  "x-content-type-options": "nosniff",
  connection: "close",
} as const;

function page(message: string): string {
  return `<!doctype html><meta charset="utf-8"><title>SpaceVibe Deck</title><style>body{font:16px system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#222}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}}</style><p>${message}</p>`;
}

const PAGES = {
  ok: page("Signed in. You can close this tab and return to Deck."),
  failed: page("Sign-in did not complete. You can close this tab and return to Deck."),
};

function reply(response: http.ServerResponse, status: number, body: string): void {
  response.writeHead(status, PAGE_HEADERS);
  response.end(body);
}

export async function startCallbackListener(deps: {
  readonly timers: Timers;
  readonly timeoutMs: number;
}): Promise<CallbackListener> {
  let settle!: (result: CallbackResult) => void;
  const result = new Promise<CallbackResult>((resolve) => {
    settle = resolve;
  });
  let settled = false;
  let timeout: unknown = null;
  let port = 0;

  const server = http.createServer((request, response) => {
    const host = request.headers.host ?? "";
    // A rebinding page reaches us under its own name; only our literal address
    // is the browser the flow opened.
    if (settled || host !== `127.0.0.1:${port}`) {
      reply(response, 404, "");
      return;
    }
    let url: URL;
    try {
      url = new URL(request.url ?? "/", `http://${host}`);
    } catch {
      reply(response, 400, "");
      return;
    }
    if (request.method !== "GET" || url.pathname !== CALLBACK_PATH) {
      reply(response, 404, "");
      return;
    }
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (error === null && (code === null || code === "")) {
      // Neither outcome: a probe, not the redirect. Keep waiting.
      reply(response, 400, PAGES.failed);
      return;
    }
    if (error !== null) {
      reply(response, 200, PAGES.failed);
      finish({ kind: "error", denied: error === "access_denied" });
      return;
    }
    finish({
      kind: "code",
      code: code as string,
      respond: (succeeded) => reply(response, 200, succeeded ? PAGES.ok : PAGES.failed),
    });
  });

  function finish(outcome: CallbackResult): void {
    if (settled) {
      return;
    }
    settled = true;
    if (timeout !== null) {
      deps.timers.clearTimeout(timeout);
    }
    // Stop accepting at once. A page already being written ends itself
    // (`connection: close`); the code response stays open until `respond`.
    server.close();
    server.closeIdleConnections();
    settle(outcome);
  }

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
  port = (server.address() as AddressInfo).port;
  // A listener that fails after it started has nobody to tell; end the flow.
  server.on("error", () => finish({ kind: "cancelled" }));
  timeout = deps.timers.setTimeout(() => finish({ kind: "timeout" }), deps.timeoutMs);

  return {
    redirectTo: `http://127.0.0.1:${port}${CALLBACK_PATH}`,
    result,
    cancel: () => finish({ kind: "cancelled" }),
  };
}
