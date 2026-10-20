// Which guide translations are current, stale or missing against the English
// guides in docs/user/ — the docs pages show a stale or missing one in English.
//
//   npm run docs:translations                  list every locale and guide
//   npm run docs:translations -- --stamp vi/agents
//                                              mark vi/agents.md current, after
//                                              bringing it in line with the English
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { sourceStamp, splitTranslation } from "./src/docs-render.js";

const GUIDES = resolve(import.meta.dirname, "../../docs/user");
const TRANSLATIONS = resolve(import.meta.dirname, "docs/translations");

const slugs = readdirSync(GUIDES)
  .filter((file) => file.endsWith(".md"))
  .map((file) => file.slice(0, -".md".length));
const locales = readdirSync(TRANSLATIONS, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

const englishStamp = (slug) => sourceStamp(readFileSync(resolve(GUIDES, `${slug}.md`), "utf8"));
const translationFile = (locale, slug) => resolve(TRANSLATIONS, locale, `${slug}.md`);

const [flag, target] = process.argv.slice(2);

if (flag === "--stamp") {
  const [locale, slug] = (target ?? "").split("/");
  const file = translationFile(locale, slug);

  if (!slugs.includes(slug) || !existsSync(file)) {
    console.error(`No translation ${target}: expected docs/translations/<locale>/<guide>.md.`);
    process.exit(1);
  }

  const { body } = splitTranslation(readFileSync(file, "utf8"));
  writeFileSync(file, `---\ntranslated-from: ${englishStamp(slug)}\n---\n\n${body.trimStart()}`);
  console.log(`${locale}/${slug} marked current.`);
} else {
  for (const locale of locales) {
    for (const slug of slugs) {
      const file = translationFile(locale, slug);
      const status = !existsSync(file)
        ? "missing"
        : splitTranslation(readFileSync(file, "utf8")).stamp === englishStamp(slug)
          ? "current"
          : "stale";
      console.log(`${`${locale}/${slug}`.padEnd(28)} ${status}`);
    }
  }
}
