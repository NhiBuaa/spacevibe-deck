import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { WRAPPED_AGENTS, agentWrapperSource } from "./agent-wrappers";
import { OPENCODE_PLUGIN_FILE, opencodePluginSource } from "./opencode-plugin";
import { provisionAgentShell, wrapperOptions } from "./provision";
import { opencodeConfigDir } from "./shell-bootstrap";

const ROOT = mkdtempSync(path.join(tmpdir(), "deck-provision-"));

afterAll(() => rmSync(ROOT, { recursive: true, force: true }));

describe("provisionAgentShell", () => {
  it("writes the wrappers, the zsh dotfiles and the bash rcfile under agent-shell/", async () => {
    const userData = path.join(ROOT, "ok");
    const paths = await provisionAgentShell(userData);
    expect(paths).not.toBeNull();
    expect(paths?.binDir).toBe(path.join(userData, "agent-shell", "bin"));
    for (const agent of WRAPPED_AGENTS) {
      const file = path.join(paths!.binDir, agent);
      expect(readFileSync(file, "utf8")).toBe(agentWrapperSource(agent, wrapperOptions(userData)));
      // POSIX only: Windows has no permission bits and reports 0o666 whatever was asked.
      if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o755);
    }
    expect(readdirSync(paths!.zshDir).sort()).toEqual([
      ".zlogin",
      ".zprofile",
      ".zshenv",
      ".zshrc",
    ]);
    expect(readFileSync(paths!.bashRcfile, "utf8")).toContain(paths!.binDir);
  });

  it("writes Deck's opencode plugin where the opencode wrapper points OPENCODE_CONFIG_DIR", async () => {
    const userData = path.join(ROOT, "plugin");
    await provisionAgentShell(userData);
    const file = path.join(opencodeConfigDir(userData), "plugin", OPENCODE_PLUGIN_FILE);
    expect(readFileSync(file, "utf8")).toBe(opencodePluginSource());
    expect(readFileSync(path.join(userData, "agent-shell", "bin", "opencode"), "utf8")).toContain(
      opencodeConfigDir(userData),
    );
  });

  it("is idempotent and leaves no temp files behind", async () => {
    const userData = path.join(ROOT, "twice");
    await provisionAgentShell(userData);
    const again = await provisionAgentShell(userData);
    expect(again).not.toBeNull();
    const names = [again!.binDir, again!.zshDir, path.dirname(again!.bashRcfile)].flatMap((dir) =>
      readdirSync(dir),
    );
    expect(names.filter((name) => name.endsWith(".tmp"))).toEqual([]);
  });

  it("answers null and logs when the directory cannot be created", async () => {
    const blocker = path.join(ROOT, "blocker");
    writeFileSync(blocker, "a file, not a directory");
    const log = vi.fn();
    expect(await provisionAgentShell(blocker, log)).toBeNull();
    expect(log).toHaveBeenCalledTimes(1);
  });
});
