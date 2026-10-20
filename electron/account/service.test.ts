import { afterEach, describe, expect, it, vi } from "vitest";
import net from "node:net";
import { createAccountService, type AccountService } from "./service";
import { createSessionStore, type SessionCipher, type SessionFileIo } from "./session-store";
import type { Timers } from "./callback-listener";
import type { AccountState } from "./model";

const CONFIG = { url: "https://stub.supabase.test", key: "sb_publishable_stub" };
const USER_ID = "11111111-1111-4111-8111-111111111111";
const KEY = "sb-stub-auth-token";

function jwt(userId = USER_ID): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ sub: userId, exp: 4102444800 })}.sig`;
}

function sessionJson(expiresAt: number, metadata: object = { full_name: "Ada Lovelace" }) {
  return {
    access_token: jwt(),
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: "refresh-secret",
    user: {
      id: USER_ID,
      aud: "authenticated",
      email: "ada@example.com",
      app_metadata: {},
      user_metadata: metadata,
      created_at: "2026-10-20T00:00:00Z",
    },
  };
}

const json = (body: unknown, status = 200, onRead?: () => void) => {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
  for (const method of ["json", "text"] as const) {
    const read = response[method].bind(response);
    response[method] = async () => {
      const value = await read();
      onRead?.();
      return value;
    };
  }
  return response;
};

interface StubOptions {
  onResponseRead?: (kind: "exchange" | "profile") => void;
  plan?: unknown;
  planStatus?: number;
  exchange?: "rejected";
  refresh?: "ok" | "rejected" | "offline";
  session?: object;
  exchangeResponse?: () => Promise<object>;
  beforePlan?: () => Promise<void>;
}

/** A stubbed GoTrue + PostgREST behind a counting fetch. */
function stubFetch(options: StubOptions = {}) {
  const calls: string[] = [];
  const logouts: string[] = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    calls.push(`${init?.method ?? "GET"} ${url.pathname}${url.search}`);
    if (url.pathname === "/auth/v1/token" && url.searchParams.get("grant_type") === "pkce") {
      if (options.exchange === "rejected") {
        return json({ code: 400, error_code: "validation_failed", msg: "invalid flow state" }, 400);
      }
      return json(
        options.exchangeResponse
          ? await options.exchangeResponse()
          : (options.session ?? sessionJson(Math.floor(Date.now() / 1000) + 3600)),
        200,
        () => options.onResponseRead?.("exchange"),
      );
    }
    if (url.pathname === "/auth/v1/token") {
      if (options.refresh === "offline") {
        throw new TypeError("fetch failed");
      }
      if (options.refresh === "rejected") {
        return json(
          { code: 400, error_code: "refresh_token_not_found", msg: "Invalid Refresh Token" },
          400,
        );
      }
      return json(sessionJson(Math.floor(Date.now() / 1000) + 3600));
    }
    if (url.pathname === "/auth/v1/logout") {
      logouts.push(new Headers(init?.headers).get("authorization") ?? "");
      throw new TypeError("fetch failed");
    }
    if (url.pathname === "/rest/v1/profiles") {
      await options.beforePlan?.();
      return options.planStatus === undefined || options.planStatus === 200
        ? json({ plan: options.plan ?? "free" }, 200, () => options.onResponseRead?.("profile"))
        : json({ message: "boom" }, options.planStatus);
    }
    return json({}, 404);
  };
  return { calls, logouts, fetch: vi.fn(impl) as unknown as typeof fetch };
}

const cipher = (available = true): SessionCipher => ({
  isEncryptionAvailable: () => available,
  encryptString: (plain) => Buffer.from(`enc:${plain}`),
  decryptString: (buffer) => {
    const text = buffer.toString();
    if (!text.startsWith("enc:")) {
      throw new Error("cannot decrypt");
    }
    return text.slice(4);
  },
});

function memoryFile(initial: string | null = null) {
  const file = { contents: initial, writes: 0, removes: 0, removeDenied: false };
  const io: SessionFileIo = {
    read: async () => file.contents,
    write: async (contents) => {
      file.writes += 1;
      file.contents = contents;
    },
    remove: async () => {
      if (file.removeDenied) throw Object.assign(new Error("fixture denied"), { code: "EACCES" });
      file.removes += 1;
      file.contents = null;
    },
  };
  return { file, io };
}

function manualTimers() {
  const pending = new Set<() => void>();
  const timers: Timers = {
    setTimeout: (callback) => {
      pending.add(callback);
      return callback;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as () => void);
    },
  };
  return { timers, fire: () => [...pending].forEach((callback) => callback()) };
}

function accepts(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

type Browser = (authorizeUrl: string, redirectTo: string) => Promise<void> | void;
const services: AccountService[] = [];

function setup(
  opts: {
    stub?: StubOptions;
    file?: string | null;
    encryption?: boolean;
    configured?: boolean;
    browser?: Browser;
    timers?: Timers;
  } = {},
) {
  const stub = stubFetch(opts.stub);
  const { file, io } = memoryFile(opts.file ?? null);
  const states: AccountState[] = [];
  const opened: { url: string; redirectTo: string }[] = [];
  const service = createAccountService({
    config: opts.configured === false ? null : CONFIG,
    store: createSessionStore({
      io,
      cipher: cipher(opts.encryption ?? true),
      report: () => undefined,
    }),
    fetch: stub.fetch,
    openExternal: async (url) => {
      const redirectTo = new URL(url).searchParams.get("redirect_to") ?? "";
      opened.push({ url, redirectTo });
      await opts.browser?.(url, redirectTo);
    },
    timers: opts.timers,
    onStateChanged: (state) => states.push(state),
    report: () => undefined,
  });
  services.push(service);
  return { service, stub, file, states, opened };
}

/** The browser coming back with `?code=…`. */
const approve: Browser = async (_url, redirectTo) => {
  void fetch(`${redirectTo}?code=the-code`).catch(() => undefined);
};

const lastState = (states: AccountState[]) => states[states.length - 1];

afterEach(async () => {
  for (const service of services.splice(0)) {
    await service.cancelSignIn();
    await service.signOut();
  }
});

describe("signed out", () => {
  it("sends no request when there is no stored session (A3)", async () => {
    const { service, stub } = setup();
    await service.start();
    expect(await service.state()).toEqual({ status: "signed-out", reason: null });
    await service.signOut();
    expect(stub.fetch).not.toHaveBeenCalled();
  });

  it("fails closed when the build has no project", async () => {
    const { service, stub } = setup({ configured: false });
    expect(await service.signIn()).toEqual({
      status: "signed-out",
      reason: "Accounts are not configured in this build.",
    });
    expect(stub.fetch).not.toHaveBeenCalled();
  });
});

describe("sign in", () => {
  it("ends signed in with the free plan and closes the listener", async () => {
    const { service, states, file, opened } = setup({ browser: approve });
    expect(await service.signIn()).toEqual({ status: "signing-in" });
    await vi.waitFor(() => expect(lastState(states).status).toBe("signed-in"));
    expect(lastState(states)).toEqual({
      status: "signed-in",
      email: "ada@example.com",
      name: "Ada Lovelace",
      plan: "free",
    });
    expect(states.map((state) => state.status)).toEqual(["signing-in", "signed-in"]);
    expect(await accepts(Number(new URL(opened[0].redirectTo).port))).toBe(false);
    // Stored, but never in the clear.
    expect(file.contents).not.toBeNull();
    expect(file.contents).not.toContain("refresh-secret");
    expect(file.contents).not.toContain("ada@example.com");
  });

  it("reads the plan the server assigned", async () => {
    const { service, states } = setup({ browser: approve, stub: { plan: "pro" } });
    await service.signIn();
    await vi.waitFor(() => expect(lastState(states).status).toBe("signed-in"));
    expect(lastState(states)).toMatchObject({ plan: "pro" });
  });

  it("shows Free when the plan read fails, and treats an unknown plan as Free", async () => {
    const failed = setup({ browser: approve, stub: { planStatus: 500 } });
    await failed.service.signIn();
    await vi.waitFor(() => expect(lastState(failed.states).status).toBe("signed-in"));
    expect(lastState(failed.states)).toMatchObject({ plan: "free" });

    const unknown = setup({ browser: approve, stub: { plan: "enterprise" } });
    await unknown.service.signIn();
    await vi.waitFor(() => expect(lastState(unknown.states).status).toBe("signed-in"));
    expect(lastState(unknown.states)).toMatchObject({ plan: "free" });
  });

  it("never puts a token in the state payload (A7)", async () => {
    const { service, states } = setup({ browser: approve });
    await service.signIn();
    await vi.waitFor(() => expect(lastState(states).status).toBe("signed-in"));
    const everything = JSON.stringify(states);
    expect(everything).not.toMatch(/token|refresh-secret|\.sig/i);
    expect(Object.keys(lastState(states)).sort()).toEqual(["email", "name", "plan", "status"]);
  });

  it("ends signed out with a fixed reason on a provider error", async () => {
    const hostile = encodeURIComponent("<script>alert(1)</script>");
    const { service, states, opened } = setup({
      browser: async (_url, redirectTo) => {
        void fetch(`${redirectTo}?error=server_error&error_description=${hostile}`);
      },
    });
    await service.signIn();
    await vi.waitFor(() => expect(lastState(states).status).toBe("signed-out"));
    expect(lastState(states)).toEqual({
      status: "signed-out",
      reason: "Sign-in failed. Check your connection and try again.",
    });
    expect(JSON.stringify(states)).not.toContain("script");
    expect(await accepts(Number(new URL(opened[0].redirectTo).port))).toBe(false);
  });

  it("ends signed out when the code exchange fails", async () => {
    const { service, states, file } = setup({ browser: approve, stub: { exchange: "rejected" } });
    await service.signIn();
    await vi.waitFor(() => expect(lastState(states).status).toBe("signed-out"));
    expect(lastState(states)).toMatchObject({ reason: expect.stringContaining("Sign-in failed") });
    expect(file.contents).toBeNull();
  });

  it("keeps the listener open across HEAD / probes", async () => {
    const { service, states, opened } = setup({
      browser: async (_url, redirectTo) => {
        const origin = new URL(redirectTo).origin;
        expect((await fetch(`${origin}/`, { method: "HEAD" })).status).toBe(404);
        void fetch(`${redirectTo}?code=the-code`);
      },
    });
    await service.signIn();
    await vi.waitFor(() => expect(lastState(states).status).toBe("signed-in"));
    expect(opened).toHaveLength(1);
  });

  it("answers a second sign-in while one is open without a second flow", async () => {
    const { service, opened } = setup();
    await service.signIn();
    expect(await service.signIn()).toEqual({ status: "signing-in" });
    expect(opened).toHaveLength(1);
  });

  it("closes the listener on cancel", async () => {
    const { service, states, opened } = setup();
    await service.signIn();
    const port = Number(new URL(opened[0].redirectTo).port);
    expect(await accepts(port)).toBe(true);
    expect(await service.cancelSignIn()).toEqual({ status: "signed-out", reason: null });
    expect(await accepts(port)).toBe(false);
    expect(lastState(states)).toEqual({ status: "signed-out", reason: null });
  });

  it("closes the listener after the 5-minute timeout", async () => {
    const clock = manualTimers();
    const { service, states, opened } = setup({ timers: clock.timers });
    await service.signIn();
    const port = Number(new URL(opened[0].redirectTo).port);
    clock.fire();
    await vi.waitFor(() => expect(lastState(states).status).toBe("signed-out"));
    expect(lastState(states)).toEqual({ status: "signed-out", reason: "Sign-in timed out." });
    expect(await accepts(port)).toBe(false);
  });

  it("opens only the project's own authorize URL", async () => {
    const { opened, service } = setup();
    await service.signIn();
    expect(new URL(opened[0].url).origin).toBe(CONFIG.url);
  });
});

describe("storage", () => {
  it("writes nothing when encryption is unavailable (A8)", async () => {
    const { service, states, file } = setup({ browser: approve, encryption: false });
    await service.signIn();
    await vi.waitFor(() => expect(lastState(states).status).toBe("signed-in"));
    expect(file.writes).toBe(0);
    expect(file.contents).toBeNull();
  });

  it("treats a corrupt file as signed out and leaves its bytes alone (A9)", async () => {
    const corrupt = "this is not an envelope";
    const { service, stub, file } = setup({ file: corrupt });
    expect(await service.state()).toEqual({ status: "signed-out", reason: null });
    expect(file.contents).toBe(corrupt);
    expect(file.writes + file.removes).toBe(0);
    expect(stub.fetch).not.toHaveBeenCalled();
  });

  it("replaces an unreadable file only when a sign-in succeeds", async () => {
    const { service, states, file } = setup({ file: "garbage", browser: approve });
    await service.signIn();
    await vi.waitFor(() => expect(lastState(states).status).toBe("signed-in"));
    expect(file.contents).not.toBe("garbage");
    expect(JSON.parse(file.contents as string)).toHaveProperty("v", 1);
  });

  it("keeps an unreadable file when a sign-in fails or is cancelled (A9)", async () => {
    const failed = setup({ file: "garbage", browser: approve, stub: { exchange: "rejected" } });
    await failed.service.signIn();
    await vi.waitFor(() => expect(lastState(failed.states).status).toBe("signed-out"));
    expect(failed.file.contents).toBe("garbage");

    const cancelled = setup({ file: "garbage" });
    await cancelled.service.signIn();
    await cancelled.service.cancelSignIn();
    expect(cancelled.file.contents).toBe("garbage");
  });

  it("deletes a file it cannot read on sign out (A9, A11)", async () => {
    const { service, file } = setup({ file: "garbage" });
    await service.signOut();
    expect(file.contents).toBeNull();
  });
});

describe("a stored session", () => {
  async function storedFile(expiresAt: number) {
    const store = memoryFile();
    const writer = createSessionStore({ io: store.io, cipher: cipher(), report: () => undefined });
    await writer.setItem(KEY, JSON.stringify(sessionJson(expiresAt)));
    return store.file.contents;
  }

  it("shows the stored account at once, then confirms the plan", async () => {
    const stored = await storedFile(Math.floor(Date.now() / 1000) + 3600);
    const { service, states } = setup({ file: stored, stub: { plan: "pro" } });
    await service.start();
    expect(lastState(states)).toMatchObject({
      status: "signed-in",
      plan: "free",
      name: "Ada Lovelace",
    });
    await vi.waitFor(() => expect(lastState(states)).toMatchObject({ plan: "pro" }));
  });

  it("signs out when the server rejects the refresh (A10)", async () => {
    const stored = await storedFile(Math.floor(Date.now() / 1000) - 60);
    const { service, states } = setup({ file: stored, stub: { refresh: "rejected" } });
    await service.start();
    await vi.waitFor(() => expect(lastState(states).status).toBe("signed-out"));
  });

  it("stays signed in when the refresh keeps failing on the network (A10)", async () => {
    const stored = await storedFile(Math.floor(Date.now() / 1000) - 60);
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
    try {
      const { service, stub, states } = setup({ file: stored, stub: { refresh: "offline" } });
      await service.start();
      // supabase-js retries with backoff for its 30 s tick window, then gives up
      // with a retryable error and keeps the session.
      await vi.advanceTimersByTimeAsync(35_000);
      expect(stub.calls.filter((call) => call.includes("/auth/v1/token")).length).toBeGreaterThan(
        1,
      );
      expect(await service.state()).toMatchObject({
        status: "signed-in",
        email: "ada@example.com",
      });
      expect(states.some((state) => state.status === "signed-out")).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("signs out locally first, even offline, and touches only account.json (A11)", async () => {
    const stored = await storedFile(Math.floor(Date.now() / 1000) + 3600);
    const { service, stub, file, states } = setup({ file: stored });
    await service.start();
    expect(await service.signOut()).toEqual({ status: "signed-out", reason: null });
    expect(file.contents).toBeNull();
    expect(file.removes).toBe(1);
    expect(lastState(states)).toEqual({ status: "signed-out", reason: null });
    // The revoke is attempted with the old access token, and its failure is swallowed.
    await vi.waitFor(() => expect(stub.logouts).toHaveLength(1));
    expect(stub.logouts[0]).toMatch(/^Bearer /);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function savedEmail(contents: string | null): string | undefined {
  if (contents === null) return undefined;
  const entries = JSON.parse(
    cipher().decryptString(Buffer.from(JSON.parse(contents).data, "base64")),
  );
  const saved = Object.entries(entries).find(([key]) => key.endsWith("-auth-token"));
  return saved ? JSON.parse(saved[1] as string).user.email : undefined;
}

describe("account teardown", () => {
  it("a cancelled exchange cannot replace or erase the next account", async () => {
    const held = deferred<object>();
    const consumed = deferred<void>();
    let responseReads = 0;
    let exchanges = 0;
    const secondId = "22222222-2222-4222-8222-222222222222";
    const second = {
      ...sessionJson(Math.floor(Date.now() / 1000) + 3600),
      access_token: jwt(secondId),
      user: {
        ...sessionJson(0).user,
        id: secondId,
        email: "second@example.test",
      },
    };
    const { service, states, file } = setup({
      browser: approve,
      stub: {
        exchangeResponse: async () => (++exchanges === 1 ? held.promise : second),
        onResponseRead: (kind) => {
          if (kind === "exchange" && ++responseReads === 2) consumed.resolve();
        },
      },
    });
    await service.signIn();
    await vi.waitFor(() => expect(exchanges).toBe(1));
    await service.cancelSignIn();
    await service.signIn();
    await vi.waitFor(() =>
      expect(lastState(states)).toMatchObject({
        status: "signed-in",
        email: "second@example.test",
      }),
    );
    expect(savedEmail(file.contents)).toBe("second@example.test");
    const writes = file.writes;
    held.resolve(sessionJson(Math.floor(Date.now() / 1000) + 3600));
    await consumed.promise;
    // The body is consumed; finish its SDK/service promise continuations this turn.
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(savedEmail(file.contents)).toBe("second@example.test");
    expect(file.writes).toBe(writes);
  });

  it("a cancelled profile read cannot erase the next account", async () => {
    const held = deferred<void>();
    const consumed = deferred<void>();
    let responseReads = 0;
    let plans = 0;
    const { service, states, file } = setup({
      browser: approve,
      stub: {
        beforePlan: async () => {
          if (++plans === 1) await held.promise;
        },
        onResponseRead: (kind) => {
          if (kind === "profile" && ++responseReads === 2) consumed.resolve();
        },
      },
    });
    await service.signIn();
    await vi.waitFor(() => expect(plans).toBe(1));
    await service.cancelSignIn();
    await service.signIn();
    await vi.waitFor(() => expect(lastState(states).status).toBe("signed-in"));
    expect(savedEmail(file.contents)).toBe("ada@example.com");
    held.resolve();
    await consumed.promise;
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(savedEmail(file.contents)).toBe("ada@example.com");
  });

  it("reports a retained credential after deletion fails and allows a safe retry", async () => {
    const { service, states, file } = setup({ browser: approve });
    await service.signIn();
    await vi.waitFor(() => expect(lastState(states).status).toBe("signed-in"));
    file.removeDenied = true;
    const result = await service.signOut();
    expect(result).toMatchObject({
      status: "signed-out",
      reason: expect.stringContaining("saved account"),
    });
    expect(file.contents).not.toBeNull();
    file.removeDenied = false;
    expect(await service.signOut()).toEqual({ status: "signed-out", reason: null });
    expect(file.contents).toBeNull();
    const restarted = setup({ file: file.contents });
    expect(await restarted.service.state()).toEqual({ status: "signed-out", reason: null });
  });
});
