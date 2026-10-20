/**
 * `docs/user/*.md` → the public docs page.
 *
 * The user guides are the ONE source: the page renders the files as they are
 * in the repository, so a change to how a feature is used reaches the site by
 * editing its guide, and the next deploy carries it. Nothing here restates the
 * app.
 *
 * Every guide becomes one section of a single page, so each heading id is
 * prefixed with its guide's slug (`settings-privacy`), and the guides' own
 * `settings.md#privacy` links are rewritten onto those ids. A link that points
 * at no heading THROWS: the build's prerender runs this, so a broken link
 * fails the deploy instead of shipping a dead anchor.
 *
 * A translation records the stamp of the English guide it was made from. When
 * the English changes, the stamp no longer matches and that locale's page shows
 * the English guide until the translation catches up: a reader is never handed
 * a translation that describes an app that has moved on.
 */
import { Marked } from "marked";

/** The guide a newcomer reads first; the rest follow alphabetically. */
const FIRST_GUIDE = "getting-started";

const HTML_ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

function escapeHtml(text) {
  return text.replace(/[&<>"]/g, (character) => HTML_ESCAPES[character]);
}

/**
 * GitHub's heading slug — the ids the guides' cross-links were written
 * against. Each whitespace character becomes its own dash, so
 * "Settings → Agents" is `settings--agents`, not `settings-agents`.
 */
export function githubSlug(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/**
 * The stamp a translation records of the English guide it was made from.
 * FNV-1a over the text, so the renderer (in the browser too) and
 * `docs-translations.mjs` compute it the same way, synchronously. Line endings
 * are normalised so a Windows checkout stamps the same guide the same way.
 */
export function sourceStamp(markdown) {
  const text = markdown.replace(/\r\n/g, "\n");
  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/** A translation's `translated-from` stamp and its markdown body. */
export function splitTranslation(markdown) {
  const match = markdown.match(FRONTMATTER);

  return {
    stamp: match?.[1].match(/^translated-from:\s*(\S+)\s*$/m)?.[1] ?? null,
    body: match ? markdown.slice(match[0].length) : markdown,
  };
}

/** Heading text with its inline markdown marks dropped, for ids and the nav. */
function plainHeading(text) {
  return text.replace(/[`*]/g, "").trim();
}

/** Every heading of one guide, in document order, with its page-wide id. */
function collectHeadings(marked, tokens, slug) {
  const seen = new Map();
  const headings = [];

  marked.walkTokens(tokens, (token) => {
    if (token.type !== "heading") {
      return;
    }

    const text = plainHeading(token.text);

    if (token.depth === 1) {
      headings.push({ id: slug, depth: 1, text });
      return;
    }

    const base = githubSlug(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    const fragment = count === 0 ? base : `${base}-${count}`;
    headings.push({ id: `${slug}-${fragment}`, depth: token.depth, text });
  });

  return headings;
}

/**
 * Where a link in guide `slug` goes on the page.
 *
 * `https:` opens outside; `page.md#heading` and `#heading` become page
 * anchors; `../` paths are the source and internals citations the repository
 * rules require in every guide — contributor-facing, so the page keeps their
 * text, quietened, and drops the link.
 */
function resolveLink(href, slug, anchors) {
  if (/^https:\/\//.test(href)) {
    return { kind: "external", href };
  }

  const local = href.match(/^(?:([\w-]+)\.md)?(?:#(.+))?$/);

  if (local && (local[1] || local[2])) {
    const page = local[1] ?? slug;
    const id = local[2] ? `${page}-${local[2]}` : page;

    if (!anchors.has(id)) {
      throw new Error(`Docs: ${slug}.md links to "${href}", which is no heading in docs/user/.`);
    }

    return { kind: "anchor", href: `#${id}` };
  }

  if (href.startsWith("../")) {
    return { kind: "text" };
  }

  throw new Error(`Docs: ${slug}.md has a link the docs page cannot resolve: "${href}".`);
}

function rendererFor(guide, anchors) {
  const queue = [...guide.headings];

  return {
    // Guide headings sit one level under the page's own `<h1>`, and each one
    // links to itself so a reader can copy the address of any section.
    heading({ tokens, depth }) {
      const { id } = queue.shift();
      const inner = this.parser.parseInline(tokens);
      const body = inner.includes("<a ") ? inner : `<a href="#${id}">${inner}</a>`;
      return `<h${depth + 1} id="${id}">${body}</h${depth + 1}>\n`;
    },

    link({ href, title, tokens }) {
      const inner = this.parser.parseInline(tokens);
      const target = resolveLink(href, guide.slug, anchors);
      const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";

      switch (target.kind) {
        case "external":
          return `<a href="${escapeHtml(target.href)}"${titleAttribute} target="_blank" rel="noreferrer">${inner}</a>`;
        case "anchor":
          return `<a href="${target.href}"${titleAttribute}>${inner}</a>`;
        case "text":
          return `<span class="docs-source">${inner}</span>`;
      }
    },
  };
}

/** Wide shortcut tables scroll inside their own box rather than the page. */
function wrapTables(html) {
  return html
    .replaceAll("<table>", '<div class="docs-table"><table>')
    .replaceAll("</table>", "</table></div>");
}

function renderGuide(guide, anchors) {
  return wrapTables(
    new Marked({ gfm: true, renderer: rendererFor(guide, anchors) }).parser(guide.tokens),
  );
}

function navSections(headings) {
  return headings
    .filter((heading) => heading.depth === 2)
    .map((heading) => ({ id: heading.id, text: heading.text }));
}

/**
 * The guide in `locale`, or `null` when its translation is missing or stale.
 *
 * A current translation takes its heading ids from the English guide, by
 * position, so every link and every shared address lands in the same place in
 * both languages. That only holds while the headings line up, so a translation
 * stamped current whose heading levels differ from the English THROWS.
 */
function translateGuide(guide, locale, translations, lexer) {
  const path = Object.keys(translations).find((key) => key.endsWith(`/${locale}/${guide.slug}.md`));

  if (path === undefined) {
    return { status: "missing" };
  }

  const { stamp, body } = splitTranslation(translations[path]);

  if (stamp !== sourceStamp(guide.source)) {
    return { status: "stale" };
  }

  const tokens = lexer.lexer(body);
  const headings = collectHeadings(lexer, tokens, guide.slug);
  const levels = (list) => list.map((heading) => heading.depth).join(",");

  if (levels(headings) !== levels(guide.headings)) {
    throw new Error(
      `Docs: ${locale}/${guide.slug}.md is stamped current, but its headings do not line up ` +
        `with docs/user/${guide.slug}.md (levels ${levels(headings)} vs ${levels(guide.headings)}).`,
    );
  }

  return {
    status: "current",
    tokens,
    headings: headings.map((heading, index) => ({ ...heading, id: guide.headings[index].id })),
  };
}

/**
 * Render the guides.
 *
 * `sources` maps a file path to its English markdown, the shape
 * `import.meta.glob` hands back; `translations` the same for
 * `<locale>/<slug>.md`. Returns the guides in reading order, each with its
 * title, its `##` sections for the navigation, its HTML, the language that
 * HTML is in, and — off English — whether its translation is `current`,
 * `stale` or `missing`.
 */
export function renderUserDocs(sources, { locale = "en", translations = {} } = {}) {
  // An empty glob is what Vercel sees when `.vercelignore` drops the guides:
  // fail the deploy rather than publish a docs page with nothing in it.
  if (Object.keys(sources).length === 0) {
    throw new Error("Docs: no guides found in docs/user/ (is it whitelisted in .vercelignore?).");
  }

  const lexer = new Marked({ gfm: true });

  const guides = Object.entries(sources).map(([path, source]) => {
    const slug = path.split("/").at(-1).replace(/\.md$/, "");
    const tokens = lexer.lexer(source);
    const headings = collectHeadings(lexer, tokens, slug);
    const title = headings.find((heading) => heading.depth === 1)?.text;

    if (title === undefined) {
      throw new Error(`Docs: docs/user/${slug}.md has no "# " title.`);
    }

    return { slug, title, source, tokens, headings };
  });

  guides.sort((a, b) =>
    a.slug === FIRST_GUIDE ? -1 : b.slug === FIRST_GUIDE ? 1 : a.slug.localeCompare(b.slug),
  );

  const anchors = new Set(guides.flatMap((guide) => guide.headings.map((heading) => heading.id)));

  return guides.map((guide) => {
    const translated = locale === "en" ? null : translateGuide(guide, locale, translations, lexer);

    if (translated?.status === "current") {
      const shown = { ...guide, tokens: translated.tokens, headings: translated.headings };

      return {
        slug: guide.slug,
        title: translated.headings[0].text,
        sections: navSections(translated.headings),
        html: renderGuide(shown, anchors),
        lang: locale,
        translation: "current",
      };
    }

    return {
      slug: guide.slug,
      title: guide.title,
      sections: navSections(guide.headings),
      html: renderGuide(guide, anchors),
      lang: "en",
      translation: translated?.status ?? null,
    };
  });
}
