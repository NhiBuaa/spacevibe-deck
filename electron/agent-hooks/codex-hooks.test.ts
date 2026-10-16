import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  CODEX_HOOK_EVENTS,
  codexHookCommand,
  reconcileCodexHooks,
  syncCodexHooks,
} from "./codex-hooks";

const scratch: string[] = [];
async function temporary() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deck-codex-test-"));
  scratch.push(dir);
  return dir;
}
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((dir) => fs.rm(dir, { recursive: true })));
});

describe("Codex hook registration", () => {
  it("preserves user handlers, settings and another Deck installation across enable/disable", () => {
    const original = {
      description: "My hooks",
      hooks: {
        Stop: [{ matcher: "*", hooks: [{ type: "command", command: "my-notifier" }] }],
        SessionEnd: [{ hooks: [{ type: "command", command: "cleanup" }] }],
      },
    };
    const sibling = reconcileCodexHooks(original, "/other Deck/hook.sh", true);
    const enabled = reconcileCodexHooks(sibling, "/this Deck/hook.sh", true);
    expect(reconcileCodexHooks(enabled, "/this Deck/hook.sh", true)).toEqual(enabled);
    expect(reconcileCodexHooks(enabled, "/this Deck/hook.sh", false)).toEqual(sibling);
    expect(original.hooks.Stop[0].hooks).toEqual([{ type: "command", command: "my-notifier" }]);
    expect(JSON.stringify(enabled)).toContain("DECK_CODEX_HOOK_SCRIPT");
    expect(codexHookCommand("/a'b/hook.sh")).toContain("'\\''");
  });

  it("leaves an existing registration in place so a user group after it keeps its position", () => {
    // Codex keys hook trust by position (`hooks.json:stop:<group>:<handler>`); moving
    // Deck's group to the end would shift the user's group and make Codex re-ask for it.
    const enabled = reconcileCodexHooks({}, "/deck/hook.sh", true);
    const deckStop = (enabled.hooks as Record<string, unknown[]>).Stop;
    const userAfterDeck = {
      ...enabled,
      hooks: {
        ...(enabled.hooks as Record<string, unknown[]>),
        Stop: [...deckStop, { hooks: [{ type: "command", command: "my-notifier" }] }],
      },
    };
    expect(reconcileCodexHooks(userAfterDeck, "/deck/hook.sh", true)).toEqual(userAfterDeck);
  });

  it("registers the eight events with their matchers", () => {
    const hooks = reconcileCodexHooks({}, "/deck/hook.sh", true).hooks as Record<
      string,
      Array<{ matcher?: string }>
    >;
    expect(Object.keys(hooks)).toEqual([...CODEX_HOOK_EVENTS]);
    expect(CODEX_HOOK_EVENTS).toHaveLength(8);
    expect(hooks.PreToolUse[0].matcher).toBe("^request_user_input$");
    expect(hooks.PostToolUse[0].matcher).toBe("*");
    expect(hooks.PermissionRequest[0]).not.toHaveProperty("matcher");
    expect(hooks.Stop[0]).not.toHaveProperty("matcher");
  });

  it("gives an install that holds the four old groups the new events without moving anything", () => {
    // Codex trusts a hook by `<file>:<event>:<group>:<handler>`: no existing index may shift.
    const deck = {
      hooks: [{ type: "command", command: codexHookCommand("/deck/hook.sh"), timeout: 3 }],
    };
    const mine = (command: string) => ({ hooks: [{ type: "command", command }] });
    const original = {
      hooks: {
        SessionStart: [mine("before"), deck, mine("after")],
        UserPromptSubmit: [deck],
        Stop: [mine("notify"), deck],
        Interrupt: [deck],
        PostToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "lint" }] }],
        PreCompact: [mine("compact")],
      },
    };
    const next = reconcileCodexHooks(original, "/deck/hook.sh", true).hooks as Record<
      string,
      unknown[]
    >;
    for (const event of ["SessionStart", "UserPromptSubmit", "Stop", "Interrupt", "PreCompact"]) {
      expect(next[event]).toEqual((original.hooks as Record<string, unknown[]>)[event]);
    }
    expect(next.PostToolUse[0]).toEqual(original.hooks.PostToolUse[0]);
    expect(next.PostToolUse[1]).toMatchObject({ matcher: "*" });
    expect(next.PostToolUse).toHaveLength(2);
    expect(next.SessionEnd).toHaveLength(1);
    expect(next.PreToolUse).toHaveLength(1);
    expect(next.PermissionRequest).toHaveLength(1);
  });

  it("on disable keeps every user group and handler at the same index", () => {
    // Codex trusts by `<file>:<event>:<group>:<handler>`: a user's hook after Deck's group must
    // not move from index 1 to 0 when Deck's group goes away.
    const mine = (command: string) => ({ hooks: [{ type: "command", command }] });
    const deck = {
      hooks: [{ type: "command", command: codexHookCommand("/deck/hook.sh"), timeout: 3 }],
    };
    const original = {
      hooks: {
        SessionStart: [mine("before"), deck, mine("after")],
        Stop: [mine("a"), deck, deck],
        PostToolUse: [deck, { matcher: "Bash", hooks: [{ type: "command", command: "lint" }] }],
        PreCompact: [mine("compact")],
      },
    };
    const off = reconcileCodexHooks(original, "/deck/hook.sh", false).hooks as Record<
      string,
      unknown[]
    >;
    expect(off.SessionStart).toEqual([mine("before"), { hooks: [] }, mine("after")]);
    expect(off.PostToolUse).toEqual([{ hooks: [] }, original.hooks.PostToolUse[1]]);
    // Trailing groups Deck emptied are dropped: nothing after them can shift.
    expect(off.Stop).toEqual([mine("a")]);
    expect(off.PreCompact).toEqual([mine("compact")]);
  });

  it("keeps an event the user left empty through enable and disable", () => {
    const off = reconcileCodexHooks(
      reconcileCodexHooks({ hooks: { Notification: [] } }, "/deck/hook.sh", true),
      "/deck/hook.sh",
      false,
    );
    expect(off).toEqual({ hooks: { Notification: [] } });
  });

  it("leaves a Deck handler that a user's handler follows in the same group", () => {
    const user = { type: "command", command: "mine" };
    const deck = { type: "command", command: codexHookCommand("/deck/hook.sh"), timeout: 3 };
    const merged = { hooks: { Stop: [{ hooks: [deck, user] }, { hooks: [deck] }] } };
    const off = reconcileCodexHooks(merged, "/deck/hook.sh", false);
    expect(off).toEqual({ hooks: { Stop: [{ hooks: [deck, user] }] } });
  });

  it("re-enabling after a disable fills the group Deck left instead of adding another", () => {
    const mine = (command: string) => ({ hooks: [{ type: "command", command }] });
    const deck = {
      hooks: [{ type: "command", command: codexHookCommand("/deck/hook.sh"), timeout: 3 }],
    };
    const original = { hooks: { Stop: [deck, mine("after")] } };
    const off = reconcileCodexHooks(original, "/deck/hook.sh", false);
    const again = reconcileCodexHooks(off, "/deck/hook.sh", true);
    expect((again.hooks as Record<string, unknown[]>).Stop).toEqual(original.hooks.Stop);
    // Many cycles pile nothing up, and enabling never moves an existing group.
    let state: Record<string, unknown> = again;
    for (let cycle = 0; cycle < 3; cycle++) {
      state = reconcileCodexHooks(
        reconcileCodexHooks(state, "/deck/hook.sh", false),
        "/deck/hook.sh",
        true,
      );
    }
    expect(state).toEqual(again);
    const withMatcher = reconcileCodexHooks(
      { hooks: { PostToolUse: [{ hooks: [] }, mine("x")] } },
      "/deck/hook.sh",
      true,
    );
    expect((withMatcher.hooks as Record<string, unknown[]>).PostToolUse).toEqual([
      { matcher: "*", hooks: deck.hooks },
      mine("x"),
    ]);
  });

  it("keeps symlinks and file permissions, and never edits config.toml/notify", async () => {
    const dir = await temporary();
    const actual = path.join(dir, "real.json");
    const link = path.join(dir, "hooks.json");
    const config = path.join(dir, "config.toml");
    await fs.writeFile(actual, "{}\n", { mode: 0o600 });
    await fs.symlink(actual, link);
    await fs.writeFile(config, 'notify = ["my-notifier"]\n');
    await syncCodexHooks(link, "/deck/hook.sh", true);
    expect((await fs.lstat(link)).isSymbolicLink()).toBe(true);
    expect((await fs.stat(actual)).mode & 0o777).toBe(0o600);
    expect(JSON.parse(await fs.readFile(actual, "utf8")).hooks.Stop).toHaveLength(1);
    expect(await fs.readFile(config, "utf8")).toBe('notify = ["my-notifier"]\n');
    await syncCodexHooks(link, "/deck/hook.sh", false);
    expect(JSON.parse(await fs.readFile(actual, "utf8"))).toEqual({});
  });

  it("refuses malformed config, dangling links and concurrent registration locks without rewriting", async () => {
    const dir = await temporary();
    const file = path.join(dir, "hooks.json");
    await fs.writeFile(file, '{"hooks":{"Stop":false}}');
    await expect(syncCodexHooks(file, "/deck/hook.sh", true)).rejects.toThrow("Invalid Codex");
    expect(await fs.readFile(file, "utf8")).toBe('{"hooks":{"Stop":false}}');
    await fs.writeFile(`${file}.deck-hooks.lock`, "owned");
    await expect(syncCodexHooks(file, "/deck/hook.sh", true)).rejects.toMatchObject({
      code: "EEXIST",
    });
    expect(await fs.readFile(`${file}.deck-hooks.lock`, "utf8")).toBe("owned");
    const dangling = path.join(dir, "dangling.json");
    await fs.symlink(path.join(dir, "missing.json"), dangling);
    await expect(syncCodexHooks(dangling, "/deck/hook.sh", true)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect((await fs.lstat(dangling)).isSymbolicLink()).toBe(true);
  });
});
