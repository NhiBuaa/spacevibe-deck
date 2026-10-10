/**
 * The real Monaco, mounted for the diff column specimens (plan
 * 2026-10-10-diff-column, Task 0).
 *
 * Three gallery-only facts live here, each one a place the shipping editor
 * could not be reused as is:
 *
 *  - **Monaco keeps one theme per page.** The gallery's theme picker publishes
 *    CSS variables and never touches `settings`, so `applyMonacoTheme` would
 *    paint the settings theme under the light skin. The theme is built from the
 *    picker's own value and re-applied when it changes.
 *  - **D1's two washes share a page.** (a) is a theme: the colours Task 3 will
 *    add to `monacoThemeFor`. (b) is a per-frame CSS override of the
 *    `--vscode-diffEditor-*` variables Monaco writes onto `.monaco-editor`, in
 *    `diff-column-specimens.css`. The overview ruler paints from the theme in
 *    JS, so it is off in every frame rather than wrong in half of them.
 *  - **A diff computes in the editor worker**, so a host reports `ready` from
 *    `onDidUpdateDiff` and the screenshot script waits for it.
 *
 * Never imported by shipping code (R7).
 */
import { useEffect, useRef } from "preact/hooks";
import {
  languageForPath,
  loadMonaco,
  monacoThemeFor,
  type MonacoApi,
  type MonacoThemeData,
} from "../../files/editor-host";
import { deriveChromeColors } from "../../lib/derive-colors";
import { monoFontFallback } from "../../settings/mono-font-fallback";
import { settings } from "../../settings/settings-store";
import { resolveTheme, THEME_PRESETS } from "../../settings/themes";

const GALLERY_THEME_ID = "deck-gallery";

/** The theme the gallery's picker shows now, falling back to `?theme=` and the default. */
function pickedThemeId(): string {
  const select = document.querySelector<HTMLSelectElement>(".gx-themepick select");
  const id = select?.value ?? new URLSearchParams(window.location.search).get("theme");
  return THEME_PRESETS.find((preset) => preset.id === id)?.id ?? THEME_PRESETS[0].id;
}

/** `#rrggbb` plus an alpha, as the 8-digit hex Monaco's `defineTheme` parses. */
function alphaHex(color: string, alpha: number): string {
  const digits = color.replace("#", "");
  const full = digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits;
  return `#${full.slice(0, 6)}${Math.round(alpha * 255)
    .toString(16)
    .padStart(2, "0")}`;
}

/** D1 (a) as theme colours, from the live theme's own green and red. */
function galleryTheme(): MonacoThemeData {
  const picked = { ...settings.peek(), themeId: pickedThemeId(), colorOverrides: {} };
  const base = monacoThemeFor(picked);
  const theme = resolveTheme(picked);
  const green = theme.green ?? "#9ece6a";
  const red = theme.red ?? "#f7768e";
  const chrome = deriveChromeColors(theme.background ?? "#0a0a0a", theme.foreground ?? "#cbcbcb");
  return {
    ...base,
    colors: {
      ...base.colors,
      "diffEditor.insertedLineBackground": alphaHex(green, 0.12),
      "diffEditor.removedLineBackground": alphaHex(red, 0.12),
      "diffEditor.insertedTextBackground": alphaHex(green, 0.25),
      "diffEditor.removedTextBackground": alphaHex(red, 0.25),
      "diffEditorGutter.insertedLineBackground": alphaHex(green, 0.4),
      "diffEditorGutter.removedLineBackground": alphaHex(red, 0.4),
      // DL-1.3: the unchanged-region band draws a blurred shadow by default.
      "diffEditor.unchangedRegionShadow": "#00000000",
      "diffEditor.unchangedRegionBackground": chrome.chrome1,
      "diffEditor.unchangedRegionForeground": chrome.textMuted,
      "diffEditor.diagonalFill": chrome.chrome2,
      "diffEditor.border": chrome.chrome2,
    },
  };
}

/**
 * `loadMonaco` never imports Monaco's codicon stylesheet, so under it the diff's
 * `+` / `−` signs and the unfold chevrons draw no glyph. D1 (b) tells added from
 * removed by those signs, so the specimens load the stylesheet; Task 3's loader
 * needs the same import (a 141 KB font).
 */
async function loadWithCodicons(): Promise<MonacoApi> {
  const [monaco] = await Promise.all([
    loadMonaco(),
    import("monaco-editor/features/codicon/register.js"),
  ]);
  return monaco;
}

