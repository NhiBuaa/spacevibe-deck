import { describe, expect, it } from "vitest";
import { parseGithubRepository } from "./github-repository";

describe("parseGithubRepository", () => {
  it.each([
    ["octocat/hello-world", "https://github.com/octocat/hello-world.git"],
    ["https://github.com/octocat/hello-world", "https://github.com/octocat/hello-world.git"],
    ["https://github.com/octocat/hello-world.git/", "https://github.com/octocat/hello-world.git"],
    ["git@github.com:octocat/hello-world.git", "git@github.com:octocat/hello-world.git"],
    ["ssh://git@github.com/octocat/hello-world", "ssh://git@github.com/octocat/hello-world.git"],
    ["  octocat/hello.js  ", "https://github.com/octocat/hello.js.git"],
  ])("accepts %s", (input, remoteUrl) => {
    expect(parseGithubRepository(input)?.remoteUrl).toBe(remoteUrl);
  });

  it("names the folder after the repository without .git", () => {
    expect(parseGithubRepository("octocat/hello-world.git")?.folderName).toBe("hello-world");
  });

  it.each([
    "",
    "octocat",
    "https://github.com/octocat/hello-world/tree/main",
    "https://github.com/octocat/hello-world/blob/main/README.md",
    "https://github.com/octocat/hello-world/pull/7",
    "https://github.com/octocat/hello-world?tab=readme",
    "https://github.com/octocat",
    "https://gitlab.com/octocat/hello-world",
    "https://token@github.com/octocat/hello-world",
    "http://github.com/octocat/hello-world",
    "file:///tmp/repo",
    "../etc/passwd",
    "octocat/..",
    "octocat/hello world",
    "ext::sh -c touch/x",
    "git@github.com:octocat/hello-world/extra",
  ])("rejects %j", (input) => {
    expect(parseGithubRepository(input)).toBeNull();
  });
});
