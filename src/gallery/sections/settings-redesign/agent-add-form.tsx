import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { settings, update, type DemoAgent } from "./model";
import { Action } from "./primitives";
import { FormField } from "./agents-form-field";
import { ADD_ROW_ID, closeDetail, listFocusRequest, selectAgent } from "./agents-state";
import { baseCommandProblem, customAgentId, nameProblem } from "./agents-validation";

/**
 * "+ Add agent": a form in the detail pane. Validation runs on Add, not per
 * keystroke, and every message stays beside its field. Esc cancels and stops
 * there, so it never reaches the shell.
 */
export function AgentAddForm() {
  const name = useSignal("");
  const command = useSignal("");
  const nameError = useSignal<string | null>(null);
  const commandError = useSignal<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const commandRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const submit = (): void => {
    nameError.value = nameProblem(name.value, settings.value.agents);
    commandError.value = baseCommandProblem(command.value);
    if (nameError.value !== null || commandError.value !== null) {
      (nameError.value !== null ? nameRef : commandRef).current?.focus();
      return;
    }
    const recommended = command.value.trim();
    const agent: DemoAgent = {
      id: customAgentId(name.value),
      label: name.value.trim(),
      kind: "custom",
      installed: true,
      enabled: true,
      inQuickMenu: false,
      recommended,
      savedCommands: [],
      defaultCommandId: null,
      model: null,
      effort: null,
      models: [],
      efforts: null,
      signals: null,
    };
    update({ agents: [...settings.value.agents, agent] });
    selectAgent(agent.id);
    // Wide: focus stays in the list on the new row. Narrow: the detail heading takes it first.
    listFocusRequest.value = { id: agent.id };
  };

  return (
    <div
      class="srd-agents-form"
      role="group"
      aria-labelledby="srd-agents-form-title"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          closeDetail(ADD_ROW_ID);
        } else if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
          event.preventDefault();
          submit();
        }
      }}
    >
      <h3 id="srd-agents-form-title" class="srd-agents-detail__title">
        New agent
      </h3>
      <FormField id="srd-agents-add-name" label="Name" error={nameError.value}>
        {({ inputId, errorId }) => (
          <input
            ref={nameRef}
            id={inputId}
            class="text-input text-input--small"
            placeholder="aider"
            spellcheck={false}
            value={name.value}
            aria-invalid={nameError.value !== null}
            aria-describedby={nameError.value === null ? undefined : errorId}
            onInput={(event) => {
              name.value = event.currentTarget.value;
              nameError.value = null;
            }}
          />
        )}
      </FormField>
      <FormField id="srd-agents-add-command" label="Command" error={commandError.value}>
        {({ inputId, errorId }) => (
          <input
            ref={commandRef}
            id={inputId}
            class="text-input text-input--small srd-agents-input--mono"
            placeholder="aider --model sonnet"
            spellcheck={false}
            value={command.value}
            aria-invalid={commandError.value !== null}
            aria-describedby={commandError.value === null ? undefined : errorId}
            onInput={(event) => {
              command.value = event.currentTarget.value;
              commandError.value = null;
            }}
          />
        )}
      </FormField>
      <div class="srd-agents-form__actions">
        <Action onClick={submit}>Add</Action>
        <Action onClick={() => closeDetail(ADD_ROW_ID)}>Cancel</Action>
      </div>
    </div>
  );
}
