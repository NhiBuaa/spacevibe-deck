/**
 * Test support for the clone service: a fake child process, a virtual file
 * system and an injected `CloneDeps`, so no test needs git, a network or a real
 * clock. Not imported by shipping code.
 */
import { EventEmitter } from "node:events";
import { vi, type Mock } from "vitest";
import type { CloneJob, CloneService } from "../../src/lib/clone-contract";
import { parseGithubRepository } from "../../src/lib/github-repository";
import { createCloneService } from "./clone";
import type { CloneChild, CloneDeps } from "./clone-deps";

export class FakeChild extends EventEmitter {
  pid: number | undefined;
  readonly stderr = new EventEmitter();
  readonly kill = vi.fn<() => boolean>(() => true);
  private exited = false;

  constructor(pid: number | null) {
    super();
    this.pid = pid ?? undefined;
  }

  /** Git writes diagnostics and progress here. */
  write(text: string): void {
    this.stderr.emit("data", Buffer.from(text, "utf8"));
  }

  /** The process ends; stderr drains and `close` follows `exit`. */
  finish(code: number | null = 0, signal: NodeJS.Signals | null = null): void {
    if (this.exited) {
      return;
    }
    this.exited = true;
    this.emit("exit", code, signal);
    this.emit("close", code, signal);
  }

  /** `spawn` itself failed (ENOENT): no pid, one `error` event. */
  fail(code: string): void {
    const error = Object.assign(new Error(`spawn git ${code}`), { code });
    this.emit("error", error);
  }
}

/** Paths that exist in the virtual file system; everything else is ENOENT. */
export class VirtualFs {
  readonly entries = new Set<string>();
  readonly directories = new Set<string>();

  asDeps(): CloneDeps["fs"] {
    const missing = (target: string) =>
      Object.assign(new Error(`ENOENT ${target}`), { code: "ENOENT" });
    return {
      lstat: async (target) => {
        if (!this.entries.has(target) && !this.directories.has(target)) {
          throw missing(target);
        }
        return { isDirectory: () => this.directories.has(target) };
      },
      stat: async (target) => {
        if (!this.directories.has(target)) {
          throw missing(target);
        }
        return { isDirectory: () => true };
      },
      realpath: async (target) => target,
    };
  }
}

export interface Harness {
  readonly service: CloneService;
  readonly deps: CloneDeps;
  readonly vfs: VirtualFs;
  readonly children: FakeChild[];
  readonly spawn: Mock<CloneDeps["spawn"]>;
  readonly kills: { readonly pid: number | undefined; readonly signal: string }[];
  readonly logs: { message: string; detail: Record<string, unknown> }[];
  readonly events: { owner: string; job: CloneJob }[];
  readonly locks: Set<string>;
  /** Lets pending promise chains and fake timers run. */
  settle(): Promise<void>;
}

export const TEST_TIMING = { idleTimeoutMs: 60_000, killGraceMs: 5_000, closeGraceMs: 1_000 };

/** Needs `vi.useFakeTimers()` in the calling file. */
export function createHarness(overrides: Partial<CloneDeps> = {}): Harness {
  const vfs = new VirtualFs();
  const children: FakeChild[] = [];
  const kills: Harness["kills"] = [];
  const logs: Harness["logs"] = [];
  const locks = new Set<string>();
  let nextId = 0;
  const spawn = vi.fn<CloneDeps["spawn"]>(() => {
    const child = children.shift();
    if (child === undefined) {
      throw new Error("test did not queue a child");
    }
    return child as unknown as CloneChild;
  });
  const deps: CloneDeps = {
    platform: "linux",
    env: () => ({ PATH: "/usr/bin" }),
    fs: vfs.asDeps(),
    resolveGit: async () => "/opt/git/bin/git",
    spawn,
    killTree: (child, signal) => kills.push({ pid: child.pid, signal }),
    parseRepository: parseGithubRepository,
    newId: () => `job-${(nextId += 1)}`,
    log: (message, detail) => logs.push({ message, detail }),
    locks,
    timing: TEST_TIMING,
    ...overrides,
  };
  const service = createCloneService(deps);
  const events: Harness["events"] = [];
  service.onChanged((owner, job) => events.push({ owner, job }));
  const harness: Harness = {
    service,
    deps,
    vfs,
    children,
    spawn,
    kills,
    logs,
    events,
    locks,
    settle: async () => {
      await vi.advanceTimersByTimeAsync(0);
    },
  };
  return harness;
}

/** Queues the child the next spawn returns, remembering it for the test body. */
export function queueChild(harness: Harness, pid: number | null = 4242): FakeChild {
  const child = new FakeChild(pid);
  harness.children.push(child);
  return child;
}
