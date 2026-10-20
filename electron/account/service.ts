/**
 * The account service: one optional Google account, owned by main
 * (docs/specs/2026-10-20-accounts.md).
 *
 * Why it looks the way it does:
 *
 *  - **Lazy client (A3).** supabase-js is built only when a stored session
 *    exists or a sign-in starts, so a signed-out Deck sends no request at all.
 *    Signing out drops the client again.
 *  - **Tokens never leave (A7).** `state()` and every broadcast are the display
 *    union and nothing else.
 *  - **Local first (A11).** Sign-out clears the local session before the
 *    best-effort server revoke, because supabase-js keeps the session when its
 *    own revoke fails, which would make offline sign-out impossible.
 *  - **Everything outside is injected** — fetch, the browser, the listener, the
 *    timers, the session store — so tests touch no network, Keychain or browser.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AccountConfig } from "./config";
import { startCallbackListener, type CallbackListener, type Timers } from "./callback-listener";
import { createLogger, type Report } from "./log";
import {
  REASONS,
  SIGNED_OUT,
  SIGN_IN_TIMEOUT_MS,
  type AccountPlan,
  type AccountState,
} from "./model";
import { createSessionStorageScope, type SessionStore, type StorageAdapter } from "./session-store";
import { asPlan, displayUser, storedAccessToken, storedUser } from "./stored-session";

export interface AccountServiceDeps {
  /** Null when this build has no usable project: sign-in fails closed. */
  readonly config: AccountConfig | null;
  readonly store: SessionStore;
  readonly fetch: typeof fetch;
  readonly openExternal: (url: string) => Promise<void>;
  readonly timers?: Timers;
  readonly listen?: typeof startCallbackListener;
  readonly onStateChanged: (state: AccountState) => void;
  readonly report?: Report;
}

export interface AccountService {
  /** Reads the stored session once; idempotent. Never waits on the network. */
  start(): Promise<void>;
  state(): Promise<AccountState>;
  signIn(): Promise<AccountState>;
  cancelSignIn(): Promise<AccountState>;
  signOut(): Promise<AccountState>;
}

interface Flow {
  listener: CallbackListener | null;
}

