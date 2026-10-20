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
        SpaceDeck Local is a privacy-first build. Telemetry, usage statistics, and Sentry crash
        reporting are permanently disabled and disconnected. No analytics, telemetry snapshots, or
        error reports are ever transmitted to the publisher or third parties.
      </p>
      <p class="settings-screen__note">
        The application interface and embedded browser operate in local-only mode, restricted
        strictly to loopback addresses. Outbound internet requests from the embedded browser are
        blocked.
      </p>
      <p class="settings-screen__note">
        Terminal agents run as independent processes and connect only to the AI model providers you
        configure. Deck does not collect, track, or inspect your credentials, prompts, file paths,
        or session contents.
      </p>
    </>
  );
}
