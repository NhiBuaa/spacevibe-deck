import fs from "node:fs/promises";
import path from "node:path";
import { hooksSupported } from "./hooks-supported";
import { opencodeSignalsMarkerPath } from "../agent-shell/shell-bootstrap";
import { storedSignalAdapterOn } from "../../src/settings/signal-adapter-choice";

export function opencodeSignalsEnabled(settings: unknown): boolean {
  return storedSignalAdapterOn(settings, "opencode");
}

interface IntegrationDeps {
  readonly userData: string;
  readonly supported?: boolean;
  readonly log?: (message: string, error: unknown) => void;
}

/**
 * opencode registers nothing in the user's config (OC1): Deck's plugin file is written with
 * the wrappers at boot, and the opencode wrapper loads it through `OPENCODE_CONFIG_DIR` only
 * while the runtime marker exists. This integration owns the marker and the delivery gate,
 * following the Signals switch the way the Codex integration does: turning off removes the
 * marker FIRST, so a launch that races the switch never gets the plugin.
 */
export function createOpencodeIntegration(deps: IntegrationDeps) {
  const marker = opencodeSignalsMarkerPath(deps.userData);
  const supported = deps.supported ?? hooksSupported();
  let enabled = false;
  let desired = false;
  let applied: boolean | null = null;
  let queue: Promise<void> = Promise.resolve();
  return {
    enabled: () => enabled,
    sync(settings: unknown): Promise<void> {
      const requested = opencodeSignalsEnabled(settings);
      desired = requested;
      if (!requested) enabled = false;
      const pending = queue
        .then(async () => {
          if (!supported || applied === requested) return;
          if (requested) {
            await fs.mkdir(path.dirname(marker), { recursive: true, mode: 0o700 });
            await fs.writeFile(marker, "", { mode: 0o600 });
          } else {
            await fs.rm(marker, { force: true });
          }
          enabled = requested && desired;
          applied = requested;
        })
        .catch((error: unknown) => {
          enabled = false;
          applied = null;
          (deps.log ?? console.warn)(
            "Deck: opencode Signals could not be switched; activity remains inferred.",
            error,
          );
        });
      queue = pending;
      return pending;
    },
  };
}
