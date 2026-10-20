/**
 * Stops a clone's whole process tree: git, `git-remote-https`, `ssh`, credential
 * helpers. Every send is synchronous, because `releaseOwner` and `dispose` must
 * signal before their first `await` (and `dispose` also runs from
 * `process.on("exit")`, where nothing asynchronous ever runs).
 */
import { spawn, type ChildProcess } from "node:child_process";
import { killablePid } from "../platform/windows";

export type KillableChild = Pick<ChildProcess, "pid" | "kill">;

export function killProcessTree(
  child: KillableChild,
  signal: "SIGTERM" | "SIGKILL",
  platform: NodeJS.Platform = process.platform,
): void {
  const pid = killablePid(child.pid ?? null);
  if (pid === null) {
    return;
  }
  try {
    if (platform === "win32") {
      // `taskkill /T` walks the tree Windows knows about; there is no polite
      // signal for a console-less git, so it is always forced.
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true,
      });
      killer.on("error", () => {});
      return;
    }
    // The clone was spawned detached, so its pid is also its process group.
    process.kill(-pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
      console.warn("Deck: failed to stop a clone process", (error as NodeJS.ErrnoException).code);
    }
    try {
      child.kill(signal);
    } catch {
      // Already gone: the outcome we wanted.
    }
  }
}
