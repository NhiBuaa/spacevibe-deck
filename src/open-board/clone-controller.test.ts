import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CANCELLED_WITH_LEFTOVERS,
  CANCELLING,
  FIXTURE_DESTINATION,
  FIXTURE_PARENT,
  FIXTURE_REQUEST,
  PROGRESS_SEQUENCE,
  REJECTIONS,
  SUCCEEDED,
  SUCCEEDED_WITH_SUBMODULES,
  cloneJob,
  createFakeCloneClient,
  failedJob,
  type FakeCloneClientScript,
} from "../lib/clone-fixtures";
import type { CloneJob } from "../lib/clone-contract";
import { createCloneController } from "./clone-controller";
import type { CloneControllerDeps } from "./clone-controller-types";

const INPUT = {
  repository: FIXTURE_REQUEST.repository,
  parent: FIXTURE_PARENT,
  name: FIXTURE_REQUEST.name,
};

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function setup(script: FakeCloneClientScript = {}, deps: Partial<CloneControllerDeps> = {}) {
  const client = createFakeCloneClient(script);
  const addWorkspace = vi.fn(async (_path: string) => {});
  const rememberParent = vi.fn();
  const controller = createCloneController({
    client,
    addWorkspace,
    rememberParent,
    newRequestId: () => FIXTURE_REQUEST.requestId,
    ...deps,
  });
  return { client, controller, addWorkspace, rememberParent };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("init", () => {
  it("subscribes before it asks for status", async () => {
    const order: string[] = [];
    const client = createFakeCloneClient({
      status: () => {
        order.push("status");
        return null;
      },
    });
    const subscribe = client.subscribe.bind(client);
    client.subscribe = (listener) => {
      order.push("subscribe");
      return subscribe(listener);
    };
    await createCloneController({ client, addWorkspace: async () => {} }).init();
    expect(order).toEqual(["subscribe", "status"]);
  });

  it("starts blank, with the remembered parent", () => {
    const { controller } = setup({}, { initialParent: "/Users/test/Code" });
    expect(controller.state.value).toEqual({
      job: null,
      registration: "idle",
      starting: false,
      rejection: null,
      lastParent: "/Users/test/Code",
    });
  });

  it("adopts the job a reload left running", async () => {
    const running = PROGRESS_SEQUENCE[2];
    const { controller } = setup({ status: () => running });
    await controller.init();
    expect(controller.state.value.job).toBe(running);
  });

  it("does not let a late status reply overwrite a newer event", async () => {
    const reply = deferred<CloneJob | null>();
    const { client, controller } = setup({ status: () => reply.promise });
    const init = controller.init();
    client.emit(PROGRESS_SEQUENCE[3]);
    reply.resolve(PROGRESS_SEQUENCE[1]);
    await init;
    expect(controller.state.value.job).toBe(PROGRESS_SEQUENCE[3]);
  });

  it("ignores an event that is older than what it holds", async () => {
    const { client, controller } = setup();
    await controller.init();
    client.emit(PROGRESS_SEQUENCE[3]);
    client.emit(PROGRESS_SEQUENCE[1]);
    expect(controller.state.value.job).toBe(PROGRESS_SEQUENCE[3]);
  });

  it("subscribes once however many times it is called", async () => {
    const { client, controller } = setup();
    await controller.init();
    await controller.init();
    expect(client.calls.status).toBe(1);
  });
});

describe("start", () => {
  it("sends the request with a fresh id and shows the accepted job", async () => {
    const { client, controller } = setup();
    await controller.init();
    await controller.start(INPUT);
    expect(client.calls.start).toEqual([FIXTURE_REQUEST]);
    expect(controller.state.value.job?.phase).toBe("connecting");
    expect(controller.state.value.starting).toBe(false);
  });

  it("reports starting until the reply arrives", async () => {
    const reply = deferred<{ ok: true; job: CloneJob }>();
    const { controller } = setup({ start: () => reply.promise });
    const pending = controller.start(INPUT);
    expect(controller.state.value.starting).toBe(true);
    reply.resolve({ ok: true, job: cloneJob() });
    await pending;
    expect(controller.state.value.starting).toBe(false);
  });

  it("falls back to crypto.randomUUID for the request id", async () => {
    const { client, controller } = setup({}, { newRequestId: undefined });
    await controller.start(INPUT);
    expect(client.calls.start[0].requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("ignores a second submit while the first is in flight", async () => {
    const reply = deferred<{ ok: true; job: CloneJob }>();
    const { client, controller } = setup({ start: () => reply.promise });
    const first = controller.start(INPUT);
    await controller.start(INPUT);
    reply.resolve({ ok: true, job: cloneJob() });
    await first;
    expect(client.calls.start).toHaveLength(1);
  });

  it.each(Object.entries(REJECTIONS))(
    "shows the %s rejection and no job",
    async (_name, result) => {
      const { controller } = setup({ start: () => result });
      await controller.start(INPUT);
      expect(controller.state.value.job).toBeNull();
      expect(controller.state.value.rejection).toBe(result.ok ? null : result.error);
      expect(controller.state.value.starting).toBe(false);
    },
  );

  it("turns a thrown start into the unknown rejection", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { controller } = setup({
      start: () => {
        throw new Error("ipc closed");
      },
    });
    await controller.start(INPUT);
    expect(controller.state.value.rejection).toBe("unknown");
  });

  it("walks every progress phase from the events", async () => {
    const { client, controller } = setup();
    await controller.init();
    await controller.start(INPUT);
    const seen: string[] = [];
    for (const snapshot of PROGRESS_SEQUENCE) {
      client.emit(snapshot);
      seen.push(`${controller.state.value.job?.phase}:${controller.state.value.job?.percent}`);
    }
    expect(seen).toEqual([
      "connecting:null",
      "receiving:0",
      "receiving:48",
      "resolving:100",
      "checkout:60",
    ]);
  });

  it("takes an event that beats the start reply, and keeps it over the reply", async () => {
    const reply = deferred<{ ok: true; job: CloneJob }>();
    const { client, controller } = setup({ start: () => reply.promise });
    await controller.init();
    const pending = controller.start(INPUT);
    client.emit(PROGRESS_SEQUENCE[3]);
    expect(controller.state.value.job).toBe(PROGRESS_SEQUENCE[3]);
    expect(controller.state.value.starting).toBe(false);
    reply.resolve({ ok: true, job: PROGRESS_SEQUENCE[0] });
    await pending;
    expect(controller.state.value.job).toBe(PROGRESS_SEQUENCE[3]);
  });

  it("does not adopt another job's event while its own reply is pending", async () => {
    const reply = deferred<{ ok: true; job: CloneJob }>();
    const { client, controller } = setup({ start: () => reply.promise });
    await controller.init();
    const pending = controller.start(INPUT);
    client.emit(cloneJob({ jobId: "other", requestId: "req-other", revision: 9 }));
    expect(controller.state.value.job).toBeNull();
    reply.resolve({ ok: true, job: cloneJob() });
    await pending;
    expect(controller.state.value.job?.jobId).toBe("job-1");
  });

  it("does not let an old job's status reply replace the job being started", async () => {
    const status = deferred<CloneJob | null>();
    const reply = deferred<{ ok: true; job: CloneJob }>();
    const { controller } = setup({ status: () => status.promise, start: () => reply.promise });
    const init = controller.init();
    const pending = controller.start(INPUT);
    status.resolve(cloneJob({ jobId: "old", requestId: "req-old", phase: "failed" }));
    await init;
    expect(controller.state.value.job).toBeNull();
    reply.resolve({ ok: true, job: cloneJob() });
    await pending;
    expect(controller.state.value.job?.jobId).toBe("job-1");
  });

  it("clears a previous rejection on the next attempt", async () => {
    let attempt = 0;
    const { controller } = setup({
      start: () => (attempt++ === 0 ? REJECTIONS.destinationExists : { ok: true, job: cloneJob() }),
    });
    await controller.start(INPUT);
    expect(controller.state.value.rejection).toBe("destination-exists");
    await controller.start(INPUT);
    expect(controller.state.value.rejection).toBeNull();
    expect(controller.state.value.job).not.toBeNull();
  });
});

describe("cancel", () => {
  it("cancels the shown job and applies the returned snapshot", async () => {
    const { client, controller } = setup();
    await controller.init();
    await controller.start(INPUT);
    await controller.cancel();
    expect(client.calls.cancel).toEqual(["job-1"]);
    expect(controller.state.value.job).toBe(CANCELLING);
  });

  it("keeps the leftovers of a cancelled clone", async () => {
    const { client, controller } = setup({ cancel: () => ({ ok: true, job: CANCELLING }) });
    await controller.init();
    await controller.start(INPUT);
    await controller.cancel();
    client.emit(CANCELLED_WITH_LEFTOVERS);
    expect(controller.state.value.job?.phase).toBe("cancelled");
    expect(controller.state.value.job?.leftoverPath).toBe(FIXTURE_DESTINATION);
    expect(controller.state.value.registration).toBe("idle");
  });

  it("shows a rejected cancel", async () => {
    const { controller } = setup({ cancel: () => ({ ok: false, error: "job-unavailable" }) });
    await controller.start(INPUT);
    await controller.cancel();
    expect(controller.state.value.rejection).toBe("job-unavailable");
    expect(controller.state.value.job?.phase).toBe("connecting");
  });

  it("does nothing without a job", async () => {
    const { client, controller } = setup();
    await controller.cancel();
    expect(client.calls.cancel).toEqual([]);
  });

  it("does not register a cancelled clone", async () => {
    const { client, controller, addWorkspace } = setup();
    await controller.init();
    await controller.start(INPUT);
    client.emit(CANCELLED_WITH_LEFTOVERS);
    await settle();
    expect(addWorkspace).not.toHaveBeenCalled();
  });
});

describe("registering the workspace", () => {
  it("adds the destination once on success, then remembers the parent", async () => {
    const { client, controller, addWorkspace, rememberParent } = setup();
    await controller.init();
    await controller.start(INPUT);
    client.emit(SUCCEEDED);
    expect(controller.state.value.registration).toBe("adding-workspace");
    await settle();
    expect(addWorkspace).toHaveBeenCalledExactlyOnceWith(FIXTURE_DESTINATION);
    expect(controller.state.value.registration).toBe("ready");
    expect(rememberParent).toHaveBeenCalledExactlyOnceWith(FIXTURE_PARENT);
    expect(controller.state.value.lastParent).toBe(FIXTURE_PARENT);
  });

  it("does not remember the parent before the add has finished", async () => {
    const add = deferred<void>();
    const { client, controller, rememberParent } = setup({}, { addWorkspace: () => add.promise });
    await controller.init();
    await controller.start(INPUT);
    client.emit(SUCCEEDED);
    await settle();
    expect(rememberParent).not.toHaveBeenCalled();
    add.resolve();
    await settle();
    expect(rememberParent).toHaveBeenCalledTimes(1);
  });

  it("adds once when the same success arrives again", async () => {
    const { client, controller, addWorkspace } = setup();
    await controller.init();
    await controller.start(INPUT);
    client.emit(SUCCEEDED);
    client.emit(SUCCEEDED);
    client.emit({ ...SUCCEEDED, revision: SUCCEEDED.revision + 1 });
    await settle();
    expect(addWorkspace).toHaveBeenCalledTimes(1);
  });

  it("adds once when a reload adopts the finished job twice", async () => {
    const { controller, addWorkspace } = setup({ status: () => SUCCEEDED });
    await controller.init();
    await settle();
    expect(addWorkspace).toHaveBeenCalledTimes(1);
    expect(controller.state.value.registration).toBe("ready");
  });

  it("skips the remembered parent for a job it did not start", async () => {
    const { controller, rememberParent } = setup({ status: () => SUCCEEDED });
    await controller.init();
    await settle();
    expect(rememberParent).not.toHaveBeenCalled();
  });

  it("does not add again when the form is dismissed and reopened", async () => {
    const { controller, addWorkspace } = setup();
    await controller.init();
    await controller.start(INPUT);
    const reopened = controller.state.value;
    await controller.init();
    expect(controller.state.value).toBe(reopened);
    expect(addWorkspace).not.toHaveBeenCalled();
  });

  it("keeps the success warnings on the job", async () => {
    const { client, controller } = setup();
    await controller.init();
    await controller.start(INPUT);
    client.emit(SUCCEEDED_WITH_SUBMODULES);
    expect(controller.state.value.job?.warnings).toEqual(["submodules-not-initialized"]);
  });

  describe("when saving fails", () => {
    function failingSave() {
      let calls = 0;
      const addWorkspace = vi.fn(async (_path: string) => {
        if (calls++ === 0) throw new Error("disk full");
      });
      return { ...setup({}, { addWorkspace }), addWorkspace };
    }

    it("reports workspace-save-failed and does not remember the parent", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { client, controller, rememberParent } = failingSave();
      await controller.init();
      await controller.start(INPUT);
      client.emit(SUCCEEDED);
      await settle();
      expect(controller.state.value.registration).toBe("workspace-save-failed");
      expect(controller.state.value.job?.phase).toBe("succeeded");
      expect(rememberParent).not.toHaveBeenCalled();
    });

    it("also fails when addWorkspace throws synchronously", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { client, controller } = setup(
        {},
        {
          addWorkspace: () => {
            throw new Error("sync");
          },
        },
      );
      await controller.init();
      await controller.start(INPUT);
      client.emit(SUCCEEDED);
      await settle();
      expect(controller.state.value.registration).toBe("workspace-save-failed");
    });

    it("retries only the save, never the clone", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { client, controller, addWorkspace, rememberParent } = failingSave();
      await controller.init();
      await controller.start(INPUT);
      client.emit(SUCCEEDED);
      await settle();
      const retry = controller.retryAddWorkspace();
      expect(controller.state.value.registration).toBe("adding-workspace");
      await retry;
      expect(addWorkspace).toHaveBeenCalledTimes(2);
      expect(addWorkspace).toHaveBeenLastCalledWith(FIXTURE_DESTINATION);
      expect(client.calls.start).toHaveLength(1);
      expect(controller.state.value.registration).toBe("ready");
      expect(rememberParent).toHaveBeenCalledExactlyOnceWith(FIXTURE_PARENT);
    });

    it("stays failed when the retry fails too", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { client, controller } = setup(
        {},
        {
          addWorkspace: async () => {
            throw new Error("still failing");
          },
        },
      );
      await controller.init();
      await controller.start(INPUT);
      client.emit(SUCCEEDED);
      await settle();
      await controller.retryAddWorkspace();
      expect(controller.state.value.registration).toBe("workspace-save-failed");
    });

    it("does not retry a second time once it is saved", async () => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { client, controller, addWorkspace } = failingSave();
      await controller.init();
      await controller.start(INPUT);
      client.emit(SUCCEEDED);
      await settle();
      await controller.retryAddWorkspace();
      await controller.retryAddWorkspace();
      expect(addWorkspace).toHaveBeenCalledTimes(2);
    });
  });

  it("ignores retryAddWorkspace in every other state", async () => {
    const { client, controller, addWorkspace } = setup();
    await controller.retryAddWorkspace();
    await controller.init();
    await controller.start(INPUT);
    await controller.retryAddWorkspace();
    client.emit(failedJob("network"));
    await controller.retryAddWorkspace();
    expect(addWorkspace).not.toHaveBeenCalled();
  });
});

