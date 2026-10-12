/**
 * The imaginary machine's live panes — the fixture the Watch rail widget reads.
 *
 * It began as the Agent Board scene's card source (`src/ui/agent-board.tsx`,
 * `docs/internals/agent-board.md`). The Board is retired and the page does not
 * advertise it, so only the panes survive. Each pane carries what a rail row
 * needs (label, state) and `rank`, the order the widget sorts by; `up`,
 * `changed` and `task` are the Board card's footer ages and its launch task,
 * kept as data. The sentences are the hero's, so the widget reads as the same
 * afternoon the top of the page shows. Every `id` is null: a widget mounts no
 * stream.
 */

import { deepFreeze } from "../../product-stage.js";

const PRIMARY = { kind: "role", text: "Primary" };

export const BOARD_PROJECTS = deepFreeze([
  {
    project: "spacevibe-deck",
    checkouts: [
      {
        name: "main",
        badge: PRIMARY,
        age: "now",
        open: true,
        panes: [
          {
            id: null,
            agent: "claude",
            label: "I'll trace why the pane divider drifts on resize.",
            state: "working",
            rank: 1,
            up: "12m",
            changed: "1m",
          },
          {
            id: null,
            agent: "codex",
            label: "96 passed · 0 failed",
            state: "done",
            rank: 2,
            up: "48m",
            changed: "2m",
          },
          {
            id: null,
            agent: "opencode",
            label: "typecheck clean · the branch follows cwd now",
            state: "done",
            rank: 3,
            up: "31m",
            changed: "2m",
          },
        ],
      },
      {
        name: "detach",
        badge: { kind: "branch", text: "feat/detach" },
        age: "5m",
        panes: [
          {
            id: null,
            agent: "codex",
            label: "npm test failed — 3 assertions in vote-panel.",
            state: "failed",
            rank: 4,
            up: "18m",
            changed: "5m",
          },
        ],
      },
    ],
  },
  {
    project: "spacevibe-api",
    checkouts: [
      {
        name: "main",
        badge: PRIMARY,
        age: "3h",
        panes: [
          {
            id: null,
            agent: "gemini",
            label: "Should I apply the pending migration?",
            state: "asked",
            rank: 5,
            up: "3h",
            changed: "3h",
          },
          {
            id: null,
            agent: "agy",
            label: "Batching the artifact uploads into one R2 write.",
            state: "working",
            rank: 6,
            up: "20m",
            changed: "1m",
            task: "Batch the artifact uploads into one R2 write",
          },
        ],
      },
    ],
  },
]);
