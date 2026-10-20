// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { WebRequest } from "electron";
import {
  isVerifiedLoopbackUrl,
  installAppSessionPolicy,
  installBrowserSessionPolicy,
  parseLocalDevOrigin,
} from "./network-policy";

describe("isVerifiedLoopbackUrl", () => {
  it("accepts valid loopback IPv4 addresses with http/https/ws/wss", () => {
    expect(isVerifiedLoopbackUrl("http://127.0.0.1:3000/")).toBe(true);
    expect(isVerifiedLoopbackUrl("https://127.0.0.1:8443/app")).toBe(true);
    expect(isVerifiedLoopbackUrl("ws://127.0.0.1:5173/")).toBe(true);
    expect(isVerifiedLoopbackUrl("wss://127.0.0.1:5173/")).toBe(true);
    expect(isVerifiedLoopbackUrl("http://127.0.0.2:8080/")).toBe(true);
    expect(isVerifiedLoopbackUrl("http://127.255.255.254:8080/")).toBe(true);
  });

  it("accepts valid loopback IPv6 addresses", () => {
    expect(isVerifiedLoopbackUrl("http://[::1]:3000/")).toBe(true);
    expect(isVerifiedLoopbackUrl("https://[::1]:8443/")).toBe(true);
    expect(isVerifiedLoopbackUrl("ws://[::1]:5173/")).toBe(true);
    expect(isVerifiedLoopbackUrl("wss://[::1]:5173/")).toBe(true);
  });

  it("accepts exact localhost", () => {
    expect(isVerifiedLoopbackUrl("http://localhost:5173/")).toBe(true);
    expect(isVerifiedLoopbackUrl("https://localhost:3000/")).toBe(true);
    expect(isVerifiedLoopbackUrl("ws://localhost:5173/")).toBe(true);
    expect(isVerifiedLoopbackUrl("wss://localhost:5173/")).toBe(true);
  });

  it("rejects 0.0.0.0", () => {
    expect(isVerifiedLoopbackUrl("http://0.0.0.0:3000/")).toBe(false);
  });

  it("rejects URLs with embedded credentials", () => {
    expect(isVerifiedLoopbackUrl("http://user:pass@127.0.0.1:3000/")).toBe(false);
    expect(isVerifiedLoopbackUrl("http://admin@localhost:3000/")).toBe(false);
  });

  it("rejects fake localhost hostnames and prefixes", () => {
    expect(isVerifiedLoopbackUrl("http://localhost.evil.com/")).toBe(false);
    expect(isVerifiedLoopbackUrl("http://localhost.com/")).toBe(false);
    expect(isVerifiedLoopbackUrl("http://notlocalhost:3000/")).toBe(false);
    expect(isVerifiedLoopbackUrl("http://127.0.0.1.nip.io/")).toBe(false);
    expect(isVerifiedLoopbackUrl("http://127.0.0.1.com/")).toBe(false);
  });

  it("rejects LAN and private network addresses", () => {
    expect(isVerifiedLoopbackUrl("http://192.168.1.1:8080/")).toBe(false);
    expect(isVerifiedLoopbackUrl("http://10.0.0.1:8080/")).toBe(false);
    expect(isVerifiedLoopbackUrl("http://172.16.0.1:8080/")).toBe(false);
    expect(isVerifiedLoopbackUrl("http://169.254.1.1:8080/")).toBe(false);
  });

  it("rejects public internet URLs", () => {
    expect(isVerifiedLoopbackUrl("https://example.com/")).toBe(false);
    expect(isVerifiedLoopbackUrl("https://api.deck.spacevibe.dev/v1/ping")).toBe(false);
    expect(isVerifiedLoopbackUrl("https://google.com/")).toBe(false);
    expect(isVerifiedLoopbackUrl("http://93.184.216.34/")).toBe(false);
  });

  it("rejects non-web schemes", () => {
    expect(isVerifiedLoopbackUrl("file:///etc/passwd")).toBe(false);
    expect(isVerifiedLoopbackUrl("javascript:alert(1)")).toBe(false);
    expect(isVerifiedLoopbackUrl("data:text/html,test")).toBe(false);
    expect(isVerifiedLoopbackUrl("blob:http://localhost/uuid")).toBe(false);
  });
});

describe("parseLocalDevOrigin", () => {
  it("accepts valid local loopback Vite dev URL", () => {
    expect(parseLocalDevOrigin("http://127.0.0.1:5173/")).toBe("http://127.0.0.1:5173");
    expect(parseLocalDevOrigin("http://localhost:5173")).toBe("http://localhost:5173");
  });

  it("rejects remote or non-loopback dev URLs", () => {
    expect(parseLocalDevOrigin("https://evil.com/")).toBeNull();
    expect(parseLocalDevOrigin("http://192.168.1.50:5173/")).toBeNull();
    expect(parseLocalDevOrigin("invalid-url")).toBeNull();
    expect(parseLocalDevOrigin(undefined)).toBeNull();
  });
});

describe("installBrowserSessionPolicy", () => {
  it("cancels any request to a non-loopback destination", () => {
    type Listener = Parameters<WebRequest["onBeforeRequest"]>[1];
    let listener: Listener | undefined;
    const webRequest: Pick<WebRequest, "onBeforeRequest"> = {
      onBeforeRequest: vi.fn((_filter, callback) => {
        listener = callback ?? undefined;
      }),
    };

    installBrowserSessionPolicy(webRequest);

    const check = (url: string, resourceType = "xhr") => {
      let cancelled = false;
      listener?.({ url, resourceType } as Parameters<NonNullable<Listener>>[0], (res) => {
        cancelled = res.cancel === true;
      });
      return cancelled;
    };

    expect(check("http://127.0.0.1:3000/app.js", "script")).toBe(false);
    expect(check("http://localhost:5173/style.css", "stylesheet")).toBe(false);
    expect(check("ws://127.0.0.1:5173/", "websocket")).toBe(false);

    // Blocked:
    expect(check("https://google.com/analytics.js", "script")).toBe(true);
    expect(check("https://cdn.example.com/font.woff2", "font")).toBe(true);
    expect(check("https://api.example.com/telemetry", "ping")).toBe(true);
    expect(check("wss://tracker.example.com/", "websocket")).toBe(true);
    expect(check("http://192.168.1.1/api", "xhr")).toBe(true);
    expect(check("http://0.0.0.0:8000/data", "fetch")).toBe(true);
  });
});

describe("installAppSessionPolicy", () => {
  it("blocks remote and loopback images while allowing dev server images only from verified dev origin", () => {
    type Listener = Parameters<WebRequest["onBeforeRequest"]>[1];
    let listener: Listener | undefined;
    const webRequest: Pick<WebRequest, "onBeforeRequest"> = {
      onBeforeRequest: vi.fn((_filter, callback) => {
        listener = callback ?? undefined;
      }),
    };

    installAppSessionPolicy(webRequest, "http://127.0.0.1:5173/");

    const check = (url: string, resourceType = "image") => {
      let cancelled = false;
      listener?.({ url, resourceType } as Parameters<NonNullable<Listener>>[0], (res) => {
        cancelled = res.cancel === true;
      });
      return cancelled;
    };

    // Images:
    expect(check("http://127.0.0.1:5173/src/logo.svg", "image")).toBe(false);
    expect(check("http://127.0.0.1:5174/logo.svg", "image")).toBe(true);
    expect(check("https://example.com/avatar.png", "image")).toBe(true);
    expect(check("http://127.0.0.1:9000/avatar.png", "image")).toBe(true);
    expect(check("https://example.test/api", "xhr")).toBe(false);
  });
});
