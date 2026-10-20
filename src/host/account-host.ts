/**
 * The optional Google account, over the host bridge
 * (docs/specs/2026-10-20-accounts.md).
 *
 * Main owns the session (A7): every reply and every broadcast here is display
 * state, never a token. Fail-soft like `telemetry-host.ts`: a host with no
 * handler — a browser `npm run dev` preview — reads as "this host has no
 * accounts", never as an error.
 *
 * Flat payload keys per R6. All four channels take an empty payload, written as
 * a literal so `scripts/electron-ipc-contract.test.ts` can read it.
 */
import { invoke, listen, type UnlistenFn } from "./bridge";

/** Whether THIS host can answer these channels, read like `telemetry-host.ts`. */
export const available: boolean =
  typeof globalThis !== "undefined" &&
  (globalThis as { __deckHost?: unknown }).__deckHost !== undefined;

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

const PLANS: readonly AccountPlan[] = ["free", "pro"];

/** A missing or unknown plan reads as `free` (spec D3). */
function asPlan(raw: unknown): AccountPlan {
  return PLANS.includes(raw as AccountPlan) ? (raw as AccountPlan) : "free";
}

/** Narrow a main-process reply; anything malformed is null, not a guess. */
export function asAccountState(raw: unknown): AccountState | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  switch (source.status) {
    case "signed-out":
      return {
        status: "signed-out",
        reason: typeof source.reason === "string" ? source.reason : null,
      };
    case "signing-in":
      return { status: "signing-in" };
    case "signed-in":
      if (typeof source.email !== "string" || source.email === "") {
        return null;
      }
      return {
        status: "signed-in",
        email: source.email,
        name: typeof source.name === "string" && source.name !== "" ? source.name : null,
        plan: asPlan(source.plan),
      };
    default:
      return null;
  }
}

async function answer(reply: Promise<unknown>): Promise<AccountState | null> {
  try {
    return asAccountState(await reply);
  } catch {
    return null;
  }
}

/** Current state, or null where the host cannot answer. */
export function accountState(): Promise<AccountState | null> {
  if (!available) {
    return Promise.resolve(null);
  }
  return answer(invoke<unknown>("account_state", {}));
}

/**
 * Start the browser sign-in. Resolves once the flow has started (normally
 * `signing-in`); how it ends arrives through `onAccountStateChanged`.
 */
export function accountSignIn(): Promise<AccountState | null> {
  if (!available) {
    return Promise.resolve(null);
  }
  return answer(invoke<unknown>("account_sign_in", {}));
}

/** Abandon an open sign-in flow; a no-op when none is open. */
export function accountCancelSignIn(): Promise<AccountState | null> {
  if (!available) {
    return Promise.resolve(null);
  }
  return answer(invoke<unknown>("account_cancel_sign_in", {}));
}

/** Sign out locally; completes offline too (A11). */
export function accountSignOut(): Promise<AccountState | null> {
  if (!available) {
    return Promise.resolve(null);
  }
  return answer(invoke<unknown>("account_sign_out", {}));
}

/** Every state change main broadcasts; malformed payloads are dropped. */
export async function onAccountStateChanged(
  handler: (state: AccountState) => void,
): Promise<UnlistenFn> {
  if (!available) {
    return () => {};
  }
  return listen<unknown>("account:state-changed", ({ payload }) => {
    const state = asAccountState(payload);
    if (state !== null) {
      handler(state);
    }
  });
}
