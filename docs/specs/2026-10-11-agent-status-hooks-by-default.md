# Agent status from hooks, on by default

Date: 2026-10-11
Delivered: all four slices are on local `main` as of 2026-10-12, not pushed; the spec stays
Active until the owner accepts them.
Status: Active — approved by the owner on 2026-10-11, together with the
[decisions](#decisions-owner-2026-10-11), the requirements below, DEF1 overriding a stored
"off", the slice order and the operating contract. Superset's behaviour is the default for
each requirement. Every place Deck departs from it is listed in
[Superset parity](#superset-parity) with its reason.
Operating contract (approved 2026-10-11):
- Slice 1's plan is reviewed by Claude and Codex CLI before code.
- After that, slices 1–4 run without asking again, unless a slice changes scope or hits a fork
  in AGENTS.md.
- One session runs the whole queue (owner, 2026-10-12). The plans for slices 2–4 get the same
  Claude and Codex review before their code, without a separate owner approval.
Owner checkout: `/Users/kyantran/Documents/Development/spacevibe-workspace/spacevibe-deck`
Baseline: written against `main` at `db46fa77`.
Host: Electron on macOS and Linux. Windows stays inferred: hook registration is POSIX-only
(`hooksSupported()` is false on `win32` in
[hooks-supported.ts](../../electron/agent-hooks/hooks-supported.ts)), and a Windows hook
transport is deferred. The renderer parts reach Tauri too, but Tauri gets no new host command,
so on Tauri the adapters stay inferred.

## Purpose

Make the rail's agent state explicit by default for Claude, Codex and opencode, the way
Superset does: the state comes from the agent's own lifecycle events, not from inference over
its output. Today every signal adapter ships off
([terminal.md](../internals/terminal.md#the-contract-layer)), so an out-of-the-box rail runs on
OSC 9;4 and the output heuristic. It cannot tell a failed turn from a finished one, and it
cannot say when Codex waits for an approval.

## Decisions (owner, 2026-10-11)

1. **Claude, Codex and opencode report through hooks or plugins by default, like Superset.**
   This reverses two earlier decisions: the 2026-09-11 rule that every adapter ships off
   (`c3e984d9`), and the DECK-102 cleanup that removed unchosen registrations.
2. **Codex skips its hook-trust review like Superset**, with `--dangerously-bypass-hook-trust`.
   - Turned down: letting Codex ask once, and keeping Codex opt-in.
   - The risk accepted with it is [RISK1](#risks).
3. **opencode follows Superset's plugin route, not a port.**
   - Superset launches opencode with no `--port`. Its wrapper exports `OPENCODE_CONFIG_DIR`
     pointing at a directory that holds its plugin, and the plugin forwards opencode's own bus
     events.
   - opencode loads that directory after the global and `.opencode` configs
     ([opencode config docs](https://opencode.ai/docs/config/), checked 2026-10-11).
4. **Interactive Codex in a pane runs with `--no-daemon`** (owner, 2026-10-12). Codex 0.162 hosts
   an interactive session in a shared app-server daemon whose environment is not the pane's,
   so env-scoped hooks never reach the pane ([Evidence](#evidence)).
   - The wrapper and `launch-augment` add `--no-daemon` to bare `codex`, `resume` and `fork`
     while Codex Signals is on, when the installed Codex accepts it. Deck's interactive Codex
     sessions then do not appear in `codex agents` or remote control.
   - Main also refuses a Codex hook whose hosting process has no tty, so a daemon carrying a
     pane's credentials cannot post into that pane.
   - Turned down: routing Codex hooks by session id (a new auth and routing design), and
     shipping as specified with interactive Codex left inferred.

## How Superset does it (`desktop-v1.37.0`, the build installed on the owner's machine)

Links are pinned to the tag. Codex CLI cross-checked this section on 2026-10-11; the citations
below were spot-checked against the source.

- **Per-agent PATH wrappers.** Each agent command runs through `~/.superset/bin/<agent>`.
  - The wrapper looks for the real binary further down `PATH`, skipping Superset's own bin
    directories
    ([agent-wrappers-common.ts:113-129](https://github.com/superset-sh/superset/blob/desktop-v1.37.0/packages/agent-setup/src/agent-wrappers-common.ts#L113-L129)).
  - It sets the agent's identity only when none is set yet (first-wins, L241-262), so a CLI
    started inside an agent's tool call keeps the outer agent's identity.
- **Shell bootstrap keeps the wrappers on `PATH`**
  ([shell-wrappers.ts](https://github.com/superset-sh/superset/blob/desktop-v1.37.0/packages/agent-setup/src/shell-wrappers.ts),
  [shell-launch.ts](https://github.com/superset-sh/superset/blob/desktop-v1.37.0/packages/host-service/src/terminal/shell-launch.ts#L83-L100)):
  - zsh: `-l` with `ZDOTDIR` pointed at Superset files. Each of them sources the user's
    matching file with the user's `ZDOTDIR`, then adds the bin directory if it is absent.
  - zsh also runs a `precmd` hook, kept last, that adds the directory back after a prompt hook
    such as mise or asdf removed it.
  - bash: `--rcfile` that sources `/etc/profile`, the user's profile and `.bashrc`, then adds
    the directory.
  - fish: `--init-command`.
  - Other shells: nothing.
  - The guarantee is that the directory is **present**, not that it comes first
    (L97-105, `case ":$PATH:"`). The user's own PATH order is preserved.
- **One script normalises every CLI payload**
  ([notify-hook.template.sh](https://github.com/superset-sh/superset/blob/desktop-v1.37.0/packages/agent-setup/templates/notify-hook.template.sh)):
  - exits outside Superset terminals (L18);
  - drops a hook whose harness differs from the terminal's agent identity (L41);
  - sends subagent events only to a separate roster (L62);
  - never guesses `Stop` (L113).
- **About 40 event names collapse to six**
  ([map-event-type.ts](https://github.com/superset-sh/superset/blob/desktop-v1.37.0/packages/host-service/src/events/map-event-type.ts#L23)).
  `PostToolUse` and `PostToolUseFailure` count as Start.
- **Codex**
  - Global hooks: SessionStart, SessionEnd, UserPromptSubmit, `PreToolUse` matched on
    `^request_user_input$`, `PostToolUse *`, Stop, Interrupt, and the Subagent events
    ([agent-wrappers-claude-codex-opencode.ts:183-197](https://github.com/superset-sh/superset/blob/desktop-v1.37.0/packages/agent-setup/src/agent-wrappers-claude-codex-opencode.ts#L183-L197)).
  - The wrapper adds `--enable hooks --dangerously-bypass-hook-trust` to every call that
    reaches it, typed commands included
    ([codex-wrapper-exec.template.sh:126-144](https://github.com/superset-sh/superset/blob/desktop-v1.37.0/packages/agent-setup/templates/codex-wrapper-exec.template.sh#L126-L144)).
  - It registers no native `PermissionRequest`: its built-in Codex command bypasses approvals
    and the sandbox. Approvals come only from a best-effort TUI session-log watcher for older
    Codex (L81-115).
- **opencode**
  - The wrapper overwrites `OPENCODE_CONFIG_DIR` with Superset's directory (L379-384).
  - The plugin
    ([opencode-plugin.template.js](https://github.com/superset-sh/superset/blob/desktop-v1.37.0/packages/agent-setup/templates/opencode-plugin.template.js))
    handles `session.status`, `session.idle`, `session.error`, `permission.asked`,
    `question.asked` and the legacy `permission.ask`.
  - It forwards only busy↔idle transitions of the root session, so child sessions never move
    the pane.
- **Interrupt.** Ctrl+C or Escape silently clears a Start or PermissionRequest
  ([useTerminalInterruptClear.ts:67](https://github.com/superset-sh/superset/blob/desktop-v1.37.0/apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/%24workspaceId/hooks/usePaneRegistry/components/TerminalPane/hooks/useTerminalInterruptClear/useTerminalInterruptClear.ts#L67)).
- **Known holes in Superset's nesting filter**, found by Codex and confirmed in the source:
  - A same-harness child passes. For example, `claude -p` run by Claude's Bash tool can rebind
    the pane's session.
  - The Codex wrapper's own exit report has no harness stamp
    ([codex-wrapper-exec.template.sh:156-158](https://github.com/superset-sh/superset/blob/desktop-v1.37.0/packages/agent-setup/templates/codex-wrapper-exec.template.sh#L156-L158)).
    So a `codex exec` run inside a Claude terminal ends that Claude terminal's binding
    ([store.ts:164-167](https://github.com/superset-sh/superset/blob/desktop-v1.37.0/packages/host-service/src/terminal-agents/store.ts#L164-L167)).

## Requirements and acceptance criteria

- **DEF1 — On by default.** A fresh install has Signals on for `claude`, `codex` and
  `opencode`.
  - When the slice for an agent ships, an existing install reads that agent as on once, through
    a new `signalAdaptersRevision` ([signal-adapter-choice.ts](../../src/settings/signal-adapter-choice.ts)).
    - The bump switches on only the agent that slice ships.
    - Every other agent keeps its stored value, including an agent a user switched off after
      an earlier slice.
  - This overrides once an explicit "off" saved under revision 2. Revision 2 cannot tell a
    chosen "off" from the old default, so a user who switched an agent off before gets it back
    on after the upgrade.
  - After that, a stored value under the new revision is the user's choice. Settings → Agents
    can still turn each one off.
  - Off removes only this installation's hook registrations. The wrappers stay as plain
    pass-through. While an agent is off, neither its wrapper nor `launch-augment` adds any
    Signals flag or plugin config.
  - *Check:* unit tests on the revision rule; a fresh `userData` in the E2E wrapper shows all
    three switches on.
- **WRAP1 — Wrappers and shell bootstrap, as Superset.**
  - Deck writes wrappers for `claude`, `codex` and `opencode` under its `userData`.
  - It launches pane shells with Superset's bootstrap: zsh `-l` with `ZDOTDIR` and the
    `precmd` repair, bash `--rcfile`, fish `--init-command`. Other shells and Windows get no
    bootstrap.
  - The bash `--rcfile` sources the same login files itself, as Superset's does, but it is no
    longer a login shell (DOC1 covers the landing's `$SHELL -l` claim).
  - Each wrapper resolves the real binary further down `PATH`, skipping Deck's bin directory,
    and exits 127 with a message when there is none.
  - The user's startup files, aliases and PATH order keep working.
  - Coverage is every invocation that resolves through Deck's wrapper. Excluded, as in
    Superset:
    - an absolute path typed by the user;
    - an alias or function that shadows the command;
    - a PATH override that puts another directory first.
  - *Check:* bootstrap tests per shell, including the user's own `ZDOTDIR`, Oh My Zsh and a
    PATH-rewriting `precmd`. E2E: `which codex` in a fresh pane names Deck's wrapper, and
    `codex --version` prints the real version.
- **CL1 — Claude reports turns everywhere.** Deck's Claude hooks add `UserPromptSubmit`,
  `PostToolUse *` and `PostToolUseFailure *` to the current set, the last two counting as
  working. A turn's working state is then explicit on macOS and Linux, not only where Claude
  emits OSC 9;4.
  - A working hook clears a `requested` latch raised by the same agent's hooks, as Superset's
    Start replaces its PermissionRequest. Warning and error latches keep their precedence.
    This is the one exception to the retained latch model: today `working` clears only
    `completed` ([agent-attention.ts](../../src/terminal/agent-attention.ts), `case "working"`).
  - For these events the script posts bounded fields only — event, session id, and a tool
    name capped like the existing text fields — never the raw stdin.
    - `PostToolUse` carries the whole `tool_response` and `UserPromptSubmit` the whole prompt.
    - Today's script forwards stdin as-is (`--data-binary @-`), and the Claude endpoint answers
      413 above 64 KiB (`HOOK_MAX_BODY_BYTES` in
      [hook-request.ts](../../electron/agent-hooks/hook-request.ts)).
    - Unbounded, the "back to working" signal would vanish exactly on large tool outputs.
  - *Check:* contract tests; a real Claude turn in the Electron E2E shows a filled (explicit)
    working mark before any OSC 9;4.
- **INT1 — An interrupt clears explicit work, as Superset.** Ctrl+C or Escape in a pane clears
  an explicit `working` or `requested` state from a hook-backed agent. It does not raise a
  completion latch, and a later hook overwrites the cleared state.
  - *Check:* a renderer test; E2E: interrupt a Claude turn, and the mark leaves working within a
    second, not after the 120-second stale timeout.
- **CX1 — Codex hooks: Superset's set plus native approvals.** Register Superset's Codex set
  (SessionStart, SessionEnd, UserPromptSubmit, `PreToolUse` on `^request_user_input$`,
  `PostToolUse *`, Stop, Interrupt), plus the native `PermissionRequest`. Deck's script returns
  no decision to `PermissionRequest`.
  - Approval and question map to `requested`. `PostToolUse` maps to working and clears that
    `requested`, as in CL1.
  - Payloads are bounded as in CL1, but every turn event keeps its validated `turn_id`. Today
    the endpoint and the Codex reducer drop a turn event without one
    ([hook-request.ts](../../electron/agent-hooks/hook-request.ts),
    [agent-signal-map.ts](../../src/lib/agent-signal-map.ts) `codexKind`).
  - SessionStart and SessionEnd are session-scoped and need no `turn_id`. Stale-turn rejection
    stays.
  - Wherever CX2 applies the bypass, the `-c tui.notification_condition=always` augmentation
    goes.
  - *Check:* `codex-hooks` reconciliation tests keep existing groups in place; E2E: a Codex
    approval prompt shows `requested` without the BEL.
- **CX2 — Every Codex launch in a pane skips the hook-trust review, as Superset.**
  - The Codex wrapper adds `--dangerously-bypass-hook-trust` unless the arguments before `--`
    already carry it. This covers typed commands, the launcher, resume and restore. It does not
    add `--enable hooks` (2026-10-13 release review): hooks are on by default in every Codex
    that accepts the bypass, and the flag would override a user's `[features] hooks = false`.
  - Where no wrapper runs (other shells on macOS and Linux), the commands Deck composes carry
    the same flags through `launch-augment`. They are never written to a profile, the journal
    or the strip.
  - Coverage is WRAP1's, plus composed commands. A typed absolute path, a shadowing alias and
    a PATH override are excluded.
  - Both paths add the flags only when the installed Codex accepts them; an older Codex
    launches unchanged.
  - *Check:* wrapper and `launch-augment` tests for add, no-duplicate, `--` prompt text and old
    version; E2E: a typed `codex` shows no "Hooks need review" and reports `working`.
- **OC1 — opencode reports through a plugin, as Superset.**
  - The opencode wrapper sets `OPENCODE_CONFIG_DIR` to Deck's directory holding the plugin,
    overwriting an inherited value as Superset does ([RISK5](#risks)). Deck adds no `--port`
    and opens no opencode server port for Signals.
  - The plugin posts to Deck's hook endpoint with the pane token. It reports:
    - root-session start and end with its session id (what
      [live-session-state.ts](../../src/ui/sessions/live-session-state.ts) needs);
    - busy/idle transitions;
    - `permission.asked`, `question.asked` and the legacy `permission.ask`, as requested;
    - permission replied;
    - `session.error`, as error.
  - Child sessions never move the pane.
  - The `--port`/SSE route is removed. An opencode that bypasses Deck's wrapper stays
    inferred:
    - Windows;
    - shells without a bootstrap;
    - a typed absolute path.

    Today a composed opencode attaches through the port on every platform when its adapter is
    on ([tab-manager.ts](../../src/terminal/tab-manager.ts), `needsOpencodePort`). That
    coverage loss is accepted, as Superset has no other path. Since the adapter ships off
    today, few installs lose anything.
  - *Check:* plugin unit tests on a recorded event sequence; E2E: a typed opencode shows
    working, completed and requested, and an existing session focuses instead of offering
    Resume.
- **NEST1 — A nested CLI cannot speak for the pane. Stronger than Superset.**
  - A wrapper that finds an agent identity already set marks its process as nested.
  - Every hook or plugin event from a nested process is dropped. That includes a same-harness
    child such as `claude -p` from Claude's Bash tool, and the wrapper's own reports.
  - A hook stamped with a harness other than the pane's agent is dropped, as in Superset.
  - *Check:* reproduce first. In a Claude pane with Signals on, have Claude run `claude -p "hi"`
    and `codex exec "hi"` from its Bash tool. Before the fix the rail shows a false completed
    or a session change; after the fix it shows neither.
- **SUB1 — Subagents stay out.** Subagent or child-session events never change a pane's state
  for any of the three agents.
- **DOC1 — Living docs follow.** [terminal.md](../internals/terminal.md) loses "Every adapter
  ships off" and describes the bootstrap, the wrappers, the Codex bypass and the opencode
  plugin, in the same change as each slice. `CHANGELOG.md` gets its entry at merge.
  - The landing's "Every pane runs your login shell (`$SHELL -l`)" stays true for zsh.
  - Slice 1 rewords it so it stays true for bash too: the pane loads the same startup files.
    The copy lives in `marketing/landing-prototype/src/copy.js`.

## Superset parity

Where Deck departs from Superset, and why. Anything not listed here follows Superset.

| Point | Superset | Deck | Why |
| --- | --- | --- | --- |
| Approvals for Codex | none needed; built-in command bypasses approvals | native `PermissionRequest` hook | Deck does not bypass approvals by default, so it must show the wait |
| Codex flags on an old Codex | added unconditionally | added only when accepted | an unknown flag would fail the launch; no effect on status |
| Same-harness nesting | passes | dropped (NEST1) | Superset's hole rebinds the pane |
| `ZDOTDIR` changed inside the user's `.zshenv` | later stages source from the original directory | follows the changed value | otherwise an XDG-layout `.zshrc` never runs |
| Hook endpoint | unauthenticated | pane token, as today | keeps the 2026-09-23 security posture; no effect on status |
| Generation check, latch until seen | latest event wins | kept, except that working clears `requested` (CL1) | Deck's existing model; the exception matches Superset |
| Windows | not supported | stays inferred | no POSIX hook transport on Windows yet |
| Launch report before the first hook | wrapper posts after 2 s | not adopted | Deck's process classification already binds the pane to its agent |
| Host restart rediscovery, v1 fallback | manifest lookup per event | not adopted | Deck's hook server lives in main; a restart ends the panes too |
| Subagent roster | tracked separately | dropped | no rail surface for it yet |
| Project auto-trust, approval bypass default | on | not adopted | not part of status accuracy |
| `--enable hooks` on Codex launches | added | not added | it overrides a user's `[features] hooks = false`; hooks are on by default wherever the bypass is accepted |
| Codex shared app-server daemon | not handled; the wrapper adds no `--no-daemon` | `--no-daemon` on interactive launches; hooks from a tty-less host refused | the daemon runs hooks with its own env, so they never reach the pane (decision 4) |

## Delivery slices

Run in order; the first row not Done is the next work. Each slice gets its own plan under
`docs/plans/`. One session runs slices 1–4 in one worktree, `feat/agent-status` (owner,
2026-10-12). Each slice fast-forwards local `main` before the next one starts.

| Slice | Requirements | Plan | Status |
| --- | --- | --- | --- |
| 1. Shell bootstrap, wrappers, nesting | WRAP1, NEST1 | [shell-bootstrap-wrappers](../plans/2026-10-11-shell-bootstrap-wrappers.md) | Done 2026-10-12 — `8aeb71fc`..`47841c81`, changelog `04167317` |
| 2. Claude on by default | DEF1 (claude), CL1, INT1, DOC1 | [claude-signals-default](../plans/2026-10-12-claude-signals-default.md) | Done 2026-10-12 — `a2b10179`..`db78fdb7`, changelog `b60dd998` |
| 3. Codex on by default | DEF1 (codex), CX1, CX2, SUB1 (codex), DOC1 | [codex-signals-default](../plans/2026-10-12-codex-signals-default.md) | Done 2026-10-12 — `4c2eff1f`..`a6074a89`, changelog `399c5ae8` (decision 4: `--no-daemon`) |
| 4. opencode plugin, on by default | DEF1 (opencode), OC1, SUB1 (opencode), DOC1 | [opencode-signals-plugin](../plans/2026-10-12-opencode-signals-plugin.md) | Done 2026-10-12 — `a2725d63`..`48216194`, changelog `8037e8e1` |

## Risks

- **RISK1 — Codex hook trust is bypassed.** Codex's own help describes the flag as "DANGEROUS.
  Intended only for automation that already vets hook sources". In Codex 0.162 the bypass
  applies to every config layer
  ([discovery.rs](https://github.com/openai/codex/blob/rust-v0.162.0/codex-rs/hooks/src/engine/discovery.rs)).
  - For that invocation, every enabled hook runs whether or not it is trusted, in any layer:
    - a hook the user skipped with "Continue without trusting";
    - third-party `PermissionRequest` hooks, which can return allow or deny;
    - a newly pulled `.codex/hooks.json` in a project the user already trusts in Codex.

    Checked 2026-10-12 with Codex 0.162.1 (`codex --enable hooks … exec --ephemeral` in a scratch
    repo whose `.codex/hooks.json` has a `SessionStart` hook that touches a file):
    - folder trusted, no bypass: the hook does not run (an untrusted hook is skipped);
    - folder trusted, with the bypass: it runs, with no review;
    - hook disabled in `config.toml` (`hooks.state."<file>:session_start:0:0".enabled = false`),
      with the bypass: it does not run. The bypass skips trust only. A `-c` override of
      `hooks.state` is ignored as a session flag;
    - folder never trusted, with the bypass and `sandbox_mode = "read-only"`: it does not run.
      The project layer still needs folder trust;
    - under the owner's own `sandbox_mode = "danger-full-access"`, the first `codex exec` in a
      never-trusted folder wrote `trust_level = "trusted"` for it to `config.toml`, and with
      the bypass that repo's hook ran on that same run. That auto-trust is Codex's, not the
      bypass's; once the folder is trusted, the third case above applies.

    On the owner's machine, the two third-party `PermissionRequest` entries in
    `~/.codex/hooks.json` already carry a `trusted_hash` in `config.toml`.
  - Accepted by the owner, 2026-10-11.
- **RISK2 — Deck writes to user-level agent config by default.** The guarded entries are inert
  outside Deck's authenticated panes, but they sit in `~/.claude/settings.json` and
  `CODEX_HOME/hooks.json` without a click. This is what DECK-102 removed; the owner reverses
  it.
- **RISK3 — `PostToolUse *` posts once per tool call, and its stdin can be megabytes.** One
  loopback `curl` with a 2-second cap, exiting 0 on every path. The body stays bounded (CL1),
  so size never decides whether the signal arrives.
- **RISK4 — Deck code runs inside opencode.** The plugin runs in the opencode process with the
  user's privileges; it must stay minimal and post only to the loopback endpoint.
- **RISK5 — A user's own `OPENCODE_CONFIG_DIR` is replaced inside Deck panes.** Their agents,
  commands, plugins and `AGENTS.md` from that directory do not load there.
  - Found in the 2.11 release review (2026-10-13): any `OPENCODE_CONFIG_DIR` also moves
    opencode's global-instructions lookup, so with Deck's directory opencode 1.19.0 read
    `~/.claude/CLAUDE.md` instead of `~/.config/opencode/AGENTS.md` for every user.
  - Decision (owner, 2026-10-14): Deck's directory carries an `AGENTS.md` symlink to
    `${XDG_CONFIG_HOME:-~/.config}/opencode/AGENTS.md`, made at boot. Turned down: switching
    opencode Signals off by default, and loading the plugin through `OPENCODE_CONFIG_CONTENT`
    (unverified that opencode loads a plugin that way).
  - Limits: the target comes from main's env, so an `XDG_CONFIG_HOME` set only in a shell rc
    is missed. Config, agents and skills were checked unaffected: `opencode debug config`,
    `debug agent build` and the `debug skill` set match with and without the variable.
- **RISK6 — Every pane shell starts through Deck's bootstrap.** A startup file that inspects
  `ZDOTDIR` or `$0`, or a `precmd` that rewrites PATH, can behave differently. Superset ships
  the same bootstrap; slice 1's tests cover the known cases.

## Forks and constraints

- Changing how the pane shell is launched (arguments and env in
  [spawn.ts](../../electron/pty/spawn.ts) and
  [macos.ts](../../electron/platform/macos.ts)) touches an R4 seam. Slice 1's plan names the
  cross-boundary verification and is reviewed before code.
- Each slice is a user-facing change, so the
  [E2E gate](../../AGENTS.md#verification-and-commands) applies, driven with the real CLIs on
  the owner's machine.

## Evidence

- `~/.claude/settings.json` on the owner's machine holds 11 Superset entries and
  `~/.codex/hooks.json` holds 9, all guarded on `$SUPERSET_HOME_DIR` (read 2026-10-11).
- `codex --help` (0.162.0) lists `--dangerously-bypass-hook-trust`. Codex's TUI shows "Hooks
  need review … Continue without trusting (hooks won't run)" for new or changed hooks
  (`startup_hooks_review_prompt.snap` @ `rust-v0.162.0`).
- Deck today: macOS pane shells start as `$SHELL -l` with no startup-file injection
  ([macos.ts](../../electron/platform/macos.ts)).
- NEST1 code path in Deck today:
  - the Claude hook guard checks only env
    ([claude-user-settings.ts](../../electron/agent-hooks/claude-user-settings.ts));
  - main accepts any `SessionStart` as the new occupant
    ([hook-request.ts](../../electron/agent-hooks/hook-request.ts), `nextPaneSession`);
  - the renderer lets a `session` signal past the generation check
    ([agent-attention.ts](../../src/terminal/agent-attention.ts), `noteContract`);
  - the registry poll restores the session id but not a latched `completed`.
- NEST1 reproduced on `main` at `b4321751` (slice 1 task 0, 2026-10-12, Electron E2E with a
  scratch `userData`, Claude 2.1.296, Codex 0.162.1, Claude and Codex Signals on). Claude,
  launched from the launcher, ran `claude -p` and then `codex exec --ephemeral` from its Bash
  tool:
  - the pane received the nested Claude's `SessionStart`/`Stop`/`SessionEnd` and the nested
    Codex's `SessionStart`/`UserPromptSubmit`/`Stop`, all on the outer pane;
  - main then logged "dropped a Stop hook from a previous occupant of pane 1" and the same for
    `Notification`: the outer Claude's own end of turn was refused, because the nested Codex
    `SessionStart` had become the pane's occupant;
  - a false `completed` during the outer turn was **not** observed (the rail stayed
    working/explicit until the outer turn ended), and the journal's session id was the outer
    one after the registry poll. The occupant eviction is the defect that reproduced.
- Codex 0.162's shared app-server daemon (slice 1 task 0, 2026-10-12): an interactive `codex`
  in a pane runs its session in `codex app-server --managed-daemon`
  (`daemon_auto_start` is stable and on), and hooks run with that daemon's environment
  (`codex-rs/hooks/src/registry.rs:79` @ `rust-v0.162.0`). A typed `codex` in a scratch pane
  with Codex Signals on fired no hook into the pane; `codex --no-daemon` fired
  `SessionStart`, `UserPromptSubmit` and `Stop` at once. `codex exec` runs in-process. Slice
  3's plan carries this as an open precondition for the owner.
- RISK1 check for slice 3: in a scratch repo trusted in Codex, add a `.codex/hooks.json`
  `SessionStart` hook that writes a file. Run `codex --dangerously-bypass-hook-trust exec
  --ephemeral` and see whether the file appears without a review.

## Out of scope

- Agents beyond these three (Gemini, Droid, Cursor, Copilot, Grok, Kimi, Vibe, Amp, Kiro,
  Crush, agy). Each needs its own bridge.
- Bypassing Codex approvals or the sandbox by default.
- Auto-trusting Codex projects.
- Notification and badge surfaces: [attention-signals plan](../plans/2026-09-24-attention-signals.md).
