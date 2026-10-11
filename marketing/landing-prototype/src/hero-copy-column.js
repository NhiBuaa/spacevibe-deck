/**
 * The hero's copy column, piece by piece: the release pill, the headline, one
 * install unit, the agent marks — plus the Pause control and the rail fixture
 * the product side stands on.
 *
 * The live hooks keep their names — `data-release-label`,
 * `data-copy="installMac"`, `data-download-proof`, the `data-install-*` set —
 * so `upgradeReleaseLinks` and `mountQuickInstall` serve them unchanged.
 */

import { AGENT_MARKS, renderAgentMark } from "./agent-strip.js";
import { RELEASES_URL, WINDOWS_FALLBACK_URL } from "./download-links.js";
import { initialInstallPlatform } from "./install-command.js";
import { renderAppleIcon, renderInstallIcon, renderWindowsIcon } from "./os-icons.js";
import { stageRail } from "./product-stage.js";
import { CHANGELOG_URL } from "./site-urls.js";

/*
 * The hero's rail. Worktree colours are cut to the one cyan card: in the
 * hero's window a yellow or red checkout mark reads as `asked` or
 * `failed`, and the beat needs yellow to mean one thing. Closed cards hold
 * still (working/asked → done), so the only loops on screen are the beat's.
 */
const RAIL_COLORS = { "spacevibe-deck/detach": "var(--sg-cyan)" };
const LOOPING_STATES = new Set(["working", "asked"]);

export const calmRail = stageRail.map((cluster) => ({
  ...cluster,
  checkouts: cluster.checkouts.map((checkout) => {
    const color = RAIL_COLORS[`${cluster.project}/${checkout.name}`];
    const panes = checkout.open
      ? checkout.panes
      : checkout.panes.map((pane) =>
          LOOPING_STATES.has(pane.state) ? { ...pane, state: "done" } : pane,
        );

    return color ? { ...checkout, panes, color } : { ...checkout, panes };
  }),
}));

export function renderReleasePill(copy) {
  return `
    <a class="a-hero__pill hero-pill hero-rise" href="${CHANGELOG_URL}">
      <span class="a-cta-tag a-cta-new__tag" data-copy="newBadge">${copy.newBadge}</span>
      <span class="a-hero__pill-text" data-copy="releaseLabel" data-release-label>${copy.releaseLabel}</span>
      <span class="a-hero__pill-arrow" aria-hidden="true">→</span>
    </a>
  `;
}

/**
 * One large line and no subhead (owner, 2026-10-11: the hero carried too much
 * text). The product's description lives in the page title and meta; the
 * agent marks below name the CLIs. The headline paints at once — it is the
 * LCP element — so it never animates.
 */
export function renderHeadline(copy) {
  return `<h1 class="hero-title" data-copy="headline">${copy.headline}</h1>`;
}

function renderCta(os, href, icon, copyKey, label) {
  const [verb, name] = label.split(/ (?=\S+$)/);

  return `
    <a class="hero-cta hero-cta--${os} a-quiet-cta" data-os="${os}" href="${href}" target="_blank" rel="noreferrer">
      <span class="a-cta-lead">
        ${icon}
        <span data-copy="${copyKey}"><span class="hero-cta__verb">${verb} </span>${name}</span>
      </span>
      <span class="a-cta-trail">${renderInstallIcon()}</span>
    </a>
  `;
}

function renderPlatformTab(key, label) {
  return `
    <button class="hero-install__tab" type="button" role="tab" id="hero-install-${key}-tab"
      aria-controls="hero-install-command" aria-selected="false" data-install-platform="${key}" tabindex="-1">${label}</button>
  `;
}

/**
 * One install unit: the visitor's own OS as the filled button, the other as
 * its outline twin, the command beside them, and one meta row — the OS switch
 * on the left, the hardware note, the licence and the count on the right.
 * Replaces the tabbed block, its "Recommended" badge and the caption row.
 */
export function renderInstallBlock(copy) {
  return `
    <div class="hero-install hero-rise" data-quick-install data-install-state="idle" data-os="mac">
      <div class="hero-install__ctas">
        ${renderCta("mac", RELEASES_URL, renderAppleIcon(), "installMac", copy.installMac)}
        ${renderCta("win", WINDOWS_FALLBACK_URL, renderWindowsIcon(), "installWin", copy.installWin)}
      </div>
      <div class="hero-install__line" id="hero-install-command" role="tabpanel">
        <span class="hero-install__prefix" data-install-prefix aria-hidden="true"></span>
        <code class="hero-install__command" data-install-command></code>
        <button class="hero-install__copy" type="button" aria-label="Copy install command" title="Copy" data-install-copy>
          <svg viewBox="0 0 20 20" width="15" height="15" fill="none" aria-hidden="true">
            <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" />
            <path d="M13.5 6.5V5A1.5 1.5 0 0 0 12 3.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5" />
          </svg>
          <span class="hero-sr" data-install-copy-label>Copy</span>
        </button>
      </div>
      <div class="hero-install__meta">
        <div class="hero-install__tabs" role="tablist" aria-label="Install platform">
          ${renderPlatformTab("mac", "macOS")}
          ${renderPlatformTab("win", "Windows")}
        </div>
        <p class="hero-install__facts">
          <span data-install-status></span>
          <span data-copy="heroMetaFree">${copy.heroMetaFree}</span>
          <span class="hero-install__proof" data-download-proof data-download-state="loading" aria-live="polite">
            <strong data-download-count>—</strong> <span data-copy="downloadCountUnit">${copy.downloadCountUnit}</span>
          </span>
        </p>
      </div>
      <span class="hero-sr" role="status" aria-live="polite" data-install-feedback></span>
    </div>
  `;
}

/**
 * Put the visitor's platform first and fill it. The UA cannot tell Apple
 * Silicon from Intel, which is why the hardware note rides the meta row.
 *
 * @param {ParentNode} root
 */
export function mountInstallOrder(root) {
  const block = root.querySelector(".hero-install");

  if (!block) {
    throw new Error("Hero install block is missing.");
  }

  const os = initialInstallPlatform();
  block.dataset.os = os;

  for (const cta of block.querySelectorAll(".hero-cta")) {
    const primary = cta.dataset.os === os;
    cta.classList.toggle("a-primary-cta", primary);
    cta.classList.toggle("a-quiet-cta", !primary);
  }
}

/** Monochrome marks, names on hover and to screen readers: the five-second answer to "does it run mine?". */
export function renderAgentRow(copy) {
  const marks = AGENT_MARKS.map(
    (agent) => `
      <li class="hero-agents__item" title="${agent.label}">
        ${renderAgentMark(agent, "hero-agents__mark", 18)}
        <span class="hero-sr">${agent.label}</span>
      </li>
    `,
  ).join("");

  return `
    <div class="hero-agents hero-rise">
      <ul class="hero-agents__marks" aria-label="Agent CLIs Deck launches">${marks}</ul>
      <span class="hero-agents__tail" data-copy="heroAgentsTail">${copy.heroAgentsTail}</span>
    </div>
  `;
}

export function renderPauseButton(copy) {
  return `
    <button class="hero-pause" type="button" aria-pressed="false" aria-label="${copy.heroPause}">
      <svg class="hero-pause__glyph hero-pause__glyph--pause" viewBox="0 0 16 16" aria-hidden="true">
        <rect x="4" y="3" width="2.6" height="10" rx="1" /><rect x="9.4" y="3" width="2.6" height="10" rx="1" />
      </svg>
      <svg class="hero-pause__glyph hero-pause__glyph--play" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5Z" />
      </svg>
    </button>
  `;
}
