// @vitest-environment jsdom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, expect, it } from "vitest";
import { UsageModelsTable } from "./usage-models-section";
import { UsageTotalsStrip } from "./usage-totals-section";

let host: HTMLDivElement | null = null;
const mount = (node: preact.VNode) => {
  host = document.createElement("div");
  act(() => render(node, host!));
  return host;
};
afterEach(() => {
  if (host) act(() => render(null, host!));
  host = null;
});

it("prints a dash, never zero, for unpriced cost and absent savings", () => {
  const view = mount(
    <>
      <UsageModelsTable
        emptyLabel="No usage today"
        table={{
          hidden: 2,
          rows: [
            {
              key: "a",
              agent: "codex",
              model: "mystery",
              costUsd: null,
              tokens: 5_000,
              shareTenths: null,
            },
          ],
        }}
      />
      <UsageTotalsStrip
        totals={{
          processedTokens: 5_000,
          cachedInputTokens: 0,
          uncachedInputTokens: 5_000,
          outputTokens: 0,
          cacheHitPercent: 0,
          savingsUsd: null,
          savingsPartial: true,
        }}
      />
    </>,
  );
  const cells = [...view.querySelectorAll("tbody td")].map((cell) => cell.textContent);
  expect(cells).toEqual(["—", "—", "5K"]);
  expect(view.textContent).toContain("+2 more models");
  expect(view.textContent).toContain("excludes unpriced models");
  expect(view.querySelector(".usage-totals dl div:last-child dd")?.textContent).toBe("—");
});

it("says which period is empty when there are no models", () => {
  const view = mount(
    <UsageModelsTable emptyLabel="No usage today" table={{ rows: [], hidden: 0 }} />,
  );
  expect(view.querySelector("tbody")?.textContent).toBe("No usage today");
  expect(view.querySelectorAll("th[scope=col]")).toHaveLength(4);
});
