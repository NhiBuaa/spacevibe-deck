import type { WebRequest } from "electron";
import { installAppSessionPolicy } from "./network-policy";

/**
 * Enforces the app's local policy at the network boundary.
 * Delegates to installAppSessionPolicy in electron/network-policy.ts.
 */
export function installAppImagePolicy(
  webRequest: Pick<WebRequest, "onBeforeRequest">,
  developmentUrl?: string,
): void {
  installAppSessionPolicy(webRequest, developmentUrl);
}
