/**
 * Everything `createCloneService` touches outside itself, injectable so tests
 * need no network, no real git and no real clock. `defaultCloneDeps()` is what
 * production wires.
 */
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, realpath, stat } from "node:fs/promises";
import type { Stats } from "node:fs";
import { parseGithubRepository, type GithubRepository } from "../../src/lib/github-repository";
import { resolveGitExecutable } from "./clone-git";
import { killProcessTree, type KillableChild } from "./clone-kill";

/** The slice of a child process a clone job reads. */
export type CloneChild = Pick<ChildProcess, "pid" | "stderr" | "on" | "kill">;

export interface CloneFs {
  lstat(path: string): Promise<Pick<Stats, "isDirectory">>;
  stat(path: string): Promise<Pick<Stats, "isDirectory">>;
  realpath(path: string): Promise<string>;
}

export interface CloneTiming {
  /** No stderr at all for this long means the transfer is stuck. */
  readonly idleTimeoutMs: number;
  /** SIGTERM → SIGKILL. */
  readonly killGraceMs: number;
  /** After `exit`, how long to wait for `close` (stderr drained) before finishing anyway. */
  readonly closeGraceMs: number;
}

export interface CloneDeps {
  readonly platform: NodeJS.Platform;
  readonly env: () => NodeJS.ProcessEnv;
  readonly fs: CloneFs;
  readonly resolveGit: () => Promise<string>;
  readonly spawn: (command: string, args: string[], options: SpawnOptions) => CloneChild;
  readonly killTree: (child: KillableChild, signal: "SIGTERM" | "SIGKILL") => void;
  readonly parseRepository: (input: string) => GithubRepository | null;
  readonly newId: () => string;
  readonly log: (message: string, detail: Record<string, unknown>) => void;
  /** Destinations being written, by canonical key; shared by every service in the process. */
  readonly locks: Set<string>;
  readonly timing: CloneTiming;
}

export const DEFAULT_CLONE_TIMING: CloneTiming = {
  idleTimeoutMs: 180_000,
  killGraceMs: 5_000,
  closeGraceMs: 2_000,
};

const processLocks = new Set<string>();

export function defaultCloneDeps(): CloneDeps {
  return {
    platform: process.platform,
    env: () => process.env,
    fs: { lstat, stat, realpath },
    resolveGit: resolveGitExecutable,
    spawn: (command, args, options) => spawn(command, args, options),
    killTree: (child, signal) => killProcessTree(child, signal),
    parseRepository: parseGithubRepository,
    newId: randomUUID,
    log: (message, detail) => console.error(message, detail),
    locks: processLocks,
    timing: DEFAULT_CLONE_TIMING,
  };
}
