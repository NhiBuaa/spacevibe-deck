import { useEffect, useRef } from "preact/hooks";
import { useSignal } from "@preact/signals";
import { CommitInput } from "../../../ui/controls/commit-input";
import { CLI_DEFAULT_CHOICE } from "../../../ui/settings/agent-choice-value";
import {
  DEMO_DEFAULTS,
  QUICK_MENU_MAX,
  failHooks,
  settings,
  signalStatus,
  update,
  updateAgent,
  type DemoAgent,
  type SignalStatus,
} from "./model";
import { Action, Choice, Group, PlainRow, Switch, TextValue } from "./primitives";
import { MODEL_MESSAGE, nameProblem, parseModels, retargetProblem } from "./agents-validation";
import { NewSessionsTag } from "./new-sessions-tag";

/*
 * The per-agent groups below Launch: Model and Signals for a built-in, Agent
 * (name, command, remove) for a custom one, and Quick menu for both.
 */

// ── Model ──────────────────────────────────────────────────────────────────

/**
 * Comma list of extra model ids. `CommitInput` with `allowEmpty`, because
 * clearing the list is a valid edit and `TextValue` cannot express it.
 */
function ExtraModelsField({
  agent,
  seed,
}: {
  readonly agent: DemoAgent;
  readonly seed: readonly string[];
}) {
  const error = useSignal<string | null>(null);
  const extras = agent.models.filter((model) => !seed.includes(model));
  return (
    <span class="srd-text">
      <CommitInput
        value={extras.join(", ")}
        placeholder="provider/model, another-id"
        ariaLabel="Additional models"
        allowEmpty
        spellcheck={false}
        invalid={error.value !== null}
        describedBy={error.value === null ? undefined : "srd-agents-models-error"}
        onDraftChange={() => {
          error.value = null;
        }}
        onCommit={(draft) => {
          const parsed = parseModels(draft);
          if (parsed === null) {
            error.value = MODEL_MESSAGE;
            return false;
          }
          updateAgent(agent.id, {
            models: [...seed, ...parsed.filter((model) => !seed.includes(model))],
          });
          return true;
        }}
      />
      {error.value !== null && (
        <span id="srd-agents-models-error" class="srd-agents-error" role="alert">
          {error.value}
        </span>
      )}
    </span>
  );
}

export function ModelGroup({ agent }: { readonly agent: DemoAgent }) {
  const seed = DEMO_DEFAULTS.agents.find((candidate) => candidate.id === agent.id)?.models ?? [];
  const choices = (values: readonly string[]) => [
    CLI_DEFAULT_CHOICE,
    ...values.map((value) => ({ value, label: value })),
  ];
  return (
    <Group
      title="Model"
      aside={<NewSessionsTag />}
      more={
        <PlainRow
          label={
            <span title="Ids Deck does not list yet, such as a new release. Comma-separated, no spaces.">
              Additional models
            </span>
          }
        >
          <ExtraModelsField agent={agent} seed={seed} />
        </PlainRow>
      }
    >
      {agent.models.length > 0 && (
        <PlainRow label="Default model">
          <Choice
            label={`${agent.label} default model`}
            value={agent.model ?? ""}
            options={choices(agent.models)}
            onChange={(value) => updateAgent(agent.id, { model: value === "" ? null : value })}
          />
        </PlainRow>
      )}
      {agent.efforts !== null && (
        <PlainRow label="Default effort">
          <Choice
            label={`${agent.label} default effort`}
            value={agent.effort ?? ""}
            options={choices(agent.efforts)}
            onChange={(value) => updateAgent(agent.id, { effort: value === "" ? null : value })}
          />
        </PlainRow>
      )}
    </Group>
  );
}

// ── Signals ────────────────────────────────────────────────────────────────

function SignalLine({ status }: { readonly status: SignalStatus | null }) {
  if (status === "active" || status === "failed") {
    return (
      <span
        class={`srd-agents-status is-${status}`}
        role={status === "failed" ? "alert" : "status"}
      >
        <span class={`srd-agents-signal is-${status}`} />
        {status === "active" ? "Reporting" : "Couldn't install hooks"}
      </span>
    );
  }
  return (
    <span class="srd-agents-status is-quiet" role="status">
      {status === "unsupported" ? "Not available on Windows" : "Estimated from output"}
    </span>
  );
}

