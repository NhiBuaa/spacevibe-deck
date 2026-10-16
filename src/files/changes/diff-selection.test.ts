import { signal } from "@preact/signals";
import { afterEach, describe, expect, it } from "vitest";
import type { ChangeEntry, ChangesSnapshot } from "../../host/git-changes-host";
import type { ChangesState } from "./changes-controller";
import { createDiffSelection, type DiffSelectionStore } from "./diff-selection";

const ROOT = "/work/repo";
const OTHER = "/work/other";

function entry(path: string): ChangeEntry {
  return {
    path,
    status: "modified",
    oldPath: null,
    added: 1,
    removed: 0,
    binary: false,
    counted: true,
  };
}

function snapshot(paths: readonly string[], initial = false): ChangesSnapshot {
  return {
    kind: "changes",
    branch: "main",
    detached: false,
    oid: null,
    initial,
    entries: paths.map(entry),
    omitted: 0,
    totals: { added: paths.length, removed: 0 },
  };
}

const FIVE = ["a.ts", "b.ts", "c.ts", "d.ts", "e.ts"];

function fresh(paths: readonly string[], root = ROOT, initial = false): ChangesState {
  return { root, snapshot: snapshot(paths, initial), failure: null, reading: false };
}

const stores: DiffSelectionStore[] = [];

function setup(initial: ChangesState = fresh(FIVE)) {
  const state = signal<ChangesState>(initial);
  const store = createDiffSelection(state);
  stores.push(store);
  return { state, store };
}

afterEach(() => {
  while (stores.length > 0) {
    stores.pop()?.dispose();
  }
});

describe("open, close and position", () => {
  it("is closed until a row is pressed, then reports entry, position and total", () => {
    const { store } = setup();
    expect(store.selection.value).toBeNull();
    expect(store.view.value).toBeNull();

    store.open(ROOT, "b.ts");
    expect(store.selection.value).toEqual({ root: ROOT, path: "b.ts", origin: "b.ts" });
    expect(store.view.value).toMatchObject({
      kind: "entry",
      position: 2,
      total: 5,
      initial: false,
      entry: { path: "b.ts" },
      previous: { path: "a.ts" },
      next: { path: "c.ts" },
    });
  });

  it("carries an unborn branch into the view", () => {
    const { store } = setup(fresh(FIVE, ROOT, true));
    store.open(ROOT, "a.ts");
    expect(store.view.value).toMatchObject({ kind: "entry", initial: true });
  });

  it("pressing another row swaps the file and the origin", () => {
    const { store } = setup();
    store.open(ROOT, "a.ts");
    store.open(ROOT, "d.ts");
    expect(store.selection.value).toEqual({ root: ROOT, path: "d.ts", origin: "d.ts" });
  });

  it("close returns what was open and empties the view", () => {
    const { store } = setup();
    store.open(ROOT, "c.ts");
    expect(store.close()).toEqual({ root: ROOT, path: "c.ts", origin: "c.ts" });
    expect(store.selection.value).toBeNull();
    expect(store.view.value).toBeNull();
    expect(store.close()).toBeNull();
  });
});

describe("next and previous file", () => {
  it("moves along the entries, keeps the origin, and updates the position", () => {
    const { store } = setup();
    store.open(ROOT, "b.ts");
    expect(store.step("next")).toBe(true);
    expect(store.step("next")).toBe(true);
    expect(store.selection.value).toEqual({ root: ROOT, path: "d.ts", origin: "b.ts" });
    expect(store.view.value).toMatchObject({ kind: "entry", position: 4, total: 5 });
    expect(store.step("previous")).toBe(true);
    expect(store.view.value).toMatchObject({ position: 3 });
  });

  it("stops at both ends instead of wrapping", () => {
    const { store } = setup();
    store.open(ROOT, "a.ts");
    expect(store.view.value).toMatchObject({ previous: null });
    expect(store.step("previous")).toBe(false);
    expect(store.selection.value?.path).toBe("a.ts");

    store.open(ROOT, "e.ts");
    expect(store.view.value).toMatchObject({ position: 5, next: null });
    expect(store.step("next")).toBe(false);
    expect(store.selection.value?.path).toBe("e.ts");
  });

  it("does nothing while closed or while the position is unknown", () => {
    const { state, store } = setup();
    expect(store.step("next")).toBe(false);
    store.open(ROOT, "b.ts");
    state.value = { root: ROOT, snapshot: null, failure: null, reading: true };
    expect(store.step("next")).toBe(false);
    expect(store.selection.value?.path).toBe("b.ts");
  });
});

