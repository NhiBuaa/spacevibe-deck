// @vitest-environment jsdom
import { batch, signal, type Signal } from "@preact/signals";
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../editor-host", async () => {
  const actual = await vi.importActual<typeof import("../editor-host")>("../editor-host");
  const { loadStubbedMonaco } = await import("./monaco-diff-stub");
  return { ...actual, loadMonaco: loadStubbedMonaco };
});

import { DiffColumn } from "./diff-column";
import { resetStub, stub } from "./monaco-diff-stub";
import {
  createFileSurfaceController,
  type FileSurfaceController,
} from "../file-surface-controller";
import type { FileClient } from "../file-client";
import { activeFileTab } from "../file-surface-store";
import type { ChangesState, ChangesController } from "../changes/changes-controller";
import { diffFocusRequested, requestDiffFocus } from "../changes/diff-column-focus";
import { diffColumnFolded } from "../changes/diff-layout";
import { createDiffSelection, type DiffSelectionStore } from "../changes/diff-selection";
import type { DiffSidesPorts } from "../changes/diff-sides";
import type { ChangeEntry, ChangesSnapshot, HeadFileReply } from "../../host/git-changes-host";
import { MAX_EDITABLE_BYTES } from "../file-content";

const ROOT = "/work/repo";

const entry = (over: Partial<ChangeEntry> & Pick<ChangeEntry, "path">): ChangeEntry => ({
  status: "modified",
  oldPath: null,
  added: 2,
  removed: 1,
  binary: false,
  counted: true,
  ...over,
});

const ENTRIES: ChangeEntry[] = [
  entry({ path: "src/a.ts" }),
  entry({ path: "docs/new.md", status: "added", added: 3, removed: 0 }),
  entry({ path: "old.txt", status: "deleted", added: 0, removed: 9 }),
  entry({ path: "src/b.ts", status: "renamed", oldPath: "src/b-old.ts", added: 0, removed: 0 }),
  entry({ path: "img.png", status: "added", binary: true, added: 0, removed: 0 }),
];

function snapshot(entries: readonly ChangeEntry[]): ChangesSnapshot {
  return {
    kind: "changes",
    branch: "feat/x",
    detached: false,
    oid: null,
    initial: false,
    entries,
    omitted: 0,
    totals: { added: 0, removed: 0 },
  };
}

interface Rig {
  readonly state: Signal<ChangesState>;
  readonly readCount: Signal<number>;
  readonly store: DiffSelectionStore;
  readonly changes: ChangesController;
  readonly ports: {
    readonly statFiles: ReturnType<typeof vi.fn>;
    readonly readFile: ReturnType<typeof vi.fn>;
    readonly readHeadFile: ReturnType<typeof vi.fn>;
  } & DiffSidesPorts;
  readonly insets: number[];
}

const OK: HeadFileReply = {
  kind: "ok",
  content: "old\n",
  eol: "lf",
  encoding: "utf-8",
  bytes: 4,
  mixedEol: false,
};

function makeRig(entries: readonly ChangeEntry[] = ENTRIES): Rig {
  const state = signal<ChangesState>({
    root: ROOT,
    snapshot: snapshot(entries),
    failure: null,
    reading: false,
  });
  const readCount = signal(1);
  const changes: ChangesController = {
    state,
    readCount,
    setShown: vi.fn(),
    setWindowVisible: vi.fn(),
    trigger: vi.fn(),
    turnEnded: vi.fn(),
    dispose: vi.fn(),
  };
  const ports = {
    statFiles: vi.fn(async (_root: string, paths: readonly string[]) =>
      paths.map((path) => ({ path, exists: true, mtimeMs: 1, size: 10 })),
    ),
    readFile: vi.fn(async () => ({
      kind: "ok" as const,
      content: "new\n",
      eol: "lf" as const,
      encoding: "utf-8" as const,
      bytes: 4,
      mixedEol: false,
      readOnly: false,
      writable: true,
      reason: null,
      mtimeMs: 1,
      size: 4,
    })),
    readHeadFile: vi.fn(async (): Promise<HeadFileReply> => OK),
  };
  return { state, readCount, store: createDiffSelection(state), changes, ports, insets: [] };
}

