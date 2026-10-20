// @vitest-environment jsdom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLONE_ERRORS, type CloneJob } from "../lib/clone-contract";
import {
  CANCELLED_WITH_LEFTOVERS,
  CANCELLING,
  FIXTURE_DESTINATION,
  FIXTURE_PARENT,
  PROGRESS_SEQUENCE,
  REJECTIONS,
  SUCCEEDED,
  SUCCEEDED_WITH_SUBMODULES,
  cloneJob,
  createFakeCloneClient,
  failedJob,
  type FakeCloneClientScript,
} from "../lib/clone-fixtures";
import { createCloneController } from "./clone-controller";
import type { CloneController, CloneControllerDeps } from "./clone-controller-types";
import {
  CLONE_ERROR_COPY,
  CloneWorkspaceForm,
  type CloneWorkspaceFormProps,
} from "./clone-workspace-form";

const HOME = "/Users/test";

let host: HTMLDivElement;

const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
const flush = () => act(async () => void (await frame()));

interface Mounted {
  readonly controller: CloneController;
  readonly client: ReturnType<typeof createFakeCloneClient>;
  readonly addWorkspace: ReturnType<typeof vi.fn<(path: string) => Promise<void>>>;
  readonly onBack: ReturnType<typeof vi.fn<() => void>>;
  readonly onPickParent: ReturnType<typeof vi.fn<() => Promise<string | null>>>;
}

async function mount(
  script: FakeCloneClientScript = {},
  deps: Partial<CloneControllerDeps> = {},
  props: Partial<CloneWorkspaceFormProps> = {},
): Promise<Mounted> {
  const client = createFakeCloneClient(script);
  const addWorkspace = vi.fn<(path: string) => Promise<void>>(async () => {});
  const controller = createCloneController({
    client,
    addWorkspace,
    newRequestId: () => "req-1",
    ...deps,
  });
  const onBack = vi.fn<() => void>();
  const onPickParent = vi.fn<() => Promise<string | null>>(async () => null);
  await controller.init();
  act(() =>
    render(
      <CloneWorkspaceForm
        controller={controller}
        home={HOME}
        onBack={onBack}
        onPickParent={onPickParent}
        {...props}
      />,
      host,
    ),
  );
  return { controller, client, addWorkspace, onBack, onPickParent };
}

const q = <T extends Element = HTMLElement>(selector: string): T | null =>
  host.querySelector<T>(selector);

