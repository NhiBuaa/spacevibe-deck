/**
 * Settings → Agents, the agent catalog — the data the Launch chapter's
 * catalog and ⌘T widgets read.
 *
 * Every agent Deck knows, split by whether the discovery probe found its
 * binary, each with the exact command it launches with. The commands are the
 * catalog's own `defaultCommand` values (`src/lib/agent-catalog.ts`), not
 * invented ones: a reader can check them against the CLI they already run, so
 * a plausible-looking flag would be worse than no widget at all.
 *
 * Two things the catalog deliberately does NOT draw, because the app stopped
 * drawing them on 2026-08-19 (`launch-profile-editor.tsx:42-46`): a star or
 * any "Set default" control, and the ↗ link to each agent's website.
 * `Settings.defaultAgent` and `BuiltinAgent.url` survive as data with no
 * control reading them. The enable toggle is the only control a row carries.
 */

import { AGENT_MARKS } from "../../agent-strip.js";

/**
 * The commands the catalog ships, verbatim from `BUILTIN_AGENTS`.
 *
 * `opencode` is ABSENT on purpose. `agent-catalog.ts:66` carries no
 * `defaultCommand` for it — its `--auto` is opt-in per session — and
 * `catalogLaunchCommand` falls back to the bare binary id, so the app prints
 * the bare word `opencode`. Adding a key here to make the table look complete
 * would put a flag on screen that the app never types.
 */
const DEFAULT_COMMANDS = {
  claude: "claude --dangerously-skip-permissions",
  codex: "codex --dangerously-bypass-approvals-and-sandbox",
  agy: "agy --dangerously-skip-permissions",
  gemini: "gemini --yolo",
};

/**
 * Which agents this drawing's probe found on `$PATH`.
 *
 * A `Set` filtered over `AGENT_MARKS` — which is the registry's order —
 * exactly as `LaunchProfileEditor` filters the catalog (`:162-168`). That is
 * what keeps the installed group in catalog order without being re-sorted: the
 * order is the digit-key contract.
 *
 * Exported for the ⌘T widget, which offers these same three agents with these
 * same commands: two widgets describing one imaginary machine must not
 * disagree about what is installed on it.
 */
const INSTALLED_IDS = new Set(["claude", "codex", "opencode"]);

export const INSTALLED = AGENT_MARKS.filter((agent) => INSTALLED_IDS.has(agent.id));

/** The command a row prints: the catalog's, else the bare binary. */
export function launchCommand(agent) {
  return DEFAULT_COMMANDS[agent.id] ?? agent.id;
}
