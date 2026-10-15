import { describe, expect, it } from "vitest";
import { contrastRatio, deriveChromeColors, mixHex } from "../../lib/derive-colors";
import { THEME_PRESETS } from "../../settings/themes";
import { FOREGROUND_SHARE_PERCENT, USAGE_AGENT_BASE, usageAgentColor } from "./usage-agent-colors";

/** WCAG's floor for graphical objects (bars, swatches). */
const GRAPHIC_CONTRAST = 3;

describe("usageAgentColor", () => {
  it("gives each agent its own base hue and mixes it toward the theme foreground", () => {
    const colors = Object.keys(USAGE_AGENT_BASE).map((agent) =>
      usageAgentColor(agent as keyof typeof USAGE_AGENT_BASE),
    );
    expect(new Set(colors).size).toBe(colors.length);
    for (const color of colors) {
      expect(color).toContain("var(--fg)");
    }
  });

  describe.each(THEME_PRESETS.map((preset) => [preset.id, preset] as const))(
    "on %s",
    (_, preset) => {
      const { chrome2 } = deriveChromeColors(preset.theme.background, preset.theme.foreground);
      it.each(Object.entries(USAGE_AGENT_BASE))("%s holds 3:1 on chrome2", (_agent, base) => {
        const mixed = mixHex(base, preset.theme.foreground, FOREGROUND_SHARE_PERCENT / 100);
        expect(contrastRatio(mixed, chrome2)).toBeGreaterThanOrEqual(GRAPHIC_CONTRAST);
      });
    },
  );
});
