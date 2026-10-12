import { spawn } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { WRAPPED_AGENTS, WRAPPER_MARKER, agentWrapperSource } from "./agent-wrappers";

const ROOT = mkdtempSync(path.join(tmpdir(), "deck-wrappers-"));
const DEV_BIN = path.join(ROOT, "dev", "agent-shell", "bin");
const RELEASE_BIN = path.join(ROOT, "release", "agent-shell", "bin");
const REAL_BIN = path.join(ROOT, "real");
const EMPTY_BIN = path.join(ROOT, "empty");
const SYSTEM_PATH = "/usr/bin:/bin";

function install(dir: string, name: string, source: string, mode = 0o755): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), source);
  chmodSync(path.join(dir, name), mode);
}

// Prints what the wrapper hands the real binary. `$$` is the shell's own pid, so
// it equals the spawned pid only when the wrapper exec'd instead of forking.
const FAKE_AGENT = `#!/bin/sh
echo "pid=$$ id=$DECK_AGENT_ID nested=$DECK_AGENT_NESTED args=$*"
`;

interface Run {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly pid: number | undefined;
}

/** Run `claude` through the dev wrapper with an explicit, minimal environment. */
function run(env: Record<string, string>, args: string[] = [], timeout = 5000): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(path.join(DEV_BIN, "claude"), args, { env, timeout });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr, pid: child.pid }));
  });
}

const PATH = [DEV_BIN, RELEASE_BIN, REAL_BIN, SYSTEM_PATH].join(":");

describe.skipIf(process.platform === "win32")("agent wrapper", () => {
  beforeAll(() => {
    for (const agent of WRAPPED_AGENTS) {
      install(DEV_BIN, agent, agentWrapperSource(agent));
    }
    // A decoy in the other install's wrapper directory: reaching it means the skip failed.
    install(RELEASE_BIN, "claude", '#!/bin/sh\necho "decoy"\n');
    install(REAL_BIN, "claude", FAKE_AGENT);
    mkdirSync(EMPTY_BIN, { recursive: true });
  });
  afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

  it("execs the real binary: same pid, identity named, arguments intact", async () => {
    const result = await run({ PATH }, ["--flag", "two words"]);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(`pid=${result.pid} id=claude nested= args=--flag two words`);
  });

  it("skips every directory ending in /agent-shell/bin", async () => {
    const result = await run({ PATH });
    expect(result.stdout).not.toContain("decoy");
    expect(result.stdout).toContain("id=claude");
  });

  it("marks a second wrapper nested and leaves the first identity alone", async () => {
    const result = await run({ PATH, DECK_AGENT_ID: "codex" });
    expect(result.stdout).toContain("id=codex nested=1");
  });

  it("drops a stale nested flag when no agent owns the pane", async () => {
    const result = await run({ PATH, DECK_AGENT_NESTED: "1" });
    expect(result.stdout).toContain("id=claude nested= ");
  });

  // Each spelling names the wrapper's own directory; none may make it exec itself.
  it.each([
    ["a trailing slash", `${DEV_BIN}/`],
    ["doubled trailing slashes", `${DEV_BIN}//`],
    ["a trailing dot", `${DEV_BIN}/.`],
    ["dot-slash chains", `${DEV_BIN}/././/`],
    ["a detour through the parent", `${DEV_BIN}/../bin`],
  ])("never execs itself through %s on PATH", async (_label, spelling) => {
    const missing = await run({ PATH: [spelling, EMPTY_BIN].join(":") }, [], 3000);
    expect(missing.code).toBe(127);
    const found = await run({ PATH: [spelling, REAL_BIN].join(":") }, [], 3000);
    expect(found.stdout).toContain("id=claude");
  });

  // Neither install's directory can be recognised by its name, so only the
  // wrapper's content (and `-ef` for itself) stands between them and a loop.
  describe("two installs whose directories evade the name check", () => {
    const OTHER_BIN = path.join(ROOT, "other", "agent-shell", "bin");
    const LINK = path.join(ROOT, "linked");
    const spellings = [`${DEV_BIN}/../bin`, `${OTHER_BIN}/../bin`, LINK];

    beforeAll(() => {
      install(OTHER_BIN, "claude", agentWrapperSource("claude"));
      symlinkSync(OTHER_BIN, LINK);
    });

    // PATH holds no /usr/bin or /bin: the check must not need them.
    it("runs the real binary behind them", async () => {
      const result = await run({ PATH: [...spellings, REAL_BIN].join(":") }, [], 3000);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("id=claude");
    });

    it("exits 127 instead of bouncing between them when there is none", async () => {
      const result = await run({ PATH: [...spellings, EMPTY_BIN].join(":") }, [], 3000);
      expect(result.code).toBe(127);
      expect(result.stderr).toContain("deck: claude not found on PATH");
    });
  });

  it("carries the marker the loop check looks for", () => {
    expect(agentWrapperSource("codex").split("\n")[1]).toContain(WRAPPER_MARKER);
  });

  it("exits 127 with a message when there is no real binary", async () => {
    const result = await run({ PATH: [DEV_BIN, RELEASE_BIN, EMPTY_BIN].join(":") });
    expect(result.code).toBe(127);
    expect(result.stderr).toContain("deck: claude not found on PATH");
  });

  it("passes over a directory and a non-executable file named like the agent", async () => {
    const shadow = path.join(ROOT, "shadow");
    mkdirSync(path.join(shadow, "dir", "claude"), { recursive: true });
    install(path.join(shadow, "plain"), "claude", FAKE_AGENT, 0o644);
    const result = await run({
      PATH: [DEV_BIN, path.join(shadow, "dir"), path.join(shadow, "plain"), REAL_BIN].join(":"),
    });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("id=claude");
  });

  it("renders each agent's own name into its script", () => {
    for (const agent of WRAPPED_AGENTS) {
      const source = agentWrapperSource(agent);
      expect(source.startsWith("#!/bin/sh\n")).toBe(true);
      expect(source).toContain(`DECK_AGENT_ID=${agent}`);
      expect(source).toContain(`deck: ${agent} not found on PATH`);
    }
  });
});
