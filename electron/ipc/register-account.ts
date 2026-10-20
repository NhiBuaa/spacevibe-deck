/**
 * Account IPC handlers (docs/specs/2026-10-20-accounts.md).
 *
 * The contract seam both implementation lanes build against: every channel
 * answers, and every answer is signed out. Signed out is the spec's real
 * baseline (A1, A3), so this build makes no request and shows "No account".
 * The account service in `../account/` replaces these bodies; the channel
 * names and the display-state shape in `src/host/account-host.ts` stay.
 */
import { ipcMain } from "electron";
import { CHANNELS } from "./channels";

const SIGNED_OUT = { status: "signed-out", reason: null } as const;

const NOT_AVAILABLE = {
  status: "signed-out",
  reason: "Accounts are not available in this build yet.",
} as const;

export function registerAccount(): void {
  ipcMain.handle(CHANNELS.accountState, () => SIGNED_OUT);
  ipcMain.handle(CHANNELS.accountSignIn, () => NOT_AVAILABLE);
  ipcMain.handle(CHANNELS.accountCancelSignIn, () => SIGNED_OUT);
  ipcMain.handle(CHANNELS.accountSignOut, () => SIGNED_OUT);
}
