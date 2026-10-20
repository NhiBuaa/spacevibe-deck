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
 *  - Packaged app: blocks all outbound HTTP/HTTPS/WS/WSS network traffic from the renderer.
 *  - Development app: permits only the verified local dev origin (assets + HMR WebSocket).
 *  - Blocks any image from remote or local servers outside the verified dev server.
 */
export function installAppSessionPolicy(
  webRequest: Pick<WebRequest, "onBeforeRequest">,
  developmentUrl?: string,
): void {
  const developmentOrigin = parseLocalDevOrigin(developmentUrl);
  let devHost: string | null = null;
  if (developmentOrigin !== null) {
    try {
      devHost = new URL(developmentOrigin).host;
    } catch {
      devHost = null;
    }
  }

  webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => {
      // In packaged builds (or when no valid dev server origin is set),
      // the renderer session is completely local-only; reject all HTTP/HTTPS/WS/WSS.
      if (devHost === null) {
        callback({ cancel: true });
        return;
      }

      // In development mode, only requests strictly targeting the verified dev server host
      // (HTTP assets and HMR WebSockets) are permitted.
      try {
        const parsed = new URL(details.url);
        const isDevAsset =
          (parsed.protocol === "http:" ||
            parsed.protocol === "https:" ||
            parsed.protocol === "ws:" ||
            parsed.protocol === "wss:") &&
          parsed.host === devHost;

        callback({ cancel: !isDevAsset });
      } catch {
        callback({ cancel: true });
      }
    },
  );
}

/**
 * Enforces loopback-only policy on the embedded browser partition.
 * Intercepts HTTP, HTTPS, WS, and WSS requests, completely blocking any request
 * (scripts, images, stylesheets, beacons, websockets, fetches) that does not target
 * a verified loopback address.
 */
export function installBrowserSessionPolicy(webRequest: Pick<WebRequest, "onBeforeRequest">): void {
  webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (details, callback) => {
      const allowed = isVerifiedLoopbackUrl(details.url);
      callback({ cancel: !allowed });
    },
  );
}