const client: FileClient = {
  listDir: async () => [],
  readFile: async () => ({ kind: "refused", reason: "unused" }),
  writeFile: async (_root, path) => ({ path, mtimeMs: 1, size: 1 }),
  statFiles: async (_root, paths) =>
    paths.map((path) => ({ path, exists: true, mtimeMs: 1, size: 1 })),
  watchPaths: async () => {},
  setDirtyFiles: async () => {},
  createEntry: async (_root: string, parent: string, name: string) => ({
    path: `${parent}/${name}`,
  }),
  listenFileChanged: async () => () => {},
};

let host: HTMLDivElement;
let surface: FileSurfaceController;
let stageWidth = 1453;

class StubResizeObserver {
  static instances: StubResizeObserver[] = [];
  disconnected = false;
  constructor(readonly callback: () => void) {
    StubResizeObserver.instances.push(this);
  }
  observe(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
}

beforeEach(() => {
  resetStub();
  StubResizeObserver.instances = [];
  stageWidth = 1453;
  vi.stubGlobal("ResizeObserver", StubResizeObserver);
  surface = createFileSurfaceController({ client });
  host = document.createElement("div");
  Object.defineProperty(host, "clientWidth", { get: () => stageWidth });
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => render(null, host));
  host.remove();
  surface.dispose();
  activeFileTab.value = null;
  vi.unstubAllGlobals();
});

/** Ports, the sides' signal, a render and Monaco's import each take a hop, and
 * each render's effects run when its `act` closes. */
async function settle(): Promise<void> {
  for (let hop = 0; hop < 6; hop += 1) {
    await act(async () => void (await new Promise((resolve) => setTimeout(resolve, 0))));
  }
}

async function mount(rig: Rig, dockWidth = 420): Promise<void> {
  act(() =>
    render(
      <DiffColumn
        controller={surface}
        dockWidth={dockWidth}
        selection={rig.store}
        changes={rig.changes}
        ports={rig.ports}
        onInset={(inset) => rig.insets.push(inset)}
      />,
      host,
    ),
  );
  await settle();
}

async function open(rig: Rig, path: string, dockWidth?: number): Promise<void> {
  act(() => rig.store.open(ROOT, path));
  await mount(rig, dockWidth);
}

const column = (): HTMLElement | null => host.querySelector("[data-diff-column]");
const name = (): string | undefined =>
  host.querySelector(".diff-column__name")?.textContent ?? undefined;
const position = (): string | undefined =>
  host.querySelector(".diff-column__position")?.textContent ?? undefined;
const status = (): HTMLElement | null => host.querySelector(".file-tree-shell__status");
const button = (label: string): HTMLButtonElement | null =>
  host.querySelector(`button[aria-label="${label}"]`);

function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = column()!): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
  });
}

describe("the column's life", () => {
  it("renders nothing while no file is selected", async () => {
    const rig = makeRig();
    await mount(rig);
    expect(column()).toBeNull();
    expect(rig.ports.readHeadFile).not.toHaveBeenCalled();
  });

  it("opens on a press and names the file, its status, counts and place in the list", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    expect(column()).not.toBeNull();
    expect(name()).toBe("a.ts");
    expect(host.querySelector(".changes-row__mark")?.textContent).toBe("M");
    expect(host.querySelector(".diff-column__counts")?.textContent).toBe("+2 −1");
    expect(position()).toBe("1/5");
    expect(stub.log).toContain("create-diff");
    expect(stub.models.map((model) => model.text)).toEqual(["old\n", "new\n"]);
  });

  it("closes from its close button", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    act(() => button("Close")!.click());
    expect(rig.store.selection.value).toBeNull();
    expect(column()).toBeNull();
  });

  it("hands the stage's room back when it closes", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    expect(rig.insets.at(-1)).toBe(516);
    act(() => void rig.store.close());
    await settle();
    expect(rig.insets.at(-1)).toBe(0);
  });
});

