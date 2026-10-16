import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createOpencodeIntegration } from "./opencode-integration";
import { opencodeSignalsMarkerPath } from "../agent-shell/shell-bootstrap";
import { SIGNAL_ADAPTERS_REVISION } from "../../src/settings/signal-adapter-choice";

const scratch: string[] = [];
const settings = (opencode: boolean) => ({
  signalAdaptersRevision: SIGNAL_ADAPTERS_REVISION,
  agentSignalAdapters: { opencode },
});
const exists = (file: string) =>
  fs.access(file).then(
    () => true,
    () => false,
  );
async function setup() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "deck-opencode-test-"));
  scratch.push(dir);
  return { userData: path.join(dir, "Deck's Data") };
}
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((dir) => fs.rm(dir, { recursive: true })));
});

describe("opencode integration — runtime marker and delivery gate (OC1)", () => {
  it("keeps the marker and the gate exactly while opencode Signals is on", async () => {
    const deps = await setup();
    const marker = opencodeSignalsMarkerPath(deps.userData);
    const integration = createOpencodeIntegration({ ...deps, supported: true });
    expect(integration.enabled()).toBe(false);
    await integration.sync(settings(true));
    expect([await exists(marker), integration.enabled()]).toEqual([true, true]);
    await integration.sync(settings(false));
    expect([await exists(marker), integration.enabled()]).toEqual([false, false]);
    await integration.sync(settings(true));
    expect([await exists(marker), integration.enabled()]).toEqual([true, true]);
  });

  it("is on for a fresh install with no settings file", async () => {
    const deps = await setup();
    const integration = createOpencodeIntegration({ ...deps, supported: true });
    await integration.sync(undefined);
    expect(integration.enabled()).toBe(true);
  });

  it("removes a marker a crash left behind when the switch is off", async () => {
    const deps = await setup();
    const marker = opencodeSignalsMarkerPath(deps.userData);
    await fs.mkdir(path.dirname(marker), { recursive: true });
    await fs.writeFile(marker, "");
    await createOpencodeIntegration({ ...deps, supported: true }).sync(settings(false));
    expect(await exists(marker)).toBe(false);
  });

  it("closes the gate at once when the switch turns off, before the marker is gone", async () => {
    const deps = await setup();
    const integration = createOpencodeIntegration({ ...deps, supported: true });
    await integration.sync(settings(true));
    const pending = integration.sync(settings(false));
    expect(integration.enabled()).toBe(false);
    await pending;
  });

  it("creates nothing where hooks are unsupported", async () => {
    const deps = await setup();
    const integration = createOpencodeIntegration({ ...deps, supported: false });
    await integration.sync(settings(true));
    expect(await exists(opencodeSignalsMarkerPath(deps.userData))).toBe(false);
    expect(integration.enabled()).toBe(false);
  });

  it("logs, stays off and retries when the marker cannot be written", async () => {
    const deps = await setup();
    const marker = opencodeSignalsMarkerPath(deps.userData);
    // The marker path is a directory, so writing the file fails.
    await fs.mkdir(marker, { recursive: true });
    const log = vi.fn();
    const integration = createOpencodeIntegration({ ...deps, supported: true, log });
    await integration.sync(settings(true));
    expect(log).toHaveBeenCalledTimes(1);
    expect(integration.enabled()).toBe(false);
    await fs.rm(marker, { recursive: true });
    await integration.sync(settings(true));
    expect([await exists(marker), integration.enabled()]).toEqual([true, true]);
  });
});
