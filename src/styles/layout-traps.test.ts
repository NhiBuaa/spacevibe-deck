/* oxlint-disable jest/valid-expect, vitest/valid-expect -- vitest expect() takes a failure message as its second argument */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseRules, type Rule } from "./css-weight-sites";

/**
 * Tripwires for the "Layout and CSS" traps in `docs/internals/traps.md`. Each one
 * is a shape the stylesheets can be read for, so a change that walks back into the
 * trap fails here instead of surfacing as a window that moves by a pixel.
 */

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
/** Never bundled into the app (R7). */
const NOT_SHIPPED = "src/gallery/";

function cssFiles(dir = join(ROOT, "src")): string[] {
  return readdirSync(dir)
    .sort()
    .flatMap((entry) => {
      const path = join(dir, entry);
      const name = relative(ROOT, path).split(sep).join("/");
      if (name.startsWith(NOT_SHIPPED)) return [];
      if (statSync(path).isDirectory()) return cssFiles(path);
      return name.endsWith(".css") ? [name] : [];
    });
}

const rules: Rule[] = cssFiles().flatMap((file) =>
  parseRules(file, readFileSync(join(ROOT, file), "utf8")),
);

const where = (rule: Rule): string => `${rule.file}:${rule.line} ${rule.selectors.join(", ")}`;
const value = (rule: Rule, prop: string): string | undefined =>
  rule.declarations.findLast((d) => d.prop === prop)?.value.replace(/\s*!important$/, "");

describe("layout traps", () => {
  it("never makes the page roots a scroll container", () => {
    const roots = /^(html|body|#root)$/;
    const offenders = rules
      .filter((rule) => rule.selectors.some((selector) => roots.test(selector.trim())))
      .filter((rule) => ["hidden", "scroll", "auto"].includes(value(rule, "overflow") ?? ""))
      .map(where);
    expect(
      offenders,
      "`html`, `body` and `#root` must use `overflow: clip`: `hidden` still builds a scroll container, so a one-pixel overhang moves the whole window (traps.md, Layout and CSS)",
    ).toEqual([]);
  });

  it("keeps `#root` at `overflow: clip`", () => {
    const declared = rules
      .filter((rule) => rule.selectors.some((selector) => selector.trim() === "#root"))
      .map((rule) => value(rule, "overflow"))
      .filter((overflow) => overflow !== undefined);
    expect(declared, "`#root` must declare `overflow: clip` (traps.md, Layout and CSS)").toContain(
      "clip",
    );
  });
});
