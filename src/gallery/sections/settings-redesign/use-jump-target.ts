import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { focusTarget, type SettingKey } from "./model";

/**
 * A search jump to a block that is not a `SettingRow`: scroll it to the middle,
 * focus its first matching control and flash it once — the same arrival
 * `SettingRow` gives its own rows.
 */
export function useJumpTarget<T extends HTMLElement>(key: SettingKey, focusSelector: string) {
  const ref = useRef<T>(null);
  const flash = useSignal(false);
  const target = focusTarget.value;

  /* oxlint-disable react-hooks/exhaustive-deps -- Preact signal: the jump's nonce is the reactive dep, as in SettingRow */
  useEffect(() => {
    if (target === null || target.key !== key) return;
    ref.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    ref.current?.querySelector<HTMLElement>(focusSelector)?.focus({ preventScroll: true });
    flash.value = true;
    const timer = setTimeout(() => {
      flash.value = false;
    }, 1400);
    return () => clearTimeout(timer);
  }, [target?.nonce]);

  return { ref, flash: flash.value };
}
