/**
 * The encrypted session file, as the storage adapter supabase-js reads and
 * writes (A8, A9, A11).
 *
 * The whole key/value map is encrypted with `safeStorage` and written as one
 * envelope, `{"v":1,"data":"<base64>"}`, so `account.json` is valid JSON that
 * holds no plaintext. Two rules shape it:
 *
 *  - **No plaintext, ever.** When the OS cannot encrypt, the session lives in
 *    memory for this run and nothing is written.
 *  - **An unreadable file is left alone.** It holds only a credential nobody can
 *    recover, so — unlike `settings.json` — replacing it is safe, but only the
 *    next successful sign-in does that (it is the first `setItem` of the
 *    session). The PKCE code verifier is memory-only, so a started flow never
 *    touches the file.
 *
 * File IO and encryption are injected; no test reaches Keychain or the disk.
 */
import { createLogger } from "./log";

export interface SessionFileIo {
  /** The file's text, or null when it does not exist. Rejects on other errors. */
  read(): Promise<string | null>;
  write(contents: string): Promise<void>;
  /** Deletes the file; a missing file is not an error. */
  remove(): Promise<void>;
}

export interface SessionCipher {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface StorageAdapter {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export type FileState = "none" | "ok" | "unreadable";

export interface SessionStore extends StorageAdapter {
  /** Reads the file once; later calls return the same answer. */
  load(): Promise<FileState>;
  /** A snapshot of the persisted entries (never the code verifier). */
  entries(): ReadonlyMap<string, string>;
  /** Sign-out: forgets every entry; false means the saved credential could not be deleted. */
  clear(): Promise<boolean>;
  /**
   * Abandons a flow: forgets every entry, and deletes the file only if this
   * store wrote it, so an unreadable file survives a sign-in that failed (A9).
   * False means a credential this flow wrote could not be deleted.
   */
  discard(): Promise<boolean>;
}

/** supabase-js keeps the PKCE verifier beside the session; it must not persist. */
const MEMORY_ONLY_SUFFIX = "-code-verifier";

const ENVELOPE_VERSION = 1;

export function createSessionStore(deps: {
  readonly io: SessionFileIo;
  readonly cipher: SessionCipher;
  readonly report?: (message: string) => void;
}): SessionStore {
  const log = createLogger(deps.report);
  const persisted = new Map<string, string>();
  const volatile = new Map<string, string>();
  let fileState: FileState = "none";
  let wroteFile = false;
  let loading: Promise<FileState> | null = null;
  // Writes are chained so a slow encrypt can never land after a newer one.
  let writing: Promise<void> = Promise.resolve();

  async function readFile(): Promise<FileState> {
    let raw: string | null;
    try {
      raw = await deps.io.read();
    } catch {
      return "unreadable";
    }
    if (raw === null) {
      return "none";
    }
    try {
      const envelope: unknown = JSON.parse(raw);
      if (
        typeof envelope !== "object" ||
        envelope === null ||
        (envelope as { v?: unknown }).v !== ENVELOPE_VERSION ||
        typeof (envelope as { data?: unknown }).data !== "string"
      ) {
        return "unreadable";
      }
      const plain = deps.cipher.decryptString(
        Buffer.from((envelope as { data: string }).data, "base64"),
      );
      const parsed: unknown = JSON.parse(plain);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return "unreadable";
      }
      for (const [key, value] of Object.entries(parsed)) {
        if (typeof value === "string") {
          persisted.set(key, value);
        }
      }
      return "ok";
    } catch {
      // Not decryptable on this machine or profile, or not our envelope.
      persisted.clear();
      return "unreadable";
    }
  }

  function load(): Promise<FileState> {
    loading ??= readFile().then((state) => {
      fileState = state;
      return state;
    });
    return loading;
  }

  /** Persist the current map; one queued write, never throws. */
  function flush(): Promise<void> {
    writing = writing.then(async () => {
      try {
        if (persisted.size === 0) {
          // Only a file this store has read or written is ours to delete here.
          if (fileState === "ok") {
            await deps.io.remove();
            fileState = "none";
          }
          return;
        }
        if (!deps.cipher.isEncryptionAvailable()) {
          // Memory only: never write a credential in the clear (A8).
          return;
        }
        const data = deps.cipher
          .encryptString(JSON.stringify(Object.fromEntries(persisted)))
          .toString("base64");
        await deps.io.write(JSON.stringify({ v: ENVELOPE_VERSION, data }));
        fileState = "ok";
        wroteFile = true;
      } catch (error) {
        log("the session file could not be saved", error);
      }
    });
    return writing;
  }

  function remove(): Promise<boolean> {
    let removed = false;
    writing = writing.then(async () => {
      try {
        await deps.io.remove();
        fileState = "none";
        wroteFile = false;
        removed = true;
      } catch (error) {
        log("the session file could not be removed", error);
      }
    });
    return writing.then(() => removed);
  }

  return {
    load,
    entries: () => new Map(persisted),
    async getItem(key) {
      await load();
      return volatile.get(key) ?? persisted.get(key) ?? null;
    },
    async setItem(key, value) {
      await load();
      if (key.endsWith(MEMORY_ONLY_SUFFIX)) {
        volatile.set(key, value);
        return;
      }
      persisted.set(key, value);
      await flush();
    },
    async removeItem(key) {
      await load();
      volatile.delete(key);
      if (persisted.delete(key)) {
        await flush();
      }
    },
    async clear() {
      await load();
      persisted.clear();
      volatile.clear();
      return remove();
    },
    async discard() {
      await load();
      persisted.clear();
      volatile.clear();
      return wroteFile ? remove() : true;
    },
  };
}

/** A dropped SDK client cannot mutate the next client's shared session. */
export function createSessionStorageScope(store: StorageAdapter): {
  readonly storage: StorageAdapter;
  revoke(): Promise<void>;
} {
  let active = true;
  let pending = Promise.resolve();
  function mutate(operation: () => Promise<void>): Promise<void> {
    const next = pending.then(async () => {
      if (active) await operation();
    });
    pending = next.catch(() => undefined);
    return next;
  }
  return {
    storage: {
      async getItem(key) {
        if (!active) return null;
        const value = await store.getItem(key);
        return active ? value : null;
      },
      setItem: (key, value) => mutate(() => store.setItem(key, value)),
      removeItem: (key) => mutate(() => store.removeItem(key)),
    },
    revoke() {
      active = false;
      // Cleanup waits for a write already inside the store, including its await load().
      return pending;
    },
  };
}
