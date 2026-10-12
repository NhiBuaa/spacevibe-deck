/**
 * Feature widgets — each feature drawn as ONE glanceable fact instead of a
 * whole app window (owner, 2026-10-12: "too many app stages, it reads dense").
 *
 * The rule a widget is held to: no window chrome — no traffic lights, no
 * sidebar, no tab strip wrapped around it. A widget that needs chrome has
 * turned back into an app stage. Sizes are real px (widgets.css): the scene
 * CSS resolves `cqw` against `.a-appwin`, which a widget does not have.
 *
 * The DATA lives in `./scenes/`, imported rather than copied, so two widgets
 * cannot disagree about a command or a figure.
 */

import { STAGE_ICONS, renderChromeIcon } from "../appwin.js";
import { AGENT_MARKS } from "../agent-strip.js";
import { BOARD_PROJECTS } from "./scenes/agent-board.js";
import { INSTALLED, launchCommand } from "./scenes/catalog.js";
import { sceneAgentMark } from "./scenes/chrome.js";
import { MENU_GROUPS, WHERE } from "./scenes/new-agent-menu.js";
import { RESTORE_PANES } from "./scenes/restore.js";
import { AGENTS as USAGE_AGENTS, FOOTNOTE, RANGES, TOTAL } from "./scenes/usage.js";

/** The four states the rail paints, loudest first. */
const STATES = ["failed", "asked", "working", "done"];

/** Every live pane on the imaginary machine. */
const LIVE_PANES = BOARD_PROJECTS.flatMap((project) =>
  project.checkouts.flatMap((checkout) => checkout.panes),
);

const ATTR_ESCAPES = { "&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;" };

