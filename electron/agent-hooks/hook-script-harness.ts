/** Runs a hook script under `/bin/sh` against a local listener, for tests of the scripts. */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface Post {
  readonly url: string;
  readonly body: string;
}

const scratch: string[] = [];
const listeners: http.Server[] = [];

/** Close the listeners and delete the scratch scripts; call from `afterEach`. */
export async function cleanupHookHarness(): Promise<void> {
  await Promise.all(listeners.splice(0).map((l) => new Promise((done) => l.close(done))));
  await Promise.all(scratch.splice(0).map((dir) => fs.rm(dir, { recursive: true })));
}

/** A listener that records the posts it gets; the scripts under test post to it. */
export async function startListener() {
  const posts: Post[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      posts.push({ url: request.url ?? "", body: Buffer.concat(chunks).toString("utf8") });
      response.statusCode = 204;
      response.end();
    });
  });
  listeners.push(server);
  await new Promise<void>((ready) => server.listen(0, "127.0.0.1", ready));
  return { posts, port: (server.address() as AddressInfo).port };
}

export interface RunOptions {
  /** Added to a minimal env. The shell's own carries a live Deck's DECK_PANE_ID, token and port. */
  readonly env: Record<string, string>;
  readonly event?: string;
  readonly stdin?: string;
  readonly shellFlags?: readonly string[];
}

/** Resolves with the exit code once the script has exited. */
export async function runHookScript(source: string, options: RunOptions): Promise<number | null> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deck-hook-script-test-"));
  scratch.push(dir);
  const file = path.join(dir, "hook.sh");
  await fs.writeFile(file, source, { mode: 0o700 });
  const event = options.event ?? "Stop";
  const stdin = options.stdin ?? JSON.stringify({ hook_event_name: event, session_id: "s-1" });
  return new Promise<number | null>((resolve, reject) => {
    const child = spawn("/bin/sh", [...(options.shellFlags ?? []), file, event], {
      env: { PATH: "/usr/bin:/bin", ...options.env },
      stdio: ["pipe", "ignore", "ignore"],
    });
    child.on("error", reject);
    child.on("close", resolve);
    // A guard that exits early never reads stdin; that EPIPE is a case under test.
    child.stdin.on("error", () => {});
    child.stdin.end(stdin);
  });
}
