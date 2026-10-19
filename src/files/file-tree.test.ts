import { describe, expect, it } from "vitest";
import {
  canExpand,
  ALWAYS_HIDDEN,
  FALLBACK_IGNORED,
  flattenTree,
  isHidden,
  isVisible,
  openDirectories,
  sortEntries,
  toggleExpanded,
  visibleEntries,
  type DirEntry,
  type IgnoreFilter,
} from "./file-tree";

function entry(path: string, options: { directory?: boolean; outOfRoot?: boolean } = {}): DirEntry {
  const name = path.slice(path.lastIndexOf("/") + 1);
  return {
    name,
    path,
    directory: options.directory ?? false,
    outOfRoot: options.outOfRoot ?? false,
  };
}

describe("sortEntries", () => {
  it("puts directories first, then files, each alphabetical", () => {
    const sorted = sortEntries([
      entry("/r/zeta.ts"),
      entry("/r/src", { directory: true }),
      entry("/r/alpha.ts"),
      entry("/r/docs", { directory: true }),
    ]);
    expect(sorted.map((e) => e.name)).toEqual(["docs", "src", "alpha.ts", "zeta.ts"]);
  });

  it("compares case-insensitively so README sits beside readme", () => {
    const sorted = sortEntries([entry("/r/banana.ts"), entry("/r/Apple.ts"), entry("/r/apple.ts")]);
    expect(sorted.map((e) => e.name)).toEqual(["Apple.ts", "apple.ts", "banana.ts"]);
  });

  it("does not mutate its input", () => {
    const input = [entry("/r/b.ts"), entry("/r/a.ts")];
    sortEntries(input);
    expect(input.map((e) => e.name)).toEqual(["b.ts", "a.ts"]);
  });
});

describe("the exclusion constants", () => {
  it("are two named sets", () => {
    expect([...ALWAYS_HIDDEN]).toEqual([".git"]);
    expect([...FALLBACK_IGNORED].sort()).toEqual(["dist", "node_modules", "target"]);
  });

  it("hide the fallback names and dot-entries by default (IGN11)", () => {
    for (const name of [...ALWAYS_HIDDEN, ...FALLBACK_IGNORED]) {
      expect(isVisible(entry(`/r/${name}`, { directory: true }), false)).toBe(false);
    }
    expect(isVisible(entry("/r/.env"), false)).toBe(false);
    expect(isVisible(entry("/r/src.ts"), false)).toBe(true);
  });

  it("reveal dot-entries under showHidden but never .git (IGN9)", () => {
    expect(isVisible(entry("/r/.env"), true)).toBe(true);
    expect(isVisible(entry("/r/.git", { directory: true }), true)).toBe(false);
    expect(isVisible(entry("/r/.git", { directory: true }), true, SHOWING)).toBe(false);
  });

  it("recognises dot-entries", () => {
    expect(isHidden(".env")).toBe(true);
    expect(isHidden("env")).toBe(false);
  });
});

const SHOWING: IgnoreFilter = { ignored: undefined, showIgnored: true };

describe("git's verdict (IGN10)", () => {
  const verdict = (...names: string[]): IgnoreFilter => ({
    ignored: new Set(names),
    showIgnored: false,
  });

  it("replaces the fallback list: a tracked dist is shown, an odd ignored name is not", () => {
    expect(isVisible(entry("/r/dist", { directory: true }), false, verdict())).toBe(true);
    expect(isVisible(entry("/r/coverage", { directory: true }), false, verdict("coverage"))).toBe(
      false,
    );
  });

  it("shows ignored entries once the toggle is on", () => {
    const shown = { ...verdict("coverage"), showIgnored: true };
    expect(isVisible(entry("/r/coverage", { directory: true }), false, shown)).toBe(true);
  });

  it("applies the fallback to a listing without a verdict, and shows it with the toggle", () => {
    const node = entry("/r/node_modules", { directory: true });
    expect(isVisible(node, false)).toBe(false);
    expect(isVisible(node, false, SHOWING)).toBe(true);
  });

  it("combines with showHidden independently in all four combinations (IGN12)", () => {
    const secret = entry("/r/.env.local");
    const ignored = (showIgnored: boolean): IgnoreFilter => ({
      ignored: new Set([".env.local"]),
      showIgnored,
    });
    expect(isVisible(secret, false, ignored(false))).toBe(false);
    expect(isVisible(secret, true, ignored(false))).toBe(false);
    expect(isVisible(secret, false, ignored(true))).toBe(false);
    expect(isVisible(secret, true, ignored(true))).toBe(true);
  });
});

