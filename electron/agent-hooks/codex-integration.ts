import fs from "node:fs/promises";
import path from "node:path";
import { AGENT_HOOKS_DIR } from "./claude-hooks-file";
import { codexHooksPath, syncCodexHooks } from "./codex-hooks";
import { BOUNDED_BODY_AWK, BOUNDED_PREFIX_BYTES } from "./bounded-body-awk";
import { hooksSupported } from "./hooks-supported";
import { codexSignalsMarkerPath } from "../agent-shell/shell-bootstrap";
import { storedSignalAdapterOn } from "../../src/settings/signal-adapter-choice";

/** The most process levels the script climbs from its parent to find Codex's own process. */
const TTY_WALK_LEVELS = 4;

/**
 * The Codex hook script. One command serves every event (Codex trusts a hook by its position in
 * `hooks.json`, so the registered command never changes), so the event comes from stdin.
 *
 * - `Stop` forwards stdin, which carries `last_assistant_message`; every other event posts a body
 *   the script builds from a bounded prefix of stdin (see `bounded-body-awk.ts`). A subagent's
 *   `agent_id` is reported in that body, never acted on here: the endpoint drops it (SUB1).
 * - `X-Deck-Tty` names the tty of the first `codex` process above the script. Codex 0.162 hosts
 *   an interactive session in a shared app-server daemon whose hooks carry the DAEMON's
 *   environment, which may hold a live pane's credentials; the daemon has no tty (`??`), so the
 *   endpoint refuses its posts. `comm` is matched by basename: Linux truncates it to 15
 *   characters (`codex-x86_64-un`), macOS may report a full path.
 * - No stdout: a hook's output would change the conversation, and `PermissionRequest` would read
 *   it as a decision.
 */
export function codexHookScript(): string {
  return [
    "#!/bin/sh",
    "# Deck Codex lifecycle bridge. No stdout: hook output must not change the conversation.",
    // `${VAR-}`: an inherited `set -u` (SHELLOPTS) must not kill the hook on an unset variable.
    '[ -n "${DECK_AGENT_NESTED-}" ] && exit 0',
    '[ -n "${DECK_AGENT_ID-}" ] && [ "${DECK_AGENT_ID-}" != codex ] && exit 0',
    'if [ -z "${DECK_HOOK_PORT-}" ] || [ -z "${DECK_PANE_ID-}" ] || [ -z "${DECK_HOOK_TOKEN-}" ]; then exit 0; fi',
    "TTY=",
    'PID="${PPID-}"',
    "N=0",
    `while [ "$N" -lt ${TTY_WALK_LEVELS} ] && [ -n "$PID" ] && [ "$PID" -gt 1 ]; do`,
    '  ROW=$(ps -o ppid=,tty=,comm= -p "$PID" 2>/dev/null) || break',
    "  read -r NEXT TTYNAME COMM <<EOF",
    "$ROW",
    "EOF",
    '  case "${COMM##*/}" in',
    '    codex|codex-*) TTY="$TTYNAME"; break ;;',
    "  esac",
    '  PID="$NEXT"',
    "  N=$((N + 1))",
    "done",
    "deck_post() {",
    "  curl -q --noproxy '*' -fsS --max-time 2 -o /dev/null --data-binary @- \\",
    '    -H "Content-Type: application/json" \\',
    '    -H "X-Deck-Pane: $DECK_PANE_ID" \\',
    '    -H "X-Deck-Token: $DECK_HOOK_TOKEN" \\',
    '    -H "X-Deck-Tty: $TTY" \\',
    '    "http://127.0.0.1:$DECK_HOOK_PORT/hook/codex" \\',
    '    || printf "%s\\n" "Deck: Codex lifecycle event could not be delivered." >&2',
    "}",
    `PREFIX=$(head -c ${BOUNDED_PREFIX_BYTES})`,
    `BODY=$(printf '%s' "$PREFIX" | LC_ALL=C awk -v REPORT_SUBAGENT=1 '${BOUNDED_BODY_AWK}')`,
    'case "$BODY" in',
    "  '') cat >/dev/null ;;",
    `  *'"hook_event_name":"Stop"'*) { printf '%s' "$PREFIX"; cat; } | deck_post ;;`,
    `  *) cat >/dev/null; printf '%s' "$BODY" | deck_post ;;`,
    "esac",
    "exit 0",
    "",
  ].join("\n");
}

export function codexSignalsEnabled(settings: unknown): boolean {
  return storedSignalAdapterOn(settings, "codex");
}

interface IntegrationDeps {
  readonly userData: string;
  readonly hooksPath?: string;
  readonly supported?: boolean;
  readonly syncHooks?: typeof syncCodexHooks;
  readonly log?: (message: string, error: unknown) => void;
}

export function createCodexIntegration(deps: IntegrationDeps) {
  const script = path.join(deps.userData, AGENT_HOOKS_DIR, "deck-codex-hook.sh");
  const hooks = deps.hooksPath ?? codexHooksPath();
  const marker = codexSignalsMarkerPath(deps.userData);
  const supported = deps.supported ?? hooksSupported();
  let ready = false;
  let enabled = false;
  let desired = false;
  let applied: boolean | null = null;
  let queue: Promise<void> = Promise.resolve();
  return {
    scriptPath: () => (ready ? script : null),
    enabled: () => enabled,
    sync(settings: unknown): Promise<void> {
      const requested = codexSignalsEnabled(settings);
      desired = requested;
      if (!requested) enabled = false;
      const pending = queue
        .then(async () => {
          if (!supported || applied === requested) return;
          // The Codex wrapper adds its flags only while the marker exists. Turning off drops it
          // FIRST, before anything that can fail (a full disk must not leave the flags on);
          // turning on creates it last, once the hooks are registered.
          if (!requested) await fs.rm(marker, { force: true });
          await fs.mkdir(path.dirname(script), { recursive: true, mode: 0o700 });
          await fs.writeFile(script, codexHookScript(), { mode: 0o700 });
          await fs.chmod(script, 0o700);
          ready = true;
          await (deps.syncHooks ?? syncCodexHooks)(hooks, script, requested);
          if (requested) {
            await fs.mkdir(path.dirname(marker), { recursive: true, mode: 0o700 });
            await fs.writeFile(marker, "", { mode: 0o600 });
          }
          enabled = requested && desired;
          applied = requested;
        })
        .catch((error: unknown) => {
          enabled = false;
          applied = null;
          (deps.log ?? console.warn)(
            "Deck: Codex hook registration failed; activity remains inferred.",
            error,
          );
        });
      queue = pending;
      return pending;
    },
  };
}