let following = false;

function applyGalleryTheme(monaco: MonacoApi): void {
  monaco.editor.defineTheme(
    GALLERY_THEME_ID,
    galleryTheme() as Parameters<typeof monaco.editor.defineTheme>[1],
  );
  monaco.editor.setTheme(GALLERY_THEME_ID);
  if (!following) {
    following = true;
    document.addEventListener("change", (event) => {
      if ((event.target as HTMLElement).closest(".gx-themepick") !== null) {
        applyGalleryTheme(monaco);
      }
    });
  }
}

function fontOptions() {
  const current = settings.peek();
  return {
    fontFamily: `${current.fontFamily}, ${monoFontFallback()}`,
    fontSize: current.fontSize,
  };
}

/** Mounts a Monaco object into `host`; returns what to dispose, or nothing if unmounted first. */
function useMonaco(
  mount: (monaco: MonacoApi, host: HTMLElement) => () => void,
  deps: readonly unknown[],
) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (element === null) {
      return;
    }
    let disposed = false;
    let dispose = () => {};
    void loadWithCodicons().then((monaco) => {
      if (disposed) {
        return;
      }
      applyGalleryTheme(monaco);
      dispose = mount(monaco, element);
    });
    return () => {
      disposed = true;
      dispose();
    };
    // `mount` closes over `deps`; the caller lists them.
    // oxlint-disable-next-line react/exhaustive-deps
  }, deps);
  return host;
}

export interface DiffBodyProps {
  readonly path: string;
  /** `null` is an empty side, for an added or a deleted file. */
  readonly original: string | null;
  readonly modified: string | null;
  /** One-sided cases are unified (D6); others follow the breakpoint (D3). */
  readonly unified: boolean;
  readonly breakpoint: number;
}

export function DiffBody(props: DiffBodyProps) {
  const host = useMonaco(
    (monaco, element) => {
      const language = languageForPath(props.path) ?? undefined;
      const original = monaco.editor.createModel(props.original ?? "", language);
      const modified = monaco.editor.createModel(props.modified ?? "", language);
      const editor = monaco.editor.createDiffEditor(element, {
        theme: GALLERY_THEME_ID,
        ...fontOptions(),
        readOnly: true,
        originalEditable: false,
        renderSideBySide: !props.unified,
        useInlineViewWhenSpaceIsLimited: true,
        renderSideBySideInlineBreakpoint: props.breakpoint,
        enableSplitViewResizing: false,
        // CHG5: no revert icon, no gutter menu — Deck never writes to git.
        renderMarginRevertIcon: false,
        renderGutterMenu: false,
        // The header counts whitespace-only changes, so the highlight must.
        ignoreTrimWhitespace: false,
        hideUnchangedRegions: {
          enabled: true,
          contextLineCount: 3,
          minimumLineCount: 4,
          revealLineCount: 20,
        },
        renderOverviewRuler: false,
        minimap: { enabled: false },
        scrollbar: { useShadows: false },
        scrollBeyondLastLine: false,
        // Wrapping stays off: in the unified view Monaco wraps the 40px hidden
        // original editor too, and a wrapped removed line leaves its gutter
        // cell unpainted. A 516px column therefore clips long lines.
        automaticLayout: true,
      });
      editor.setModel({ original, modified });
      editor.onDidUpdateDiff(() => {
        element.dataset.monaco = "ready";
      });
      return () => {
        editor.dispose();
        original.dispose();
        modified.dispose();
      };
    },
    [props.path, props.original, props.modified, props.unified, props.breakpoint],
  );
  return <div class="gx-dcs-monaco" data-monaco="pending" ref={host} />;
}

export function DocumentBody(props: { readonly path: string; readonly text: string }) {
  const host = useMonaco(
    (monaco, element) => {
      const editor = monaco.editor.create(element, {
        theme: GALLERY_THEME_ID,
        ...fontOptions(),
        value: props.text,
        language: languageForPath(props.path) ?? undefined,
        readOnly: true,
        minimap: { enabled: false },
        scrollbar: { useShadows: false },
        scrollBeyondLastLine: false,
        renderLineHighlight: "none",
        automaticLayout: true,
      });
      element.dataset.monaco = "ready";
      return () => editor.dispose();
    },
    [props.path, props.text],
  );
  return <div class="gx-dcs-monaco" data-monaco="pending" ref={host} />;
}
