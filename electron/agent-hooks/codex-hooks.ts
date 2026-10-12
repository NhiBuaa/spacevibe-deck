/** Add this installation's Codex lifecycle hooks without replacing user hooks or notify. */
import fs from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";
import { writeFileAtomically } from "../fs/write";
import { shellQuote } from "./claude-hooks-file";

type Document = Record<string, unknown>;
/**
 * Superset's Codex set minus its Subagent events, plus the native `PermissionRequest`, in the
 * order they are appended. The four oldest come first: Codex trusts a hook by its position, so
 * an install that registered only those keeps its trust and gains the rest after them.
 */
export const CODEX_HOOK_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "Stop",
  "Interrupt",
  "SessionEnd",
  "PreToolUse",
  "PostToolUse",
  "PermissionRequest",
] as const;

/** The matcher each event is registered with; an event absent here has none. */
export const CODEX_HOOK_MATCHERS: Readonly<Record<string, string>> = {
  PreToolUse: "^request_user_input$",
  PostToolUse: "*",
};

function record(value: unknown): value is Document {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function codexHooksPath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(env.CODEX_HOME || path.join(homedir(), ".codex"), "hooks.json");
}

export function codexHookCommand(scriptPath: string): string {
  const script = shellQuote(scriptPath);
  return (
    `[ "$DECK_CODEX_HOOK_SCRIPT" = ${script} ] && [ -n "$DECK_PANE_ID" ] && ` +
    `[ -n "$DECK_HOOK_TOKEN" ] && [ -n "$DECK_HOOK_PORT" ] && [ -x ${script} ] && ` +
    `${script} || true`
  );
}

/** A group Deck emptied on disable (or any group with nothing in it): `{"hooks": []}`. */
function isEmptyGroup(group: Document): boolean {
  return Array.isArray(group.hooks) && group.hooks.length === 0 && Object.keys(group).length === 1;
}

export function reconcileCodexHooks(
  value: unknown,
  scriptPath: string,
  enabled: boolean,
): Document {
  if (!record(value) || (value.hooks !== undefined && !record(value.hooks))) {
    throw new Error("Codex hooks must be an object with an object-valued hooks field.");
  }
  const hooks = (value.hooks ?? {}) as Document;
  const command = codexHookCommand(scriptPath);
  const isDeck = (handler: unknown) =>
    record(handler) && handler.type === "command" && handler.command === command;
  const groupHoldsDeck = (group: Document) => (group.hooks as unknown[]).some(isDeck);
  const holdsDeck = (groups: readonly Document[]) => groups.some(groupHoldsDeck);
  const deckGroup = (event: string): Document => ({
    ...(event in CODEX_HOOK_MATCHERS ? { matcher: CODEX_HOOK_MATCHERS[event] } : {}),
    hooks: [{ type: "command", command, timeout: 3 }],
  });
  /**
   * Take Deck's handlers out WITHOUT moving anything else. Codex trusts a hook by its position
   * (`<file>:<event>:<group>:<handler>` in config.toml), so removing a group or a handler in the
   * middle would shift everything after it and make Codex ask the user to review hooks that did
   * not change.
   * - A group Deck empties stays as `{"hooks": []}` (Codex counts its index and runs the groups
   *   after it), unless it is the last group, where nothing after it can shift; empty groups
   *   left trailing are dropped with it.
   * - Only Deck's TRAILING handlers in a group are removed. A Deck handler followed by another
   *   handler in the same group (only possible by hand-merging) stays: removing it would shift
   *   that handler. Its command is guarded by the pane env, so it is inert once Signals is off.
   */
  const withoutDeck = (groups: Document[]): Document[] => {
    if (!holdsDeck(groups)) return groups;
    const stripped = groups.map((group) => {
      const handlers = group.hooks as unknown[];
      let end = handlers.length;
      while (end > 0 && isDeck(handlers[end - 1])) end -= 1;
      if (end === handlers.length) return group;
      return end === 0 ? { hooks: [] } : { ...group, hooks: handlers.slice(0, end) };
    });
    let last = stripped.length;
    while (last > 0 && isEmptyGroup(stripped[last - 1])) last -= 1;
    return stripped.slice(0, last);
  };
  const entries = Object.entries(hooks).map(([event, groups]) => {
    if (!Array.isArray(groups) || groups.some((g) => !record(g) || !Array.isArray(g.hooks))) {
      throw new Error(`Invalid Codex hook groups for ${event}; hooks were not changed.`);
    }
    // A registration already in place stays exactly where it is when enabling.
    if (enabled && (CODEX_HOOK_EVENTS as readonly string[]).includes(event) && holdsDeck(groups)) {
      return [event, groups] as const;
    }
    return [event, withoutDeck(groups)] as const;
  });
  const cleaned = Object.fromEntries(
    entries.filter(
      ([event, groups]) => groups.length > 0 || (hooks[event] as unknown[]).length === 0,
    ),
  );
  const next = enabled
    ? {
        ...cleaned,
        ...Object.fromEntries(
          CODEX_HOOK_EVENTS.map((event) => {
            const groups = (cleaned[event] ?? []) as Document[];
            if (holdsDeck(groups)) return [event, groups];
            // Reuse a group an earlier disable left empty rather than piling up a new one each
            // time. An empty group is not told apart from a user's own; filling one is harmless,
            // since it holds nothing and goes back to `{"hooks": []}` on the next disable.
            const reusable = groups.findIndex(isEmptyGroup);
            return [
              event,
              reusable >= 0
                ? groups.map((group, index) => (index === reusable ? deckGroup(event) : group))
                : [...groups, deckGroup(event)],
            ];
          }),
        ),
      }
    : cleaned;
  if (
    Object.keys(next).length > 0 ||
    (record(value.hooks) && Object.keys(value.hooks).length === 0)
  ) {
    return { ...value, hooks: next };
  }
  const { hooks: _hooks, ...rest } = value;
  return rest;
}

function missing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

async function readOptional(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

async function resolveFile(file: string): Promise<string> {
  try {
    await fs.lstat(file);
  } catch (error) {
    if (missing(error)) return file;
    throw error;
  }
  return fs.realpath(file);
}

export async function syncCodexHooks(
  file: string,
  script: string,
  enabled: boolean,
): Promise<void> {
  const target = await resolveFile(file);
  if (!enabled && (await readOptional(target)) === null) return;
  await fs.mkdir(path.dirname(target), { recursive: true });
  const lockPath = `${target}.deck-hooks.lock`;
  const lock = await fs.open(lockPath, "wx", 0o600);
  try {
    const before = await readOptional(target);
    const value: unknown = before === null ? {} : JSON.parse(before);
    const next = reconcileCodexHooks(value, script, enabled);
    if (JSON.stringify(value) === JSON.stringify(next)) return;
    const mode = before === null ? 0o600 : (await fs.stat(target)).mode & 0o777;
    if ((await readOptional(target)) !== before || (await resolveFile(file)) !== target) {
      throw new Error("Codex hooks changed during registration; retry from Signals.");
    }
    await writeFileAtomically(target, `${JSON.stringify(next, null, 2)}\n`, { mode });
  } finally {
    await lock.close();
    await fs.unlink(lockPath);
  }
}
