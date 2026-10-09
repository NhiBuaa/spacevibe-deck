import type { ComponentType } from "preact";
import { SettingsFrame } from "../settings-redesign/shell";
import { CanvasFrame } from "./canvas/canvas-frame";
import { CommandFrame } from "./command/command-frame";
import { ControlFrame } from "./control/control-frame";

export type DirectionId = "command" | "canvas" | "control" | "reference";

export interface Direction {
  readonly id: DirectionId;
  readonly label: string;
  /** The one-sentence compositional thesis the owner judges. */
  readonly thesis: string;
  /** DESIGN-LANGUAGE patterns this direction would replace if picked. */
  readonly replaces: readonly string[];
  /** Part I invariants it bends, each a fork to settle when the pick is promoted. */
  readonly invariants: readonly string[];
  readonly Frame: ComponentType;
}

/**
 * The exploration round's directions (plan: docs/plans/2026-10-04-settings-redesign.md §4).
 * Every direction draws the same in-memory settings from `../settings-redesign/model`, so only
 * the structure differs. `reference` is today's structure refined, shown for comparison only.
 */
export const DIRECTIONS: readonly Direction[] = [
  {
    id: "command",
    label: "Command",
    thesis: "One search field is the navigation: every setting is a live row you reach by typing.",
    replaces: [
      "§11 rail and document (DL-11.1, 11.4, 11.6)",
      "§5 group card and description line",
      "DL-6.5 three-option rule",
    ],
    invariants: ["DL-21.1 accent wash on the active row", "DL-4.5 an 18px search field"],
    Frame: CommandFrame,
  },
  {
    id: "canvas",
    label: "Canvas",
    thesis: "The app is its own menu: point at a part of a live Deck to edit it.",
    replaces: ["§11 rail (DL-11.1, 11.4)", "DL-24.2 miniature becomes the main surface"],
    invariants: ["DL-21.1 accent on selected region chips"],
    Frame: CanvasFrame,
  },
  {
    id: "control",
    label: "Control center",
    thesis: "State first: see the health of the whole setup at a glance, then fix what is red.",
    replaces: [
      "§11 rail (overview + drill-in)",
      "§5 rows on the overview become tiles",
      "§6 value kinds on tiles",
    ],
    invariants: ["DL-21.1 accent on selected segments and tiles"],
    Frame: ControlFrame,
  },
  {
    id: "reference",
    label: "Reference",
    thesis: "Today's structure refined (the 2026-10-04 proposal), for comparison only.",
    replaces: [],
    invariants: [],
    Frame: SettingsFrame,
  },
];

export function directionById(id: DirectionId): Direction {
  const found = DIRECTIONS.find((direction) => direction.id === id);
  if (found === undefined) throw new Error(`Unknown settings direction: ${id}`);
  return found;
}
