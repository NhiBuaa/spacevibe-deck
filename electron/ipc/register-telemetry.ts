/**
 * Usage-analytics IPC handlers.
 *
 * In this privacy-first fork (`SpaceDeck Local`), publisher analytics are
 * completely disconnected and disabled. No daily ID is created, no counters
 * are sent, no timers are started, and no network requests are made on exit.
 */
import { ipcMain, type BrowserWindow } from "electron";
import type { StoreRegistry } from "../store";
import { CHANNELS } from "./channels";
import type { UpdateCounterKey } from "../telemetry/model";

export interface TelemetryRegisterDeps {
  readonly stores: StoreRegistry;
  readonly windows: ReadonlyMap<string, BrowserWindow>;
  readonly emitTo: (label: string, event: string, payload: unknown) => boolean;
}

export interface TelemetryHandle {
  /** Best-effort final snapshot on orderly quit. Never throws. */
  flushOnQuit(): Promise<void>;
  /** Count one update-lifecycle outcome. Main-side; fire and forget. */
  countUpdate(key: UpdateCounterKey): void;
}

export function registerTelemetry(_deps: TelemetryRegisterDeps): TelemetryHandle {
  // Fire and forget by contract: no-op in this privacy-first fork.
  ipcMain.handle(CHANNELS.telemetryCount, () => {});

  // The state read doubles as "a window is ready": returns declined/disabled state;
  // never starts timers or sends data.
  ipcMain.handle(CHANNELS.telemetryState, () => ({
    consent: "declined",
    consentVersion: 1,
  }));

  ipcMain.handle(CHANNELS.telemetrySetEnabled, () => ({
    consent: "declined",
    consentVersion: 1,
  }));

  return {
    flushOnQuit: async () => {},
    countUpdate: (_key: UpdateCounterKey) => {},
  };
}
