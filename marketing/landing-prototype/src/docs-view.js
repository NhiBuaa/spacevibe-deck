import { BRAND_ICON_SRC } from "./appwin.js";
import { messages } from "./copy.js";
import { renderUserDocs } from "./docs-render.js";
import { CHANGELOG_URL, DOCS_URLS, FEEDBACK_URL, LANDING_URL } from "./site-urls.js";

// The guides themselves, read from the repository at build time: the English
// originals in docs/user/ and their translations, one folder per locale.
const GUIDE_SOURCES = import.meta.glob("../../../docs/user/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});
const TRANSLATION_SOURCES = import.meta.glob("../docs/translations/*/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
});

const PARTNER_MARK_SRC = "/landing-prototype/assets/partner-mark.svg";

/** The changelog and the feedback board read their language from `?lang=`. */
function localized(url, locale) {
  return locale === "en" ? url : `${url}?lang=${locale}`;
}

function renderLocaleSwitch(copy, locale) {
  const links = Object.entries(DOCS_URLS)
    .map(
      ([code, url]) =>
        `<a href="${url}" hreflang="${code}" lang="${code}" data-docs-locale${
          code === locale ? ' aria-current="page"' : ""
        }>${code.toUpperCase()}</a>`,
    )
    .join("");

  return `
    <div class="changelog-topbar__lang docs-lang" role="group" aria-label="${copy.localeLabel}" data-active="${locale}">
      <span class="changelog-topbar__lang-thumb" aria-hidden="true"></span>
      ${links}
    </div>
  `;
}

function renderNav(guides, copy, locale) {
  const items = guides
    .map(
      (guide) => `
        <li data-docs-guide="${guide.slug}"${guide.lang === locale ? "" : ` lang="${guide.lang}"`}>
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
    <nav class="docs-nav" aria-label="${copy.docsNavLabel}">
      <ol class="docs-nav__list">${items}</ol>
    </nav>
  `;
}

/** A guide showing in English on another locale's page says so, in that locale. */
function renderGuide(guide, copy, locale) {
  if (guide.lang === locale) {
    return `<section class="docs-guide" aria-labelledby="${guide.slug}">${guide.html}</section>`;
  }

  const titleEnd = guide.html.indexOf("</h2>") + "</h2>".length;
  const notice = `<p class="docs-untranslated" lang="${locale}">${copy.docsUntranslated}</p>`;

  return `<section class="docs-guide" aria-labelledby="${guide.slug}" lang="${guide.lang}">${guide.html.slice(0, titleEnd)}${notice}${guide.html.slice(titleEnd)}</section>`;
}

/**
 * The whole page in `locale`, as one string — the build prerenders it, dev
 * renders it on boot — plus the guides that fell back to English, which the
 * build reports.
 */
export function renderDocsPage(locale) {
  const copy = messages[locale];
  const guides = renderUserDocs(GUIDE_SOURCES, { locale, translations: TRANSLATION_SOURCES });

  const markup = `
    <header class="changelog-topbar docs-topbar">
      <a class="changelog-brand" href="${LANDING_URL}" aria-label="${copy.navProduct}">
        <span class="changelog-brand__marks" aria-hidden="true">
          <img src="${PARTNER_MARK_SRC}" alt="" width="22" height="22" />
          <span></span>
          <img src="${BRAND_ICON_SRC}" alt="" width="28" height="28" />
        </span>
        <strong>${copy.navProduct}</strong>
      </a>
      ${renderLocaleSwitch(copy, locale)}
      <a class="changelog-back docs-topbar__changelog" href="${localized(CHANGELOG_URL, locale)}">${copy.navChangelog}</a>
      <a class="changelog-back" href="${LANDING_URL}">
        <span aria-hidden="true">←</span>
        <span>${copy.changelogBack}</span>
      </a>
    </header>

    <section class="docs-intro" aria-labelledby="docs-title">
      <h1 id="docs-title">${copy.docsTitle}</h1>
      <p class="docs-intro__body">${copy.docsIntro}</p>
    </section>

    <div class="docs-body">
      ${renderNav(guides, copy, locale)}
      <article class="docs-article">
        ${guides.map((guide) => renderGuide(guide, copy, locale)).join("")}
        <p class="docs-feedback">
          ${copy.docsFeedbackLead} <a href="${localized(FEEDBACK_URL, locale)}">${copy.docsFeedbackLink}</a>
        </p>
      </article>
    </div>
  `;

  return {
    markup,
    untranslated: guides
      .filter((guide) => guide.translation !== null && guide.translation !== "current")
      .map((guide) => ({ slug: guide.slug, status: guide.translation })),
  };
}
