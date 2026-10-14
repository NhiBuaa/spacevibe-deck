// @vitest-environment jsdom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { UsagePage } from "./usage-page";

let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
});
afterEach(() => {
  render(null, host);
  host.remove();
});

function press(target: EventTarget, key: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

it("focuses Back on open so Escape reaches the page", () => {
  act(() => render(<UsagePage open onClose={vi.fn()} />, host));
  expect(document.activeElement).toBe(host.querySelector(".usage-screen__back"));
});

it("closes on Back and on an unclaimed Escape", () => {
  const onClose = vi.fn();
  act(() => render(<UsagePage open onClose={onClose} />, host));
  act(() => host.querySelector<HTMLButtonElement>(".usage-screen__back")?.click());
  press(document.body, "Escape");
  expect(onClose).toHaveBeenCalledTimes(2);
});

it("leaves a terminal's Escape alone", () => {
  const onClose = vi.fn();
  act(() => render(<UsagePage open onClose={onClose} />, host));
  const xterm = document.createElement("div");
  xterm.className = "xterm";
  document.body.append(xterm);
  press(xterm, "Escape");
  xterm.remove();
  expect(onClose).not.toHaveBeenCalled();
});

it("ignores Escape while closed and does not trap Tab", () => {
  const onClose = vi.fn();
  act(() => render(<UsagePage open={false} onClose={onClose} />, host));
  press(document.body, "Escape");
  expect(onClose).not.toHaveBeenCalled();
  expect(host.querySelector(".usage-screen")?.getAttribute("aria-hidden")).toBe("true");
  act(() => render(<UsagePage open onClose={onClose} />, host));
  const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  act(() => void document.body.dispatchEvent(tab));
  expect(tab.defaultPrevented).toBe(false);
});