export function SignalsGroup({ agent }: { readonly agent: DemoAgent }) {
  const status = signalStatus(agent);
  const unsupported = status === "unsupported";
  return (
    <Group title="Signals" aside={<NewSessionsTag />}>
      <PlainRow
        label={
          <span title="The CLI reports its own state to Deck: hooks in the CLI's settings, or a local port for opencode. Off, Deck estimates it from output.">
            Agent-reported status
          </span>
        }
        desc={<SignalLine status={status} />}
      >
        {status === "failed" && (
          <Action
            onClick={() => {
              failHooks.value = false;
            }}
          >
            Retry
          </Action>
        )}
        <Switch
          label={`${agent.label} agent-reported status`}
          checked={agent.signals === true && !unsupported}
          disabled={unsupported}
          onChange={(next) => updateAgent(agent.id, { signals: next })}
        />
      </PlainRow>
    </Group>
  );
}

// ── Quick menu ─────────────────────────────────────────────────────────────

export function QuickMenuGroup({ agent }: { readonly agent: DemoAgent }) {
  const used = settings.value.agents.filter((candidate) => candidate.inQuickMenu).length;
  const full = used >= QUICK_MENU_MAX && !agent.inQuickMenu;
  return (
    <Group
      title="Quick menu"
      aside={
        <span class="srd-agents-quota" title="Agents pinned to the checkout menu">
          {used}/{QUICK_MENU_MAX}
        </span>
      }
    >
      <PlainRow label="In checkout menu" desc={full ? "Remove one to add this" : undefined}>
        <Switch
          label={`${agent.label} in checkout menu`}
          checked={agent.inQuickMenu}
          disabled={full}
          onChange={(next) => updateAgent(agent.id, { inQuickMenu: next })}
        />
      </PlainRow>
    </Group>
  );
}

// ── Custom agent ───────────────────────────────────────────────────────────

/** Press once to arm, again to remove; a press elsewhere, focus leaving, or four seconds disarms. */
function RemoveAgentAction({
  agent,
  onRemoved,
}: {
  readonly agent: DemoAgent;
  readonly onRemoved: () => void;
}) {
  const armed = useSignal(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!armed.value) return;
    const timer = setTimeout(() => {
      armed.value = false;
    }, 4000);
    const away = (event: PointerEvent): void => {
      if (!wrapRef.current?.contains(event.target as Node)) armed.value = false;
    };
    document.addEventListener("pointerdown", away);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", away);
    };
  }, [armed.value]);

  return (
    <span
      ref={wrapRef}
      onFocusOut={() => {
        armed.value = false;
      }}
    >
      <Action
        danger
        onClick={() => {
          if (!armed.value) {
            armed.value = true;
            return;
          }
          armed.value = false;
          update({
            agents: settings.value.agents.filter((candidate) => candidate.id !== agent.id),
          });
          onRemoved();
        }}
      >
        {armed.value ? `Remove ${agent.label}?` : "Remove"}
      </Action>
    </span>
  );
}

export function CustomGroup({
  agent,
  onRemoved,
}: {
  readonly agent: DemoAgent;
  readonly onRemoved: () => void;
}) {
  return (
    <Group title="Agent">
      <PlainRow label="Name">
        <TextValue
          label="Name"
          value={agent.label}
          validate={(draft) => nameProblem(draft, settings.value.agents, agent.id)}
          onCommit={(label) => updateAgent(agent.id, { label })}
        />
      </PlainRow>
      <PlainRow label="Command">
        <TextValue
          label="Command"
          value={agent.recommended}
          validate={(draft) => retargetProblem(agent, draft)}
          onCommit={(recommended) => updateAgent(agent.id, { recommended })}
        />
      </PlainRow>
      <PlainRow
        danger
        label={
          <span title="Removes it from every picker, along with its saved commands.">
            Remove agent
          </span>
        }
      >
        <RemoveAgentAction agent={agent} onRemoved={onRemoved} />
      </PlainRow>
    </Group>
  );
}
