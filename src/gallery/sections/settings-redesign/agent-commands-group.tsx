import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { X } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../ui/controls/deck-icon";
import { agentById, commandProblem, updateAgent, type DemoAgent, type SavedCommand } from "./model";
import { Group, PlainRow, TextValue } from "./primitives";
import { binaryOf } from "./agents-validation";
import { NewSessionsTag } from "./new-sessions-tag";
import { UndoSlot, useUndo } from "./use-undo-slot";

/*
 * The launch-command list — the fix for "saved commands could never be removed"
 * and "commands for unknown binaries became orphans". One radio group: the
 * recommended command first (it ships with Deck and has no remove button), then every
 * saved command with its own remove button. The chosen one is `defaultCommandId`, null
 * meaning the recommended one.
 */

interface CommandOption {
  /** Null for the recommended command. */
  readonly id: string | null;
  readonly command: string;
}

interface Removed {
  readonly saved: SavedCommand;
  readonly index: number;
  readonly wasDefault: boolean;
}

const RADIO_KEYS = ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "Home", "End"];

const optionKey = (option: CommandOption): string => option.id ?? "recommended";

export function CommandsGroup({ agent }: { readonly agent: DemoAgent }) {
  const listRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  const removed = useUndo<Removed>();
  const fresh = useSignal(0);
  const options: readonly CommandOption[] = [
    { id: null, command: agent.recommended },
    ...agent.savedCommands.map((saved) => ({ id: saved.id, command: saved.command })),
  ];

  // The Add field is remounted to clear its draft; Enter then leaves focus on the body, so take it back.
  useEffect(() => {
    if (fresh.value === 0) return;
    const active = document.activeElement;
    if (active === null || active === document.body)
      addRef.current?.querySelector("input")?.focus();
  }, [fresh.value]);

  const focusRadio = (selector: string): void => {
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(selector)?.focus());
  };

  const choose = (id: string | null): void => updateAgent(agent.id, { defaultCommandId: id });

  const remove = (saved: SavedCommand, index: number): void => {
    const wasDefault = agent.defaultCommandId === saved.id;
    removed.value = { saved, index, wasDefault };
    updateAgent(agent.id, {
      savedCommands: agent.savedCommands.filter((candidate) => candidate.id !== saved.id),
      defaultCommandId: wasDefault ? null : agent.defaultCommandId,
    });
    focusRadio('[role="radio"][tabindex="0"]');
  };

  const undo = (): void => {
    const gone = removed.value;
    const now = agentById(agent.id);
    removed.value = null;
    if (gone === null || now === undefined) return;
    if (now.savedCommands.some((candidate) => candidate.id === gone.saved.id)) return;
    const at = Math.min(gone.index, now.savedCommands.length);
    updateAgent(agent.id, {
      savedCommands: [
        ...now.savedCommands.slice(0, at),
        gone.saved,
        ...now.savedCommands.slice(at),
      ],
      defaultCommandId: gone.wasDefault ? gone.saved.id : now.defaultCommandId,
    });
    focusRadio(`[data-cmd-id="${gone.saved.id}"]`);
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (!RADIO_KEYS.includes(event.key)) return;
    const radios = [...(listRef.current?.querySelectorAll<HTMLElement>('[role="radio"]') ?? [])];
    const index = radios.indexOf(event.target as HTMLElement);
    if (index === -1) return;
    event.preventDefault();
    const last = radios.length - 1;
    const forward = event.key === "ArrowDown" || event.key === "ArrowRight";
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? last
          : (index + (forward ? 1 : -1) + radios.length) % radios.length;
    radios[next].focus();
    choose(options[next].id);
  };

  const custom = agent.kind === "custom";
  return (
    <Group title="Launch" description="The command a new session types" aside={<NewSessionsTag />}>
      <div
        ref={listRef}
        class="srd-agents-cmds"
        role="radiogroup"
        aria-label={`${agent.label} launch command`}
        onKeyDown={onKeyDown}
      >
        {options.map((option, index) => {
          const selected = option.id === agent.defaultCommandId;
          const saved = option.id === null ? undefined : agent.savedCommands[index - 1];
          return (
            <div
              key={optionKey(option)}
              class={`srd-agents-cmdrow ${selected ? "is-selected" : ""}`}
              role="presentation"
            >
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                data-cmd-id={optionKey(option)}
                class="srd-agents-cmdrow__radio"
                onClick={() => choose(option.id)}
              >
                <span class="srd-agents-radio" aria-hidden="true" />
                <span class="srd-agents-cmd">{option.command}</span>
                {option.id === null && (
                  <span
                    class="srd-agents-chip"
                    title={
                      custom
                        ? "Your agent's own command"
                        : "Ships with Deck for this agent. It can't be removed."
                    }
                  >
                    {custom ? "Base" : "Recommended"}
                  </span>
                )}
              </button>
              {saved !== undefined && (
                <button
                  type="button"
                  class="cfg-row__remove srd-agents-cmdrow__remove"
                  aria-label={`Remove ${saved.command}`}
                  title="Remove"
                  onClick={() => remove(saved, index - 1)}
                >
                  <DeckIcon icon={X} size={ROW_ICON} />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <UndoSlot what={removed.value?.saved.command ?? null} onUndo={undo} />
      <div ref={addRef}>
        <PlainRow label="Add command">
          <TextValue
            key={fresh.value}
            label="Add command"
            value=""
            placeholder={`${binaryOf(agent.recommended)} --flag`}
            validate={(draft) => commandProblem(agent, draft)}
            onCommit={(command) => {
              updateAgent(agent.id, {
                savedCommands: [...agent.savedCommands, { id: `lp:${Date.now()}`, command }],
              });
              fresh.value += 1;
            }}
          />
        </PlainRow>
      </div>
    </Group>
  );
}
