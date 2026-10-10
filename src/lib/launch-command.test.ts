import { describe, expect, it } from "vitest";
import { catalogLaunchCommand } from "./agent-catalog";
import {
  agentLaunchCommandChoices,
  applyResumeFlags,
  defaultLaunchCommand,
  resolveLaunchCommand,
} from "./launch-command";
import type { LaunchProfile } from "./launch-profile";

const plan: LaunchProfile = {
  id: "lp:plan",
  command: "claude --model opus --permission-mode plan",
};

const sandboxed: LaunchProfile = {
  id: "lp:sandboxed",
  command: "codex --sandbox workspace-write",
};

describe("resolveLaunchCommand", () => {
  it("returns the profile's command when the binary matches the agent", () => {
    expect(resolveLaunchCommand("claude", "lp:plan", [plan])).toBe(plan.command);
  });

  it("refuses a command belonging to another agent", () => {
    expect(resolveLaunchCommand("codex", "lp:plan", [plan])).toBeNull();
  });

  it("returns null for a null agent, a null id and an unknown id", () => {
    expect(resolveLaunchCommand(null, "lp:plan", [plan])).toBeNull();
    expect(resolveLaunchCommand("claude", null, [plan])).toBeNull();
    expect(resolveLaunchCommand("claude", "lp:gone", [plan])).toBeNull();
  });
});

describe("defaultLaunchCommand", () => {
  it("reads the agent's starred command", () => {
    expect(defaultLaunchCommand("claude", [plan], { claude: "lp:plan" })).toBe(plan.command);
  });

  it("returns null when the agent has no default", () => {
    expect(defaultLaunchCommand("claude", [plan], {})).toBeNull();
    expect(defaultLaunchCommand(null, [plan], { claude: "lp:plan" })).toBeNull();
  });
});

describe("applyResumeFlags", () => {
  it("appends claude's flags to its resume command", () => {
    expect(applyResumeFlags("claude --resume abc123", plan.command)).toBe(
      "claude --resume abc123 --model opus --permission-mode plan",
    );
  });

  it("leaves every other agent's resume command alone", () => {
    expect(applyResumeFlags("codex resume abc123", sandboxed.command)).toBe("codex resume abc123");
    expect(applyResumeFlags("claude --continue", null)).toBe("claude --continue");
  });

  it("leaves a resume command that is not claude's own alone", () => {
    expect(applyResumeFlags("review --resume x", plan.command)).toBe("review --resume x");
  });

  it("adds nothing when the launch command was the bare binary", () => {
    expect(applyResumeFlags("claude --resume abc", "claude")).toBe("claude --resume abc");
  });
});

describe("agentLaunchCommandChoices", () => {
  const shipped = catalogLaunchCommand("claude", [])!;
  const other: LaunchProfile = { id: "lp:other", command: "claude --model sonnet" };

  it("lists the starred command first, then the agent's own, then the shipped one", () => {
    const choices = agentLaunchCommandChoices("claude", [other, plan], { claude: plan.id });
    expect(choices).toEqual({
      default: plan.command,
      commands: [plan.command, other.command, shipped],
    });
  });

  it("falls back to the first own command, then to the shipped command alone", () => {
    expect(agentLaunchCommandChoices("claude", [other], {})?.default).toBe(other.command);
    expect(agentLaunchCommandChoices("claude", [], {})).toEqual({
      default: shipped,
      commands: [shipped],
    });
  });

  it("lists a command once however many sources name it", () => {
    const same: LaunchProfile = { id: "lp:same", command: shipped };
    expect(agentLaunchCommandChoices("claude", [same], { claude: same.id })?.commands).toEqual([
      shipped,
    ]);
  });

  it("leaves other agents' profiles out and reads a declared agent's command", () => {
    expect(agentLaunchCommandChoices("codex", [plan], {})?.commands).not.toContain(plan.command);
    const custom = [{ id: "custom:aider", label: "Aider", command: "aider --yes" }];
    expect(agentLaunchCommandChoices("custom:aider", [], {}, custom)).toEqual({
      default: "aider --yes",
      commands: ["aider --yes"],
    });
  });

  it("is null for an agent nothing declares", () => {
    expect(agentLaunchCommandChoices("custom:gone", [], {})).toBeNull();
  });
});
