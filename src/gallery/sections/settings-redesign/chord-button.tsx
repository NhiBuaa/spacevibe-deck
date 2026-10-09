import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import "./pages-misc.css";

const PRESS_KEYS = "Press keys…";
const NEEDS_MODIFIER = "Add ⌘, ⌃ or ⌥";
const UNBOUND = "—";
const MODIFIER_KEYS: ReadonlySet<string> = new Set(["Meta", "Control", "Alt", "Shift"]);

/** What the physical key prints, independent of what ⌥ turns it into. */
const KEY_GLYPHS: Readonly<Record<string, string>> = {
  Enter: "⏎",
  Tab: "⇥",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Space: "Space",
  Minus: "-",
  Equal: "=",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  BracketLeft: "[",
  BracketRight: "]",
};

/*
 * Modifier order is ⌃⌘⌥⇧ — the order the demo keymap in model.ts is written in
 * (`⌃⇧⇥`, `⌘⌥⏎`, `⌘⇧D`). Conflicts are found by string equality, so a recorded
 * chord must spell itself exactly like the seeded ones or it never collides.
 */
function formatChord(event: KeyboardEvent): string {
  const modifiers = [
    event.ctrlKey ? "⌃" : "",
    event.metaKey ? "⌘" : "",
    event.altKey ? "⌥" : "",
    event.shiftKey ? "⇧" : "",
  ].join("");
  const { code, key } = event;
  const glyph = code.startsWith("Key")
    ? code.slice(3)
    : code.startsWith("Digit")
      ? code.slice(5)
      : (KEY_GLYPHS[code] ?? (key.length === 1 ? key.toUpperCase() : key));
  return `${modifiers}${glyph}`;
}

interface ChordButtonProps {
  readonly label: string;
  /** "" = unbound. */
  readonly chord: string;
  readonly onCommit: (chord: string) => void;
}

/** The chord pill; pressing it records the next chord, Esc cancels, Backspace unbinds. */
export function ChordButton({ label, chord, onCommit }: ChordButtonProps) {
  const recording = useSignal(false);
  const hint = useSignal(PRESS_KEYS);
  // A ref, so a re-render mid-recording does not tear the key listener down.
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  /* oxlint-disable react-hooks/exhaustive-deps -- one-shot listener; the signals are captured by reference */
  useEffect(() => {
    if (!recording.value) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      const bare = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
      // Bare Tab keeps moving focus, or recording would be a keyboard trap.
      if (event.key === "Tab" && bare) {
        recording.value = false;
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        recording.value = false;
        return;
      }
      if (bare && (event.key === "Backspace" || event.key === "Delete")) {
        commitRef.current("");
        recording.value = false;
        return;
      }
      // Still holding modifiers down: keep listening.
      if (MODIFIER_KEYS.has(event.key)) return;
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        hint.value = NEEDS_MODIFIER;
        return;
      }
      commitRef.current(formatChord(event));
      recording.value = false;
    };
    // Capture phase on window, so the shell's own Esc handling never sees the keystroke.
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [recording.value]);
  /* oxlint-enable react-hooks/exhaustive-deps */

  return (
    <>
      <span class="srd-misc-sr" role="status">
        {recording.value ? hint.value : ""}
      </span>
      <button
        type="button"
        class={`cfg-btn cfg-chord ${recording.value ? "cfg-chord--listening" : ""} ${
          chord === "" ? "cfg-chord--unbound" : ""
        }`}
        aria-label={`${label} shortcut: ${chord === "" ? "none" : chord}`}
        onClick={() => {
          hint.value = PRESS_KEYS;
          recording.value = !recording.value;
        }}
        // Clicking or tabbing away ends the recording, or it would outlive the user's interest.
        onBlur={() => {
          recording.value = false;
        }}
      >
        {recording.value ? hint.value : chord === "" ? UNBOUND : chord}
      </button>
    </>
  );
}
