// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createProgressParser, MAX_PENDING_CHARS, MAX_TAIL_CHARS } from "./clone-progress";

describe("createProgressParser", () => {
  it("reads \\r-separated redraws, keeping the latest of a chunk", () => {
    const parser = createProgressParser();
    expect(
      parser.push("Receiving objects:   1% (1/100)\rReceiving objects:  2% (2/100)\r"),
    ).toEqual({
      phase: "receiving",
      percent: 2,
    });
  });

  it("joins a line split across chunks, and ignores an exact repeat", () => {
    const parser = createProgressParser();
    expect(parser.push("Receiving obj")).toBeNull();
    expect(parser.push("ects:  40% (4/10)\r")).toEqual({ phase: "receiving", percent: 40 });
    expect(parser.push("Receiving objects:  40% (4/10)\r")).toBeNull();
  });

  it("maps every git label to a phase, and strips sideband escapes", () => {
    const parser = createProgressParser();
    expect(parser.push("Resolving deltas:  50% (5/10)\n")).toMatchObject({ phase: "resolving" });
    expect(parser.push("Updating files: 100% (3/3), done.\n")).toEqual({
      phase: "checkout",
      percent: 100,
    });
    const ansi = new RegExp(`${String.fromCharCode(27)}\\[K`);
    const fresh = createProgressParser();
    expect(fresh.push(`remote: fatal thing${String.fromCharCode(27)}[K\n`)).toBeNull();
    expect(fresh.tail()).not.toMatch(ansi);
  });

  it("keeps non-progress lines as the diagnostic tail, without progress noise", () => {
    const parser = createProgressParser();
    parser.push("Cloning into 'x'...\nReceiving objects:  5% (1/20)\rfatal: boom\n");
    expect(parser.tail()).toBe("Cloning into 'x'...\nfatal: boom\n");
  });

  it("includes an unfinished last line in the tail", () => {
    const parser = createProgressParser();
    parser.push("fatal: no newline at the end");
    expect(parser.tail()).toBe("fatal: no newline at the end");
  });

  it("bounds both buffers however much git prints", () => {
    const parser = createProgressParser();
    for (let index = 0; index < 2_000; index += 1) {
      parser.push(`remote: ${"y".repeat(1_000)}\n`);
    }
    expect(parser.tail().length).toBeLessThanOrEqual(MAX_TAIL_CHARS);
    const runaway = createProgressParser();
    for (let index = 0; index < 1_000; index += 1) {
      runaway.push("z".repeat(10_000)); // never a terminator
    }
    expect(runaway.tail().length).toBeLessThanOrEqual(MAX_PENDING_CHARS + MAX_TAIL_CHARS);
  });
});
