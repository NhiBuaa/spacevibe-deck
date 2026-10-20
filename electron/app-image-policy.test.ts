// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebRequest } from "electron";
import { installAppImagePolicy } from "./app-image-policy";

type BeforeRequest = Parameters<WebRequest["onBeforeRequest"]>[1];
type Listener = NonNullable<BeforeRequest>;

function policy(developmentUrl?: string) {
  let listener: Listener | undefined;
  const onBeforeRequest = vi.fn<WebRequest["onBeforeRequest"]>((_filter, callback) => {
    listener = callback ?? undefined;
  });
  installAppImagePolicy({ onBeforeRequest }, developmentUrl);
  const blocked = (url: string, resourceType = "image"): boolean => {
    let cancelled = false;
    listener?.({ url, resourceType } as Parameters<Listener>[0], (response) => {
      cancelled = response.cancel === true;
    });
    return cancelled;
  };
  return { blocked, onBeforeRequest };
}

afterEach(() => vi.unstubAllGlobals());

describe("app image network boundary", () => {
  it("rejects remote and loopback images while preserving non-image requests", () => {
    const { blocked, onBeforeRequest } = policy();
    expect(blocked("https://example.test/pixel.png")).toBe(true);
    expect(blocked("http://127.0.0.1:9000/pixel.png")).toBe(true);
    expect(blocked("https://example.test/api", "xhr")).toBe(false);
    expect(onBeforeRequest).toHaveBeenCalledWith(
      { urls: ["http://*/*", "https://*/*"] },
      expect.any(Function),
    );
  });

  it("permits only the configured Vite origin for development images", () => {
    const { blocked } = policy("http://127.0.0.1:5173/");
    expect(blocked("http://127.0.0.1:5173/src/assets/logo.svg")).toBe(false);
    expect(blocked("http://127.0.0.1:5174/pixel.png")).toBe(true);
    expect(blocked("http://127.0.0.1:5173.example.test/pixel.png")).toBe(true);
    expect(policy("invalid").blocked("https://example.test/pixel")).toBe(true);
  });

  it("blocks the real Mermaid pre-sanitize image request that escapes Markdown image handling", async () => {
    const mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
    const url = "https://example.test/review-marker.png";
    const reachedNetwork: string[] = [];
    const attempted: string[] = [];
    let block: (value: string) => boolean = () => false;
    vi.stubGlobal(
      "Image",
      class {
        set src(value: string) {
          attempted.push(value);
          if (!block(value)) reachedNetwork.push(value);
          // Never send a real request; stop before the diagram reaches layout.
          throw new Error("image stopped by isolated test transport");
        }
      },
    );
    const source = `flowchart TD\nA@{ img: "${url}", label: "sample" }`;
    const render = async (id: string) => {
      await expect(mermaid.render(id, source)).rejects.toThrow(
        "image stopped by isolated test transport",
      );
    };
    // Control: the installed library requests the image even in strict mode.
    await render("unprotected-diagram");
    expect(reachedNetwork).toEqual([url]);
    reachedNetwork.length = 0;
    attempted.length = 0;
    block = policy().blocked;
    await render("protected-diagram");
    expect(attempted).toEqual([url]);
    expect(reachedNetwork).toEqual([]);
  });
});
