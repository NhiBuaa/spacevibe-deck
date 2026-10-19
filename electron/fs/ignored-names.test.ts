import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IgnoreAnswer, IgnoreClassifier } from "../git/ignore-classifier";
import { PathOutsideWorkspaceError } from "./path-guard";
import {
  ignoredNames,
  MalformedIgnoredNamesError,
  MAX_IGNORED_NAMES,
  TooManyIgnoredNamesError,
} from "./ignored-names";

let scratch: string;
let root: string;
let src: string;

beforeEach(() => {
  scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "deck-ignored-names-")));
  root = path.join(scratch, "root");
  src = path.join(root, "src");
  fs.mkdirSync(src, { recursive: true });
});

afterEach(() => {
  fs.rmSync(scratch, { recursive: true, force: true });
});

function fake(answer: IgnoreAnswer = { kind: "classified", ignored: new Set() }) {
  const classify = vi.fn(async () => answer);
  return { classifier: { classify } satisfies IgnoreClassifier, classify };
}

describe("ignoredNames", () => {
  it("classifies from the canonical directory and returns the ignored names", async () => {
    const { classifier, classify } = fake({ kind: "classified", ignored: new Set(["b.log"]) });
    const reply = await ignoredNames(root, src, ["a.ts", "b.log"], classifier);
    expect(reply).toEqual({ kind: "classified", ignored: ["b.log"] });
    expect(classify).toHaveBeenCalledWith(root, src, ["a.ts", "b.log"]);
  });

  it("resolves a symlinked directory before git sees it", async () => {
    const link = path.join(scratch, "link");
    fs.symlinkSync(root, link);
    const { classifier, classify } = fake();
    await ignoredNames(link, path.join(link, "src"), ["a.ts"], classifier);
    expect(classify).toHaveBeenCalledWith(root, src, ["a.ts"]);
  });

  it("carries an unavailable answer through instead of rejecting", async () => {
    const { classifier } = fake({ kind: "unavailable", reason: "not-repository" });
    expect(await ignoredNames(root, root, ["a"], classifier)).toEqual({
      kind: "unavailable",
      reason: "not-repository",
    });
  });

  it("rejects a directory outside the root, a relative root and a missing directory", async () => {
    const { classifier, classify } = fake();
    await expect(ignoredNames(root, scratch, ["a"], classifier)).rejects.toBeInstanceOf(
      PathOutsideWorkspaceError,
    );
    await expect(ignoredNames("root", root, ["a"], classifier)).rejects.toBeInstanceOf(
      PathOutsideWorkspaceError,
    );
    await expect(
      ignoredNames(root, path.join(root, "missing"), ["a"], classifier),
    ).rejects.toBeInstanceOf(PathOutsideWorkspaceError);
    expect(classify).not.toHaveBeenCalled();
  });

  it("rejects names that are not single segments", async () => {
    const { classifier, classify } = fake();
    const bad: unknown[] = [
      "a",
      null,
      [""],
      ["."],
      [".."],
      ["a/b"],
      ["../x"],
      ["a\0"],
      [1],
      [["a"]],
    ];
    for (const names of bad) {
      await expect(ignoredNames(root, root, names as string[], classifier)).rejects.toBeInstanceOf(
        MalformedIgnoredNamesError,
      );
    }
    expect(classify).not.toHaveBeenCalled();
  });

  it("caps the batch at 10,000 names, counted raw", async () => {
    const { classifier, classify } = fake();
    const names = Array.from({ length: MAX_IGNORED_NAMES }, () => "a");
    await expect(ignoredNames(root, root, names, classifier)).resolves.toBeTruthy();
    await expect(ignoredNames(root, root, [...names, "a"], classifier)).rejects.toBeInstanceOf(
      TooManyIgnoredNamesError,
    );
    expect(classify).toHaveBeenCalledTimes(1);
  });
});
