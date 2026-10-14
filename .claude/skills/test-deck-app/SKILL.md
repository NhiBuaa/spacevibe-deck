---
name: test-deck-app
description: Drive the running Deck Electron app with playwright-core against an isolated userData dir, to prove a new feature or UI flow works through IPC, PTYs and persistence. Use for the E2E gate on large features. Not for bug fixes, styling or copy, and not through Playwright MCP or a browser tab on `npm run dev`.
---

# Test Deck in Electron

The gate in [AGENTS.md](../../../AGENTS.md#verification-and-commands) applies to a new
user-facing feature or a changed UI flow. It does not apply to bug fixes, styling, copy,
refactors, tests or docs. The browser preview (`npm run dev`) paints the shell but reaches no
IPC, PTY, persistence or updater, so a pass there proves nothing.

If the app cannot be launched (no display, build fails, Electron missing), report the blocker
and stop. Do not substitute the browser preview or another automation tool.

## Launch an isolated instance

1. In the checkout under test: `npm run build && npm run electron:build`.
   In a fresh worktree `node_modules/electron/dist` may be missing after `npm install`; run
   `node node_modules/electron/install.js` once.
2. Make a scratch directory **outside the repo** for `userData`, a `CLAUDE_CONFIG_DIR`, and
   stub agents. A plain `electron:dev` run shares the owner's real `workspaces.json` and
   `session.json`.
3. Launch from a scratch driver with `playwright-core`:

   ```js
   const { _electron } = require("playwright-core");
   const app = await _electron.launch({
     executablePath: "<checkout>/node_modules/electron/dist/Electron.app/Contents/MacOS/Electron",
     args: ["<checkout>/.claude/skills/test-deck-app/scripts/isolated-main.cjs"],
     env: {
       ...cleanEnv, // process.env without CLAUDECODE, DECK_AGENT_ID, DECK_AGENT_PID, DECK_AGENT_NESTED
       DECK_TEST_USERDATA: "<scratch>/userdata",
       DECK_TEST_MAIN: "<checkout>/dist-electron/electron/main.cjs",
       CLAUDE_CONFIG_DIR: "<scratch>/claude",
     },
   });
   const page = await app.firstWindow();
   ```

   [`isolated-main.cjs`](scripts/isolated-main.cjs) sets `userData` before main loads and refuses
   to start without both variables.

## Traps that cost a run

- **A stub, never a real agent.** Put stubs on a scratch `PATH` set in a scratch
  `ZDOTDIR/.zshrc` (override `path_helper`), and never seed `lastAgent: "claude"`: it starts a
  real, unattended session. Unset the `CLAUDECODE` variables above, or Deck's wrappers treat the
  pane as nested and a probe reads like plain agent behaviour.
- **One instance per userData.** The single-instance lock is per directory: a second launch on
  the same one exits 0 with no window and Playwright reports a closed target.
- **`setViewportSize` pins `innerWidth`.** After any window resize, call it again with
  `BrowserWindow.getAllWindows()[0].getContentSize()` and read `innerWidth` before measuring.
- **`app.close()` hangs.** End with `app.evaluate(({ app }) => app.exit(0))`.
- **`app.getVersion()` reports Electron's version** from a wrapper outside the packaged app.
  Expected, not a bug.
- To record links Deck would open, reassign `shell.openExternal` in `app.evaluate` before the
  flow starts.

## Report and clean up

Walk each affected flow and report it with its result: what you did, what you observed, and
whether it matched the spec. Screenshots go to the scratch directory, never the repo.

Stop only the processes you started, by PID. Do not `pkill -f` on a pattern: other sessions run
Electron too. Delete the scratch directory when the report is written.
