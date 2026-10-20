/**
 * Shared shapes and constants of the account service
 * (docs/specs/2026-10-20-accounts.md).
 *
 * `AccountState` mirrors the display union in `src/host/account-host.ts`, which
 * this process cannot import (the facade reaches for the renderer bridge). The
 * IPC reply and the broadcast carry exactly these keys and never a token (A7).
 */
export type AccountPlan = "free" | "pro";

export type AccountState =
  | { readonly status: "signed-out"; readonly reason: string | null }
  | { readonly status: "signing-in" }
  | {
      readonly status: "signed-in";
      readonly email: string;
      readonly name: string | null;
      readonly plan: AccountPlan;
    };

export const SIGNED_OUT: AccountState = { status: "signed-out", reason: null };

/** The one file under `userData` the account owns (A8). */
export const ACCOUNT_FILE = "account.json";

/** A sign-in that nobody finishes in the browser ends here (A5). */
export const SIGN_IN_TIMEOUT_MS = 5 * 60 * 1000;

export const CALLBACK_PATH = "/auth/callback";

/** One-line reasons shown on the signed-out state (A6). Fixed text only. */
export const REASONS = {
  notConfigured: "Accounts are not configured in this build.",
  denied: "Sign-in was cancelled.",
  failed: "Sign-in failed. Check your connection and try again.",
  timedOut: "Sign-in timed out.",
  browser: "Could not open the browser.",
  noEmail: "Google did not return an email address.",
  expired: "Your session ended. Sign in again.",
  savedAccount: "Could not remove the saved account. It may return after restarting.",
} as const;
