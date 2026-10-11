/**
 * The hero's one focal loop (2026-10-10).
 *
 * An agent row in the rail turns `asked`, waits for you, is answered and goes
 * back to work while another one finishes — the product's promise acted out in
 * the marks the real rail already carries. It replaces the six-scene slideshow:
 * every change here has a cause a reader can name.
 *
 * Budget (motion review, 2026-10-10): at most one working + one asked row per
 * beat, nothing outside the window loops, and every loop pauses off screen, in
 * a hidden tab and behind the on-page Pause control (WCAG 2.2.2).
 */

/** The app's working spinner (f1fa8fb1): ten frames, one `<i>` each. */
const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const FADE_OUT = { duration: 120, easing: "cubic-bezier(0.3, 0, 0.8, 0.15)" };
const FADE_IN = { duration: 200, easing: "cubic-bezier(0.05, 0.7, 0.1, 1)" };
const ANSWERED_MS = 700;
const VISIBLE_RATIO = 0.35;

/**
 * Give every rail status cell under `root` the braille spinner. CSS paints it
 * only while the cell's `data-state` is `working`, so the beat flips one
 * attribute and the mark follows.
 *
 * @param {ParentNode} root
 */
export function injectBraille(root) {
  const spinner = `<span class="hero-braille" aria-hidden="true">${BRAILLE_FRAMES.map((frame) => `<i>${frame}</i>`).join("")}</span>`;

  for (const cell of root.querySelectorAll(".a-appwin__cardstatus")) {
    cell.insertAdjacentHTML("beforeend", spinner);
  }
}

function swapText(el, text, animate) {
  if (el.textContent === text) {
    return;
  }

  if (!animate || typeof el.animate !== "function") {
    el.textContent = text;
    return;
  }

  el.animate([{ opacity: 1 }, { opacity: 0 }], FADE_OUT).finished.then(
    () => {
      el.textContent = text;
      el.animate([{ opacity: 0 }, { opacity: 1 }], FADE_IN);
    },
    () => {
      el.textContent = text;
    },
  );
}

/**
 * Paint one beat. `rows` is keyed by pane id — the `[data-dot]` /
 * `[data-tail]` hooks the stage renderer already emits — so no shared
 * renderer learns about the loop.
 */
function paintBeat(root, beat, animate) {
  for (const [id, patch] of Object.entries(beat.rows)) {
    for (const dot of root.querySelectorAll(`[data-dot="${id}"]`)) {
      const answered = dot.dataset.state === "asked" && patch.state === "working";

      if (patch.state) {
        dot.dataset.state = patch.state;
      }

      const row = dot.closest(".a-appwin__cardrow");

      if (answered && animate && row) {
        row.classList.add("is-answered");
        setTimeout(() => row.classList.remove("is-answered"), ANSWERED_MS);
      }
    }

    if (patch.tail !== undefined) {
      for (const tail of root.querySelectorAll(`[data-tail="${id}"]`)) {
        swapText(tail, patch.tail, animate);
      }
    }
  }
}

/**
 * @param {ParentNode} root where the rail hooks live
 * @param {Array<{ hold: number, rows: Record<string, { state?: string, tail?: string }> }>} beats
 * @param {{ stillBeat?: number }} [options] the frame a reader who asked for
 *   no motion is left on — the asking one, because that frame is the message
 * @returns {{ play(): void, pause(): void, repaint(): void, dispose(): void }}
 *   `repaint` restores the current beat after something else wrote the same
 *   hooks (a stream remount paints its completed frame over every row).
 */
export function mountAskedBeat(root, beats, { stillBeat = 0 } = {}) {
  if (beats.length === 0) {
    throw new Error("The asked beat needs at least one beat.");
  }

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let index = reduceMotion ? stillBeat : 0;
  let timer = null;
  let dueAt = 0;
  let remaining = beats[index].hold;
  let running = false;

  // Earlier beats may have set fields the current one leaves alone, so a
  // still paint walks every beat up to it, exactly as the loop would have.
  function repaint() {
    for (let i = 0; i <= index; i += 1) {
      paintBeat(root, beats[i], false);
    }
  }

  repaint();

  function schedule(ms) {
    dueAt = performance.now() + ms;
    timer = setTimeout(advance, ms);
  }

  function advance() {
    index = (index + 1) % beats.length;
    paintBeat(root, beats[index], true);
    schedule(beats[index].hold);
  }

  return {
    play() {
      if (running || reduceMotion) {
        return;
      }

      running = true;
      schedule(remaining);
    },
    pause() {
      if (!running) {
        return;
      }

      running = false;
      clearTimeout(timer);
      remaining = Math.max(0, dueAt - performance.now());
    },
    repaint,
    dispose() {
      running = false;
      clearTimeout(timer);
    },
  };
}

/**
 * One switch for everything that moves on its own: the user's Pause, the
 * product scrolled under {@link VISIBLE_RATIO} on screen, or a hidden tab all
 * turn it off. `section.dataset.motion` mirrors the state so CSS can hold its
 * own loops (spinner, ripple) in the same breath.
 *
 * @param {HTMLElement} section
 * @param {{ watch: Element, button: HTMLButtonElement | null, copy: Record<string, string>,
 *           onPlay: () => void, onPause: () => void }} options
 * @returns {() => void} dispose
 */
export function mountMotionGate(section, { watch, button, copy, onPlay, onPause }) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let userPaused = false;
  let onScreen = true;
  let active = false;

  if (button) {
    button.hidden = reduceMotion;
  }

  function sync() {
    const next = !reduceMotion && !userPaused && onScreen && document.visibilityState !== "hidden";

    section.dataset.motion = next ? "on" : "off";

    if (next === active) {
      return;
    }

    active = next;
    (next ? onPlay : onPause)();
  }

  function toggle() {
    userPaused = !userPaused;
    button.setAttribute("aria-pressed", String(userPaused));
    button.setAttribute("aria-label", userPaused ? copy.heroPlay : copy.heroPause);
    sync();
  }

  const observer =
    typeof IntersectionObserver === "undefined"
      ? null
      : new IntersectionObserver(
          (entries) => {
            const entry = entries.at(-1);

            // `isIntersecting` is true for any overlap whatever the threshold,
            // so the ratio is what decides "on screen".
            onScreen = entry ? entry.intersectionRatio >= VISIBLE_RATIO : true;
            sync();
          },
          { threshold: [0, VISIBLE_RATIO] },
        );

  observer?.observe(watch);
  button?.addEventListener("click", toggle);
  document.addEventListener("visibilitychange", sync);
  sync();

  return () => {
    observer?.disconnect();
    button?.removeEventListener("click", toggle);
    document.removeEventListener("visibilitychange", sync);
    onPause();
  };
}
