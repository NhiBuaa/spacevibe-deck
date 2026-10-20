// @vitest-environment jsdom
import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const openUrl = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("../../../host/shell-host", () => ({ openUrl }));

// The REAL consent store runs over a mocked host, so the section is tested
// against the exact signal it ships with; each case drives `telemetryConsent`
// directly and re-renders ride the signal, as they do in the app.
const host = vi.hoisted(() => ({
  available: true,
  telemetryState: vi.fn(() => Promise.resolve(null)),
  telemetrySetEnabled: vi.fn(() =>
    Promise.resolve({ consent: "enabled" as const, consentVersion: 1 }),
  ),
  telemetryCount: vi.fn(),
}));
vi.mock("../../../host/telemetry-host", () => host);

import { telemetryConsent } from "../../../telemetry/consent-store";
import { PrivacySection } from "./privacy-section";

describe("PrivacySection", () => {
  let mount: HTMLDivElement;

  beforeEach(() => {
    mount = document.createElement("div");
    document.body.appendChild(mount);
    telemetryConsent.value = "declined";
    host.telemetrySetEnabled.mockClear();
  });

  afterEach(() => {
    act(() => render(null, mount));
    mount.remove();
  });

  it("pins the privacy copy: privacy-first fork, disabled telemetry, no third-party transmission", () => {
    act(() => render(<PrivacySection />, mount));
    const text = mount.textContent ?? "";
    expect(text).toContain("SpaceDeck Local");
    expect(text).toContain("privacy-first");
    expect(text).toContain("permanently disconnected");
    expect(text).toContain("local-only network boundary");
    expect(text).toContain("loopback");
    expect(text).toContain("solely on your local machine");
    expect(text).toContain("Terminal agents run as independent child processes");
  });

  it("offers no control at all, in every consent phase", () => {
    for (const phase of ["loading", "unreadable", "declined", "enabled"] as const) {
      act(() => {
        telemetryConsent.value = phase;
      });
      act(() => render(<PrivacySection />, mount));
      expect(mount.querySelector("button[role='switch']")).toBeNull();
    }
    expect(host.telemetrySetEnabled).not.toHaveBeenCalled();
  });
});
