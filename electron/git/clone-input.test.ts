// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isSafeFolderName, validateCloneRequest } from "./clone-input";

const request = {
  requestId: "r1",
  repository: "octocat/hello-world",
  parent: "/Users/test/Code Projects",
  name: "Dự án mẫu",
};

describe("isSafeFolderName", () => {
  it.each(["repo", "Dự án mẫu", "my repo", "a.b", "-dash"])("accepts %j", (name) => {
    expect(isSafeFolderName(name, "linux")).toBe(true);
  });

  it.each(["", " ", " x", "x ", ".", "..", ".git", "a/b", "a\\b", "a\0b", "a\nb", "x".repeat(300)])(
    "rejects %j",
    (name) => {
      expect(isSafeFolderName(name, "linux")).toBe(false);
    },
  );

  it("applies Windows-only rules on Windows", () => {
    for (const name of ["a:b", "con", "NUL.txt", "end."]) {
      expect(isSafeFolderName(name, "win32")).toBe(false);
      expect(isSafeFolderName(name, "linux")).toBe(true);
    }
  });
});

describe("validateCloneRequest", () => {
  it("builds the destination from a normalised parent and the name", () => {
    expect(
      validateCloneRequest({ ...request, parent: "/Users/test/Code Projects/./x/.." }, "linux"),
    ).toEqual({
      remoteUrl: "https://github.com/octocat/hello-world.git",
      parent: "/Users/test/Code Projects",
      name: "Dự án mẫu",
      destination: "/Users/test/Code Projects/Dự án mẫu",
    });
  });

  it("rejects what main cannot trust", () => {
    expect(validateCloneRequest({ ...request, parent: "relative" }, "linux")).toBeNull();
    expect(validateCloneRequest({ ...request, parent: "/a\0b" }, "linux")).toBeNull();
    expect(
      validateCloneRequest({ ...request, repository: "https://example.com/a/b" }, "linux"),
    ).toBeNull();
    expect(validateCloneRequest({ ...request, requestId: "" }, "linux")).toBeNull();
    expect(validateCloneRequest({ ...request, name: 5 as unknown as string }, "linux")).toBeNull();
  });
});
