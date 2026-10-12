/**
 * ⌘T's New Agent list — the data the Launch chapter's ⌘T widget reads.
 *
 * Deck 1.1 retired the quick picker. ⌘T raised the checkout card's own actions
 * menu FREE-STANDING (`worktree-card-menus.tsx`, placement `free-standing`;
 * `docs/internals/agent-rail.md`, "One create control per checkout"): it names
 * the checkout the agent will run in on one heading line, lists the agents,
 * then `New split here`, `Open in Finder` and `Open another project…`.
 *
 * The rows are the ones the SHIPPED app wires (`railCardActions` in
 * `app.tsx`), not every row the component can draw: `Create branch from here`
 * is unwired while Quick Launch is deferred and `Open terminal here` has no
 * caller, so both are omitted — DL-19.7, a control nothing answers is not
 * drawn.
 *
 * The checkout is the rail's active card, `detach` on `feat/detach`, so the
 * heading reads project · folder · branch — `whereOf`'s own words.
 */

import { INSTALLED, launchCommand } from "./catalog.js";

/** `subjectWhere` for the active card: nothing in it repeats, so nothing drops. */
export const WHERE = "spacevibe-deck · detach · feat/detach";

/*
 * The groups in `actionGroups`' order — agents, work, the OS, the board —
 * each separated by a hairline. An agent row's detail is the command it will
 * run: no model is stored for any of the three, so that is the fact the app
 * prints. The agents are the catalog's installed three, commands and all.
 */
export const MENU_GROUPS = [
  INSTALLED.map((agent) => ({ agent: agent.id, title: agent.label, detail: launchCommand(agent) })),
  [{ title: "New split here", detail: "Open a pane beside this tab" }],
  [{ title: "Open in Finder", detail: "Reveal this folder" }],
  [{ title: "Open another project…", detail: "Add a folder or worktree" }],
];
