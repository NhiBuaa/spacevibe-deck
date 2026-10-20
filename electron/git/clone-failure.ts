/**
 * Turns one failed `git clone` into a closed `CloneError`, and scrubs text that
 * is about to be logged. Raw stderr stays in main: only the code crosses IPC.
 *
 * Same idea as `classify` in `worktree.ts`, with the same rule about ORDER: the
 * texts overlap (an SSH rejection ends with "make sure the repository exists"),
 * so the most specific pattern is tested first.
 *
 * A missing repository and a private one you cannot read look the same to the
 * remote on purpose, so both are `repository-unavailable` — except where Git
 * itself says the CREDENTIALS were the problem.
 */
import type { CloneError } from "../../src/lib/clone-contract";

const AUTHENTICATION =
  /could not read (username|password)|terminal prompts disabled|authentication failed|permission denied \((publickey|keyboard-interactive|password)|host key verification failed|no such identity|invalid username or password|returned error: 40[13]|http basic: access denied|sign in required/i;

const REPOSITORY_UNAVAILABLE =
  /repository not found|repository '.*' (not found|does not exist)|does not appear to be a git repository|returned error: 404|project you were looking for could not be found/i;

/** Git's closing line for any failed fetch; only meaningful once nothing more specific matched. */
const REMOTE_UNREADABLE = /could not read from remote repository/i;

const NETWORK =
  /could not resolve host|could not resolve hostname|failed to connect|connection (timed out|refused|reset|closed)|network is unreachable|no route to host|early eof|rpc failed|remote end hung up|\bssl\b|\btls\b|gnutls|unable to access|operation timed out|temporary failure in name resolution|proxy/i;

const DISK_FULL = /no space left on device|disk full|not enough space|there is not enough space/i;

const CHECKOUT_FAILED = /clone succeeded, but checkout failed|unable to checkout working tree/i;

const PERMISSION_DENIED =
  /permission denied|access is denied|operation not permitted|read-only file system/i;

const DESTINATION_OCCUPIED = /already exists and is not an empty directory/i;

/** `stderr` is the non-progress output; it may contain anything and is never forwarded. */
export function classifyCloneFailure(stderr: string): CloneError {
  if (DESTINATION_OCCUPIED.test(stderr)) {
    return "destination-exists";
  }
  if (DISK_FULL.test(stderr)) {
    return "disk-full";
  }
  if (CHECKOUT_FAILED.test(stderr)) {
    return "incomplete-checkout";
  }
  if (AUTHENTICATION.test(stderr)) {
    return "authentication-required";
  }
  if (REPOSITORY_UNAVAILABLE.test(stderr)) {
    return "repository-unavailable";
  }
  if (NETWORK.test(stderr)) {
    return "network";
  }
  if (REMOTE_UNREADABLE.test(stderr)) {
    return "repository-unavailable";
  }
  if (PERMISSION_DENIED.test(stderr)) {
    return "permission-denied";
  }
  return "unknown";
}

const URL_CREDENTIALS = /([a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi;
const TOKEN = /\b(gh[pousr]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/g;
const MAX_LOGGED_CHARS = 2048;

/** `https://user:pass@host` and GitHub tokens never reach a log line. */
export function redactSecrets(text: string): string {
  return text.replace(URL_CREDENTIALS, "$1***@").replace(TOKEN, "***");
}

/** What a failure log may carry: the redacted end of git's diagnostics. */
export function loggableTail(stderr: string): string {
  return redactSecrets(stderr.slice(-MAX_LOGGED_CHARS));
}

/** A spawn that never produced a process: `git` is missing or not runnable. */
export function classifySpawnFailure(code: string | undefined): CloneError {
  return code === "ENOENT" || code === "EACCES" || code === "EPERM" || code === "ENOTDIR"
    ? "git-not-found"
    : "unknown";
}
