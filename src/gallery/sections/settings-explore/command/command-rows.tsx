import type { ComponentChildren } from "preact";
import { CaretRight } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON, type DeckIconComponent } from "../../../../ui/controls/deck-icon";
import { AgentMark } from "../../settings-redesign/agent-mark";
import { selectAgent } from "../../settings-redesign/agents-state";
import { ChordButton } from "../../settings-redesign/chord-button";
import {
  SHORTCUT_ACTIONS,
  agentById,
  agentModified,
  chordFor,
  focusTarget,
  effectiveCommand,
  isModified,
  pageInfo,
  registryEntry,
  resetAgent,
  resetKeys,
  settings,
  shortcutConflicts,
  updateAgent,
} from "../../settings-redesign/model";
import { ResetButton, Switch } from "../../settings-redesign/primitives";
import { AgentFieldValue, SettingValue } from "./command-controls";
import { NOTIFY_CHILDREN, rowLabel } from "./command-options";
import type { Hit } from "./command-hits";
import { agentFieldLabel, rebindShortcut } from "./command-sources";
import { openArea } from "./command-state";

/*
 * Command direction: the row. Label and path on the left, the real control on the right, a
 * changed dot and its reset. The row owns no focus of its own: the field keeps the keyboard and
 * marks one row active, and Tab hands real focus to the control inside it.
 */

/** Where a row says it lives: its registry group, its area, or nowhere (the list already says). */
export type PathMode = "group" | "area" | "none";

interface CommandRowProps {
  readonly id: string;
  readonly label: string;
  readonly lead?: ComponentChildren;
  readonly path?: string;
  /** Replaces the path where something needs to be unmissable. */
  readonly warn?: string;
  readonly tip?: string;
  readonly modified?: boolean;
  readonly onReset?: () => void;
  /** The whole key side opens something instead of just naming the row. */
  readonly onOpen?: () => void;
  readonly nested?: boolean;
  readonly children?: ComponentChildren;
}

export function CommandRow({
  id,
  label,
  lead,
  path,
  warn,
  tip,
  modified = false,
  onReset,
  onOpen,
  nested = false,
  children,
}: CommandRowProps) {
  const key = (
    <>
      {lead}
      <span class="cmd-row__label">{label}</span>
      {modified && (
        <span class="srd-dot" role="img" aria-label="changed" title="Changed from default" />
      )}
      {warn !== undefined ? (
        <span class="cmd-row__warn">{warn}</span>
      ) : (
        path !== undefined && <span class="cmd-row__path">{path}</span>
      )}
    </>
  );
  return (
    <div
      id={`cmd-row-${id}`}
      data-cmd-row={id}
      class={`cmd-row ${nested ? "is-nested" : ""} ${modified ? "is-modified" : ""}`}
      title={tip}
    >
      {onOpen === undefined ? (
        <div class="cmd-row__key">{key}</div>
      ) : (
        <button
          type="button"
          class="cmd-row__key cmd-row__open"
          data-cmd-open=""
          title={`Open ${label}`}
          onClick={onOpen}
        >
          {key}
        </button>
      )}
      <div class="cmd-row__value">
        {children}
        {modified && onReset !== undefined && <ResetButton label={label} onReset={onReset} />}
        {onOpen !== undefined && <DeckIcon icon={CaretRight} size={ROW_ICON} class="cmd-row__go" />}
      </div>
    </div>
  );
}

// ── one hit, one live row ──────────────────────────────────────────────────

function SettingHitRow({ hit, pathMode }: { readonly hit: Hit; readonly pathMode: PathMode }) {
  if (hit.type !== "setting") return null;
  const entry = registryEntry(hit.key);
  const area = pageInfo(hit.area).label;
  const path =
    pathMode === "area"
      ? area
      : pathMode === "group" && entry.group !== area && entry.group !== entry.label
        ? entry.group
        : undefined;
  return (
    <CommandRow
      id={hit.id}
      label={rowLabel(hit.key)}
      path={path}
      tip={entry.desc}
      modified={isModified(hit.key, settings.value)}
      onReset={() => resetKeys([hit.key])}
      nested={NOTIFY_CHILDREN.has(hit.key)}
    >
      <SettingValue k={hit.key} />
    </CommandRow>
  );
}

