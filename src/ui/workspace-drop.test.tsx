// @vitest-environment jsdom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WorkspaceDrop } from "./workspace-drop";

const select = vi.fn();
const grant = vi.fn();
let host: HTMLDivElement;
function drop(target: Element, type = "drop", types = ["Files"]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types, files: [new File([], "folder")], dropEffect: "none" },
  });
  target.dispatchEvent(event);
  return event;
}
beforeEach(() => {
  vi.resetAllMocks();
  grant.mockResolvedValue("/work");
  vi.stubGlobal("__deckHost", { getPathForFile: () => "/work", grantDroppedWorkspace: grant });
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() =>
    render(
      <>
        <WorkspaceDrop enabled onSelect={select} onChecking={vi.fn()} />
        <div class="rail">
          <span />
        </div>
        <div class="pane">
          <span />
        </div>
        <div class="open-board">
          <span />
        </div>
      </>,
      host,
    ),
  );
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
  vi.unstubAllGlobals();
});
it("imports a chrome drop and stops it reaching the terminal listener", async () => {
  const terminalListener = vi.fn();
  window.addEventListener("drop", terminalListener);
  try {
    await act(async () => {
      drop(host.querySelector(".rail span")!);
    });
    expect(select).toHaveBeenCalledExactlyOnceWith("/work", ["/work"]);
    expect(terminalListener).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener("drop", terminalListener);
  }
});
it.each([".pane span", ".open-board span"])("delegates %s without importing", async (selector) => {
  const listener = vi.fn();
  const target = host.querySelector(selector)!;
  target.addEventListener("drop", listener);
  await act(async () => {
    drop(target);
  });
  expect(listener).toHaveBeenCalledOnce();
  expect(grant).not.toHaveBeenCalled();
});
it("clears the chrome hint when moving onto a terminal", () => {
  act(() => {
    drop(host.querySelector(".rail")!, "dragover");
  });
  expect(host.querySelector('[role="status"]')).not.toBeNull();
  act(() => {
    drop(host.querySelector(".pane")!, "dragover");
  });
  expect(host.querySelector('[role="status"]')).toBeNull();
});
it("ignores internal text drags and removes listeners on unmount", async () => {
  await act(async () => {
    drop(host.querySelector(".rail")!, "drop", ["text/plain"]);
  });
  expect(grant).not.toHaveBeenCalled();
  act(() => render(null, host));
  await act(async () => {
    drop(host);
  });
  expect(grant).not.toHaveBeenCalled();
});
