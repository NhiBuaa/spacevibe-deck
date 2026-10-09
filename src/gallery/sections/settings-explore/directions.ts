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
    replaces: ["§5 config row", "§11 full-window screens (rail)", "§6 value kinds"],
    Frame: CommandFrame,
  },
  {
    id: "canvas",
    label: "Canvas",
    thesis: "The app is its own menu: point at a part of a live Deck to edit it.",
    replaces: ["§11 full-window screens", "§5 config row", "§24 theme gallery"],
    Frame: CanvasFrame,
  },
  {
    id: "control",
    label: "Control center",
    thesis: "State first: see the health of the whole setup at a glance, then fix what is red.",
    replaces: ["§11 full-window screens", "§5 config row", "§6 value kinds"],
    Frame: ControlFrame,
  },
  {
    id: "reference",
    label: "Reference",
    thesis: "Today's structure refined (the 2026-10-04 proposal), for comparison only.",
    replaces: [],
    Frame: SettingsFrame,
  },
];

export function directionById(id: DirectionId): Direction {
  const found = DIRECTIONS.find((direction) => direction.id === id);
  if (found === undefined) throw new Error(`Unknown settings direction: ${id}`);
  return found;
}
