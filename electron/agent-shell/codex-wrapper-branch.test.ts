import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classifyCodexArgs } from "../../src/lib/codex-launch-form";
import { agentWrapperSource } from "./agent-wrappers";

const ROOT = mkdtempSync(path.join(tmpdir(), "deck-codex-wrapper-"));
const BIN = path.join(ROOT, "agent-shell", "bin");
const REAL = path.join(ROOT, "real");
const MARKER = path.join(ROOT, "agent-shell", "codex-signals-on");

const BYPASS = "--dangerously-bypass-hook-trust";
const NO_DAEMON = "--no-daemon";
const FULL_HELP = `${BYPASS} ${NO_DAEMON}`;

// Answers `--help` with FAKE_HELP, as the probe reads it; otherwise reports what it was given.
const FAKE_CODEX = `#!/bin/sh
if [ "$#" -eq 1 ] && [ "$1" = --help ] && [ -n "\${FAKE_HELP+x}" ]; then
  printf '%s\\n' "$FAKE_HELP"
  exit 0
fi
printf 'args=%s\\n' "$*"
printf 'env=%s,%s,%s\\n' "\${DECK_PANE_ID-unset}" "\${DECK_HOOK_TOKEN-unset}" "\${DECK_HOOK_PORT-unset}"
`;

interface Result {
  readonly args: string;
  readonly env: string;
  readonly code: number | null;
}

function run(args: string[], options: { help?: string; marker?: boolean } = {}): Promise<Result> {
  const { help = FULL_HELP, marker = true } = options;
  if (marker) writeFileSync(MARKER, "");
  else rmSync(MARKER, { force: true });
  // Explicit env: the shell this suite runs in carries a live Deck's DECK_* variables.
  const env = {
    PATH: `${BIN}:${REAL}`,
    FAKE_HELP: help,
    DECK_PANE_ID: "7",
    DECK_HOOK_TOKEN: "tok",
    DECK_HOOK_PORT: "1234",
  };
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(BIN, "codex"), args, { env, timeout: 5000 });
    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const line = (name: string) => stdout.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1] ?? "";
      resolve({ args: line("args"), env: line("env"), code });
    });
  });
}

const FLAGS = `${NO_DAEMON} ${BYPASS}`;
const KEPT = "7,tok,1234";

describe.skipIf(process.platform === "win32")("codex wrapper — CX2 flags", () => {
  beforeAll(() => {
    mkdirSync(BIN, { recursive: true });
    mkdirSync(REAL, { recursive: true });
    writeFileSync(
      path.join(BIN, "codex"),
      agentWrapperSource("codex", { codexSignalsMarker: MARKER }),
    );
    chmodSync(path.join(BIN, "codex"), 0o755);
    writeFileSync(path.join(REAL, "codex"), FAKE_CODEX);
    chmodSync(path.join(REAL, "codex"), 0o755);
  });
  afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

  it.each([
    [[], FLAGS],
    [["fix the bug"], `${FLAGS} fix the bug`],
    [["--full-auto"], `${FLAGS} --full-auto`],
    [["resume", "--last"], `${FLAGS} resume --last`],
    [["fork", "--last"], `${FLAGS} fork --last`],
    [["-m", "gpt-5", "resume"], `${FLAGS} -m gpt-5 resume`],
    [["-i", "a.png", "b.png"], `${FLAGS} -i a.png b.png`],
  ])("the interactive form %j gets --no-daemon and the bypass", async (args, expected) => {
    const result = await run(args);
    expect(result.args).toBe(expected);
    expect(result.env).toBe(KEPT);
  });

  it.each([
    [["exec", "say hi"], "exec say hi"],
    [["e", "say hi"], "e say hi"],
    [["review"], "review"],
    [["login"], "login"],
    [["-c", "model=x", "exec", "go"], "-c model=x exec go"],
  ])("%j gets the bypass but never --no-daemon", async (args, rest) => {
    const result = await run(args);
    expect(result.args).toBe(`${BYPASS} ${rest}`);
    expect(result.env).toBe(KEPT);
  });

  it("never doubles a typed bypass or --no-daemon", async () => {
    expect((await run([BYPASS, "resume"])).args).toBe(`${NO_DAEMON} ${BYPASS} resume`);
    expect((await run([NO_DAEMON])).args).toBe(`${BYPASS} ${NO_DAEMON}`);
  });

  it("ignores a flag that only appears after --", async () => {
    const result = await run(["--", BYPASS, NO_DAEMON]);
    expect(result.args).toBe(`${FLAGS} -- ${BYPASS} ${NO_DAEMON}`);
  });

  it("leaves the information flags untouched", async () => {
    for (const args of [["-h"], ["--version"], ["-V"], ["exec", "--help"], ["resume", "-h"]]) {
      expect((await run(args)).args).toBe(args.join(" "));
    }
  });

  // The shell and TypeScript classifiers read the same tables; keep them from drifting.
  it.each([
    [["-i", "a.png", "resume"]],
    [["--remote", "ws://h:1", "resume"]],
    [["--profile", "review"]],
    [["-c", "exec"]],
    [["--add-dir", "/x", "--add-dir", "/y", "fork"]],
    [["--", "agents"]],
    [["-C", "/tmp", "agents"]],
    [["--enable", "hooks", "login"]],
  ])("agrees with classifyCodexArgs on %j", async (args) => {
    const form = classifyCodexArgs(args);
    const result = await run(args);
    const added = result.args.split(" ").includes(NO_DAEMON) && !form.hasNoDaemon;
    expect(added).toBe(!form.daemon && form.interactive && !form.remote);
    expect(result.env === "unset,unset,unset").toBe(form.daemon);
  });

  it("adds nothing without the runtime marker (Codex Signals off)", async () => {
    expect((await run(["resume"], { marker: false })).args).toBe("resume");
  });

  it("adds nothing for a Codex that lacks the bypass", async () => {
    const result = await run(["resume"], { help: NO_DAEMON });
    expect(result.args).toBe("resume");
  });

  it("skips --no-daemon for a Codex that does not list it", async () => {
    const result = await run(["resume"], { help: BYPASS });
    expect(result.args).toBe(`${BYPASS} resume`);
  });

  it.each([
    ["agents", ["agents"]],
    ["app-server", ["app-server", "--listen", "ws://x"]],
    ["remote-control", ["remote-control", "start"]],
    ["queue", ["queue", "--thread", "abc", "--message", "hello"]],
    ["archive", ["archive", "abc"]],
    ["unarchive", ["unarchive", "abc"]],
    ["delete", ["delete", "abc", "--force"]],
    ["--remote", ["--remote", "ws://h:1"]],
    ["resume --remote", ["resume", "--remote=ws://h:1"]],
  ])("%s runs without the pane's credentials, Signals on or off", async (_name, args) => {
    for (const marker of [true, false]) {
      const result = await run(args, { marker });
      expect(result.env).toBe("unset,unset,unset");
      expect(result.args).toBe(args.join(" "));
    }
  });

  it("keeps the credentials for every other command, on or off", async () => {
    for (const marker of [true, false]) {
      expect((await run(["exec", "go"], { marker })).env).toBe(KEPT);
    }
  });
});
