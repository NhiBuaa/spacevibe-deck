import { describe, expect, it } from "vitest";
import { agentOptions, BUILTIN_AGENTS } from "../lib/agent-catalog";
import { launchPageAgents, quickAgentOptions, quickAgentsWithout } from "./quick-agents";
import { validateSettings } from "./settings-schema";

const detected = BUILTIN_AGENTS.map((agent) => ({ name: agent.id, path: `/bin/${agent.id}` }));

describe("quick agents", () => {
  it("uses every available agent for older settings", () => {
    const settings = validateSettings({});
    expect(settings.quickAgentIds).toBeNull();
    const options = agentOptions(detected, [], [BUILTIN_AGENTS[0].id]);
    expect(quickAgentOptions(options, settings.quickAgentIds).map((agent) => agent.id)).toEqual(
      BUILTIN_AGENTS.slice(1).map((agent) => agent.id),
    );
  });

  it("preserves an explicit empty selection after settings serialization", () => {
    const settings = validateSettings(JSON.parse(JSON.stringify({ quickAgentIds: [] })));
    expect(quickAgentOptions(agentOptions(detected, []), settings.quickAgentIds)).toEqual([]);
  });

  it("drops invalid and duplicate entries but keeps every persisted pick", () => {
    const settings = validateSettings({
      quickAgentIds: [
        null,
        "",
        " ",
        "claude",
        "claude",
        3,
        "codex",
        "opencode",
        "agy",
        "gemini",
        "cursor-agent",
      ],
    });
    expect(settings.quickAgentIds).toEqual([
      "claude",
      "codex",
      "opencode",
      "agy",
      "gemini",
      "cursor-agent",
    ]);
    expect(validateSettings({ quickAgentIds: "claude" }).quickAgentIds).toBeNull();
  });

  it("keeps saved order and never backfills missing, disabled or removed picks", () => {
    const options = agentOptions(
      detected.filter((agent) => agent.name !== "claude"),
      [],
      ["codex"],
    );
    expect(
      quickAgentOptions(options, ["gemini", "claude", "codex", "custom:removed", "opencode"]).map(
        (agent) => agent.id,
      ),
    ).toEqual(["gemini", "opencode"]);
  });

  it("offers installed custom agents but excludes missing custom commands", () => {
    const custom = [{ id: "custom:aider", label: "Aider", command: "aider" }];
    expect(quickAgentOptions(agentOptions(detected, custom), ["custom:aider"])).toEqual([]);
    const options = agentOptions([...detected, { name: "aider", path: "/bin/aider" }], custom);
    expect(quickAgentOptions(options, ["custom:aider"])[0]?.id).toBe("custom:aider");
  });
});

describe("launch page agents", () => {
  const probed = { probed: true, disabledAgents: [] };
  const ids = (list: readonly { readonly id: string }[]) => list.map((agent) => agent.id);
  const without = (...names: string[]) => detected.filter((agent) => !names.includes(agent.name));

  it("keeps the quick agents' order and appends the missing built-ins in catalog order", () => {
    const options = agentOptions(without("claude", "amp"), []);
    const list = launchPageAgents(options, ["gemini", "codex"], probed);
    const absent = BUILTIN_AGENTS.filter((agent) => ["claude", "amp"].includes(agent.id)).map(
      (agent) => agent.id,
    );
    expect(ids(list)).toEqual(["gemini", "codex", ...absent]);
    expect(list.map((agent) => agent.missing)).toEqual([false, false, true, true]);
  });

  it("leaves out a disabled built-in, as the quick list does", () => {
    const options = agentOptions(without("amp"), [], ["amp", "claude"]);
    const list = launchPageAgents(options, null, {
      probed: true,
      disabledAgents: ["amp", "claude"],
    });
    expect(ids(list)).not.toContain("amp");
    expect(ids(list)).not.toContain("claude");
    expect(list.every((agent) => !agent.missing)).toBe(true);
  });

  it("puts a declared agent whose binary is gone after the missing built-ins", () => {
    const custom = [{ id: "custom:aider", label: "Aider", command: "aider" }];
    const options = agentOptions(without("amp"), custom);
    const list = launchPageAgents(options, null, probed);
    expect(ids(list).slice(-2)).toEqual(["amp", "custom:aider"]);
    expect(list.slice(-2).map((agent) => agent.missing)).toEqual([true, true]);
  });

  it("adds nothing before the probe has answered", () => {
    expect(launchPageAgents([], null, { probed: false, disabledAgents: [] })).toEqual([]);
  });

  it("unpins removed agents, and keeps the automatic list automatic", () => {
    expect(quickAgentsWithout(["claude", "custom:a", "codex"], ["custom:a"])).toEqual([
      "claude",
      "codex",
    ]);
    expect(quickAgentsWithout([], ["custom:a"])).toEqual([]);
    expect(quickAgentsWithout(null, ["custom:a"])).toBeNull();
  });
});