describe("visibleEntries", () => {
  it("filters and sorts in one pass", () => {
    const rows = visibleEntries(
      [
        entry("/r/node_modules", { directory: true }),
        entry("/r/b.ts"),
        entry("/r/.env"),
        entry("/r/a", { directory: true }),
      ],
      false,
    );
    expect(rows.map((e) => e.name)).toEqual(["a", "b.ts"]);
  });
});

describe("canExpand", () => {
  it("refuses a symlink that resolves outside the root", () => {
    expect(canExpand(entry("/r/src", { directory: true }))).toBe(true);
    expect(canExpand(entry("/r/away", { directory: true, outOfRoot: true }))).toBe(false);
    expect(canExpand(entry("/r/file.ts"))).toBe(false);
  });
});

describe("flattenTree", () => {
  const listings = new Map<string, readonly DirEntry[]>([
    [
      "/r",
      [
        entry("/r/src", { directory: true }),
        entry("/r/readme.md"),
        entry("/r/node_modules", { directory: true }),
      ],
    ],
    ["/r/src", [entry("/r/src/deep", { directory: true }), entry("/r/src/index.ts")]],
    ["/r/src/deep", [entry("/r/src/deep/leaf.ts")]],
  ]);

  it("renders only the root's children when nothing is expanded", () => {
    const rows = flattenTree("/r", listings, new Set(), false, true);
    expect(rows.map((r) => [r.name, r.depth])).toEqual([
      ["r", 0],
      ["src", 1],
      ["readme.md", 1],
    ]);
  });

  it("emits the root as row 0 at depth 0, with children at depth 1", () => {
    const rows = flattenTree("/r", listings, new Set(), false, true);
    expect(rows.map((r) => [r.name, r.depth])).toEqual([
      ["r", 0],
      ["src", 1],
      ["readme.md", 1],
    ]);
    expect(rows[0]).toMatchObject({
      path: "/r",
      directory: true,
      expanded: true,
      outOfRoot: false,
    });
  });

  it("emits exactly one row when the root is collapsed", () => {
    const rows = flattenTree("/r", listings, new Set(["/r/src"]), false, false);
    expect(rows.map((r) => r.name)).toEqual(["r"]);
    expect(rows[0].expanded).toBe(false);
  });

  it("keeps the root row when the root has no listing at all", () => {
    const rows = flattenTree("/r", new Map(), new Set(), false, true);
    expect(rows.map((r) => r.name)).toEqual(["r"]);
  });

  it("descends into expanded directories in display order", () => {
    const rows = flattenTree("/r", listings, new Set(["/r/src"]), false, true);
    expect(rows.map((r) => [r.name, r.depth])).toEqual([
      ["r", 0],
      ["src", 1],
      ["deep", 2],
      ["index.ts", 2],
      ["readme.md", 1],
    ]);
  });

  it("descends two levels and keeps depth-first order", () => {
    const rows = flattenTree("/r", listings, new Set(["/r/src", "/r/src/deep"]), false, true);
    expect(rows.map((r) => [r.name, r.depth])).toEqual([
      ["r", 0],
      ["src", 1],
      ["deep", 2],
      ["leaf.ts", 3],
      ["index.ts", 2],
      ["readme.md", 1],
    ]);
  });

  it("shows an expanded directory with no listing yet as a childless row", () => {
    const rows = flattenTree(
      "/r",
      new Map([["/r", [entry("/r/pending", { directory: true })]]]),
      new Set(["/r/pending"]),
      false,
      true,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1].expanded).toBe(true);
  });

  it("never walks into a symlink that resolves out of the root", () => {
    const rows = flattenTree(
      "/r",
      new Map<string, readonly DirEntry[]>([
        ["/r", [entry("/r/away", { directory: true, outOfRoot: true })]],
        ["/r/away", [entry("/r/away/secret.txt")]],
      ]),
      new Set(["/r/away"]),
      false,
      true,
    );
    expect(rows.map((r) => r.name)).toEqual(["r", "away"]);
    expect(rows[1].expanded).toBe(false);
  });

  it("terminates on a symlink cycle inside the root", () => {
    const rows = flattenTree(
      "/r",
      new Map<string, readonly DirEntry[]>([
        ["/r", [entry("/r/a", { directory: true })]],
        ["/r/a", [entry("/r", { directory: true })]],
      ]),
      new Set(["/r", "/r/a"]),
      false,
      true,
    );
    // The third entry is the CHILD row named `r`, not a second root row: the
    // `walked` set is what stops the loop.
    expect(rows.map((r) => r.name)).toEqual(["r", "a", "r"]);
  });
});

