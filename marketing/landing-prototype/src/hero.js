import { renderStagePane, renderStageRail, renderStageStrip } from "./appwin.js";
import { injectBraille, mountAskedBeat, mountMotionGate } from "./hero-asked-beat.js";
import {
  calmRail,
  mountInstallOrder,
  renderAgentRow,
  renderHeadline,
  renderInstallBlock,
  renderPauseButton,
  renderReleasePill,
} from "./hero-copy-column.js";
import { STAGE_ARIA_LABEL, mountStageStream, stagePanes, stageStrip } from "./product-stage.js";
import { mountTopbarDownload, renderTopbar } from "./topbar.js";

/**
 * The hero (2026-10-10): the copy column on the dark ground, then the window
 * standing on the painting below it — the desk the page has always had. The
 * owner kept that order over a spread with the product beside the copy: whole
 * and at one scale, the window reads as the app, and a cut or magnified one
 * read as a broken layout.
 *
 * The one loop on the page happens in the window's rail: an agent asks, is
 * answered, goes back to work. It replaced a six-scene cycle and a drawn
 * pointer, so every change on screen has a cause a reader can name.
 */

/*
 * Every beat holds at most one working and one asked row (motion review,
 * 2026-10-10). Asked beats dwell longer: that frame is the message.
 */
const BEATS = [
  {
    hold: 4200,
    rows: {
      claude: { state: "working", tail: "Tracing why the pane divider drifts on resize…" },
      codex: { state: "done", tail: "96 passed · 0 failed" },
      opencode: { state: "done", tail: "typecheck clean · the branch follows cwd now" },
    },
  },
  {
    hold: 5600,
    rows: { opencode: { state: "asked", tail: "Should I apply the pending migration?" } },
  },
  {
    hold: 4200,
    rows: {
      opencode: { state: "working", tail: "Applying migration 0042…" },
      claude: { state: "done", tail: "214 tests passed — the divider stays put" },
    },
  },
  { hold: 5600, rows: { codex: { state: "asked", tail: "Run the full e2e suite? About 4 min." } } },
  {
    hold: 4200,
    rows: {
      codex: { state: "working", tail: "Running e2e · 48 specs" },
      opencode: { state: "done", tail: "Migration applied · 3 tables" },
    },
  },
  { hold: 5600, rows: { claude: { state: "asked", tail: "Open a PR for the divider fix?" } } },
  {
    hold: 4200,
    rows: {
      claude: { state: "working", tail: "Opening PR #412…" },
      codex: { state: "done", tail: "e2e · 48 passed" },
    },
  },
];

/** The beat a reader who asked for no motion is left on: opencode asking. */
const STILL_BEAT = 1;

export function renderHero(copy) {
  const [claudePane, codexPane, opencodePane] = stagePanes;

  return {
    markup: `
      <section class="direction-a hero">
        <div class="a-main">
          ${renderTopbar(copy)}

          <div class="hero-copy">
            ${renderReleasePill(copy)}
            ${renderHeadline(copy)}
            ${renderInstallBlock(copy)}
            ${renderAgentRow(copy)}
          </div>

          <div class="hero-stage">
            <div class="hero-desk">
              <div class="hero-desk__art" aria-hidden="true"></div>

              <figure class="a-appwin hero-window" role="img" aria-label="${STAGE_ARIA_LABEL}">
                <div class="a-appwin__body">
                  ${renderStageRail(calmRail)}
                  <div class="a-appwin__stage is-revealed" data-scene="agents">
                    ${renderStageStrip(stageStrip)}
                    <div class="a-appwin__grid">
                      <div class="a-appwin__col">
                        ${renderStagePane(claudePane)}
                        ${renderStagePane(codexPane)}
                      </div>
                      ${renderStagePane(opencodePane)}
                    </div>
                  </div>
                </div>
              </figure>

              ${renderPauseButton(copy)}
            </div>
          </div>
        </div>
      </section>
    `,
    mount(root) {
      const section = root.querySelector(".hero");

      if (!section) {
        throw new Error("Hero root is missing.");
      }

      mountInstallOrder(section);
      mountTopbarDownload(section);

      // The panes hold their completed frame; the rail is the one thing that
      // moves, and the beat repaints the hooks the stream shares with it.
      const win = section.querySelector(".hero-window");
      const disposeStream = mountStageStream(win.querySelector(".a-appwin__grid"), {
        chromeRoot: win,
        live: [],
      });
      injectBraille(win);

      const beat = mountAskedBeat(win, BEATS, { stillBeat: STILL_BEAT });
      const disposeGate = mountMotionGate(section, {
        watch: section.querySelector(".hero-desk"),
        button: section.querySelector(".hero-pause"),
        copy,
        onPlay: beat.play,
        onPause: beat.pause,
      });

      return () => {
        disposeGate();
        beat.dispose();
        disposeStream();
      };
    },
  };
}
