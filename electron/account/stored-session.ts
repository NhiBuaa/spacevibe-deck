/**
 * Reading what supabase-js persisted, without a client.
 *
 * Launch shows the stored account at once and sign-out needs the access token
 * before anything is deleted, and neither may wait on the network or build a
 * client first (A3, A11). supabase-js stores one JSON session under a key that
 * ends in `-auth-token`; this reads the few fields Deck displays from it.
 */
import type { AccountPlan } from "./model";

export interface DisplayUser {
  readonly email: string;
  readonly name: string | null;
}

const SESSION_KEY_SUFFIX = "-auth-token";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Email and Google's display name from a supabase-js `User`; null without an email. */
export function displayUser(user: unknown): DisplayUser | null {
  const record = asRecord(user);
  const email = nonEmpty(record?.email);
  if (record === null || email === null) {
    return null;
  }
  const metadata = asRecord(record.user_metadata);
  return { email, name: nonEmpty(metadata?.full_name) ?? nonEmpty(metadata?.name) };
}

function storedSession(entries: ReadonlyMap<string, string>): Record<string, unknown> | null {
  for (const [key, value] of entries) {
    if (key.endsWith(SESSION_KEY_SUFFIX)) {
      try {
        return asRecord(JSON.parse(value));
      } catch {
        return null;
      }
    }
  }
  return null;
}

export function storedUser(entries: ReadonlyMap<string, string>): DisplayUser | null {
  return displayUser(storedSession(entries)?.user);
}

export function storedAccessToken(entries: ReadonlyMap<string, string>): string | null {
  return nonEmpty(storedSession(entries)?.access_token);
}

/** A missing or unknown value reads as `free` (spec D3). */
export function asPlan(raw: unknown): AccountPlan {
  return raw === "pro" ? "pro" : "free";
}
