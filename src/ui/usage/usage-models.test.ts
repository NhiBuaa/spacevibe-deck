import { expect, it } from "vitest";
import { EMPTY_COUNTERS, type UsageBucket } from "../../lib/usage-snapshot";
import { buildModelTable, MODEL_ROWS_SHOWN } from "./usage-models";

const NOW = new Date(2026, 9, 15, 12).getTime();
const bucket = (
  model: string,
  output: number,
  agent: "claude" | "codex" = "claude",
): UsageBucket => ({
  bucketStartMs: NOW - 3_600_000,
  agent,
  model,
  repo: null,
  counters: { ...EMPTY_COUNTERS, output },
});

it("orders by cost, puts the unpriced last and makes the shares sum to 100.0", () => {
  const table = buildModelTable(
    [
      bucket("claude-sonnet-4-5", 1_000_000),
      bucket("claude-opus-4-5", 1_000_000),
      bucket("mystery-model", 9_000_000),
    ],
    "all",
    NOW,
  );
  expect(table.rows.map((row) => row.model)).toEqual([
    "claude-opus-4-5",
    "claude-sonnet-4-5",
    "mystery-model",
  ]);
  expect(table.rows[2]).toMatchObject({ costUsd: null, shareTenths: null });
  expect(table.rows[0].shareTenths! + table.rows[1].shareTenths!).toBe(1000);
});

it("merges buckets of one model and keeps an agent's same-named model apart", () => {
  const table = buildModelTable(
    [bucket("gpt-5", 100), bucket("gpt-5", 50), bucket("gpt-5", 7, "codex")],
    "all",
    NOW,
  );
  expect(table.rows.map((row) => [row.agent, row.tokens])).toEqual([
    ["claude", 150],
    ["codex", 7],
  ]);
});

it("leaves out a model that used no tokens", () => {
  const table = buildModelTable(
    [bucket("<synthetic>", 0), bucket("claude-opus-4-5", 10)],
    "all",
    NOW,
  );
  expect(table.rows.map((row) => row.model)).toEqual(["claude-opus-4-5"]);
  expect(table.hidden).toBe(0);
});

it("caps the list and reports how many models it hid", () => {
  const many = Array.from({ length: MODEL_ROWS_SHOWN + 3 }, (_, index) =>
    bucket(`model-${index}`, index + 1),
  );
  const table = buildModelTable(many, "all", NOW);
  expect(table.rows).toHaveLength(MODEL_ROWS_SHOWN);
  expect(table.hidden).toBe(3);
});
