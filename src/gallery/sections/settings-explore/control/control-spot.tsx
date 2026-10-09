import type { ComponentChildren } from "preact";
import {
  anchorId,
  isModified,
  registryEntry,
  resetKeys,
  type SettingKey,
} from "../../settings-redesign/model";
import { useJumpTarget } from "../../settings-redesign/use-jump-target";
import { ChangedDot, ControlReset } from "./control-parts";

/**
 * One registry setting inside an area page: label left, value right, a changed
 * mark and reset when it differs. It is also where a search hit lands, so the
 * anchor, the scroll, the focus and the flash all live here. `stack` puts the
 * value under the label for values that need the width (the font tiles).
 */
export function Spot({
  k,
  label,
  stack,
  children,
}: {
  readonly k: SettingKey;
  readonly label?: string;
  readonly stack?: boolean;
  readonly children: ComponentChildren;
}) {
  const entry = registryEntry(k);
  const { ref, flash } = useJumpTarget<HTMLDivElement>(k, "button, input, [tabindex='0']");
  const modified = isModified(k);
  const shown = label ?? entry.label;
  const reset = modified && <ControlReset label={shown} onReset={() => resetKeys([k])} />;
  return (
    <div
      ref={ref}
      id={anchorId(k)}
      class={`ctl-spot ${stack === true ? "is-stack" : ""} ${modified ? "is-modified" : ""} ${flash ? "is-flash" : ""}`}
    >
      <span class="ctl-spot__label" title={entry.desc}>
        {shown}
        {modified && <ChangedDot />}
      </span>
      {stack === true && reset}
      <div class="ctl-spot__value">
        {children}
        {stack !== true && reset}
      </div>
    </div>
  );
}

/** A titled group of spots, drawn as one surface. */
export function Module({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ComponentChildren;
}) {
  return (
    <section class="ctl-module" aria-label={title}>
      <h3 class="ctl-module__title">{title}</h3>
      {children}
    </section>
  );
}
