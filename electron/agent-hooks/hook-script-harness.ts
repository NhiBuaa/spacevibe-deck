/** Runs a hook script under `/bin/sh` against a local listener, for tests of the scripts. */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/**
 * Each test spawns `sh`, `head`, `awk`, `curl` and sometimes `ps`, which takes about half a second
 * on an idle machine and more than ten times that on one running a build and an Electron app
 * (load average 170 was measured), well past vitest's 5 s default.
 */
export const SCRIPT_TEST_TIMEOUT_MS = 60_000;

export interface Post {
  readonly url: string;
  readonly body: string;
  readonly headers: http.IncomingHttpHeaders;
}

const scratch: string[] = [];
const listeners: http.Server[] = [];

/** Close the listeners and delete the scratch scripts; call from `afterEach`. */
export async function cleanupHookHarness(): Promise<void> {
  await Promise.all(
    listeners.splice(0).map(
      (l) =>
        new Promise((done) => {
          l.close(done);
          l.closeAllConnections();
        }),
    ),
  );
  await Promise.all(scratch.splice(0).map((dir) => fs.rm(dir, { recursive: true })));
}

/**
 * A listener that records the posts it gets; the scripts under test post to it.
 *
 * It records only a POST that carries a pane header, which every Deck script sends. Anything
 * else is answered and ignored: a running Deck's dev-server scanner finds any listening loopback
 * port and probes it with `HEAD /` (`electron/dev-servers/protocol.ts`), which would otherwise
 * land in a test's count whenever a Deck is open on the machine.
 */
export async function startListener() {
  const posts: Post[] = [];
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      if (request.method === "POST" && request.headers["x-deck-pane"] !== undefined) {
        posts.push({
          url: request.url ?? "",
          body: Buffer.concat(chunks).toString("utf8"),
          headers: request.headers,
        });
      }
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

/**
 * Write a fake `ps` into `<dir>/bin` and answer that directory, for `PATH`. Each row is
 * `<pid> <ppid> <tty> <comm...>` and answers `ps -o ppid=,tty=,comm= -p <pid>`; the row whose pid
 * is `-` answers a pid no row names (the real parent of the script under test).
 */
export async function writeFakePs(dir: string, rows: readonly string[]): Promise<string> {
  const bin = path.join(dir, "bin");
  await fs.mkdir(bin, { recursive: true });
  const table = path.join(dir, "ps-table");
  await fs.writeFile(table, `${rows.join("\n")}\n`);
  const script = [
    "#!/bin/sh",
    "for last; do :; done",
    "found=",
    `while read -r pid ppid tty comm; do`,
    `  if [ "$pid" = "$last" ]; then found="$ppid $tty $comm"; break; fi`,
    `  if [ "$pid" = "-" ]; then fallback="$ppid $tty $comm"; fi`,
    `done < '${table}'`,
    `[ -n "$found" ] || found="\${fallback-}"`,
    `[ -n "$found" ] || exit 1`,
    `printf '%s\\n' "$found"`,
    "",
  ].join("\n");
  await fs.writeFile(path.join(bin, "ps"), script, { mode: 0o755 });
  return bin;
}
