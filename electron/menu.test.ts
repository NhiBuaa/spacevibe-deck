/**
 * The native menu's accelerators, which are the half of a rebind that cannot
 * be seen from the renderer.
 *
 * Cocoa consumes an accelerator before the webview receives the keydown. So a
 * menu still advertising the shipped chord after a rebind does not merely look
 * stale — it runs the OLD action, and the new binding never fires. The renderer
 * tests cannot observe that at all, which is why it is asserted here.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";

const switchFixture = vi.hoisted(() => ({ enabled: true }));
vi.mock("../src/lib/release-switches", async (original) => {
  const actual = await original<typeof import("../src/lib/release-switches")>();
  return { ...actual, resolveReleaseSwitches: () => ({ menuFixture: switchFixture.enabled }) };
});
vi.mock("../src/terminal/action-registry", async (original) => {
  const actual = await original<typeof import("../src/terminal/action-registry")>();
  return {
    ...actual,
    ACTION_REGISTRY: actual.ACTION_REGISTRY.map((action) =>
      action.id === "find" ? { ...action, releaseSwitch: "menuFixture" } : action,
    ),
  };
});

const built: MenuItemConstructorOptions[][] = [];

vi.mock("electron", () => ({
  app: { getName: () => "Deck" },
  Menu: {
    buildFromTemplate: (template: MenuItemConstructorOptions[]) => {
      built.push(template);
      return template;
    },
    setApplicationMenu: () => {},
  },
}));

import { buildMenu } from "./menu";
import { WindowRegistry } from "./window-lifecycle";
import { resolveKeymap, withOverride, NO_KEYBINDING_OVERRIDES } from "../src/lib/keybindings";

const realPlatform = process.platform;

function items(template: MenuItemConstructorOptions[]): MenuItemConstructorOptions[] {
  return template.flatMap((entry) => (Array.isArray(entry.submenu) ? entry.submenu : []));
}

function accelerator(template: MenuItemConstructorOptions[], id: string): string | undefined {
  return items(template).find((item) => item.id === id)?.accelerator;
}

/** The menu as built after rebinding one action to `chord`. */
function rebound(action: string, chord: Record<string, unknown>): MenuItemConstructorOptions[] {
  return render(
    resolveKeymap(
      "macos",
      withOverride(NO_KEYBINDING_OVERRIDES, "macos", action as never, [chord as never]),
    ),
  );
}

function render(
  keymap?: ReturnType<typeof resolveKeymap>,
  suspendAccelerators?: boolean,
): MenuItemConstructorOptions[] {
  built.length = 0;
  buildMenu({
    registry: new WindowRegistry(),
    emitTo: () => {},
    focused: () => null,
    keymap,
    suspendAccelerators,
  });
  return built[0] ?? [];
}

