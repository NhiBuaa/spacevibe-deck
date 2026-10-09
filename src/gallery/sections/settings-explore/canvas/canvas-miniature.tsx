import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { CursorClick } from "@phosphor-icons/react";
import { CHROME_ICON, DeckIcon } from "../../../../ui/controls/deck-icon";
import { DEFAULT_SETTINGS } from "../../../../settings/settings-schema";
import { CANONICAL_THEME_IDS, resolveTheme } from "../../../../settings/themes";
import { toFontStack } from "../../../../terminal/pane";
import { resolveMode, useSystemMode } from "../../settings-redesign/live-preview";
import { settings } from "../../settings-redesign/model";
import { allChanges } from "./canvas-changes";
import { Navigation, StatusBar, TitleBar } from "./canvas-chrome";
import { rovingKeyDown } from "./canvas-keys";
import { Region } from "./canvas-region";
import { Toasts } from "./canvas-toasts";
import {
  focusAt,
  pointed,
  pointerAt,
  selectRegion,
  tabStop,
  type RegionId,
  type Spot,
} from "./canvas-regions";
import { PaneClaude, PaneCodex } from "./canvas-terminal";
import "../../settings-redesign/page-agents.css";
import "./canvas-miniature.css";

/*
 * A live Deck window drawn from the current settings, on a desk. It is built at
 * a fixed design size and scaled to fit its column, so text keeps its true size
 * relative to the chrome: a 13 to 14 change is visible. Pointing at a region
 * outlines and names it; clicking or pressing Enter selects it for the
 * inspector. Arrow keys walk the regions (one Tab stop for the whole window).
 */

const DESIGN_WIDTH = 720;
const HIT = ".cv-hit";

function spotOf(target: EventTarget | null): Spot | null {
  const element = (target as Element | null)?.closest<HTMLElement>("[data-cv-instance]");
  if (element === null || element === undefined) return null;
  return {
    region: element.dataset.cvRegion as RegionId,
    instance: element.dataset.cvInstance ?? "",
    part: element.dataset.cvPart,
  };
}

/** Scale that fits the design width into the measured column; never enlarges. */
function useFitScale(ref: { readonly current: HTMLElement | null }): number {
  const scale = useSignal(1);
  /* oxlint-disable react-hooks/exhaustive-deps -- mount-only observer; the ref and the signal are stable */
  useLayoutEffect(() => {
    const node = ref.current;
    if (node === null) return;
    const measure = (): void => {
      scale.value = Math.min(1, node.clientWidth / DESIGN_WIDTH);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  /* oxlint-enable react-hooks/exhaustive-deps */
  return scale.value;
}

/** The terminal's own colours, from the canonical theme of the resolved mode. */
function useTerminalVars(): Record<string, string> {
  const current = settings.value;
  const mode = resolveMode(current.colorMode, useSystemMode());
  const theme = resolveTheme({ ...DEFAULT_SETTINGS, themeId: CANONICAL_THEME_IDS[mode] });
  const fg = theme.foreground ?? "currentColor";
  return {
    "--cv-fg": fg,
    "--cv-cursor": theme.cursor ?? fg,
    "--cv-select": theme.selectionBackground ?? "transparent",
    "--cv-cwd": theme.cyan ?? fg,
    "--cv-branch": theme.magenta ?? fg,
    "--cv-prompt": theme.blue ?? fg,
    "--cv-ok": theme.green ?? fg,
    "--cv-warn": theme.yellow ?? fg,
    "--cv-font": toFontStack(current.fontFamily),
    "--cv-fs": String(current.fontSize),
    "--cv-lh": String(current.lineHeight),
  };
}

export function Miniature({ interactive }: { readonly interactive: boolean }) {
  const s = settings.value;
  const rootRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<HTMLDivElement>(null);
  const scale = useFitScale(fitRef);
  const changed: ReadonlySet<RegionId> = new Set(allChanges(s).map((change) => change.region));
  const vars = useTerminalVars();

  // The roving stop can vanish (an agent leaves the pickers); fall back to the window.
  useEffect(() => {
    if (!interactive) return;
    if (rootRef.current?.querySelector(`${HIT}[tabindex="0"]`) === null) tabStop.value = "win";
  });

  const events = interactive
    ? {
        onPointerOver: (event: PointerEvent) => {
          const spot = spotOf(event.target);
          pointerAt.value = spot;
          if (spot !== null && spot.instance !== "desk") pointed.value = true;
        },
        onPointerLeave: () => {
          pointerAt.value = null;
        },
        onFocusIn: (event: FocusEvent) => {
          const spot = spotOf(event.target);
          if (spot !== null) tabStop.value = spot.instance;
          focusAt.value = (event.target as Element).matches(":focus-visible") ? spot : null;
        },
        onFocusOut: (event: FocusEvent) => {
          if (!rootRef.current?.contains(event.relatedTarget as Node | null)) focusAt.value = null;
        },
        onClick: (event: MouseEvent) => {
          const spot = spotOf(event.target);
          if (spot !== null) selectRegion(spot.region, spot.part);
        },
        onKeyDown: (event: KeyboardEvent) => rovingKeyDown(event, HIT),
      }
    : {};

  return (
    <div
      ref={rootRef}
      class={`cv-stage ${interactive ? "" : "is-thumb"}`}
      data-cv-region="window"
      data-cv-instance="desk"
      role={interactive ? "group" : undefined}
      aria-label={interactive ? "Deck, point at a part to edit it" : undefined}
      aria-hidden={interactive ? undefined : "true"}
      {...events}
    >
      <div ref={fitRef} class="cv-fit">
        <Region
          region="window"
          instance="win"
          interactive={interactive}
          class={`cv-win is-${s.tabBarPosition}`}
          label="Window"
          style={{ ...vars, "--cv-k": String(scale) }}
        >
          <TitleBar s={s} changed={changed} />
          <div class="cv-body">
            <Navigation s={s} changed={changed} interactive={interactive} />
            <div class="cv-main">
              <div class={`cv-panes ${s.focusExpand ? "is-expanded" : ""}`}>
                <PaneClaude
                  s={s}
                  interactive={interactive}
                  changedPane={changed.has("pane")}
                  changedBar={changed.has("panebar")}
                />
                <PaneCodex
                  s={s}
                  interactive={interactive}
                  changedPane={changed.has("pane")}
                  changedBar={changed.has("panebar")}
                />
              </div>
              <StatusBar s={s} changed={changed} interactive={interactive} />
            </div>
          </div>
          <Toasts s={s} changed={changed} interactive={interactive} />
        </Region>
      </div>
      {interactive && (
        <p class="cv-hint" title="Point at a part of Deck to edit it">
          <DeckIcon icon={CursorClick} size={CHROME_ICON} />
          {!pointed.value && "Point at a part of Deck"}
        </p>
      )}
    </div>
  );
}
