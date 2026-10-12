/**
 * Write the agent wrappers under
 * `<userData>/agent-shell/bin` at boot (shell bootstrap and agent wrappers,
 * slice 1 of the agent-status queue).
 *
 * Every file is written to a sibling temp file and renamed over its target. A
 * pane that is mid-startup, or a wrapper already running, keeps the inode it
 * opened; nobody ever reads a half-written script.
 *
 * A failure answers null: panes then start `$SHELL -l` as they did before, and
 * the wrappers are simply absent. It never stops Deck from booting.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { WRAPPED_AGENTS, agentWrapperSource } from "./agent-wrappers";

export const AGENT_SHELL_DIR = "agent-shell";
const SCRIPT_MODE = 0o755;

export interface AgentShellPaths {
  /** Directory holding the agent wrappers. */
  readonly binDir: string;
}

async function writeAtomic(file: string, text: string, mode: number): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.tmp`;
  try {
    await fs.writeFile(temp, text, { encoding: "utf8", mode });
    await fs.chmod(temp, mode);
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function provisionAgentShell(
  userDataDir: string,
  log: (message: string, error: unknown) => void = console.warn,
): Promise<AgentShellPaths | null> {
  const paths: AgentShellPaths = { binDir: path.join(userDataDir, AGENT_SHELL_DIR, "bin") };
  try {
    await Promise.all(
      WRAPPED_AGENTS.map((agent) =>
        writeAtomic(path.join(paths.binDir, agent), agentWrapperSource(agent), SCRIPT_MODE),
      ),
    );
    return paths;
  } catch (error) {
    log("Deck: the agent wrappers could not be written; panes start a plain login shell.", error);
    return null;
  }
}
