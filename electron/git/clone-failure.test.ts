// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  classifyCloneFailure,
  classifySpawnFailure,
  loggableTail,
  redactSecrets,
} from "./clone-failure";

describe("classifyCloneFailure", () => {
  it("treats a credential problem as authentication, and an SSH rejection too", () => {
    expect(classifyCloneFailure("fatal: could not read Username for 'https://github.com'")).toBe(
      "authentication-required",
    );
    expect(
      classifyCloneFailure(
        "git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.\nPlease make sure the repository exists.",
      ),
    ).toBe("authentication-required");
  });

  it("never distinguishes a missing repository from a private one", () => {
    expect(classifyCloneFailure("remote: Repository not found.")).toBe("repository-unavailable");
    expect(classifyCloneFailure("fatal: repository 'https://x/y.git/' does not exist")).toBe(
      "repository-unavailable",
    );
  });

  it("does not mistake a network failure for an unreadable repository", () => {
    expect(
      classifyCloneFailure(
        "ssh: connect to host github.com port 22: Connection timed out\nfatal: Could not read from remote repository.",
      ),
    ).toBe("network");
  });
});

describe("classifySpawnFailure", () => {
  it("maps a git that cannot start to git-not-found", () => {
    expect(classifySpawnFailure("ENOENT")).toBe("git-not-found");
    expect(classifySpawnFailure("EACCES")).toBe("git-not-found");
    expect(classifySpawnFailure("EMFILE")).toBe("unknown");
    expect(classifySpawnFailure(undefined)).toBe("unknown");
  });
});

describe("redaction", () => {
  it("removes URL credentials and GitHub tokens", () => {
    const token = "github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuv";
    const redacted = redactSecrets(
      `https://user:pass@github.com/a/b ssh://git:secret@host/x ${token} gho_0123456789abcdefghij`,
    );
    expect(redacted).toBe("https://***@github.com/a/b ssh://***@host/x *** ***");
  });

  it("bounds what a log may carry", () => {
    expect(loggableTail("a".repeat(100_000)).length).toBeLessThanOrEqual(2048);
  });
});