const GLOBAL_TIMERS: Timers = {
  setTimeout: (callback, ms) => setTimeout(callback, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

function buildClient(
  config: AccountConfig,
  store: StorageAdapter,
  fetchImpl: typeof fetch,
): SupabaseClient {
  return createClient(config.url, config.key, {
    auth: {
      flowType: "pkce",
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storage: store,
    },
    global: { fetch: fetchImpl },
  });
}

export function createAccountService(deps: AccountServiceDeps): AccountService {
  const log = createLogger(deps.report);
  const timers = deps.timers ?? GLOBAL_TIMERS;
  const listen = deps.listen ?? startCallbackListener;
  const { config, store } = deps;

  let state: AccountState = SIGNED_OUT;
  let client: SupabaseClient | null = null;
  let unsubscribe: (() => void) | null = null;
  let flow: Flow | null = null;
  let started: Promise<void> | null = null;
  let storageScope: ReturnType<typeof createSessionStorageScope> | null = null;
  let teardown = Promise.resolve();

  function setState(next: AccountState): void {
    state = next;
    deps.onStateChanged(next);
  }

  function signedOut(reason: string | null): void {
    setState({ status: "signed-out", reason });
  }

  function dropClient(): Promise<void> {
    const drained = storageScope?.revoke() ?? Promise.resolve();
    storageScope = null;
    teardown = teardown.then(() => drained);
    unsubscribe?.();
    unsubscribe = null;
    const dropped = client;
    client = null;
    void dropped?.auth.stopAutoRefresh().catch(() => undefined);
    return teardown;
  }

  function ensureClient(): SupabaseClient {
    if (client !== null) {
      return client;
    }
    if (config === null) {
      throw new Error("accounts are not configured");
    }
    storageScope = createSessionStorageScope(store);
    const created = buildClient(config, storageScope.storage, deps.fetch);
    const { data } = created.auth.onAuthStateChange((event) => {
      // A refresh the server rejected: supabase-js has removed the session.
      // Network failures never emit this, so they keep the user signed in (A10).
      if (event === "SIGNED_OUT" && created === client && state.status === "signed-in") {
        dropClient();
        signedOut(REASONS.expired);
      }
    });
    unsubscribe = () => data.subscription.unsubscribe();
    client = created;
    return created;
  }

  async function readPlan(owner: SupabaseClient, userId: string): Promise<AccountPlan> {
    try {
      const { data, error } = await owner.from("profiles").select("plan").eq("id", userId).single();
      return error === null ? asPlan((data as { plan?: unknown } | null)?.plan) : "free";
    } catch {
      return "free";
    }
  }

  /** The launch half that does touch the network, after the stored account shows. */
  async function refreshStored(owner: SupabaseClient): Promise<void> {
    try {
      const { data, error } = await owner.auth.getSession();
      if (owner !== client || error !== null) {
        // An error is a refresh that failed: when the server rejected it the
        // SIGNED_OUT event has handled it, and when the network did, the session
        // is kept and the user stays signed in (A10). Retried by the ticker.
        return;
      }
      if (data.session === null) {
        // No error and no session: nothing usable is stored any more.
        if (state.status === "signed-in") {
          dropClient();
          signedOut(REASONS.expired);
        }
        return;
      }
      const plan = await readPlan(owner, data.session.user.id);
      if (owner === client && state.status === "signed-in" && state.plan !== plan) {
        setState({ ...state, plan });
      }
    } catch (error) {
      log("the stored session could not be checked", error);
    }
  }

  function start(): Promise<void> {
    started ??= (async () => {
      try {
        if ((await store.load()) !== "ok" || config === null) {
          return;
        }
        const user = storedUser(store.entries());
        if (user === null) {
          return;
        }
        setState({ status: "signed-in", ...user, plan: "free" });
        void refreshStored(ensureClient());
      } catch (error) {
        // A launch that cannot read its account is a signed-out launch.
        log("the stored account could not be loaded", error);
      }
    })();
    return started;
  }

  /** Revoke the old client and finish local cleanup before another flow can start. */
  async function endFlow(current: Flow, reason: string | null): Promise<void> {
    if (flow !== current) {
      return;
    }
    flow = null;
    current.listener?.cancel();
    teardown = dropClient().then(async () => {
      const removed = await store.discard();
      signedOut(removed ? reason : REASONS.savedAccount);
    });
    await teardown;
  }

  async function finishFlow(current: Flow, listener: CallbackListener): Promise<void> {
    const outcome = await listener.result;
    if (flow !== current) {
      if (outcome.kind === "code") {
        outcome.respond(false);
      }
      return;
    }
    switch (outcome.kind) {
      case "timeout":
        return endFlow(current, REASONS.timedOut);
      case "cancelled":
        return endFlow(current, null);
      case "error":
        return endFlow(current, outcome.denied ? REASONS.denied : REASONS.failed);
      case "code":
        break;
    }
    try {
      const owner = ensureClient();
      const { data, error } = await owner.auth.exchangeCodeForSession(outcome.code);
      const user = error === null ? displayUser(data.session?.user) : null;
      if (flow !== current) {
        // The revoked storage scope already refused this stale client's writes.
        outcome.respond(false);
        return;
      }
      if (error !== null || data.session === null || user === null) {
        outcome.respond(false);
        return endFlow(current, error === null ? REASONS.noEmail : REASONS.failed);
      }
      outcome.respond(true);
      const plan = await readPlan(owner, data.session.user.id);
      if (flow !== current) {
        return;
      }
      flow = null;
      setState({ status: "signed-in", ...user, plan });
    } catch (error) {
      log("the sign-in exchange failed", error);
      outcome.respond(false);
      await endFlow(current, REASONS.failed);
    }
  }

  return {
    start,
    async state() {
      await start();
      return state;
    },

    async signIn() {
      await start();
      // Sign-out may expose its in-memory state before disk cleanup completes.
      let pending: Promise<void>;
      do {
        pending = teardown;
        // Local cleanups must finish in order; a concurrent sign-out can append another.
        // eslint-disable-next-line no-await-in-loop
        await pending;
      } while (pending !== teardown);
      if (state.status !== "signed-out") {
        return state; // already signing in, or signed in: one flow at a time
      }
      if (config === null) {
        signedOut(REASONS.notConfigured);
        return state;
      }
      const current: Flow = { listener: null };
      flow = current;
      setState({ status: "signing-in" });
      try {
        const listener = await listen({ timers, timeoutMs: SIGN_IN_TIMEOUT_MS });
        current.listener = listener;
        if (flow !== current) {
          listener.cancel(); // cancelled while the port was opening
          return state;
        }
        const { data, error } = await ensureClient().auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: listener.redirectTo, skipBrowserRedirect: true },
        });
        // Only the project's own authorize URL is ever handed to the browser.
        if (
          error !== null ||
          new URL(data.url ?? "about:blank").origin !== new URL(config.url).origin
        ) {
          await endFlow(current, REASONS.failed);
          return state;
        }
        void finishFlow(current, listener).catch((error: unknown) =>
          log("the sign-in could not finish", error),
        );
        await deps.openExternal(data.url as string).catch(() => endFlow(current, REASONS.browser));
      } catch (error) {
        log("the sign-in could not start", error);
        await endFlow(current, REASONS.failed);
      }
      return state;
    },

    async cancelSignIn() {
      if (flow !== null) {
        await endFlow(flow, null);
      }
      return state;
    },

    async signOut() {
      await start();
      const token = storedAccessToken(store.entries());
      const revoker = client;
      flow?.listener?.cancel();
      flow = null;
      const drained = dropClient();
      signedOut(null);
      teardown = drained.then(async () => {
        if (!(await store.clear())) signedOut(REASONS.savedAccount);
      });
      await teardown;
      if (revoker !== null && token !== null) {
        // Best effort: offline sign-out has already completed locally.
        void revoker.auth.admin.signOut(token, "local").catch(() => undefined);
      }
      return state;
    },
  };
}
