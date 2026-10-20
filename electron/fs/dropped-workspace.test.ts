import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { droppedWorkspaceRoot } from "./dropped-workspace";

let root: string;
beforeAll(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "deck-drop-")));
  await fs.mkdir(path.join(root, "My Folder"));
  await fs.writeFile(path.join(root, "My Folder", "file.txt"), "fixture");
  await fs.symlink(path.join(root, "My Folder"), path.join(root, "alias"), "dir");
  await fs.symlink(path.join(root, "My Folder", "file.txt"), path.join(root, "file-link"));
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

describe("droppedWorkspaceRoot", () => {
  it("uses the directory itself or the regular file's parent", async () => {
    const folder = path.join(root, "My Folder");
    expect(await droppedWorkspaceRoot(folder)).toBe(folder);
    expect(await droppedWorkspaceRoot(path.join(folder, "file.txt"))).toBe(folder);
  });
  it("canonicalizes folder aliases but keeps a file link's containing folder", async () => {
    expect(await droppedWorkspaceRoot(path.join(root, "alias"))).toBe(path.join(root, "My Folder"));
    expect(await droppedWorkspaceRoot(path.join(root, "file-link"))).toBe(root);
  });
  it.each([null, 42, "", "relative", "/missing-deck-drop-path", "/a\0b"])(
    "rejects invalid or missing input: %s",
    async (input) => {
      expect(await droppedWorkspaceRoot(input)).toBeNull();
    },
  );
  it.skipIf(process.platform === "win32")("rejects device files", async () => {
    expect(await droppedWorkspaceRoot("/dev/null")).toBeNull();
  });
});
