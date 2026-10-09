import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { Plus, X } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../ui/controls/deck-icon";
import { anchorId, settings, update, type PromptTemplateDemo } from "./model";
import { Action, Group, PlainRow, Switch } from "./primitives";
import { FormField } from "./agents-form-field";
import { templateProblems } from "./agents-validation";
import { UndoSlot, useUndo } from "./use-undo-slot";
import { useJumpTarget } from "./use-jump-target";

/*
 * Prompt templates below the master–detail: one row per template, plus an
 * "Add template" row that opens Label + Body. Nothing is committed until the
 * Add button (or ⌘/Ctrl+Enter), so a half-typed template is never saved.
 */

interface Removed {
  readonly template: PromptTemplateDemo;
  readonly index: number;
}

const onePreviewLine = (body: string): string => body.replace(/\s+/g, " ").trim();

function TemplateForm({ onClose }: { readonly onClose: (refocusAdd: boolean) => void }) {
  const label = useSignal("");
  const body = useSignal("");
  const labelError = useSignal<string | null>(null);
  const bodyError = useSignal<string | null>(null);
  const labelRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    labelRef.current?.focus();
  }, []);

  const submit = (): void => {
    const problems = templateProblems(label.value, body.value);
    labelError.value = problems.label;
    bodyError.value = problems.body;
    if (problems.label !== null || problems.body !== null) {
      (problems.label !== null ? labelRef : bodyRef).current?.focus();
      return;
    }
    update({
      promptTemplates: [
        ...settings.value.promptTemplates,
        {
          id: `pt:${Date.now()}`,
          label: label.value.trim(),
          body: body.value.trim(),
          autoSend: false,
        },
      ],
    });
    onClose(true);
  };

  return (
    <div
      class="srd-agents-form srd-agents-form--inline"
      role="group"
      aria-label="New prompt template"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose(true);
        } else if (
          event.key === "Enter" &&
          (event.metaKey || event.ctrlKey || event.target instanceof HTMLInputElement)
        ) {
          event.preventDefault();
          submit();
        }
      }}
    >
      <FormField id="srd-agents-template-label" label="Label" error={labelError.value}>
        {({ inputId, errorId }) => (
          <input
            ref={labelRef}
            id={inputId}
            class="text-input text-input--small"
            placeholder="Review diff"
            spellcheck={false}
            value={label.value}
            aria-invalid={labelError.value !== null}
            aria-describedby={labelError.value === null ? undefined : errorId}
            onInput={(event) => {
              label.value = event.currentTarget.value;
              labelError.value = null;
            }}
          />
        )}
      </FormField>
      <FormField id="srd-agents-template-body" label="Body" error={bodyError.value}>
        {({ inputId, errorId }) => (
          <textarea
            ref={bodyRef}
            id={inputId}
            class="text-input text-input--small prompt-textarea"
            rows={3}
            placeholder="Review the staged diff for correctness bugs."
            value={body.value}
            aria-invalid={bodyError.value !== null}
            aria-describedby={bodyError.value === null ? undefined : errorId}
            onInput={(event) => {
              body.value = event.currentTarget.value;
              bodyError.value = null;
            }}
          />
        )}
      </FormField>
      <div class="srd-agents-form__actions">
        <Action onClick={submit}>Add</Action>
        <Action onClick={() => onClose(true)}>Cancel</Action>
      </div>
    </div>
  );
}

export function PromptTemplatesGroup() {
  const templates = settings.value.promptTemplates;
  const adding = useSignal(false);
  const removed = useUndo<Removed>();
  const { ref, flash } = useJumpTarget<HTMLDivElement>(
    "promptTemplates",
    "button, input, textarea",
  );

  const focusAdd = (): void => {
    requestAnimationFrame(() =>
      ref.current?.querySelector<HTMLElement>(".srd-agents-addrow")?.focus(),
    );
  };

  const patch = (id: string, change: Partial<PromptTemplateDemo>): void =>
    update({
      promptTemplates: templates.map((template) =>
        template.id === id ? { ...template, ...change } : template,
      ),
    });

  const remove = (template: PromptTemplateDemo, index: number): void => {
    removed.value = { template, index };
    update({ promptTemplates: templates.filter((candidate) => candidate.id !== template.id) });
    focusAdd();
  };

  const undo = (): void => {
    const gone = removed.value;
    removed.value = null;
    const now = settings.value.promptTemplates;
    if (gone === null || now.some((candidate) => candidate.id === gone.template.id)) return;
    const at = Math.min(gone.index, now.length);
    update({ promptTemplates: [...now.slice(0, at), gone.template, ...now.slice(at)] });
  };

  return (
    <div
      id={anchorId("promptTemplates")}
      ref={ref}
      class={`srd-agents-templates ${flash ? "is-flash" : ""}`}
    >
      <Group
        title="Prompt templates"
        aside={
          templates.length > 0 ? (
            <span class="srd-agents-count">{templates.length}</span>
          ) : undefined
        }
      >
        {templates.length === 0 && <p class="srd-agents-empty">No templates yet</p>}
        {templates.map((template, index) => (
          <PlainRow
            key={template.id}
            label={template.label}
            desc={
              <span class="srd-agents-preview" title={template.body}>
                {onePreviewLine(template.body)}
              </span>
            }
          >
            <span class="srd-agents-autosend" title="Send the prompt as soon as it is inserted">
              Auto-send
            </span>
            <Switch
              label={`Auto-send ${template.label}`}
              checked={template.autoSend}
              onChange={(autoSend) => patch(template.id, { autoSend })}
            />
            <button
              type="button"
              class="cfg-row__remove"
              aria-label={`Remove ${template.label}`}
              title="Remove"
              onClick={() => remove(template, index)}
            >
              <DeckIcon icon={X} size={ROW_ICON} />
            </button>
          </PlainRow>
        ))}
        <UndoSlot what={removed.value?.template.label ?? null} onUndo={undo} />
        {adding.value ? (
          <TemplateForm
            onClose={(refocusAdd) => {
              adding.value = false;
              if (refocusAdd) focusAdd();
            }}
          />
        ) : (
          <button
            type="button"
            class="srd-agents-addrow"
            onClick={() => {
              adding.value = true;
            }}
          >
            <DeckIcon icon={Plus} size={ROW_ICON} />
            Add template
          </button>
        )}
      </Group>
    </div>
  );
}
