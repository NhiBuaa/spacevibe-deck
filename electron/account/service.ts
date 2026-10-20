/**
 * The account service: stubbed for the privacy-first fork.
 *
 * In this privacy-first fork (`SpaceDeck Local`), accounts and Supabase
 * are completely disconnected. No Supabase SDK is initialized, no network
 * calls are made, and sign-in always returns "not configured".
 */
import type { AccountConfig } from "./config";
import type { Report } from "./log";
import { REASONS, SIGNED_OUT, type AccountState } from "./model";
import type { SessionStore } from "./session-store";

export interface AccountServiceDeps {
  /** Null when this build has no usable project: sign-in fails closed. */
  readonly config: AccountConfig | null;
  readonly store: SessionStore;
  readonly fetch?: typeof fetch;
  readonly openExternal?: (url: string) => Promise<void>;
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

export function createAccountService(deps: AccountServiceDeps): AccountService {
  let state: AccountState = { status: "signed-out", reason: REASONS.notConfigured };

  return {
    async start(): Promise<void> {
      deps.onStateChanged(state);
    },
    async state(): Promise<AccountState> {
      return state;
    },
    async signIn(): Promise<AccountState> {
      state = { status: "signed-out", reason: REASONS.notConfigured };
      deps.onStateChanged(state);
      return state;
    },
    async cancelSignIn(): Promise<AccountState> {
      state = SIGNED_OUT;
      deps.onStateChanged(state);
      return state;
    },
    async signOut(): Promise<AccountState> {
      let cleared = false;
      try {
        cleared = await deps.store.clear();
      } catch {
        cleared = false;
      }
      state = cleared ? SIGNED_OUT : { status: "signed-out", reason: REASONS.savedAccount };
      deps.onStateChanged(state);
      return state;
    },
  };
}
