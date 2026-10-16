import { describe, expect, it, vi } from "vitest";
import type { ChangeEntry, HeadFileReply } from "../../host/git-changes-host";
import type { FileStatResult, ReadFileResponse } from "../file-client";
import { BINARY_REFUSAL, MAX_EDITABLE_BYTES } from "../file-content";
import { createDiffSides, type DiffSidesPorts, type DiffSidesRequest } from "./diff-sides";

const ROOT = "/work/repo";

function entry(over: Partial<ChangeEntry> = {}): ChangeEntry {
  return {
    path: "src/app.ts",
    status: "modified",
    oldPath: null,
    added: 1,
    removed: 1,
    binary: false,
    counted: true,
    ...over,
  };
}

function request(over: Partial<ChangeEntry> = {}, initial = false): DiffSidesRequest {
  return { root: ROOT, entry: entry(over), initial };
}

const headOk = (content: string): HeadFileReply => ({
  kind: "ok",
  content,
  eol: "lf",
  encoding: "utf-8",
  bytes: content.length,
  mixedEol: false,
});

const workOk = (content: string): ReadFileResponse => ({
  kind: "ok",
  content,
  eol: "lf",
  encoding: "utf-8",
  bytes: content.length,
  mixedEol: false,
  readOnly: false,
  reason: null,
  mtimeMs: 1,
  size: content.length,
  writable: true,
});

const stat = (path: string, size: number | null = 10, exists = true): FileStatResult => ({
  path,
  exists,
  mtimeMs: exists ? 1 : null,
  size: exists ? size : null,
});

interface Fakes {
  readonly ports: DiffSidesPorts;
  readonly statFiles: ReturnType<typeof vi.fn>;
  readonly readFile: ReturnType<typeof vi.fn>;
  readonly readHeadFile: ReturnType<typeof vi.fn>;
}

