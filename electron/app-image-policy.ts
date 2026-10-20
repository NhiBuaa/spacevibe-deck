import type { WebRequest } from "electron";

/**
 * Markdown libraries can load images before returning sanitized markup. Enforce
 * the app's local-image policy at the network boundary, not at the returned SVG.
 * Install only on the app session; remote browser panels use their own partition.
 */
export function installAppImagePolicy(
  webRequest: Pick<WebRequest, "onBeforeRequest">,
  developmentUrl?: string,
): void {
  let developmentOrigin: string | null = null;
  if (developmentUrl !== undefined) {
    try {
      const url = new URL(developmentUrl);
      if (url.protocol === "http:" || url.protocol === "https:") {
        developmentOrigin = url.origin;
      }
    } catch {
      // No network image exception for an invalid development URL.
    }
  }
  webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
    // Vite serves the app's own bundled image assets over its development origin.
    // Packaged builds have no exception. file:/data:/blob: never match this filter.
    let localDevelopmentAsset = false;
    if (developmentOrigin !== null) {
      try {
        localDevelopmentAsset = new URL(details.url).origin === developmentOrigin;
      } catch {
        // Fail closed if an invalid URL ever reaches the network listener.
      }
    }
    callback({ cancel: details.resourceType === "image" && !localDevelopmentAsset });
  });
}
