import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import {
  resetFileSurfaces,
  setListing,
  setRootExpanded,
  toggleDirectory,
} from "./file-surface-store";
import type { DirEntry } from "./file-tree";
import { createTreeRefresh, type TreeRefresh, type TreeRefreshDeps } from "./tree-refresh";

const ROOT = "/r";

const dir = (path: string): DirEntry => ({
  name: path.slice(path.lastIndexOf("/") + 1),
  path,
  directory: true,
  outOfRoot: false,
});

let loadListing: Mock<TreeRefreshDeps["loadListing"]>;
let refresh: TreeRefresh;

/** /r with src/ and docs/ open, and src/gen/ open under src/. */
function openTree(): void {
  setRootExpanded(ROOT, true);
  setListing(ROOT, ROOT, [dir(`${ROOT}/src`), dir(`${ROOT}/docs`)]);
  setListing(ROOT, `${ROOT}/src`, [dir(`${ROOT}/src/gen`)]);
  setListing(ROOT, `${ROOT}/src/gen`, []);
  setListing(ROOT, `${ROOT}/docs`, []);
  for (const path of [`${ROOT}/src`, `${ROOT}/docs`, `${ROOT}/src/gen`]) {
    toggleDirectory(ROOT, path);
  }
}

const listed = (): string[] => loadListing.mock.calls.map((call) => call[1]).sort();

beforeEach(() => {
  vi.useFakeTimers();
  resetFileSurfaces();
  loadListing = vi.fn<TreeRefreshDeps["loadListing"]>(async () => {});
  refresh = createTreeRefresh({ loadListing, isDisposed: () => false });
  openTree();
});
afterEach(() => {
  refresh.dispose();
  vi.useRealTimers();
});

describe("handleTreeChange", () => {
  it("re-lists only the parent of an ordinary file", async () => {
    refresh.handleTreeChange(`${ROOT}/src/a.ts`);
    await vi.advanceTimersByTimeAsync(150);
    expect(listed()).toEqual([`${ROOT}/src`]);
  });

  it("re-lists every visible directory at or under a changed .gitignore (IGN16)", async () => {
    refresh.handleTreeChange(`${ROOT}/src/.gitignore`);
    await vi.advanceTimersByTimeAsync(150);
    expect(listed()).toEqual([`${ROOT}/src`, `${ROOT}/src/gen`]);
  });

  it("re-lists the whole tree for the root's .gitignore, once per directory", async () => {
    refresh.handleTreeChange(`${ROOT}/.gitignore`);
    refresh.handleTreeChange(`${ROOT}/.gitignore`);
    await vi.advanceTimersByTimeAsync(150);
    expect(listed()).toEqual([ROOT, `${ROOT}/docs`, `${ROOT}/src`, `${ROOT}/src/gen`]);
  });

  it("does not match a sibling that only shares the name prefix", async () => {
    setListing(ROOT, ROOT, [dir(`${ROOT}/src`), dir(`${ROOT}/src-old`)]);
    setListing(ROOT, `${ROOT}/src-old`, []);
    toggleDirectory(ROOT, `${ROOT}/src-old`);
    refresh.handleTreeChange(`${ROOT}/src/.gitignore`);
    await vi.advanceTimersByTimeAsync(150);
    expect(listed()).not.toContain(`${ROOT}/src-old`);
  });
});