/** An agent is opened as a scope, and its pickers switch is live right on the row. */
function AgentHitRow({ hit }: { readonly hit: Hit }) {
  if (hit.type !== "agent") return null;
  const agent = agentById(hit.agentId);
  if (agent === undefined) return null;
  const changed = agent.kind === "builtin" && agentModified(agent.id);
  return (
    <CommandRow
      id={hit.id}
      label={agent.label}
      lead={<AgentMark agent={agent} />}
      path={agent.installed ? effectiveCommand(agent) : "not installed"}
      modified={changed}
      onReset={() => resetAgent(agent.id)}
      onOpen={() => {
        selectAgent(agent.id);
        openArea("agents");
      }}
    >
      <Switch
        label={`Show ${agent.label} in pickers`}
        checked={agent.enabled}
        onChange={(enabled) => updateAgent(agent.id, { enabled })}
      />
    </CommandRow>
  );
}

function AgentFieldRow({ hit }: { readonly hit: Hit }) {
  if (hit.type !== "agent-field") return null;
  const agent = agentById(hit.agentId);
  if (agent === undefined) return null;
  return (
    <CommandRow
      id={hit.id}
      label={agentFieldLabel(hit.field)}
      lead={<AgentMark agent={agent} />}
      path={agent.label}
    >
      <AgentFieldValue agent={agent} field={hit.field} />
    </CommandRow>
  );
}

function ShortcutHitRow({ hit, pathMode }: { readonly hit: Hit; readonly pathMode: PathMode }) {
  if (hit.type !== "shortcut") return null;
  const action = SHORTCUT_ACTIONS.find((candidate) => candidate.id === hit.actionId);
  if (action === undefined) return null;
  const current = settings.value;
  const others = shortcutConflicts(current).get(action.id);
  const names = (others ?? []).map(
    (id) => SHORTCUT_ACTIONS.find((candidate) => candidate.id === id)?.label ?? id,
  );
  return (
    <CommandRow
      id={hit.id}
      label={action.label}
      path={pathMode === "none" ? undefined : action.group}
      warn={others === undefined ? undefined : `Also bound to ${names.join(", ")}`}
      modified={action.id in current.keybindings}
      onReset={() => rebindShortcut(action.id, null)}
    >
      <ChordButton
        label={action.label}
        chord={chordFor(action.id, current)}
        onCommit={(chord) => rebindShortcut(action.id, chord)}
      />
    </CommandRow>
  );
}

export function HitRow({ hit, pathMode }: { readonly hit: Hit; readonly pathMode: PathMode }) {
  switch (hit.type) {
    case "setting":
      return <SettingHitRow hit={hit} pathMode={pathMode} />;
    case "agent":
      return <AgentHitRow hit={hit} />;
    case "agent-field":
      return <AgentFieldRow hit={hit} />;
    case "shortcut":
      return <ShortcutHitRow hit={hit} pathMode={pathMode} />;
    case "open":
      return (
        <CommandRow
          id={hit.id}
          label={hit.label}
          path={pageInfo(hit.area).label}
          onOpen={() => {
            openArea(hit.area);
            if (hit.jump !== undefined) focusTarget.value = { key: hit.jump, nonce: Date.now() };
          }}
        />
      );
  }
}

// ── sections ───────────────────────────────────────────────────────────────

export function HitSection({
  label,
  icon,
  hits,
  pathMode,
}: {
  readonly label: string;
  readonly icon?: DeckIconComponent;
  readonly hits: readonly Hit[];
  readonly pathMode: PathMode;
}) {
  return (
    <section class="cmd-group" role="group" aria-label={label === "" ? "Settings" : label}>
      {label !== "" && (
        <header class="cmd-group__head">
          {icon !== undefined && <DeckIcon icon={icon} size={ROW_ICON} />}
          <span>{label}</span>
        </header>
      )}
      {hits.map((hit) => (
        <HitRow key={hit.id} hit={hit} pathMode={pathMode} />
      ))}
    </section>
  );
}