describe("no longer changed", () => {
  it("is derived from a fresh snapshot of the same root without the path", () => {
    const { state, store } = setup();
    store.open(ROOT, "c.ts");
    state.value = fresh(["a.ts", "b.ts", "d.ts", "e.ts"]);
    expect(store.view.value).toMatchObject({ kind: "gone", total: 4 });
    expect(store.selection.value?.path).toBe("c.ts");
  });

  it("restores the entry when the path comes back", () => {
    const { state, store } = setup();
    store.open(ROOT, "c.ts");
    state.value = fresh(["a.ts", "b.ts"]);
    expect(store.view.value?.kind).toBe("gone");
    state.value = fresh(["a.ts", "b.ts", "c.ts"]);
    expect(store.view.value).toMatchObject({ kind: "entry", position: 3, total: 3 });
  });

  it("is never raised by a failure reply, which keeps the old snapshot", () => {
    const { state, store } = setup();
    store.open(ROOT, "c.ts");
    state.value = {
      root: ROOT,
      snapshot: snapshot(["a.ts", "b.ts"]),
      failure: { kind: "timeout", message: "slow" },
      reading: false,
    };
    expect(store.view.value).toEqual({ kind: "unknown" });
  });

  it("is never raised by the empty state, a reading state or another root", () => {
    const { state, store } = setup();
    store.open(ROOT, "c.ts");

    state.value = { root: null, snapshot: null, failure: null, reading: false };
    expect(store.view.value).toEqual({ kind: "unknown" });

    state.value = { root: ROOT, snapshot: null, failure: null, reading: true };
    expect(store.view.value).toEqual({ kind: "unknown" });

    state.value = fresh(["a.ts"], OTHER);
    expect(store.view.value).toEqual({ kind: "unknown" });

    state.value = {
      root: ROOT,
      snapshot: null,
      failure: { kind: "not-repository", message: "Not a git repository" },
      reading: false,
    };
    expect(store.view.value).toEqual({ kind: "unknown" });
  });

  it("keeps the arrows moving from the slot the file left", () => {
    const { state, store } = setup();
    store.open(ROOT, "c.ts");
    state.value = fresh(["a.ts", "b.ts", "d.ts", "e.ts"]);
    expect(store.view.value).toMatchObject({
      kind: "gone",
      previous: { path: "b.ts" },
      next: { path: "d.ts" },
    });
    expect(store.step("next")).toBe(true);
    expect(store.view.value).toMatchObject({ kind: "entry", position: 3, total: 4 });
  });

  it("moves from the slot even when entries before it left first", () => {
    const { state, store } = setup();
    store.open(ROOT, "c.ts");
    state.value = fresh(["b.ts", "c.ts", "d.ts", "e.ts"]);
    expect(store.view.value).toMatchObject({ kind: "entry", position: 2 });
    state.value = fresh(["b.ts", "d.ts", "e.ts"]);
    expect(store.view.value).toMatchObject({
      kind: "gone",
      previous: { path: "b.ts" },
      next: { path: "d.ts" },
    });
  });

  it("stops at the ends when the file left from the last slot", () => {
    const { state, store } = setup();
    store.open(ROOT, "e.ts");
    state.value = fresh(["a.ts", "b.ts", "c.ts", "d.ts"]);
    expect(store.view.value).toMatchObject({
      kind: "gone",
      next: null,
      previous: { path: "d.ts" },
    });
    expect(store.step("next")).toBe(false);
    expect(store.step("previous")).toBe(true);
    expect(store.selection.value?.path).toBe("d.ts");
  });

  it("with an empty fresh list there is nowhere to go", () => {
    const { state, store } = setup();
    store.open(ROOT, "c.ts");
    state.value = fresh([]);
    expect(store.view.value).toMatchObject({ kind: "gone", total: 0, previous: null, next: null });
    expect(store.step("next")).toBe(false);
    expect(store.step("previous")).toBe(false);
  });

  it("a path opened before any snapshot arrives starts the arrows at the ends", () => {
    const { state, store } = setup({ root: ROOT, snapshot: null, failure: null, reading: true });
    store.open(ROOT, "zz.ts");
    expect(store.view.value).toEqual({ kind: "unknown" });
    state.value = fresh(FIVE);
    expect(store.view.value).toMatchObject({
      kind: "gone",
      previous: { path: "e.ts" },
      next: { path: "a.ts" },
    });
  });
});
