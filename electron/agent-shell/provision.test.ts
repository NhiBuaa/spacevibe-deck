import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { WRAPPED_AGENTS, agentWrapperSource } from "./agent-wrappers";
import { provisionAgentShell } from "./provision";

const ROOT = mkdtempSync(path.join(tmpdir(), "deck-provision-"));

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("provisionAgentShell", () => {
  it("writes the wrappers under agent-shell/bin", async () => {
    const userData = path.join(ROOT, "ok");
    const paths = await provisionAgentShell(userData);
    expect(paths).not.toBeNull();
    expect(paths?.binDir).toBe(path.join(userData, "agent-shell", "bin"));
    for (const agent of WRAPPED_AGENTS) {
      const file = path.join(paths!.binDir, agent);
      expect(readFileSync(file, "utf8")).toBe(agentWrapperSource(agent));
      expect(statSync(file).mode & 0o777).toBe(0o755);
    }
  });

  it("is idempotent and leaves no temp files behind", async () => {
    const userData = path.join(ROOT, "twice");
    await provisionAgentShell(userData);
    const again = await provisionAgentShell(userData);
    expect(again).not.toBeNull();
    expect(readdirSync(again!.binDir).sort()).toEqual([...WRAPPED_AGENTS].sort());
  });

  it("answers null and logs when the directory cannot be created", async () => {
    const blocker = path.join(ROOT, "blocker");
    writeFileSync(blocker, "a file, not a directory");
    const log = vi.fn();
    expect(await provisionAgentShell(blocker, log)).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });
});
