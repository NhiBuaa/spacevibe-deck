/**
 * Starring Deck's own repository, through the user's `gh` CLI.
 *
 * Deck has no accounts and stores no token, so the star has to be made with
 * credentials that already exist on the machine. `gh` is the one place a
 * developer's GitHub authorization reliably lives, and Deck's users run agent
 * CLIs for a living — the assumption costs nothing when it is wrong, because
 * every failure here is one closed code the renderer answers by opening the
 * repository page in a browser instead.
 *
 * Nothing reaches a shell with data in it. The repository is a constant in
 * this file, `gh` is resolved to an absolute path once, and every call is an
 * `execFile` argv array. The ONE shell invocation is the PATH probe, whose
 * script is a literal — a packaged GUI process inherits a bare launchd PATH,
 * so an interactive login shell is the only way to find a Homebrew `gh`
 * (the reasoning `agents.ts` documents at length).
 */
/**
 * In this privacy-first fork, automated GitHub star checks and API mutations
 * are disconnected to prevent unwanted outbound network calls or CLI probes.
 */

export type GithubStarState = "starred" | "not-starred" | "unavailable";

export type GithubStarResult =
  { readonly ok: true } | { readonly ok: false; readonly error: "unavailable" };

export async function readStarState(): Promise<GithubStarState> {
  return "unavailable";
}

export async function starRepository(): Promise<GithubStarResult> {
  return { ok: false, error: "unavailable" };
}