describe("failures", () => {
  it("keeps a failed job and registers nothing", async () => {
    const { client, controller, addWorkspace } = setup();
    await controller.init();
    await controller.start(INPUT);
    client.emit(failedJob("authentication-required"));
    await settle();
    expect(controller.state.value.job?.error).toBe("authentication-required");
    expect(addWorkspace).not.toHaveBeenCalled();
  });
});

describe("reset", () => {
  it("forgets a finished job and keeps lastParent", async () => {
    const { client, controller } = setup();
    await controller.init();
    await controller.start(INPUT);
    client.emit(SUCCEEDED);
    await settle();
    controller.reset();
    expect(controller.state.value).toMatchObject({
      job: null,
      registration: "idle",
      rejection: null,
      lastParent: FIXTURE_PARENT,
    });
  });

  it("clears a rejection that left no job", async () => {
    const { controller } = setup({ start: () => REJECTIONS.gitMissing });
    await controller.start(INPUT);
    controller.reset();
    expect(controller.state.value.rejection).toBeNull();
  });

  it("does nothing while a job is active", async () => {
    const { controller } = setup();
    await controller.start(INPUT);
    const before = controller.state.value;
    controller.reset();
    expect(controller.state.value).toBe(before);
  });

  it("does nothing while the workspace is being added", async () => {
    const add = deferred<void>();
    const { client, controller } = setup({}, { addWorkspace: () => add.promise });
    await controller.init();
    await controller.start(INPUT);
    client.emit(SUCCEEDED);
    controller.reset();
    expect(controller.state.value.job).toBe(SUCCEEDED);
    add.resolve();
    await settle();
    expect(controller.state.value.registration).toBe("ready");
  });

  it("does not register a reset job again when its success is replayed", async () => {
    const { client, controller, addWorkspace } = setup();
    await controller.init();
    await controller.start(INPUT);
    client.emit(SUCCEEDED);
    await settle();
    controller.reset();
    client.emit(SUCCEEDED);
    await settle();
    expect(addWorkspace).toHaveBeenCalledTimes(1);
    expect(controller.state.value.registration).toBe("ready");
  });

  it("lets a new clone start after a failure", async () => {
    const { client, controller } = setup();
    await controller.init();
    await controller.start(INPUT);
    client.emit(failedJob("destination-exists"));
    controller.reset();
    await controller.start(INPUT);
    expect(controller.state.value.job?.phase).toBe("connecting");
  });
});

