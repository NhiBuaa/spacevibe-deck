// @vitest-environment jsdom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildRepoTable, type RepoUsage } from "./usage-by-repo";
import { REPO_TILES_SHOWN, UsageRepoTiles } from "./usage-repo-tiles";

const tokens = (output: number) => ({
  inputUncached: 0,
  cacheRead: 0,
  cacheCreate5m: 0,
  cacheCreate1h: 0,
  cacheWrite: 0,
  output,
});

const repo = (key: string, name: string, ...lines: [string, number][]): RepoUsage => ({
  key,
  name,
  parent: "~/Work",
  lines: lines.map(([model, output]) => ({
    agent: model.startsWith("gpt") ? "codex" : "claude",
    model,
    counters: tokens(output),
  })),
});

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  render(null, host);
  host.remove();
});

function show(repos: readonly RepoUsage[], props: { loading?: boolean; reloading?: boolean } = {}) {
  act(() => {
    render(
      <UsageRepoTiles table={buildRepoTable(repos)} emptyLabel="No usage today" {...props} />,
      host,
    );
  });
}

describe("UsageRepoTiles", () => {
  it("is a list of read-only tiles, not a table, with no controls", () => {
    show([repo("/a", "alpha", ["claude-opus-5-5", 1_000_000])]);
    expect(host.querySelector("table")).toBeNull();
    expect(host.querySelectorAll("ul.usage-tiles > li")).toHaveLength(1);
    expect(host.querySelector("button, a, [tabindex], input")).toBeNull();
    expect(host.querySelector(".usage-tile__bar")?.getAttribute("aria-hidden")).toBe("true");
    // An agent is named once, by its picture, however many marks draw it.
    expect(host.querySelector(".usage-tile__agent")?.getAttribute("aria-label")).toBe(
      "Claude Code",
    );
  });

  it("shows only the biggest repositories and counts the rest in the shares", () => {
    const repos = Array.from({ length: REPO_TILES_SHOWN + 2 }, (_, index) =>
      repo(`/r${index}`, `repo-${index}`, ["claude-opus-5-5", (index + 1) * 1_000_000]),
    );
    show(repos);
    const names = [...host.querySelectorAll(".usage-tile__name")].map((node) => node.textContent);
    expect(names).toHaveLength(REPO_TILES_SHOWN);
    expect(names[0]).toBe(`repo-${REPO_TILES_SHOWN + 1}`);
    expect(names).not.toContain("repo-0");
    expect(host.textContent).toContain("+2 more repositories");
    show(repos.slice(0, REPO_TILES_SHOWN));
    expect(host.textContent).not.toContain("more repositories");
  });

  it("shows cost, share and the model summary, and a dash plus a note when unpriced", () => {
    show([
      repo("/a", "alpha", ["claude-opus-5-5", 1_000_000]),
      repo("/b", "beta", ["gpt-6-preview", 2_000_000]),
    ]);
    const [alpha, beta] = [...host.querySelectorAll(".usage-tile")];
    expect(alpha.textContent).toContain("alpha");
    expect(alpha.textContent).toContain("100.0%");
    expect(alpha.textContent).toContain("claude-opus-5-5 100%");
    expect(beta.querySelector(".usage-tile__cost")?.textContent?.startsWith("—")).toBe(true);
    expect(beta.textContent).toContain("no price");
    expect(host.textContent).toContain("1 model has no published price");
  });

  it("says which period is empty, and draws placeholders only while loading", () => {
    show([]);
    expect(host.textContent).toContain("No usage today");
    expect(host.querySelector(".usage-tile")).toBeNull();
    show([], { loading: true });
    expect(host.querySelectorAll(".usage-tile--placeholder")).toHaveLength(3);
    expect(host.textContent).not.toContain("No usage today");
  });

  it("keeps the tiles and mutes them while a newer read is in flight", () => {
    show([repo("/a", "alpha", ["claude-opus-5-5", 1_000_000])], { reloading: true });
    expect(host.querySelector(".usage-repo-tiles.is-reloading")).not.toBeNull();
    expect(host.querySelectorAll(".usage-tile")).toHaveLength(1);
  });
});