describe("placement (D2)", () => {
  it("docks at half the room beside the dock", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts", 420);
    expect(column()!.classList.contains("diff-column--docked")).toBe(true);
    expect(column()!.style.width).toBe("516px");
    expect(rig.insets.at(-1)).toBe(516);
  });

  it("folds over the dock at the default window and adds no inset", async () => {
    stageWidth = 825;
    const rig = makeRig();
    await open(rig, "src/a.ts", 420);
    expect(column()!.classList.contains("diff-column--folded")).toBe(true);
    expect(column()!.style.width).toBe("");
    expect(rig.insets.at(-1)).toBe(0);
  });

  it("publishes whether it lies folded, for a document about to open under it", async () => {
    stageWidth = 825;
    const rig = makeRig();
    await open(rig, "src/a.ts", 420);
    expect(diffColumnFolded.value).toBe(true);
    stageWidth = 1453;
    act(() => StubResizeObserver.instances.at(-1)!.callback());
    expect(diffColumnFolded.value).toBe(false);
    stageWidth = 825;
    act(() => StubResizeObserver.instances.at(-1)!.callback());
    act(() => void rig.store.close());
    await settle();
    expect(diffColumnFolded.value).toBe(false);
  });

  it("follows the stage when the window resizes, and never closes", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts", 420);
    stageWidth = 825;
    act(() => StubResizeObserver.instances.at(-1)!.callback());
    expect(column()!.classList.contains("diff-column--folded")).toBe(true);
    stageWidth = 1453;
    act(() => StubResizeObserver.instances.at(-1)!.callback());
    expect(column()!.classList.contains("diff-column--docked")).toBe(true);
    expect(rig.store.selection.value).not.toBeNull();
  });

  it("closes when it folds over a document that holds the keyboard, and leaves focus there", async () => {
    const rig = makeRig();
    const released = vi.fn();
    const panel = document.createElement("section");
    panel.className = "file-panel";
    const editor = document.createElement("textarea");
    panel.appendChild(editor);
    document.body.appendChild(panel);
    act(() => rig.store.open(ROOT, "src/a.ts"));
    act(() =>
      render(
        <DiffColumn
          controller={surface}
          dockWidth={420}
          selection={rig.store}
          changes={rig.changes}
          ports={rig.ports}
          onInset={(inset) => rig.insets.push(inset)}
          onFocusReleased={released}
        />,
        host,
      ),
    );
    await settle();
    expect(column()!.classList.contains("diff-column--docked")).toBe(true);
    editor.focus();
    // What FilePanel's focusin does as the document takes the keyboard.
    act(() => {
      activeFileTab.value = `${ROOT}/notes.txt`;
    });
    // The window narrowing, or the sidebar opening.
    stageWidth = 825;
    act(() => StubResizeObserver.instances.at(-1)!.callback());
    await settle();
    expect(rig.store.selection.value).toBeNull();
    expect(column()).toBeNull();
    expect(rig.insets.at(-1)).toBe(0);
    expect(document.activeElement).toBe(editor);
    expect(released).not.toHaveBeenCalled();
    panel.remove();
  });

  it("stays open when it folds while focus is in the column", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts", 420);
    column()!.focus();
    stageWidth = 825;
    act(() => StubResizeObserver.instances.at(-1)!.callback());
    await settle();
    expect(column()!.classList.contains("diff-column--folded")).toBe(true);
    expect(rig.store.selection.value?.path).toBe("src/a.ts");
    expect(document.activeElement).toBe(column());
  });

  it("closes when it folds just as Open file hands the keyboard to the document", async () => {
    const rig = makeRig();
    const row = document.createElement("div");
    row.className = "changes-row";
    row.dataset.path = "src/a.ts";
    row.tabIndex = 0;
    document.body.appendChild(row);
    await open(rig, "src/a.ts", 420);
    button("Open file")!.focus();
    // Open file marks the document active at once; its editor takes focus only
    // once Monaco has loaded, so focus is still on the button here.
    act(() => {
      activeFileTab.value = `${ROOT}/src/a.ts`;
    });
    stageWidth = 825;
    act(() => StubResizeObserver.instances.at(-1)!.callback());
    await settle();
    expect(rig.store.selection.value).toBeNull();
    expect(document.activeElement).toBe(row);
    row.remove();
  });

  it("watches the stage only while open", async () => {
    const rig = makeRig();
    await mount(rig);
    expect(StubResizeObserver.instances).toHaveLength(0);
    act(() => rig.store.open(ROOT, "src/a.ts"));
    await settle();
    expect(StubResizeObserver.instances).toHaveLength(1);
    act(() => void rig.store.close());
    await settle();
    expect(StubResizeObserver.instances[0].disconnected).toBe(true);
  });

  it("follows the dock's width", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts", 420);
    await mount(rig, 720);
    expect(column()!.classList.contains("diff-column--folded")).toBe(true);
  });
});

