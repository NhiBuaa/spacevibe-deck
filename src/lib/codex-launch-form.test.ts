import { describe, expect, it } from "vitest";
import { classifyCodexArgs } from "./codex-launch-form";

const form = (...args: string[]) => classifyCodexArgs(args);

describe("classifyCodexArgs", () => {
  it.each([
    [[], true],
    [["--full-auto"], true],
    [["fix the failing test"], true],
    [["resume"], true],
    [["resume", "--last"], true],
    [["fork", "--last"], true],
    [["-m", "gpt-5", "resume"], true],
    [["exec", "say hi"], false],
    [["e", "say hi"], false],
    [["review"], false],
    [["login"], false],
    [["-c", "model=gpt-5", "exec"], false],
    [["--enable", "hooks", "review"], false],
  ])("%j interactive=%s", (args, interactive) => {
    expect(form(...args).interactive).toBe(interactive);
  });

  it("does not mistake an option's value for a subcommand", () => {
    expect(form("-c", "exec").subcommand).toBeNull();
    expect(form("--profile", "review", "resume").subcommand).toBe("resume");
    expect(form("-i", "a.png", "b.png", "--full-auto").subcommand).toBeNull();
  });

  it("treats everything after -- as prompt text", () => {
    const afterDashes = form("--", "exec", "--help", "--no-daemon");
    expect(afterDashes.subcommand).toBeNull();
    expect(afterDashes.infoOnly).toBe(false);
    expect(afterDashes.hasNoDaemon).toBe(false);
    expect(form("--", "agents").daemon).toBe(false);
  });

  it.each([
    ["agents"],
    ["app-server"],
    ["remote-control"],
    ["queue"],
    ["archive"],
    ["unarchive"],
    ["delete"],
  ])("%s is a daemon command", (name) => {
    expect(form(name).daemon).toBe(true);
    expect(form(name, "--help").daemon).toBe(true);
  });

  it.each([
    [["--remote", "ws://h:1"]],
    [["--remote=ws://h:1"]],
    [["resume", "--remote", "unix://"]],
    [["--remote-auth-token-env", "TOKEN"]],
  ])("%j is a daemon form and never takes --no-daemon", (args) => {
    expect(form(...args).daemon).toBe(true);
    expect(form(...args).remote).toBe(true);
  });

  it("does not call a plain launch a daemon form", () => {
    for (const args of [[], ["resume"], ["exec", "agents"], ["agents-notes"]]) {
      expect(form(...args).daemon).toBe(false);
    }
  });

  it("notices information flags, the bypass and a typed --no-daemon", () => {
    for (const flag of ["-h", "--help", "-V", "--version"]) {
      expect(form(flag).infoOnly).toBe(true);
      expect(form("exec", flag).infoOnly).toBe(true);
    }
    expect(form("--dangerously-bypass-hook-trust").hasBypass).toBe(true);
    expect(form("--no-daemon", "resume").hasNoDaemon).toBe(true);
    expect(form("--full-auto").hasBypass).toBe(false);
  });
});
