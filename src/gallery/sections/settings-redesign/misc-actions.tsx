import type { ComponentChildren } from "preact";
import { useSignal, type ReadonlySignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import { Action } from "./primitives";
import "./pages-misc.css";

/*
 * Inline feedback shared by the five lighter pages (Notifications, Files &
 * browser, Shortcuts, About, Data & reset): a result that fades after a few
 * seconds, and the two-press confirm that replaces a modal. Prototype only.
 */

export const RESULT_MS = 3000;
export const ARMED_MS = 4000;

interface Transient {
  readonly text: ReadonlySignal<string | null>;
  readonly show: (next: string) => void;
}

/** A short-lived inline result ("Sent", "Opened"); showing again restarts the clock. */
export function useTransient(ms: number = RESULT_MS): Transient {
  const text = useSignal<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);
  const show = (next: string): void => {
    clearTimeout(timer.current);
    text.value = next;
    timer.current = setTimeout(() => {
      text.value = null;
    }, ms);
  };
  return { text, show };
}

/** The live region stays mounted while empty so a screen reader hears the text arrive. */
export function Result({ text }: { readonly text: string | null }) {
  return (
    <span class="srd-misc-result" role="status">
      {text}
    </span>
  );
}

interface ConfirmActionProps {
  /** The idle pill. */
  readonly children: ComponentChildren;
  /** The armed pill — phrased as the question the second press answers. */
  readonly confirmLabel: string;
  /** Shown beside the pill for a few seconds after the second press. */
  readonly resultLabel?: string;
  /** Red even while idle (a destructive action). */
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly onConfirm: () => void;
}

/** First press arms (and asks), second press runs; it disarms by itself after 4s. */
export function ConfirmAction({
  children,
  confirmLabel,
  resultLabel,
  danger,
  disabled,
  onConfirm,
}: ConfirmActionProps) {
  const armed = useSignal(false);
  const result = useTransient();

  useEffect(() => {
    if (!armed.value) return;
    const timer = setTimeout(() => {
      armed.value = false;
    }, ARMED_MS);
    return () => clearTimeout(timer);
  }, [armed.value]);

  const press = (): void => {
    if (!armed.value) {
      armed.value = true;
      return;
    }
    armed.value = false;
    onConfirm();
    if (resultLabel !== undefined) result.show(resultLabel);
  };

  return (
    <>
      <Result text={result.text.value} />
      <span class="srd-misc-sr" role="status">
        {armed.value ? confirmLabel : ""}
      </span>
      <Action danger={danger === true || armed.value} disabled={disabled} onClick={press}>
        {armed.value ? confirmLabel : children}
      </Action>
    </>
  );
}
