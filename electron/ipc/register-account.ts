/**
 * Account IPC handlers over the main-owned service in `../account/`
 * (docs/specs/2026-10-20-accounts.md).
 *
 * The session lives here and nowhere else (A7): replies and the broadcast are
 * the display state from `src/host/account-host.ts`. Signed out is the baseline
 * — the service is built from stored bytes only, so a signed-out Deck sends no
 * request (A3). It is started on `ready`, because `safeStorage` is unusable
 * before it, and again lazily by the first state read.
 */
import path from "node:path";
import fs from "node:fs/promises";
import { app, ipcMain, safeStorage, shell, type BrowserWindow } from "electron";
import { resolveAccountConfig } from "../account/config";
import { ACCOUNT_FILE } from "../account/model";
import { createAccountService, type AccountService } from "../account/service";
import { createSessionStore, type SessionFileIo } from "../account/session-store";
import { writeFileAtomically } from "../fs/write";
import { CHANNELS, EVENTS } from "./channels";

export interface AccountRegisterDeps {
  readonly userData: string;
  readonly windows: ReadonlyMap<string, BrowserWindow>;
  readonly emitTo: (label: string, event: string, payload: unknown) => boolean;
}

function fileIo(file: string): SessionFileIo {
  return {
    read: () =>
      fs.readFile(file, "utf8").catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          return null;
        }
        throw error;
      }),
    // The file holds a credential: owner-only, like the other private configs.
    write: (contents) => writeFileAtomically(file, contents, { mode: 0o600 }),
    remove: () => fs.rm(file, { force: true }),
  };
}

export function registerAccount(deps: AccountRegisterDeps): AccountService {
  const service = createAccountService({
    config: resolveAccountConfig(app.isPackaged),
    store: createSessionStore({
      io: fileIo(path.join(deps.userData, ACCOUNT_FILE)),
      cipher: safeStorage,
    }),
    fetch: (input, init) => fetch(input, init),
    openExternal: (url) => shell.openExternal(url),
    onStateChanged: (state) => {
      for (const [label] of deps.windows) {
        deps.emitTo(label, EVENTS.accountState, state);
      }
    },
  });

  void app.whenReady().then(() => service.start());

  ipcMain.handle(CHANNELS.accountState, () => service.state());
  ipcMain.handle(CHANNELS.accountSignIn, () => service.signIn());
  ipcMain.handle(CHANNELS.accountCancelSignIn, () => service.cancelSignIn());
  ipcMain.handle(CHANNELS.accountSignOut, () => service.signOut());
  return service;
}
