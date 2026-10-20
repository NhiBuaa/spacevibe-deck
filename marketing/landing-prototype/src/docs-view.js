import { BRAND_ICON_SRC } from "./appwin.js";
import { renderUserDocs } from "./docs-render.js";
import { CHANGELOG_URL, FEEDBACK_URL, LANDING_URL } from "./site-urls.js";

// The guides themselves, read from the repository at build time. The docs
// are English only (AGENTS.md R1), so the page chrome is too.
const GUIDE_SOURCES = import.meta.glob("../../../docs/user/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const PARTNER_MARK_SRC = "/landing-prototype/assets/partner-mark.svg";

const COPY = {
  product: "Deck",
  back: "Back to Deck",
  changelog: "Changelog",
  title: "Docs",
  intro:
    "Install Deck, launch your agents, and find your way around panes, files, shortcuts and settings. These guides live beside the app's source and go live with every change to them.",
  navLabel: "Guides",
  feedbackLead: "Something unclear or out of date?",
  feedbackLink: "Tell us",
};

function renderNav(guides) {
  const items = guides
    .map(
      (guide) => `
        <li data-docs-guide="${guide.slug}">
          <a class="docs-nav__guide" href="#${guide.slug}">${guide.title}</a>
          <ul class="docs-nav__sections">
            ${guide.sections
              .map((section) => `<li><a href="#${section.id}">${section.text}</a></li>`)
              .join("")}
          </ul>
        </li>`,
    )
    .join("");

  return `
    <nav class="docs-nav" aria-label="${COPY.navLabel}">
      <ol class="docs-nav__list">${items}</ol>
    </nav>
  `;
}

/** The whole page, as one string: the build prerenders it, dev renders it on boot. */
export function renderDocsPage() {
  const guides = renderUserDocs(GUIDE_SOURCES);

  return `
    <header class="changelog-topbar docs-topbar">
      <a class="changelog-brand" href="${LANDING_URL}" aria-label="${COPY.product}">
        <span class="changelog-brand__marks" aria-hidden="true">
          <img src="${PARTNER_MARK_SRC}" alt="" width="22" height="22" />
          <span></span>
          <img src="${BRAND_ICON_SRC}" alt="" width="28" height="28" />
        </span>
        <strong>${COPY.product}</strong>
      </a>
      <a class="changelog-back docs-topbar__changelog" href="${CHANGELOG_URL}">${COPY.changelog}</a>
      <a class="changelog-back" href="${LANDING_URL}">
        <span aria-hidden="true">←</span>
        <span>${COPY.back}</span>
      </a>
    </header>

    <section class="docs-intro" aria-labelledby="docs-title">
      <h1 id="docs-title">${COPY.title}</h1>
      <p class="docs-intro__body">${COPY.intro}</p>
    </section>

    <div class="docs-body">
      ${renderNav(guides)}
      <article class="docs-article">
        ${guides
          .map(
            (guide) =>
              `<section class="docs-guide" aria-labelledby="${guide.slug}">${guide.html}</section>`,
          )
          .join("")}
        <p class="docs-feedback">
          ${COPY.feedbackLead} <a href="${FEEDBACK_URL}">${COPY.feedbackLink}</a>
        </p>
      </article>
    </div>
  `;
}
