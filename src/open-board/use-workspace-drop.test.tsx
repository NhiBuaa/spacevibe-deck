// @vitest-environment jsdom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceDrop } from "./use-workspace-drop";
import { MAX_RECENTS } from "../lib/workspace-recents";

const select = vi.fn();
const error = vi.fn();
const checking = vi.fn();
const grant = vi.fn();
let host: HTMLDivElement;

function Surface({ enabled = true }: { enabled?: boolean }) {
  const drop = useWorkspaceDrop({
    enabled,
    onSelect: select,
    onError: error,
    onChecking: checking,
  });
  return (
    <div {...drop.handlers} data-drop data-dragging={drop.dragging}>
      <button disabled={drop.checking}>Run</button>
    </div>
  );
}
function dispatch(type: string, names = ["/work/My Folder"], types = ["Files"]) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: { types, files: names.map((name) => new File([], name)), dropEffect: "none" },
  });
  host.querySelector("[data-drop]")!.dispatchEvent(event);
  return event;
}
beforeEach(() => {
  vi.resetAllMocks();
  grant.mockImplementation(async (file: File) => file.name);
  vi.stubGlobal("__deckHost", {
    getPathForFile: (file: File) => file.name,
    grantDroppedWorkspace: grant,
  });
  host = document.createElement("div");
  document.body.appendChild(host);
  act(() => render(<Surface />, host));
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
  vi.unstubAllGlobals();
});

async function flush(action: () => void) {
  await act(async () => {
    action();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe("workspace drops", () => {
  it("rejects a batch that would exceed recent-workspace capacity", async () => {
    await flush(() => {
      dispatch(
        "drop",
        Array.from({ length: MAX_RECENTS + 1 }, (_, i) => `/w/${i}`),
      );
    });
    expect(select).not.toHaveBeenCalled();
    expect(error).toHaveBeenLastCalledWith(
      `Drop up to ${MAX_RECENTS} different workspace folders at a time.`,
    );
  });
  it("selects the host-validated folder without launching", async () => {
    await flush(() => {
      dispatch("drop");
    });
    expect(select).toHaveBeenCalledExactlyOnceWith("/work/My Folder", ["/work/My Folder"]);
    expect(host.querySelector("button")?.disabled).toBe(false);
    expect(error).toHaveBeenCalledExactlyOnceWith(null);
    expect(checking.mock.calls).toEqual([[true], [false]]);
  });
  it("maps a mixed batch to unique roots and selects the first", async () => {
    grant
      .mockResolvedValueOnce("/first")
      .mockResolvedValueOnce("/first")
      .mockResolvedValueOnce("/second");
    await flush(() => {
      dispatch("drop", ["/first/a.txt", "/first", "/second/b.txt"]);
    });
    expect(select).toHaveBeenCalledExactlyOnceWith("/first", ["/first", "/second"]);
  });
  it("blocks Run and duplicate drops while validation is pending", async () => {
    let resolve!: (value: string) => void;
    grant.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    act(() => {
      dispatch("drop");
    });
    expect(host.querySelector("button")?.disabled).toBe(true);
    await flush(() => {
      dispatch("drop", ["/other"]);
    });
    expect(grant).toHaveBeenCalledTimes(1);
    expect(select).not.toHaveBeenCalled();
    await flush(() => {
      resolve("/work/My Folder");
    });
    expect(select).toHaveBeenCalledTimes(1);
  });
  it.each([null, false, true, "", 7, {}])(
    "rejects failed or malformed grants: %s",
    async (answer) => {
      grant.mockResolvedValueOnce("/valid").mockResolvedValueOnce(answer);
      await flush(() => {
        dispatch("drop", ["/valid", "/invalid"]);
      });
      expect(select).not.toHaveBeenCalled();
      expect(error).toHaveBeenLastCalledWith(
        "Couldn't open that file or folder — try again or use Open folder.",
      );
      expect(host.querySelector("button")?.disabled).toBe(false);
    },
  );
  it("reports a failed call and allows retry", async () => {
    grant.mockRejectedValueOnce(new Error("offline"));
    await flush(() => {
      dispatch("drop");
    });
    expect(select).not.toHaveBeenCalled();
    await flush(() => {
      dispatch("drop");
    });
    expect(select).toHaveBeenCalledTimes(1);
  });
  it.each(["unmount", "disable"])("ignores an in-flight reply after %s", async (change) => {
    let resolve!: (value: string) => void;
    grant.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    act(() => {
      dispatch("drop");
    });
    act(() => render(change === "unmount" ? null : <Surface enabled={false} />, host));
    await flush(() => {
      resolve("/valid");
    });
    expect(select).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledExactlyOnceWith(null);
    expect(checking).toHaveBeenLastCalledWith(false);
  });
  it("rejects empty batches and ignores text", async () => {
    await flush(() => {
      dispatch("drop", [], ["text/plain"]);
    });
    expect(error).not.toHaveBeenCalled();
    await flush(() => {
      dispatch("drop", []);
    });
    expect(error).toHaveBeenCalledWith("Drop a file or folder from your computer.");
    expect(grant).not.toHaveBeenCalled();
  });
  it("consumes disabled drops without granting or selecting", async () => {
    act(() => render(<Surface enabled={false} />, host));
    expect(dispatch("drop").defaultPrevented).toBe(true);
    expect(grant).not.toHaveBeenCalled();
  });
  it("leaves drops alone without native path support", async () => {
    vi.stubGlobal("__deckHost", undefined);
    expect(dispatch("dragover").defaultPrevented).toBe(false);
    expect(dispatch("drop").defaultPrevented).toBe(false);
    expect(grant).not.toHaveBeenCalled();
  });
  it("clears the highlight on leave and drop", async () => {
    act(() => {
      dispatch("dragover");
    });
    expect(host.querySelector("[data-drop]")?.getAttribute("data-dragging")).toBe("true");
    act(() => {
      dispatch("dragleave");
    });
    expect(host.querySelector("[data-drop]")?.getAttribute("data-dragging")).toBe("false");
    await flush(() => {
      dispatch("dragover");
      dispatch("drop");
    });
    expect(host.querySelector("[data-drop]")?.getAttribute("data-dragging")).toBe("false");
  });
});
