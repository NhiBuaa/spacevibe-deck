import { describe, expect, it } from "vitest";
import { createSessionStorageScope, createSessionStore, type SessionCipher } from "./session-store";

const cipher: SessionCipher = {
  isEncryptionAvailable: () => true,
  encryptString: (plain) => Buffer.from(`enc:${plain}`),
  decryptString: (buffer) => buffer.toString().replace(/^enc:/, ""),
};

function harness() {
  const file = { contents: null as string | null };
  const io = {
    read: async () => file.contents,
    write: async (contents: string) => {
      file.contents = contents;
    },
    remove: async () => {
      file.contents = null;
    },
  };
  return { file, store: createSessionStore({ io, cipher }) };
}

describe("session store", () => {
  it("drains an already-started write before cleanup and refuses queued stale mutations", async () => {
    let begin!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      begin = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let contents: string | null = null;
    const store = createSessionStore({
      cipher,
      io: {
        read: async () => null,
        write: async (next) => {
          begin();
          await held;
          contents = next;
        },
        remove: async () => {
          contents = null;
        },
      },
    });
    const old = createSessionStorageScope(store);
    const write = old.storage.setItem("session", "old");
    await started;
    let removed = false;
    const cleanup = old.revoke().then(async () => {
      await store.clear();
      removed = true;
    });
    const stale = old.storage.setItem("session", "stale");
    await Promise.resolve();
    expect(removed).toBe(false);
    release();
    await Promise.all([write, stale, cleanup]);
    expect(contents).toBeNull();
    const current = createSessionStorageScope(store);
    await current.storage.setItem("session", "new");
    await old.storage.removeItem("session");
    expect(await current.storage.getItem("session")).toBe("new");
  });
  it("keeps the PKCE verifier in memory only", async () => {
    const { store, file } = harness();
    await store.setItem("sb-x-auth-token-code-verifier", "verifier-secret");
    expect(await store.getItem("sb-x-auth-token-code-verifier")).toBe("verifier-secret");
    expect(file.contents).toBeNull();
    expect(store.entries().size).toBe(0);
  });

  it("round-trips a session through an envelope with no plaintext", async () => {
    const { store, file } = harness();
    await store.setItem("sb-x-auth-token", '{"access_token":"a-secret"}');
    expect(file.contents).not.toContain("a-secret");
    expect(JSON.parse(file.contents as string)).toMatchObject({ v: 1 });
    const reopened = createSessionStore({
      io: {
        read: async () => file.contents,
        write: async () => undefined,
        remove: async () => undefined,
      },
      cipher,
    });
    expect(await reopened.load()).toBe("ok");
    expect(await reopened.getItem("sb-x-auth-token")).toBe('{"access_token":"a-secret"}');
  });

  it("deletes the file when the last session entry is removed", async () => {
    const { store, file } = harness();
    await store.setItem("sb-x-auth-token", "{}");
    await store.removeItem("sb-x-auth-token");
    expect(file.contents).toBeNull();
  });
});