describe("menu accelerators", () => {
  beforeEach(() => {
    switchFixture.enabled = true;
    // The menu is macOS-only; without this every assertion below would pass
    // vacuously on a Linux CI runner.
    Object.defineProperty(process, "platform", { value: "darwin" });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: realPlatform });
  });

  it("advertises the shipped chord when nothing is overridden", () => {
    expect(accelerator(render(), "split-row")).toBe("Command+D");
    expect(accelerator(render(), "toggle-settings")).toBe("Command+,");
  });

  it("follows a rebind, so Cocoa stops eating the old chord", () => {
    const keymap = resolveKeymap(
      "macos",
      withOverride(NO_KEYBINDING_OVERRIDES, "macos", "split-row", [
        { key: "j", meta: true, alt: true },
      ]),
    );
    expect(accelerator(render(keymap), "split-row")).toBe("Command+Alt+J");
  });

  it("drops the accelerator of an action the user unbound", () => {
    const keymap = resolveKeymap(
      "macos",
      withOverride(NO_KEYBINDING_OVERRIDES, "macos", "clear-buffer", []),
    );
    expect(accelerator(render(keymap), "clear-buffer")).toBeUndefined();
    // The item itself stays — it is still reachable with the mouse.
    expect(items(render(keymap)).some((item) => item.id === "clear-buffer")).toBe(true);
  });

  it("strips every accelerator while a chord is being recorded", () => {
    // Otherwise pressing ⌘W to rebind `close-pane` closes the pane instead:
    // the OS runs the menu item and the webview never sees the keydown.
    const suspended = items(render(undefined, true));
    expect(suspended.length).toBeGreaterThan(5);
    expect(suspended.filter((item) => item.accelerator !== undefined)).toEqual([]);
    // …and comes back afterwards.
    expect(accelerator(render(undefined, false), "split-row")).toBe("Command+D");
  });

  it("builds the accelerator from the binding's OWN modifiers", () => {
    // `["CmdOrCtrl"]` used to be hardcoded and `binding.meta` never read. The
    // concrete break: rebinding Find to ⇧D produced `CmdOrCtrl+Shift+D` — ⌘⇧D,
    // `split-column`'s shipped chord. Edit precedes View, so Cocoa ran Find
    // and Split Horizontally silently stopped working, with no conflict shown
    // anywhere: the collision lived only in the generated accelerator, never
    // in the resolved keymap `chordConflicts` scans.
    const shiftD = rebound("find", { key: "d", shift: true });
    expect(accelerator(shiftD, "find")).toBe("Shift+D");
    expect(accelerator(shiftD, "split-column")).toBe("Command+Shift+D");
    expect(accelerator(shiftD, "find")).not.toBe(accelerator(shiftD, "split-column"));

    expect(accelerator(rebound("find", { key: "j", ctrl: true, alt: true }), "find")).toBe(
      "Control+Alt+J",
    );
  });

  it("spells named keys the way Electron parses them", () => {
    // `Arrowup` / `Pageup` are not accelerator tokens; Electron drops them, so
    // the menu item lost its chord while the Shortcuts row still showed one.
    expect(accelerator(rebound("find", { key: "arrowup", meta: true }), "find")).toBe("Command+Up");
    expect(accelerator(rebound("find", { key: "pageup", meta: true }), "find")).toBe(
      "Command+PageUp",
    );
    expect(accelerator(rebound("find", { key: "enter", meta: true }), "find")).toBe(
      "Command+Return",
    );
  });

  it("installs NO accelerator rather than a wrong one", () => {
    // A key this build cannot spell, and a chord with no modifier at all: both
    // resolve to "no accelerator", which leaves the item clickable. A wrong
    // accelerator would hand Cocoa a chord the user never chose.
    expect(
      accelerator(rebound("find", { key: "unidentified", meta: true }), "find"),
    ).toBeUndefined();
    expect(accelerator(rebound("find", { key: "f5" }), "find")).toBeUndefined();
  });

  it("keeps the labels while accelerators are suspended", () => {
    const suspended = items(render(undefined, true));
    expect(suspended.find((item) => item.id === "split-row")?.label).toBe("Split Vertically");
  });
});

describe("release switch menu entrance", () => {
  afterEach(() => {
    switchFixture.enabled = true;
    Object.defineProperty(process, "platform", { value: realPlatform });
  });
  it.each([false, true])("omits disabled items and accelerators with enabled=%s", (enabled) => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    switchFixture.enabled = enabled;
    const item = items(render()).find((entry) => entry.id === "find");
    expect(item !== undefined).toBe(enabled);
    if (!enabled) expect(accelerator(render(), "find")).toBeUndefined();
  });
  it("rechecks a direct click before emitting to a renderer", () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    switchFixture.enabled = true;
    const emitTo = vi.fn();
    built.length = 0;
    buildMenu({ registry: new WindowRegistry(), focused: () => "main", emitTo });
    const click = items(built[0]).find((entry) => entry.id === "find")!.click!;
    switchFixture.enabled = false;
    click({} as never, {} as never, {} as never);
    expect(emitTo).not.toHaveBeenCalled();
    switchFixture.enabled = true;
    click({} as never, {} as never, {} as never);
    expect(emitTo).toHaveBeenCalledOnce();
  });
});
