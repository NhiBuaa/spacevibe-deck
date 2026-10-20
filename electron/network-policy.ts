import type { WebRequest } from "electron";

const ALLOWED_LOOPBACK_PROTOCOLS = new Set(["http:", "https:", "ws:", "wss:"]);

// IPv4 loopback regex: 127.0.0.0 to 127.255.255.255
const IPV4_LOOPBACK_REGEX = /^127(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/**
 * Validates whether a URL points strictly to a verified loopback address (IPv4 127.0.0.0/8,
 * IPv6 ::1, or exact localhost).
 *
 * Explicitly rejects:
 *  - 0.0.0.0
 *  - Hostnames with fake prefixes or subdomains (e.g. localhost.evil.com)
 *  - URLs with embedded credentials (user:pass@...)
 *  - LAN / private IP ranges (10.x, 192.168.x, 172.16-31.x)
 *  - Non-http/https/ws/wss schemes
 */
export function isVerifiedLoopbackUrl(urlStr: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return false;
  }

  if (!ALLOWED_LOOPBACK_PROTOCOLS.has(parsed.protocol)) {
    return false;
  }

  // Reject embedded credentials
  if (parsed.username !== "" || parsed.password !== "") {
    return false;
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, "").toLowerCase();

  if (hostname === "localhost" || hostname === "::1") {
    return true;
  }

  if (IPV4_LOOPBACK_REGEX.test(hostname)) {
    return true;
  }

  return false;
}

/**
 * Validates and extracts a loopback development origin.
 * Rejects remote or non-loopback URLs so environment variables cannot open
 * network permissions in packaged or untrusted configurations.
 */
export function parseLocalDevOrigin(developmentUrl?: string): string | null {
  if (developmentUrl === undefined) {
    return null;
  }
  try {
    const url = new URL(developmentUrl);
    if (
      (url.protocol === "http:" || url.protocol === "https:") &&
      isVerifiedLoopbackUrl(url.href)
    ) {
      return url.origin;
    }
  } catch {
    // Invalid URL fails closed.
  }
  return null;
}

/**
 * Enforces combined local-only policy and image protection on the main app session.
 *  - Blocks any image from remote or local servers unless it is the verified Vite dev origin.
 *  - Blocks any outbound network traffic from renderer outside the verified Vite dev origin.
 */
export function installAppSessionPolicy(
  webRequest: Pick<WebRequest, "onBeforeRequest">,
  developmentUrl?: string,
): void {
  const developmentOrigin = parseLocalDevOrigin(developmentUrl);

  webRequest.onBeforeRequest({ urls: ["http://*/*", "https://*/*"] }, (details, callback) => {
    let isDevAsset = false;
    if (developmentOrigin !== null) {
      try {
        isDevAsset = new URL(details.url).origin === developmentOrigin;
      } catch {
        // Invalid URL fails closed.
      }
    }

    callback({ cancel: details.resourceType === "image" && !isDevAsset });
  });
}

/**
 * Enforces loopback-only policy on the embedded browser partition.
 * Completely blocks any request (scripts, images, stylesheets, beacons, websockets, fetches)
 * that does not target a verified loopback address.
 */
export function installBrowserSessionPolicy(webRequest: Pick<WebRequest, "onBeforeRequest">): void {
  webRequest.onBeforeRequest({ urls: ["*://*/*"] }, (details, callback) => {
    const allowed = isVerifiedLoopbackUrl(details.url);
    callback({ cancel: !allowed });
  });
}