describe("each case's representation (D6)", () => {
  it("diffs a modified file: HEAD against the working side", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    expect(rig.ports.readHeadFile).toHaveBeenCalledWith(ROOT, "src/a.ts");
    expect(rig.ports.readFile).toHaveBeenCalledWith(ROOT, `${ROOT}/src/a.ts`);
  });

  it("shows an added file as added lines only, with no HEAD read", async () => {
    const rig = makeRig();
    await open(rig, "docs/new.md");
    expect(rig.ports.readHeadFile).not.toHaveBeenCalled();
    expect(stub.log).toContain("create-whole");
    expect(stub.log).not.toContain("create-diff");
  });

  it("shows a deleted file as removed lines, with no Open file", async () => {
    const rig = makeRig();
    await open(rig, "old.txt");
    expect(rig.ports.readFile).not.toHaveBeenCalled();
    expect(stub.decorations).toMatchObject([{ options: { className: "line-delete" } }]);
    expect(button("Open file")).toBeNull();
  });

  it("headlines a rename as old to new and diffs HEAD at the old path", async () => {
    const rig = makeRig();
    await open(rig, "src/b.ts");
    expect(name()).toBe("b-old.ts → b.ts");
    expect(host.querySelector(".diff-column__name")?.getAttribute("title")).toBe("src/b.ts");
    expect(rig.ports.readHeadFile).toHaveBeenCalledWith(ROOT, "src/b-old.ts");
  });

  it("says Binary file for a binary entry and reads nothing", async () => {
    const rig = makeRig();
    await open(rig, "img.png");
    expect(host.querySelector(".diff-column__note")?.textContent).toBe("Binary file");
    expect(rig.ports.readFile).not.toHaveBeenCalled();
    expect(stub.log).not.toContain("create-diff");
    expect(button("Open file")).not.toBeNull();
  });

  it("says Too large to diff, with the size, for a side over the limit", async () => {
    const rig = makeRig();
    rig.ports.statFiles.mockResolvedValue([
      { path: `${ROOT}/src/a.ts`, exists: true, mtimeMs: 1, size: MAX_EDITABLE_BYTES * 1.7 },
    ]);
    await open(rig, "src/a.ts");
    expect(host.querySelector(".diff-column__note")?.textContent).toBe(
      "Too large to diff · 3.4 MB",
    );
    expect(rig.ports.readFile).not.toHaveBeenCalled();
  });

  it("prints a failed read as DL-19.5's red line and keeps the header and its keys", async () => {
    const rig = makeRig();
    rig.ports.readHeadFile.mockResolvedValue({ kind: "failed", message: "git took too long" });
    await open(rig, "src/a.ts");
    expect(status()?.textContent).toBe("git took too long");
    expect(status()?.classList.contains("is-failure")).toBe(true);
    expect(name()).toBe("a.ts");
    press("]");
    expect(rig.store.selection.value?.path).toBe("docs/new.md");
  });
});

