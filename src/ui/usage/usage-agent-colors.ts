import type { UsageAgent } from "../../lib/usage-snapshot";

/**
 * The colours an agent wears on the Usage page (owner, 2026-10-15): a fixed
 * orange for Claude, which is the hue of its own mark, and a fixed blue for
 * Codex. They stay clear of green, red and yellow, which carry status
 * (DL-3.2), and orange against blue survives the common colour-vision
 * deficiencies. The tab dot, the rail and the dock overview keep their own
 * colours.
 *
 * No single hex can hold 3:1 against every theme's `chrome2`: it is near black
 * on dark themes (luminance up to 0.066) and near white on `deck-light` (0.745),
 * and the band that clears both is empty. So each base hue is mixed toward the
 * theme's own foreground, which lightens it on dark themes and darkens it on
 * light ones. The share is the smallest that clears 3:1 with margin on every
 * built-in theme; `usage-agent-colors.test.ts` locks it.
 */
export const USAGE_AGENT_BASE: Readonly<Record<UsageAgent, string>> = {
  claude: "#e07b53",
  codex: "#4f9bd9",
};

/** How much of the theme foreground is mixed into the base hue, in percent. */
export const FOREGROUND_SHARE_PERCENT = 26;

/** The CSS colour for an agent: the base hue pulled toward `--fg`. */
export function usageAgentColor(agent: UsageAgent): string {
  return `color-mix(in srgb, ${USAGE_AGENT_BASE[agent]} ${100 - FOREGROUND_SHARE_PERCENT}%, var(--fg))`;
}