describe("dispose", () => {
  it("unsubscribes, so later events change nothing", async () => {
    const { client, controller } = setup();
    await controller.init();
    controller.dispose();
    client.emit(PROGRESS_SEQUENCE[2]);
    expect(controller.state.value.job).toBeNull();
  });

  it("makes late replies inert", async () => {
    const status = deferred<CloneJob | null>();
    const start = deferred<{ ok: true; job: CloneJob }>();
    const { controller } = setup({ status: () => status.promise, start: () => start.promise });
    const init = controller.init();
    const pending = controller.start(INPUT);
    const before = controller.state.value;
    controller.dispose();
    status.resolve(PROGRESS_SEQUENCE[1]);
    start.resolve({ ok: true, job: PROGRESS_SEQUENCE[0] });
    await Promise.all([init, pending]);
    expect(controller.state.value).toBe(before);
  });

  it("writes nothing and remembers nothing when the add finishes afterwards", async () => {
    const add = deferred<void>();
    const { client, controller, rememberParent } = setup({}, { addWorkspace: () => add.promise });
    await controller.init();
    await controller.start(INPUT);
    client.emit(SUCCEEDED);
    const before = controller.state.value;
    controller.dispose();
    add.resolve();
    await settle();
    expect(controller.state.value).toBe(before);
    expect(rememberParent).not.toHaveBeenCalled();
  });

  it("refuses to start or init again", async () => {
    const { client, controller } = setup();
    controller.dispose();
    await controller.init();
    await controller.start(INPUT);
    expect(client.calls.start).toEqual([]);
    expect(client.calls.status).toBe(0);
  });
});
