import type { ComponentChildren } from "preact";
import "./agents-forms.css";

/** A labelled form field with its inline error. The control is passed the ids it must reference. */
export function FormField({
  id,
  label,
  error,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly error: string | null;
  readonly children: (ids: {
    readonly inputId: string;
    readonly errorId: string;
  }) => ComponentChildren;
}) {
  const inputId = `${id}-input`;
  const errorId = `${id}-error`;
  return (
    <div class="srd-agents-field">
      <label class="srd-agents-field__label" for={inputId}>
        {label}
      </label>
      {children({ inputId, errorId })}
      {error !== null && (
        <span id={errorId} class="srd-agents-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
