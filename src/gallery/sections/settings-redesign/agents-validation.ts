import { DEMO_DEFAULTS, type DemoAgent } from "./model";

/*
 * Field rules for the Agents page. The command character set mirrors the real
 * launch-profile validator (`commandProblem` in model.ts keeps its own copy,
 * which is not exported).
 */

export const NAME_MAX = 32;
export const COMMAND_MAX = 200;
export const TEMPLATE_LABEL_MAX = 40;
export const COMMAND_MESSAGE = "Only letters, digits, spaces and . , : @ + = _ - /";
export const MODEL_MESSAGE = "One model id per comma, no spaces or quotes";

const COMMAND_SAFE = /^[A-Za-z0-9 _.,:@+=/-]+$/;
const MODEL_ID = /^[A-Za-z0-9._:/@+-]+$/;
const BUILTIN_IDS = DEMO_DEFAULTS.agents
  .filter((agent) => agent.kind === "builtin")
  .map((agent) => agent.id);

export function binaryOf(command: string): string {
  return command.trim().split(" ")[0];
}

function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function customAgentId(name: string): string {
  return `custom:${slugify(name)}`;
}

/** Why this name is refused for a custom agent, or null. `exceptId` is the agent being renamed. */
export function nameProblem(
  name: string,
  agents: readonly DemoAgent[],
  exceptId?: string,
): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "Type a name";
  if (trimmed.length > NAME_MAX) return `Names stay under ${NAME_MAX} characters`;
  const slug = slugify(trimmed);
  if (slug === "") return "Use at least one letter or digit";
  if (BUILTIN_IDS.includes(slug) || BUILTIN_IDS.includes(trimmed.toLowerCase())) {
    return `${trimmed} is already built in`;
  }
  const id = customAgentId(trimmed);
  const lower = trimmed.toLowerCase();
  const clash = agents.some(
    (agent) => agent.id !== exceptId && (agent.label.toLowerCase() === lower || agent.id === id),
  );
  return clash ? "Already in your list" : null;
}

/** Why this command is refused as a custom agent's own command, or null. */
export function baseCommandProblem(command: string): string | null {
  const trimmed = command.trim();
  if (trimmed === "") return "Type a command";
  if (trimmed.length > COMMAND_MAX) return `Commands stay under ${COMMAND_MAX} characters`;
  if (!COMMAND_SAFE.test(trimmed)) return COMMAND_MESSAGE;
  return null;
}

/**
 * Changing a custom agent's binary would orphan its saved commands — the
 * defect this redesign fixes — so it is refused while any exist.
 */
export function retargetProblem(agent: DemoAgent, command: string): string | null {
  const basic = baseCommandProblem(command);
  if (basic !== null) return basic;
  const binary = binaryOf(command);
  const stranded = agent.savedCommands.some((saved) => binaryOf(saved.command) !== binary);
  return stranded ? `Saved commands start with ${binaryOf(agent.recommended)}` : null;
}

/** A comma list of model ids, or null when any entry is not a plain id. */
export function parseModels(draft: string): readonly string[] | null {
  const parts = draft
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (parts.some((part) => !MODEL_ID.test(part))) return null;
  return [...new Set(parts)];
}

export function templateProblems(
  label: string,
  body: string,
): { label: string | null; body: string | null } {
  const trimmed = label.trim();
  return {
    label:
      trimmed === ""
        ? "Type a label"
        : trimmed.length > TEMPLATE_LABEL_MAX
          ? `Labels stay under ${TEMPLATE_LABEL_MAX} characters`
          : null,
    body: body.trim() === "" ? "Type the prompt" : null,
  };
}