describe("refresh (D7)", () => {
  it("reads again on every completed list read, even with an unchanged snapshot", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    expect(rig.ports.readFile).toHaveBeenCalledTimes(1);
    act(() => {
      rig.readCount.value += 1;
    });
    await settle();
    expect(rig.ports.readFile).toHaveBeenCalledTimes(2);
  });

  it("reads once, not twice, when a read also changes the snapshot", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    const before = rig.ports.readFile.mock.calls.length;
    act(() => {
      batch(() => {
        rig.state.value = {
          ...rig.state.value,
          snapshot: snapshot([entry({ path: "src/a.ts", added: 9 }), ...ENTRIES.slice(1)]),
        };
        rig.readCount.value += 1;
      });
    });
    await settle();
    expect(rig.ports.readFile.mock.calls.length - before).toBe(1);
    expect(host.querySelector(".diff-column__counts")?.textContent).toBe("+9 −1");
  });

  it("keeps its models when the re-read text is the same", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    const models = stub.models.length;
    act(() => {
      rig.readCount.value += 1;
    });
    await settle();
    expect(stub.models).toHaveLength(models);
  });

  it("swaps the models when the working side changed", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    rig.ports.readFile.mockResolvedValue({
      kind: "ok",
      content: "newer\n",
      eol: "lf",
      encoding: "utf-8",
      bytes: 6,
      mixedEol: false,
      readOnly: false,
      writable: true,
      reason: null,
      mtimeMs: 2,
      size: 6,
    });
    act(() => {
      rig.readCount.value += 1;
    });
    await settle();
    expect(stub.shown.map((model) => model.text)).toEqual(["old\n", "newer\n"]);
  });

  it("says No longer changed when a fresh list drops the file, and restores it on return", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    act(() => {
      rig.state.value = { ...rig.state.value, snapshot: snapshot(ENTRIES.slice(1)) };
    });
    await settle();
    expect(status()?.textContent).toBe("No longer changed");
    expect(status()?.classList.contains("is-failure")).toBe(false);
    expect(name()).toBe("a.ts");
    expect(host.querySelector(".diff-editor")).toBeNull();
    expect(position()).toBeUndefined();
    expect(button("Next file")!.getAttribute("aria-disabled")).toBeNull();

    act(() => {
      rig.state.value = { ...rig.state.value, snapshot: snapshot(ENTRIES) };
    });
    await settle();
    expect(status()).toBeNull();
    expect(position()).toBe("1/5");
    expect(host.querySelector(".diff-editor")).not.toBeNull();
  });

  it("never says No longer changed for a failure reply or the empty state", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    act(() => {
      rig.state.value = {
        ...rig.state.value,
        snapshot: snapshot([]),
        failure: { kind: "timeout", message: "slow" },
      };
    });
    await settle();
    expect(status()?.textContent).not.toBe("No longer changed");
    act(() => {
      rig.state.value = { root: null, snapshot: null, failure: null, reading: false };
    });
    await settle();
    expect(status()?.textContent ?? "").not.toBe("No longer changed");
  });
});