function type(label: string, value: string): void {
  const input = q<HTMLInputElement>(`[aria-label="${label}"]`);
  if (input === null) throw new Error(`missing input ${label}`);
  act(() => {
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const click = (selector: string) =>
  act(() => {
    q(selector)?.click();
  });

const text = (selector: string): string => q(selector)?.textContent ?? "";
const alerts = (): string[] =>
  [...host.querySelectorAll('[role="alert"]')].map((el) => el.textContent ?? "");

/** Fills the form and presses Clone; the accepted job then drives the view. */
async function submitClone(repository = "octocat/hello-world"): Promise<void> {
  type("GitHub repository", repository);
  click('[data-action="start-clone"]');
  await flush();
}

/** An event the way `clone:changed` delivers it. */
async function emit(m: Mounted, job: CloneJob): Promise<void> {
  act(() => m.client.emit(job));
  await flush();
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => render(null, host));
  host.remove();
  vi.restoreAllMocks();
});

describe("repository field", () => {
  it("keeps Clone disabled until the repository parses", async () => {
    await mount();
    expect(q<HTMLButtonElement>('[data-action="start-clone"]')?.disabled).toBe(true);
    type("GitHub repository", "octocat/hello-world");
    expect(q<HTMLButtonElement>('[data-action="start-clone"]')?.disabled).toBe(false);
  });

  it("says nothing while the field is empty", async () => {
    await mount();
    expect(alerts()).toEqual([]);
  });

  it.each([
    ["https://github.com/octocat/hello-world/blob/main/README.md", "not a file, branch or pull"],
    ["https://github.com/octocat/hello-world/pull/12", "not a file, branch or pull"],
    ["https://github.com/octocat/hello-world/tree/dev", "not a file, branch or pull"],
    ["https://github.com/octocat/hello-world?tab=readme", "not a file, branch or pull"],
    ["https://gitlab.com/octocat/hello-world", "Only github.com"],
    ["git@bitbucket.org:octocat/hello-world.git", "Only github.com"],
    ["hello-world", "owner/repo"],
    ["https://github.com/octocat", "owner/repo"],
  ])("explains why %s is refused", async (input, problem) => {
    await mount();
    type("GitHub repository", input);
    expect(alerts().join(" ")).toContain(problem);
    expect(q<HTMLButtonElement>('[data-action="start-clone"]')?.disabled).toBe(true);
  });

  it.each([
    "octocat/hello-world",
    "https://github.com/octocat/hello-world.git",
    "git@github.com:octocat/hello-world.git",
    "ssh://git@github.com/octocat/hello-world",
  ])("accepts %s", async (input) => {
    await mount();
    type("GitHub repository", input);
    expect(alerts()).toEqual([]);
    expect(q<HTMLInputElement>('[aria-label="Folder name"]')?.value).toBe("hello-world");
  });

  it("takes the first focus", async () => {
    await mount();
    await flush();
    expect(document.activeElement).toBe(q('[aria-label="GitHub repository"]'));
  });
});

describe("folder name and final path", () => {
  it("fills the name from the repository until the user edits it", async () => {
    await mount();
    type("GitHub repository", "octocat/hello-world");
    expect(q<HTMLInputElement>('[aria-label="Folder name"]')?.value).toBe("hello-world");
    type("Folder name", "my-copy");
    type("GitHub repository", "octocat/other-repo");
    expect(q<HTMLInputElement>('[aria-label="Folder name"]')?.value).toBe("my-copy");
  });

  it("hands the name back to the repository when the field is emptied", async () => {
    await mount();
    type("GitHub repository", "octocat/hello-world");
    type("Folder name", "my-copy");
    type("Folder name", "");
    expect(q<HTMLInputElement>('[aria-label="Folder name"]')?.value).toBe("hello-world");
  });

  it("previews parent and name, starting at home", async () => {
    await mount();
    type("GitHub repository", "octocat/hello-world");
    expect(text("[data-final-path]")).toBe("/Users/test/hello-world");
  });

  it("starts at the last parent the controller remembers", async () => {
    await mount({}, { initialParent: FIXTURE_PARENT });
    type("GitHub repository", "octocat/hello-world");
    expect(text("[data-parent-path]")).toBe(FIXTURE_PARENT);
    expect(text("[data-final-path]")).toBe(`${FIXTURE_PARENT}/hello-world`);
  });

  it("previews spaces and non-ASCII exactly", async () => {
    await mount({}, { initialParent: FIXTURE_PARENT });
    type("GitHub repository", "octocat/hello-world");
    type("Folder name", "Dự án mẫu");
    expect(text("[data-final-path]")).toBe(FIXTURE_DESTINATION);
  });

  it("does not double a trailing separator", async () => {
    await mount({}, { initialParent: "/Users/test/" });
    type("GitHub repository", "octocat/hello-world");
    expect(text("[data-final-path]")).toBe("/Users/test/hello-world");
  });

  it("joins a Windows parent with a backslash", async () => {
    await mount({}, { initialParent: "C:\\Users\\test\\" });
    type("GitHub repository", "octocat/hello-world");
    expect(text("[data-final-path]")).toBe("C:\\Users\\test\\hello-world");
  });

  it.each([".hidden", "..", "../escape", "a/b", "a\\b", " padded "])(
    "refuses the unsafe name %j",
    async (name) => {
      const m = await mount();
      type("GitHub repository", "octocat/hello-world");
      type("Folder name", name);
      expect(alerts().join(" ")).toContain("folder name");
      expect(q<HTMLButtonElement>('[data-action="start-clone"]')?.disabled).toBe(true);
      await submitClone();
      expect(m.client.calls.start).toEqual([]);
    },
  );

  it("uses the picked parent", async () => {
    const m = await mount();
    m.onPickParent.mockResolvedValue("/picked/Code Projects");
    type("GitHub repository", "octocat/hello-world");
    click('[data-action="pick-parent"]');
    await flush();
    expect(text("[data-parent-path]")).toBe("/picked/Code Projects");
    expect(text("[data-final-path]")).toBe("/picked/Code Projects/hello-world");
  });

  it("keeps the parent when the picker is cancelled, and reports a picker failure", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = await mount();
    click('[data-action="pick-parent"]');
    await flush();
    expect(text("[data-parent-path]")).toBe(HOME);
    m.onPickParent.mockRejectedValue(new Error("no dialog"));
    click('[data-action="pick-parent"]');
    await flush();
    expect(alerts().join(" ")).toContain("folder picker");
  });
});