describe("flattenTree with an ignore view", () => {
  const listings = new Map<string, readonly DirEntry[]>([
    [
      "/r",
      [
        entry("/r/src", { directory: true }),
        entry("/r/coverage", { directory: true }),
        entry("/r/dist", { directory: true }),
        entry("/r/.git", { directory: true }),
      ],
    ],
    ["/r/src", [entry("/r/src/a.ts"), entry("/r/src/gen.ts")]],
  ]);
  const verdicts = new Map([
    ["/r", new Set(["coverage"])],
    ["/r/src", new Set(["gen.ts"])],
  ]);

  it("hides what git ignores and shows a tracked dist", () => {
    const rows = flattenTree("/r", listings, new Set(["/r/src"]), false, true, {
      verdicts,
      showIgnored: false,
    });
    expect(rows.map((r) => r.name)).toEqual(["r", "dist", "src", "a.ts"]);
    expect(rows.every((r) => !r.ignored)).toBe(true);
  });

  it("marks ignored rows when the toggle is on, still hiding .git", () => {
    const rows = flattenTree("/r", listings, new Set(["/r/src"]), false, true, {
      verdicts,
      showIgnored: true,
    });
    expect(rows.map((r) => [r.name, r.ignored])).toEqual([
      ["r", false],
      ["coverage", true],
      ["dist", false],
      ["src", false],
      ["a.ts", false],
      ["gen.ts", true],
    ]);
  });

  it("uses the fallback list for a directory with no verdict", () => {
    const rows = flattenTree("/r", listings, new Set(), false, true, {
      verdicts: new Map(),
      showIgnored: true,
    });
    expect(rows.map((r) => [r.name, r.ignored])).toContainEqual(["dist", true]);
    expect(rows.map((r) => r.name)).not.toContain(".git");
  });
});

describe("toggleExpanded", () => {
  it("adds, removes, and never mutates the input set", () => {
    const start = new Set(["/r/a"]);
    const added = toggleExpanded(start, "/r/b");
    expect([...added].sort()).toEqual(["/r/a", "/r/b"]);
    expect([...toggleExpanded(added, "/r/a")]).toEqual(["/r/b"]);
    expect([...start]).toEqual(["/r/a"]);
  });
});

describe("openDirectories", () => {
  it("is the root plus every expanded row — the listing and watch scope", () => {
    const rows = flattenTree(
      "/r",
      new Map<string, readonly DirEntry[]>([
        ["/r", [entry("/r/src", { directory: true })]],
        ["/r/src", [entry("/r/src/deep", { directory: true })]],
      ]),
      new Set(["/r/src", "/r/src/deep"]),
      false,
      true,
    );
    expect(openDirectories(rows, "/r")).toEqual(["/r", "/r/src", "/r/src/deep"]);
  });

  it("names the root once even though the root row is itself expanded", () => {
    const rows = flattenTree(
      "/r",
      new Map<string, readonly DirEntry[]>([
        ["/r", [entry("/r/src", { directory: true })]],
        ["/r/src", [entry("/r/src/deep", { directory: true })]],
      ]),
      new Set(["/r/src", "/r/src/deep"]),
      false,
      true,
    );
    expect(openDirectories(rows, "/r")).toEqual(["/r", "/r/src", "/r/src/deep"]);
  });
});