describe("keys (D5), only while focus is inside the column", () => {
  it("] and [ move between files and ‹ › do the same by pointer", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    press("]");
    expect(name()).toBe("new.md");
    expect(position()).toBe("2/5");
    press("[");
    expect(position()).toBe("1/5");
    act(() => button("Next file")!.click());
    expect(position()).toBe("2/5");
    act(() => button("Previous file")!.click());
    expect(position()).toBe("1/5");
  });

  it("stops at the ends, and says why on the arrow", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    press("[");
    expect(position()).toBe("1/5");
    expect(button("Previous file")!.getAttribute("aria-disabled")).toBe("true");
  });

  it("n and p move between changes in a diff", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    press("n");
    press("p");
    expect(stub.goToDiff).toEqual(["next", "previous"]);
  });

  it("Esc closes from inside and returns focus to the row", async () => {
    const rig = makeRig();
    const row = document.createElement("div");
    row.className = "changes-row";
    row.dataset.path = "src/a.ts";
    row.tabIndex = 0;
    document.body.appendChild(row);
    await open(rig, "src/a.ts");
    column()!.focus();
    press("Escape");
    expect(rig.store.selection.value).toBeNull();
    expect(document.activeElement).toBe(row);
    row.remove();
  });

  it("returns focus to the row of the file it had stepped to", async () => {
    const rig = makeRig();
    const rows = ["src/a.ts", "docs/new.md"].map((path) => {
      const row = document.createElement("div");
      row.className = "changes-row";
      row.dataset.path = path;
      row.tabIndex = 0;
      document.body.appendChild(row);
      return row;
    });
    await open(rig, "src/a.ts");
    column()!.focus();
    press("]");
    press("Escape");
    expect(document.activeElement).toBe(rows[1]);
    rows.forEach((row) => row.remove());
  });

  it("Esc outside the column does nothing: a terminal needs it", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    act(() => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(rig.store.selection.value).not.toBeNull();
  });

  it("a key outside the column does nothing", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    for (const key of ["]", "[", "n", "p"]) {
      act(() => {
        document.body.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
    }
    expect(rig.store.selection.value?.path).toBe("src/a.ts");
    expect(stub.goToDiff).toEqual([]);
  });

  it("leaves a modified key alone, so copy and the Deck chords still work", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { altKey: true }]) {
      const event = new KeyboardEvent("keydown", {
        key: "]",
        bubbles: true,
        cancelable: true,
        ...init,
      });
      act(() => void column()!.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
    }
    expect(rig.store.selection.value?.path).toBe("src/a.ts");
  });

  it("takes the keys it owns before Monaco can see them", async () => {
    const rig = makeRig();
    await open(rig, "src/a.ts");
    const seen = vi.fn();
    host.querySelector(".diff-editor")!.addEventListener("keydown", seen);
    const event = new KeyboardEvent("keydown", { key: "n", bubbles: true, cancelable: true });
    act(() => void host.querySelector(".diff-editor")!.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(true);
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("focus", () => {
  it("parks on the column's root, then moves into the editor once Monaco is up", async () => {
    const rig = makeRig();
    act(() => rig.store.open(ROOT, "src/a.ts"));
    act(() => requestDiffFocus());
    await mount(rig);
    expect(stub.focused).toEqual(["modified"]);
  });

  it("does not steal focus the user already moved elsewhere", async () => {
    const rig = makeRig();
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => rig.store.open(ROOT, "src/a.ts"));
    act(() => requestDiffFocus());
    act(() => {
      render(
        <DiffColumn
          controller={surface}
          dockWidth={420}
          selection={rig.store}
          changes={rig.changes}
          ports={rig.ports}
          onInset={() => {}}
        />,
        host,
      );
    });
    input.focus();
    await settle();
    expect(stub.focused).toEqual([]);
    input.remove();
  });

  it("answers a press once: a remount nobody pressed for leaves focus alone", async () => {
    const rig = makeRig();
    const input = document.createElement("input");
    document.body.appendChild(input);
    act(() => rig.store.open(ROOT, "src/a.ts"));
    act(() => requestDiffFocus());
    await mount(rig);
    expect(diffFocusRequested.value).toBe(false);
    input.focus();
    // The dock leaving and coming back with the selection still alive.
    act(() => render(null, host));
    await mount(rig);
    expect(document.activeElement).toBe(input);
    expect(stub.focused).toEqual(["modified"]);
    input.remove();
  });

  it("keeps focus in the column while the editor is swapped for another file", async () => {
    const rig = makeRig();
    act(() => rig.store.open(ROOT, "src/a.ts"));
    act(() => requestDiffFocus());
    await mount(rig);
    // Stands in for Monaco's focused text node inside the editor's host.
    const focusInside = () => {
      const inner = document.createElement("textarea");
      host.querySelector(".diff-editor")!.appendChild(inner);
      inner.focus();
    };
    focusInside();
    act(() => rig.store.open(ROOT, "src/b.ts"));
    await settle();
    expect(column()!.contains(document.activeElement)).toBe(true);
    expect(stub.focused.at(-1)).toBe("modified");

    // A row press: the open and its request land in the same turn.
    focusInside();
    stub.focused = [];
    act(() => {
      rig.store.open(ROOT, "src/a.ts");
      requestDiffFocus();
    });
    await settle();
    expect(column()!.contains(document.activeElement)).toBe(true);
    expect(stub.focused.at(-1)).toBe("modified");
  });

  it("hands focus to the stage when it unmounts holding it, not when Esc returns it", async () => {
    const rig = makeRig();
    const released = vi.fn();
    const draw = () =>
      act(() =>
        render(
          <DiffColumn
            controller={surface}
            dockWidth={420}
            selection={rig.store}
            changes={rig.changes}
            ports={rig.ports}
            onInset={() => {}}
            onFocusReleased={released}
          />,
          host,
        ),
      );
    const row = document.createElement("div");
    row.className = "changes-row";
    row.dataset.path = "src/a.ts";
    row.tabIndex = 0;
    document.body.appendChild(row);
    act(() => rig.store.open(ROOT, "src/a.ts"));
    draw();
    await settle();
    column()!.focus();
    press("Escape");
    await settle();
    expect(document.activeElement).toBe(row);
    expect(released).not.toHaveBeenCalled();
    row.remove();

    act(() => rig.store.open(ROOT, "src/a.ts"));
    draw();
    await settle();
    column()!.focus();
    // The dock closing under it.
    act(() => render(null, host));
    await settle();
    expect(released).toHaveBeenCalledTimes(1);
  });
});

describe("Open file", () => {
  it("opens the working file in the dock's document panel", async () => {
    const rig = makeRig();
    const openFile = vi.spyOn(surface, "openFile").mockResolvedValue(undefined as never);
    await open(rig, "src/a.ts");
    act(() => button("Open file")!.click());
    expect(openFile).toHaveBeenCalledWith(ROOT, `${ROOT}/src/a.ts`, false);
  });
});