describe("starting a clone", () => {
  it("sends the typed repository, the parent and the name", async () => {
    const m = await mount({}, { initialParent: FIXTURE_PARENT });
    type("GitHub repository", "  octocat/hello-world  ");
    type("Folder name", "Dự án mẫu");
    click('[data-action="start-clone"]');
    await flush();
    expect(m.client.calls.start).toEqual([
      {
        requestId: "req-1",
        repository: "octocat/hello-world",
        parent: FIXTURE_PARENT,
        name: "Dự án mẫu",
      },
    ]);
  });

  it("submits with Enter from either field", async () => {
    const m = await mount();
    type("GitHub repository", "octocat/hello-world");
    act(() => {
      q('[aria-label="GitHub repository"]')?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await flush();
    expect(m.client.calls.start).toHaveLength(1);
  });

  it("submits with Enter from the folder name field too", async () => {
    const m = await mount();
    type("GitHub repository", "octocat/hello-world");
    act(() => {
      q('[aria-label="Folder name"]')?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await flush();
    expect(m.client.calls.start).toHaveLength(1);
  });

  it("does not submit with Enter while the form is invalid", async () => {
    const m = await mount();
    act(() => {
      q('[aria-label="GitHub repository"]')?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    await flush();
    expect(m.client.calls.start).toEqual([]);
  });

  it.each([
    ["gitMissing", "git-not-found"],
    ["authRequired", "authentication-required"],
    ["destinationExists", "destination-exists"],
  ] as const)("shows the %s rejection on the form and keeps the input", async (key, code) => {
    await mount({ start: () => REJECTIONS[key] });
    await submitClone();
    expect(text(`[data-clone-error="${code}"]`)).toBe(CLONE_ERROR_COPY[code]);
    expect(q<HTMLInputElement>('[aria-label="GitHub repository"]')?.value).toBe(
      "octocat/hello-world",
    );
  });

  it("drops the rejection once the user edits a field", async () => {
    await mount({ start: () => REJECTIONS.destinationExists });
    await submitClone();
    type("Folder name", "another");
    expect(q("[data-clone-error]")).toBeNull();
  });
});

describe("progress", () => {
  it.each([
    [PROGRESS_SEQUENCE[0], "Connecting…", null],
    [PROGRESS_SEQUENCE[2], "Receiving objects…", 48],
    [PROGRESS_SEQUENCE[3], "Resolving deltas…", 100],
    [PROGRESS_SEQUENCE[4], "Updating files…", 60],
    [CANCELLING, "Cancelling…", 30],
  ])("shows the real phase and bar for %#", async (job, label, percent) => {
    const m = await mount({ status: () => job });
    expect(text('[role="status"]')).toContain(label);
    const bar = q('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow") ?? null).toBe(percent === null ? null : `${percent}`);
    expect(bar?.hasAttribute("data-indeterminate")).toBe(percent === null);
    const fill = q<HTMLElement>(".nt-clone__fill");
    expect(fill?.style.transform).toBe(`scaleX(${(percent ?? 0) / 100})`);
    expect(m.client.calls.start).toEqual([]);
  });

  it("announces the phase politely, but not every percent tick", async () => {
    await mount({ status: () => PROGRESS_SEQUENCE[2] });
    const status = q('[role="status"]');
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toBe("Receiving objects…");
    expect(q(".nt-clone__percent")?.getAttribute("aria-hidden")).toBe("true");
    expect(status?.contains(q(".nt-clone__percent"))).toBe(false);
  });

  it("follows the events of the running job", async () => {
    const m = await mount();
    await submitClone();
    for (const [index, label] of [
      [1, "Receiving objects…"],
      [3, "Resolving deltas…"],
      [4, "Updating files…"],
    ] as const) {
      await emit(m, PROGRESS_SEQUENCE[index]);
      expect(text('[role="status"]')).toContain(label);
    }
  });

  it("moves focus to Cancel clone and cancels only on its button", async () => {
    const m = await mount();
    await submitClone();
    expect(document.activeElement).toBe(q('[data-action="cancel-clone"]'));
    click('[data-action="cancel-clone"]');
    await flush();
    expect(m.client.calls.cancel).toEqual(["job-1"]);
    expect(text('[role="status"]')).toContain("Cancelling…");
    expect(q<HTMLButtonElement>('[data-action="cancel-clone"]')?.disabled).toBe(true);
    expect(document.activeElement?.textContent).toBe("Close");
  });

  it("does not move focus on a progress tick", async () => {
    const m = await mount();
    await submitClone();
    const cancel = q<HTMLButtonElement>('[data-action="cancel-clone"]');
    cancel?.focus();
    await emit(m, PROGRESS_SEQUENCE[2]);
    expect(document.activeElement).toBe(cancel);
  });

  it("shows the starting state while the request is in flight", async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const m = await mount({
      start: async () => {
        await hold;
        return { ok: true, job: cloneJob() };
      },
    });
    type("GitHub repository", "octocat/hello-world");
    click('[data-action="start-clone"]');
    await flush();
    expect(text('[role="status"]')).toContain("Starting…");
    expect(q('[data-action="cancel-clone"]')).toBeNull();
    release();
    await flush();
    expect(text('[role="status"]')).toContain("Connecting…");
    expect(m.client.calls.start).toHaveLength(1);
  });
});

describe("dismissing and reopening", () => {
  it("Escape dismisses the form and never cancels the running clone", async () => {
    const m = await mount({ status: () => PROGRESS_SEQUENCE[2] });
    act(() => {
      q('[data-action="cancel-clone"]')?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(m.onBack).toHaveBeenCalledTimes(1);
    expect(m.client.calls.cancel).toEqual([]);
  });

  it("Escape from the repository field goes back", async () => {
    const m = await mount();
    act(() => {
      q('[aria-label="GitHub repository"]')?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(m.onBack).toHaveBeenCalledTimes(1);
  });

  it("shows the running job again on reopen, without a second clone", async () => {
    const m = await mount();
    await submitClone();
    await emit(m, PROGRESS_SEQUENCE[2]);
    act(() => render(null, host));
    act(() =>
      render(
        <CloneWorkspaceForm
          controller={m.controller}
          home={HOME}
          onBack={m.onBack}
          onPickParent={m.onPickParent}
        />,
        host,
      ),
    );
    await flush();
    expect(text('[role="status"]')).toContain("Receiving objects…");
    expect(text(".nt-clone__percent")).toBe("48%");
    expect(m.client.calls.start).toHaveLength(1);
  });

  it("does not add the workspace again on reopen", async () => {
    const m = await mount();
    await submitClone();
    await emit(m, SUCCEEDED);
    await flush();
    act(() => render(null, host));
    act(() =>
      render(
        <CloneWorkspaceForm
          controller={m.controller}
          home={HOME}
          onBack={m.onBack}
          onPickParent={m.onPickParent}
        />,
        host,
      ),
    );
    await flush();
    expect(m.addWorkspace).toHaveBeenCalledTimes(1);
    expect(text('[role="status"]')).toContain("Added");
  });
});

describe("success", () => {
  it("shows Added with the destination and a Done button", async () => {
    const m = await mount();
    await submitClone();
    await emit(m, SUCCEEDED);
    await flush();
    expect(text('[role="status"]')).toContain("Added");
    expect(text("[data-clone-destination]")).toBe(FIXTURE_DESTINATION);
    expect(q("[data-clone-warning]")).toBeNull();
    expect(document.activeElement).toBe(q('[data-action="done"]'));
  });

  it("says Adding workspace… while the save is in flight", async () => {
    let release!: () => void;
    const hold = new Promise<void>((resolve) => (release = resolve));
    const m = await mount({}, { addWorkspace: () => hold });
    await submitClone();
    await emit(m, SUCCEEDED);
    expect(text('[role="status"]')).toContain("Adding workspace…");
    release();
    await flush();
    expect(text('[role="status"]')).toContain("Added");
    expect(m.controller.state.value.registration).toBe("ready");
  });

  it("warns that submodules were not initialized", async () => {
    const m = await mount();
    await submitClone();
    await emit(m, SUCCEEDED_WITH_SUBMODULES);
    await flush();
    expect(text("[data-clone-warning]")).toContain("Submodules were not initialized");
  });

  it("Done clears the finished job and goes back", async () => {
    const m = await mount();
    await submitClone();
    await emit(m, SUCCEEDED);
    await flush();
    click('[data-action="done"]');
    expect(m.controller.state.value.job).toBeNull();
    expect(m.onBack).toHaveBeenCalledTimes(1);
  });
});

describe("workspace-save-failed", () => {
  async function failSave() {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const addWorkspace = vi.fn(async (_path: string) => {
      if (calls++ === 0) throw new Error("write failed");
    });
    const m = await mount({}, { addWorkspace });
    await submitClone();
    await emit(m, SUCCEEDED);
    await flush();
    return { m, addWorkspace };
  }

  it("keeps the clone and offers Retry adding workspace", async () => {
    await failSave();
    expect(alerts().join(" ")).toContain("cloned");
    expect(text('[data-action="retry-add-workspace"]')).toBe("Retry adding workspace");
    expect(text("[data-clone-destination]")).toBe(FIXTURE_DESTINATION);
    expect(document.activeElement).toBe(q('[data-action="retry-add-workspace"]'));
  });

  it("retry saves again and never clones again", async () => {
    const { m, addWorkspace } = await failSave();
    click('[data-action="retry-add-workspace"]');
    await flush();
    expect(addWorkspace).toHaveBeenCalledTimes(2);
    expect(m.client.calls.start).toHaveLength(1);
    expect(text('[role="status"]')).toContain("Added");
  });
});

describe("failures", () => {
  it("covers every closed error code with its own copy", () => {
    for (const code of CLONE_ERRORS) {
      expect(CLONE_ERROR_COPY[code], code).toBeTruthy();
    }
    expect(Object.keys(CLONE_ERROR_COPY).sort()).toEqual([...CLONE_ERRORS].sort());
    expect(new Set(Object.values(CLONE_ERROR_COPY)).size).toBe(CLONE_ERRORS.length);
  });

  it.each(CLONE_ERRORS)("shows the copy for a failed %s job", async (code) => {
    await mount({ status: () => failedJob(code) });
    expect(text(`[data-clone-error="${code}"]`)).toBe(CLONE_ERROR_COPY[code]);
    expect(alerts()).toContain(CLONE_ERROR_COPY[code]);
  });

  it("treats a failure without a code as unknown", async () => {
    await mount({ status: () => cloneJob({ phase: "failed", revision: 2 }) });
    expect(alerts()).toEqual([CLONE_ERROR_COPY.unknown]);
  });

  it("discloses leftovers without claiming they were removed", async () => {
    await mount({
      status: () => failedJob("network", { leftoverPath: "/Users/test/Code Projects/Dự án mẫu" }),
    });
    expect(text("[data-clone-leftover]")).toBe(
      "Files were left at /Users/test/Code Projects/Dự án mẫu; Deck did not delete them.",
    );
  });

  it("says nothing about leftovers when there are none", async () => {
    await mount({ status: () => failedJob("network") });
    expect(q("[data-clone-leftover]")).toBeNull();
  });

  it("Try again returns to the form with the typed values", async () => {
    const m = await mount();
    await submitClone();
    await emit(m, failedJob("destination-exists"));
    await flush();
    expect(document.activeElement).toBe(q('[data-action="start-over"]'));
    click('[data-action="start-over"]');
    await flush();
    expect(q<HTMLInputElement>('[aria-label="GitHub repository"]')?.value).toBe(
      "octocat/hello-world",
    );
    expect(document.activeElement).toBe(q('[aria-label="GitHub repository"]'));
  });
});

describe("cancelled", () => {
  it("shows the leftovers a cancelled clone left behind", async () => {
    const m = await mount();
    await submitClone();
    await emit(m, CANCELLED_WITH_LEFTOVERS);
    await flush();
    expect(text('[role="status"]')).toContain("cancelled");
    expect(text("[data-clone-leftover]")).toContain(FIXTURE_DESTINATION);
    expect(q('[role="alert"]')).toBeNull();
    expect(m.addWorkspace).not.toHaveBeenCalled();
  });
});
