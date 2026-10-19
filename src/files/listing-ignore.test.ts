import { describe, expect, it, vi } from "vitest";
import type { FileClient } from "./file-client";
import type { DirEntry } from "./file-tree";
import { LISTING_IGNORE_NAME_CAP, listingVerdict } from "./listing-ignore";

const entry = (name: string): DirEntry => ({
  name,
  path: `/r/${name}`,
  directory: false,
  outOfRoot: false,
});

const clientWith = (ignoredNames?: FileClient["ignoredNames"]): FileClient =>
  ({ ignoredNames }) as unknown as FileClient;

describe("listingVerdict", () => {
  it("never asks about .git, and sends the names as listed", async () => {
    const ask = vi.fn(async () => ({ kind: "classified", ignored: ["b"] }) as const);
    const verdict = await listingVerdict(
      clientWith(ask),
      "/r",
      "/r",
      [entry(".git"), entry("a"), entry("b")],
      vi.fn(),
    );
    expect(ask).toHaveBeenCalledWith("/r", "/r", ["a", "b"]);
    expect([...(verdict ?? [])]).toEqual(["b"]);
  });

  it("answers null without a channel, and without a call for an empty or oversized listing", async () => {
    expect(await listingVerdict(clientWith(), "/r", "/r", [entry("a")], vi.fn())).toBeNull();

    const ask = vi.fn();
    const many = Array.from({ length: LISTING_IGNORE_NAME_CAP + 1 }, (_, index) =>
      entry(`f${index}`),
    );
    expect(await listingVerdict(clientWith(ask), "/r", "/r", many, vi.fn())).toBeNull();
    expect(ask).not.toHaveBeenCalled();

    const none = await listingVerdict(clientWith(ask), "/r", "/r", [entry(".git")], vi.fn());
    expect(none?.size).toBe(0);
    expect(ask).not.toHaveBeenCalled();
  });

  it("answers null when git is unavailable", async () => {
    const ask = vi.fn(async () => ({ kind: "unavailable", reason: "x" }) as const);
    expect(await listingVerdict(clientWith(ask), "/r", "/r", [entry("a")], vi.fn())).toBeNull();
  });
});
