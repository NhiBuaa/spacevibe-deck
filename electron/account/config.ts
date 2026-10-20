/**
 * The Supabase project the account service talks to (A17).
 *
 * The publishable key is public by design: it is the key the project hands to
 * clients, and RLS is what protects the data. The service-role key must never
 * appear in this repository or in the app. An empty key fails closed — the
 * service answers sign-in with "not configured" instead of guessing.
 */
export const SUPABASE_URL = "https://calkpkscykzmvyayfxih.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_ct0mvQDe_5TOkTeukN3SMg_MXUn3Jkn";

export interface AccountConfig {
  readonly url: string;
  readonly key: string;
}

/**
 * The shipped project, or — in an unpackaged run only — the stub a test or the
 * E2E gate points `DECK_SUPABASE_URL` / `DECK_SUPABASE_KEY` at. A packaged app
 * ignores both variables, so nothing in a user's environment can redirect where
 * their tokens go. Returns null when the result is unusable.
 */
export function resolveAccountConfig(
  isPackaged: boolean,
  env: NodeJS.ProcessEnv = process.env,
): AccountConfig | null {
  const overridden = !isPackaged;
  const url = (overridden && env.DECK_SUPABASE_URL) || SUPABASE_URL;
  const key = (overridden && env.DECK_SUPABASE_KEY) || SUPABASE_PUBLISHABLE_KEY;
  if (key === "") {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? { url, key } : null;
  } catch {
    return null;
  }
}
