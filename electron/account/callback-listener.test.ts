import { afterEach, describe, expect, it } from "vitest";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { startCallbackListener, type CallbackListener, type Timers } from "./callback-listener";

const open: CallbackListener[] = [];

/** A clock the test advances by hand. */
function manualTimers() {
  const pending = new Map<number, () => void>();
  let next = 0;
  const timers: Timers = {
    setTimeout: (callback) => {
      next += 1;
      pending.set(next, callback);
      return next;
    },
    clearTimeout: (handle) => {
      pending.delete(handle as number);
    },
  };
  return { timers, fire: () => [...pending.values()].forEach((callback) => callback()), pending };
}

async function listener(timers: Timers = manualTimers().timers) {
  const started = await startCallbackListener({ timers, timeoutMs: 1000 });
  open.push(started);
  return started;
}

function accepts(redirectTo: string): Promise<boolean> {
  const port = Number(new URL(redirectTo).port);
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

afterEach(() => {
  for (const started of open.splice(0)) {
    started.cancel();
  }
});

describe("callback listener", () => {
  it("binds the loopback address only", async () => {
    const started = await listener();
    expect(started.redirectTo).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
  });

  it("answers HEAD / and other paths with 404 and stays open", async () => {
    const started = await listener();
    const origin = new URL(started.redirectTo).origin;
    expect((await fetch(`${origin}/`, { method: "HEAD" })).status).toBe(404);
    expect((await fetch(`${origin}/other?code=abc`)).status).toBe(404);
    expect((await fetch(started.redirectTo, { method: "POST" })).status).toBe(404);
    // A callback with neither a code nor an error is a probe, not the redirect.
    expect((await fetch(started.redirectTo)).status).toBe(400);
    expect(await accepts(started.redirectTo)).toBe(true);
  });

  it("resolves a code once and closes the port", async () => {
    const started = await listener();
    const page = fetch(`${started.redirectTo}?code=abc`).then((response) => response.text());
    const result = await started.result;
    expect(result.kind).toBe("code");
    expect(result.kind === "code" && result.code).toBe("abc");
    expect(await accepts(started.redirectTo)).toBe(false);
    if (result.kind === "code") {
      result.respond(true);
    }
    expect(await page).toContain("Signed in. You can close this tab");
  });

  it("never reflects provider text into the page", async () => {
    const started = await listener();
    const hostile = encodeURIComponent("<script>alert(1)</script>");
    const response = await fetch(
      `${started.redirectTo}?error=access_denied&error_description=${hostile}`,
    );
    const body = await response.text();
    expect(body).not.toContain("script");
    expect(await started.result).toEqual({ kind: "error", denied: true });
  });

  it("rejects a foreign Host header", async () => {
    const started = await listener();
    const port = new URL(started.redirectTo).port;
    const status = await new Promise<number>((resolve) => {
      const socket = net.connect(Number(port), "127.0.0.1", () => {
        socket.write(
          `GET /auth/callback?code=x HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n`,
        );
      });
      let data = "";
      socket.on("data", (chunk) => (data += chunk));
      socket.on("close", () => resolve(Number(data.split(" ")[1])));
    });
    expect(status).toBe(404);
    expect(await accepts(started.redirectTo)).toBe(true);
  });

  it("closes on cancel and on timeout", async () => {
    const cancelled = await listener();
    cancelled.cancel();
    expect(await cancelled.result).toEqual({ kind: "cancelled" });
    expect(await accepts(cancelled.redirectTo)).toBe(false);

    const clock = manualTimers();
    const timed = await listener(clock.timers);
    clock.fire();
    expect(await timed.result).toEqual({ kind: "timeout" });
    expect(await accepts(timed.redirectTo)).toBe(false);
  });
});

it("rejects malformed request targets without throwing in the host process", async () => {
  const bundle = await build({
    entryPoints: [fileURLToPath(new URL("./callback-listener.ts", import.meta.url))],
    bundle: true,
    write: false,
    platform: "node",
    format: "cjs",
  });
  const script =
    bundle.outputFiles[0].text +
    `
    (async () => {
      const listener = await module.exports.startCallbackListener({
        timers: { setTimeout, clearTimeout }, timeoutMs: 3000,
      });
      const url = new URL(listener.redirectTo);
      const status = await new Promise((resolve, reject) => {
        require("node:http").get({ hostname: url.hostname, port: url.port, path: "//[" }, response => {
          response.resume();
          response.on("end", () => resolve(response.statusCode));
        }).on("error", reject);
      });
      if (status !== 400) throw new Error("Expected malformed target rejection");
      const page = fetch(listener.redirectTo + "?code=fixture");
      const result = await listener.result;
      if (result.kind !== "code") throw new Error("Listener was closed by malformed target");
      result.respond(true);
      await (await page).text();
      process.exit(0);
    })().catch(error => { console.error(error); process.exit(1); });
  `;
  const outcome = await new Promise<{ code: number | null; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ["-e", script], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    const watchdog = setTimeout(() => child.kill(), 5000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", (error) => {
      clearTimeout(watchdog);
      resolve({ code: null, stderr: error.message });
    });
    child.once("close", (code) => {
      clearTimeout(watchdog);
      resolve({ code, stderr });
    });
  });
  expect(outcome, outcome.stderr).toMatchObject({ code: 0 });
}, 7000);
