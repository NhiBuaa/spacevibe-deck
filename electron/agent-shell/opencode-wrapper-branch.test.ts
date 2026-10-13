import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { agentWrapperSource } from "./agent-wrappers";

// A directory with a space in it: the exported value has to survive quoting.
const ROOT = mkdtempSync(path.join(tmpdir(), "deck opencode wrapper-"));
const BIN = path.join(ROOT, "agent-shell", "bin");
const REAL = path.join(ROOT, "real");
const MARKER = path.join(ROOT, "agent-shell", "opencode-signals-on");
const CONFIG_DIR = path.join(ROOT, "agent-shell", "opencode");

const FAKE_OPENCODE = `#!/bin/sh
printf 'config=%s\\n' "\${OPENCODE_CONFIG_DIR-unset}"
printf 'args=%s\\n' "$*"
`;

function run(options: {
  marker: boolean;
  env?: Record<string, string>;
}): Promise<{ config: string; args: string }> {
  if (options.marker) writeFileSync(MARKER, "");
  else rmSync(MARKER, { force: true });
  // Explicit env: the shell this suite runs in carries a live Deck's DECK_* variables.
  const env = { PATH: `${BIN}:${REAL}:/usr/bin:/bin`, ...options.env };
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(BIN, "opencode"), ["run", "hi there"], { env, timeout: 5000 });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk));
    child.on("error", reject);
    child.on("close", () => {
      const line = (name: string) => stdout.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1] ?? "";
      resolve({ config: line("config"), args: line("args") });
    });
  });
}

describe.skipIf(process.platform === "win32")("opencode wrapper — OC1 plugin directory", () => {
  beforeAll(() => {
    mkdirSync(BIN, { recursive: true });
    mkdirSync(REAL, { recursive: true });
    writeFileSync(
      path.join(BIN, "opencode"),
      agentWrapperSource("opencode", {
        opencodeSignalsMarker: MARKER,
        opencodeConfigDir: CONFIG_DIR,
      }),
    );
    chmodSync(path.join(BIN, "opencode"), 0o755);
    writeFileSync(path.join(REAL, "opencode"), FAKE_OPENCODE);
    chmodSync(path.join(REAL, "opencode"), 0o755);
  });
  afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

  it("exports Deck's config directory while the marker exists, and adds no argument", async () => {
    expect(await run({ marker: true })).toEqual({ config: CONFIG_DIR, args: "run hi there" });
  });

  it("replaces a config directory the user exported", async () => {
    const result = await run({ marker: true, env: { OPENCODE_CONFIG_DIR: "/users/own" } });
    expect(result.config).toBe(CONFIG_DIR);
  });

  it("leaves the environment alone without the marker", async () => {
    expect((await run({ marker: false })).config).toBe("unset");
    const own = await run({ marker: false, env: { OPENCODE_CONFIG_DIR: "/users/own" } });
    expect(own.config).toBe("/users/own");
  });

  it("leaves a nested run's configuration to the outer opencode", async () => {
    const nested = await run({
      marker: true,
      env: { DECK_AGENT_ID: "claude", OPENCODE_CONFIG_DIR: "/outer" },
    });
    expect(nested.config).toBe("/outer");
  });

  // Claude Code sets CLAUDECODE for its tool subprocesses: an outer claude that skipped the
  // wrapper still owns the pane, so this opencode is nested and gets no plugin.
  it("leaves the configuration alone under a Claude Code that bypassed the wrapper", async () => {
    const nested = await run({ marker: true, env: { CLAUDECODE: "1" } });
    expect(nested.config).toBe("unset");
  });

  it("adds nothing when the wrapper was rendered without the paths", () => {
    expect(agentWrapperSource("opencode")).not.toContain("OPENCODE_CONFIG_DIR");
    expect(agentWrapperSource("claude", { opencodeSignalsMarker: MARKER })).not.toContain(
      "OPENCODE_CONFIG_DIR",
    );
  });
});
