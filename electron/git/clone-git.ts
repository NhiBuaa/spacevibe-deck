/**
 * How Deck runs `git clone`: which binary, which arguments, which environment.
 *
 * Nothing the user typed is shell text. The remote and the destination are argv
 * elements after `--`, so neither can be read as an option; the only shell
 * invocation is the literal PATH probe, as in `github-star.ts`.
 */
import { execFile } from "node:child_process";
import { DETECT_TIMEOUT_MS, parseCommandVOutput } from "../agents";
import * as macos from "../platform/macos";
import * as windows from "../platform/windows";

export function buildCloneArgs(remoteUrl: string, destination: string): string[] {
  return ["clone", "--progress", "--", remoteUrl, destination];
}

/**
 * Credentials are whatever the user already has configured (credential helper,
 * SSH keys and agent). Deck never answers a prompt, so every prompt path is
 * closed: a missing credential must fail fast as `authentication-required`
 * instead of hanging on a terminal nobody can see.
 */
export function buildCloneEnv(base: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...base,
    GIT_TERMINAL_PROMPT: "0",
    // An empty value (not an unset one) also stops git from falling back to
    // `core.askPass` and `SSH_ASKPASS`.
    GIT_ASKPASS: "",
    GIT_SSH_COMMAND: base.GIT_SSH_COMMAND ?? "ssh -o BatchMode=yes",
    // Failure classification reads English stderr whatever the user's locale.
    LC_ALL: "C",
    LANG: "C",
  };
}

let resolved: Promise<string> | undefined;

function probeGit(): Promise<string | null> {
  if (process.platform === "win32") {
    return Promise.resolve(windows.resolveOnPath("git"));
  }
  const launch = macos.shellLaunch();
  return new Promise((resolve) => {
    execFile(
      launch.executable,
      ["-ilc", "command -v git"],
      { encoding: "utf8", timeout: DETECT_TIMEOUT_MS, env: process.env },
      (_error, stdout) => {
        resolve(parseCommandVOutput(String(stdout ?? ""), ["git"])[0]?.path ?? null);
      },
    );
  });
}

/**
 * The absolute path of `git`, found the way a packaged GUI app must: its PATH
 * is a bare launchd one, so a login shell is asked once. Not found → plain
 * `git`, so the spawn itself reports ENOENT (`git-not-found`) when it is truly
 * absent. Only a hit is cached: installing Git must not need a restart.
 */
export function resolveGitExecutable(): Promise<string> {
  resolved ??= probeGit().then((found) => {
    if (found === null) {
      resolved = undefined;
      return "git";
    }
    return found;
  });
  return resolved;
}
