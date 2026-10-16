import { describe, expect, it } from "vitest";
import {
  diffColumnInsetFor,
  diffColumnLayout,
  MAX_DOCKED_WIDTH,
  MIN_DOCKED_WIDTH,
} from "./diff-layout";

/** The navigation sidebar's default and Electron's collapsed avatar column. */
const SIDEBAR_SHOWN = 275;
const SIDEBAR_COLLAPSED = 52;

const layoutAt = (window: number, sidebar: number, dock: number) =>
  diffColumnLayout(window - sidebar, dock);

describe("diffColumnLayout (D2)", () => {
  it("takes half the room beside the dock, at 1728 with the sidebar shown", () => {
    expect(layoutAt(1728, SIDEBAR_SHOWN, 420)).toEqual({ kind: "docked", width: 516 });
    expect(layoutAt(1728, SIDEBAR_SHOWN, 360)).toEqual({ kind: "docked", width: 546 });
  });

  it("folds at the default window, where 405px are free before any column", () => {
    expect(layoutAt(1100, SIDEBAR_SHOWN, 420)).toEqual({ kind: "folded" });
    expect(layoutAt(1100, SIDEBAR_COLLAPSED, 420)).toEqual({ kind: "folded" });
  });

  it("folds at 1470 with the sidebar shown and docks with it collapsed or hidden", () => {
    expect(layoutAt(1470, SIDEBAR_SHOWN, 420)).toEqual({ kind: "folded" });
    expect(layoutAt(1470, SIDEBAR_COLLAPSED, 420)).toEqual({ kind: "docked", width: 499 });
    expect(layoutAt(1470, 0, 420)).toEqual({ kind: "docked", width: 525 });
  });

  it("docks at the minimum and folds one pixel under it", () => {
    const dock = 420;
    const atMinimum = 2 * MIN_DOCKED_WIDTH + dock;
    expect(diffColumnLayout(atMinimum, dock)).toEqual({ kind: "docked", width: 400 });
    expect(diffColumnLayout(atMinimum - 1, dock)).toEqual({ kind: "folded" });
  });

  it("stops at the maximum on a wide display", () => {
    expect(layoutAt(2560, SIDEBAR_SHOWN, 420)).toEqual({ kind: "docked", width: 932 });
    expect(layoutAt(2560, SIDEBAR_COLLAPSED, 360)).toEqual({
      kind: "docked",
      width: MAX_DOCKED_WIDTH,
    });
  });

  it("follows the dock: a wider dock leaves less to halve", () => {
    expect(layoutAt(1728, SIDEBAR_COLLAPSED, 720)).toEqual({ kind: "docked", width: 478 });
    expect(layoutAt(1728, SIDEBAR_SHOWN, 720)).toEqual({ kind: "folded" });
  });
});

describe("diffColumnInsetFor", () => {
  it("is the docked width, and nothing while folded", () => {
    expect(diffColumnInsetFor({ kind: "docked", width: 516 })).toBe(516);
    expect(diffColumnInsetFor({ kind: "folded" })).toBe(0);
  });
});