function fakes(
  over: {
    head?: HeadFileReply | (() => Promise<HeadFileReply>);
    work?: ReadFileResponse;
    size?: number | null;
    exists?: boolean;
  } = {},
): Fakes {
  const statFiles = vi.fn(async (_root: string, paths: readonly string[]) =>
    paths.map((path) => stat(path, over.size ?? 10, over.exists ?? true)),
  );
  const readFile = vi.fn(async () => over.work ?? workOk("new\n"));
  const readHeadFile = vi.fn(async () =>
    typeof over.head === "function" ? over.head() : (over.head ?? headOk("old\n")),
  );
  return {
    ports: { statFiles, readFile, readHeadFile } as DiffSidesPorts,
    statFiles,
    readFile,
    readHeadFile,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function view(f: Fakes, req: DiffSidesRequest) {
  const sides = createDiffSides(f.ports);
  await sides.load(req);
  return sides.view.value;
}

describe("a modified file", () => {
  it("reads HEAD at the path and the working file by absolute path, one side each", async () => {
    const f = fakes();
    expect(await view(f, request())).toEqual({
      kind: "text",
      original: { text: "old\n", language: "typescript" },
      modified: { text: "new\n", language: "typescript" },
      oneSided: false,
      note: null,
    });
    expect(f.readHeadFile).toHaveBeenCalledWith(ROOT, "src/app.ts");
    expect(f.statFiles).toHaveBeenCalledWith(ROOT, [`${ROOT}/src/app.ts`]);
    expect(f.readFile).toHaveBeenCalledWith(ROOT, `${ROOT}/src/app.ts`);
  });

  it("plain text has no language", async () => {
    const f = fakes();
    expect(await view(f, request({ path: "NOTES" }))).toMatchObject({
      original: { language: null },
      modified: { language: null },
    });
  });
});

describe("the size limit", () => {
  it("a working file over the limit is never read", async () => {
    const f = fakes({ size: MAX_EDITABLE_BYTES + 1 });
    expect(await view(f, request())).toEqual({ kind: "too-large", bytes: MAX_EDITABLE_BYTES + 1 });
    expect(f.readFile).not.toHaveBeenCalled();
  });

  it("a working file exactly at the limit is diffed", async () => {
    const f = fakes({ size: MAX_EDITABLE_BYTES });
    expect((await view(f, request()))?.kind).toBe("text");
  });

  it("a HEAD blob over the limit is too large and the working file is not read", async () => {
    const f = fakes({ head: { kind: "too-large", bytes: 3_000_000 } });
    expect(await view(f, request())).toEqual({ kind: "too-large", bytes: 3_000_000 });
    expect(f.readFile).not.toHaveBeenCalled();
  });

  it("a failure on one side wins over a too-large other side", async () => {
    const f = fakes({
      head: { kind: "timeout", message: "git took too long" },
      size: MAX_EDITABLE_BYTES + 1,
    });
    expect(await view(f, request())).toEqual({ kind: "failed", message: "git took too long" });
  });
});

describe("binary", () => {
  it("a binary entry reads nothing", async () => {
    const f = fakes();
    expect(await view(f, request({ binary: true }))).toEqual({ kind: "binary" });
    expect(f.readHeadFile).not.toHaveBeenCalled();
    expect(f.statFiles).not.toHaveBeenCalled();
    expect(f.readFile).not.toHaveBeenCalled();
  });

  it("a side the host refuses as binary reads as binary, not as a failure", async () => {
    expect(
      await view(fakes({ head: { kind: "refused", reason: BINARY_REFUSAL } }), request()),
    ).toEqual({
      kind: "binary",
    });
    expect(
      await view(fakes({ work: { kind: "refused", reason: BINARY_REFUSAL } }), request()),
    ).toEqual({
      kind: "binary",
    });
  });
});

describe("one-sided entries", () => {
  it("deleted: HEAD against an empty side, no working file touched", async () => {
    const f = fakes();
    expect(await view(f, request({ status: "deleted" }))).toEqual({
      kind: "text",
      original: { text: "old\n", language: "typescript" },
      modified: { text: "", language: "typescript" },
      oneSided: true,
      note: null,
    });
    expect(f.statFiles).not.toHaveBeenCalled();
    expect(f.readFile).not.toHaveBeenCalled();
  });

  it.each(["added", "untracked"] as const)(
    "%s: the working file against an empty side, no HEAD read",
    async (status) => {
      const f = fakes();
      expect(await view(f, request({ status }))).toMatchObject({
        kind: "text",
        original: { text: "" },
        modified: { text: "new\n" },
        oneSided: true,
      });
      expect(f.readHeadFile).not.toHaveBeenCalled();
    },
  );

  it("an unborn branch reads no HEAD for any entry", async () => {
    const f = fakes();
    expect(await view(f, request({ status: "modified" }, true))).toMatchObject({
      original: { text: "" },
      modified: { text: "new\n" },
      oneSided: true,
    });
    expect(f.readHeadFile).not.toHaveBeenCalled();
  });
});

describe("renamed", () => {
  it("diffs HEAD at the old path against the working file at the new one", async () => {
    const f = fakes();
    expect(
      await view(f, request({ status: "renamed", oldPath: "src/old.py", path: "src/new.ts" })),
    ).toMatchObject({
      original: { language: "python" },
      modified: { language: "typescript" },
      oneSided: false,
      note: null,
    });
    expect(f.readHeadFile).toHaveBeenCalledWith(ROOT, "src/old.py");
    expect(f.readFile).toHaveBeenCalledWith(ROOT, `${ROOT}/src/new.ts`);
  });

  it("an old path outside the root is shown as added, with a note and no HEAD read", async () => {
    const f = fakes();
    expect(await view(f, request({ status: "renamed", oldPath: null }))).toMatchObject({
      kind: "text",
      original: { text: "" },
      oneSided: true,
      note: "Renamed from outside this folder",
    });
    expect(f.readHeadFile).not.toHaveBeenCalled();
  });
});

describe("failures", () => {
  it.each([
    ["a git failure", { kind: "failed", message: "git exploded" } as const, "git exploded"],
    [
      "git missing",
      { kind: "git-missing", message: "git is not installed" } as const,
      "git is not installed",
    ],
    [
      "a refused HEAD read",
      { kind: "refused", reason: "Not a regular file" } as const,
      "Not a regular file",
    ],
    ["a path not in HEAD", { kind: "absent" } as const, "This file is not in HEAD."],
  ])("%s becomes a failed view with the reason", async (_name, head, message) => {
    const f = fakes({ head });
    expect(await view(f, request())).toEqual({ kind: "failed", message });
    expect(f.readFile).not.toHaveBeenCalled();
  });

  it("a refused working read carries its reason", async () => {
    const f = fakes({ work: { kind: "refused", reason: "That is not a file." } });
    expect(await view(f, request())).toEqual({ kind: "failed", message: "That is not a file." });
  });

  it("a working file that vanished is a failure, not a too-large", async () => {
    const f = fakes({ exists: false });
    expect(await view(f, request())).toEqual({
      kind: "failed",
      message: "This file is no longer on disk.",
    });
    expect(f.readFile).not.toHaveBeenCalled();
  });

  it("a port that rejects becomes a failed view and the loader keeps working", async () => {
    const f = fakes();
    f.readHeadFile.mockRejectedValueOnce(new Error("bridge down"));
    const sides = createDiffSides(f.ports);
    await sides.load(request());
    expect(sides.view.value).toEqual({ kind: "failed", message: "bridge down" });
    await sides.load(request());
    expect(sides.view.value?.kind).toBe("text");
  });
});

describe("newest request wins", () => {
  it("drops a slower, older reply", async () => {
    const slow = deferred<HeadFileReply>();
    const f = fakes();
    f.readHeadFile.mockImplementationOnce(() => slow.promise);
    const sides = createDiffSides(f.ports);

    const first = sides.load(request());
    const second = sides.load(request());
    await second;
    expect(sides.view.value).toMatchObject({ original: { text: "old\n" } });

    slow.resolve(headOk("STALE\n"));
    await first;
    expect(sides.view.value).toMatchObject({ original: { text: "old\n" } });
  });

  it("drops a reply for the file that was left", async () => {
    const slow = deferred<HeadFileReply>();
    const f = fakes();
    f.readHeadFile.mockImplementationOnce(() => slow.promise);
    const sides = createDiffSides(f.ports);

    const first = sides.load(request({ path: "a.ts" }));
    await sides.load(request({ path: "b.ts" }));
    slow.resolve(headOk("from a\n"));
    await first;
    expect(sides.view.value).toMatchObject({ original: { text: "old\n" } });
  });

  it("clear drops the view and a read still in flight", async () => {
    const slow = deferred<HeadFileReply>();
    const f = fakes();
    f.readHeadFile.mockImplementationOnce(() => slow.promise);
    const sides = createDiffSides(f.ports);

    const pending = sides.load(request());
    sides.clear();
    slow.resolve(headOk("late\n"));
    await pending;
    expect(sides.view.value).toBeNull();
  });
});

describe("what the view shows between reads", () => {
  it("a different file empties the view at once", async () => {
    const slow = deferred<HeadFileReply>();
    const f = fakes();
    const sides = createDiffSides(f.ports);
    await sides.load(request({ path: "a.ts" }));
    expect(sides.view.value?.kind).toBe("text");

    f.readHeadFile.mockImplementationOnce(() => slow.promise);
    const next = sides.load(request({ path: "b.ts" }));
    expect(sides.view.value).toBeNull();
    slow.resolve(headOk("b old\n"));
    await next;
    expect(sides.view.value).toMatchObject({ original: { text: "b old\n" } });
  });

  it("the same file keeps its last view while it re-reads, and an unchanged re-read publishes nothing", async () => {
    const f = fakes();
    const sides = createDiffSides(f.ports);
    await sides.load(request());
    const first = sides.view.value;

    await sides.load(request());
    expect(sides.view.value).toBe(first);

    f.readFile.mockResolvedValueOnce(workOk("newer\n"));
    await sides.load(request());
    expect(sides.view.value).not.toBe(first);
    expect(sides.view.value).toMatchObject({ modified: { text: "newer\n" } });
  });
});
