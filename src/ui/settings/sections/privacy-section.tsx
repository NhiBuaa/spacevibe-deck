import { useEffect } from "preact/hooks";
import { ensureTelemetryStateLoaded } from "../../../telemetry/consent-store";

/**
 * The Privacy category (spec §7): the whole disclosure in plain words, over
 * MAIN-owned state read through `telemetry_state` — deliberately not a
 * settings-schema pair, because settings get copied to other machines and
 * pasted into issues, and consent must never travel with them.
 *
 * The switch is GONE (2026-09-06, `USAGE_ANALYTICS_MANDATORY`): usage stats
 * are on for every install with no way to turn them off, so a control here
 * would be a lie either way — working, it would contradict main, which refuses
 * `setEnabled(false)`; disabled, it would be a dead thing to keep pressing.
 * The account of what is sent stays, and is the reason this category still
 * exists at all: taking the choice away is not a licence to stop saying what
 * is taken. No identifier is displayed because no daily id ever crosses into
 * the renderer.
 *
 * `unreadable` is still reported, because it still means nothing is being sent
 * — fail-closed survives the mandatory policy, and a user reading a page that
 * says "always on" deserves to know when it is in fact off.
 *
 * The copy never calls the payload "anonymous" (spec §11) — the copy test
 * pins that word out — and it must never claim the collection is optional.
 */
export function PrivacySection() {
  useEffect(() => {
    void ensureTelemetryStateLoaded();
  }, []);

  return (
    <>
      <p class="settings-screen__note">
        SpaceDeck Local is a privacy-first build. Upstream publisher telemetry, usage analytics,
        account integrations, and Sentry crash reporting are permanently disconnected. No metrics,
        error reports, or telemetry data are ever transmitted to the publisher or external servers.
      </p>
      <p class="settings-screen__note">
        Application data—including workspaces, session restore journals, and local token usage
        summaries—is processed and stored solely on your local machine.
      </p>
      <p class="settings-screen__note">
        The application interface and embedded browser operate under a local-only network boundary,
        restricting network traffic strictly to verified loopback addresses (127.0.0.1 / ::1).
        Outbound internet requests and remote WebSockets from the embedded browser are blocked.
      </p>
      <p class="settings-screen__note">
        Terminal agents run as independent child processes with their own direct network access
        according to your configuration (such as AI model providers, tools, or MCP servers).
        Outbound network traffic initiated by agent processes operates outside Deck's loopback
        network filter.
      </p>
    </>
  );
}