const attr = (text) => String(text).replace(/[&"<>]/g, (char) => ATTR_ESCAPES[char]);

const mark = (id, size = 16) => sceneAgentMark(id, "w-mark", size);

const icon = (name) => `<span class="w-icon">${renderChromeIcon(STAGE_ICONS[name])}</span>`;

function stateMark(state) {
  const bars = state === "working" ? "<i></i><i></i><i></i>" : "";
  return `<span class="w-state" data-state="${state}" aria-hidden="true">${bars}</span>`;
}

/** Rail: one row per agent — the sentence it last said, and its mark. */
function rail() {
  const rows = STATES.map((state) => LIVE_PANES.find((pane) => pane.state === state))
    .filter(Boolean)
    .sort((a, b) => a.rank - b.rank)
    .map(
      (pane) => `
        <div class="w-rail__row" data-state="${pane.state}">
          ${mark(pane.agent)}
          <span class="w-rail__text">${pane.label}</span>
          ${stateMark(pane.state)}
        </div>
      `,
    )
    .join("");

  return `<div class="w w-rail">${rows}</div>`;
}

/** ⌘T: the New Agent popover alone — the checkout, then the agents. */
function menu() {
  const [agents, , , [another]] = MENU_GROUPS;
  const rows = agents
    .map(
      (row, index) => `
        <div class="w-menu__row${index === 0 ? " is-focused" : ""}">
          ${mark(row.agent)}
          <span class="w-menu__title">${row.title}</span>
          <span class="w-menu__detail">${row.detail}</span>
        </div>
      `,
    )
    .join("");

  return `
    <div class="w w-menu">
      <kbd class="w-corner-kbd">⌘T</kbd>
      <p class="w-menu__where">${icon("branch")}${WHERE}</p>
      ${rows}
      <div class="w-sep"></div>
      <div class="w-menu__row">${icon("plus")}<span class="w-menu__title">${another.title}</span></div>
    </div>
  `;
}

/** Catalog: what is installed and the command each types; the rest as marks. */
function catalog() {
  const installed = new Set(INSTALLED.map((agent) => agent.id));
  const available = AGENT_MARKS.filter((agent) => !installed.has(agent.id));
  const rows = INSTALLED.map(
    (agent) => `
      <div class="w-cat__row">
        ${mark(agent.id)}
        <span class="w-cat__name">${agent.label}<code>${launchCommand(agent)}</code></span>
        <span class="w-toggle"><b>On</b><span>Off</span></span>
      </div>
    `,
  ).join("");

  return `
    <div class="w w-cat">
      <p class="w-cat__head"><span>Installed</span><span>${INSTALLED.length}</span></p>
      ${rows}
      <div class="w-sep"></div>
      <p class="w-cat__head"><span>Available to install</span><span>${available.length}</span></p>
      <div class="w-cat__avail">${available.map((agent) => mark(agent.id, 18)).join("")}</div>
    </div>
  `;
}

/** Restore: the three resume commands Deck types, and what came back. */
function restore() {
  const blocks = RESTORE_PANES.map(
    (pane) => `
      <div class="w-term__block">
        <span class="w-term__cmd">${pane.cmd}</span>
        <span class="w-term__out">${pane.lines[0].text}<span class="w-badge">restored</span></span>
      </div>
    `,
  ).join("");

  return `<div class="w w-term">${blocks}</div>`;
}

/** Surfaces: the tab strip holding more than terminals, and its keys. */
function surfaces() {
  const tabs = [
    { lead: mark("claude", 13), label: "claude" },
    { lead: icon("file"), label: "layout-engine.ts", active: true },
    { lead: icon("globe"), label: "localhost:5173" },
    { lead: icon("squares"), label: "Token usage" },
  ]
    .map(
      (tab) =>
        `<span class="w-tab${tab.active ? " is-active" : ""}">${tab.lead}${tab.label}</span>`,
    )
    .join("");
  const keys = [
    ["⌘⇧B", "Explorer"],
    ["⌘⇧V", "Markdown source"],
    ["⌘S", "Save"],
    ["⌘W", "Close what is in front"],
  ]
    .map(([combo, label]) => `<span><kbd>${combo}</kbd>${label}</span>`)
    .join("");

  return `
    <div class="w w-surfaces">
      <div class="w-tabs">${tabs}</div>
      <div class="w-keys">${keys}</div>
    </div>
  `;
}

/** Usage: the figure, the range, and who spent it. */
function usage() {
  const segments = RANGES.map(
    (range, index) =>
      `<span${index === RANGES.length - 1 ? ' class="is-active"' : ""}>${range}</span>`,
  ).join("");
  const bar = USAGE_AGENTS.map(
    (agent) => `<span data-agent="${agent.id}" style="--share: ${agent.share}%"></span>`,
  ).join("");
  const rows = USAGE_AGENTS.map(
    (agent) => `
      <span class="w-usage__row" data-agent="${agent.id}">
        <span>${agent.label}</span><span>${agent.amount}</span>
      </span>
    `,
  ).join("");

  return `
    <div class="w w-usage">
      <div class="w-seg">${segments}</div>
      <strong class="w-usage__total">${TOTAL}*</strong>
      <div class="w-usage__bar">${bar}</div>
      ${rows}
      <p class="w-usage__foot">${FOOTNOTE}</p>
    </div>
  `;
}

const WIDGETS = {
  panelRail: rail,
  panelWorktree: menu,
  panelCatalog: catalog,
  panelRestore: restore,
  panelSurfaces: surfaces,
  panelUsage: usage,
};

/**
 * One feature as a tile: its title, then its widget. The long panel body
 * rides in the tooltip — the owner prefers a tooltip to an explaining
 * sentence.
 *
 * @param {string} key a panel copy key, e.g. "panelRail"
 * @param {Record<string, string>} copy
 * @param {number} index position, for the reveal stagger
 */
export function renderWidgetTile(key, copy, index) {
  const widget = WIDGETS[key];

  if (!widget) {
    throw new Error(`No widget for feature "${key}".`);
  }

  return `
    <article
      class="wtile"
      data-widget="${key}"
      title="${attr(copy[`${key}Body`])}"
      data-reveal
      style="--reveal-delay: ${index * 70}ms"
    >
      <h3 data-copy="${key}Title">${copy[`${key}Title`]}</h3>
      ${widget()}
    </article>
  `;
}
