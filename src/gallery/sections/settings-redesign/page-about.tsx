import { useSignal } from "@preact/signals";
import { ArrowSquareOut } from "@phosphor-icons/react";
import { DeckIcon, ROW_ICON } from "../../../ui/controls/deck-icon";
import { Action, Group, PageIntro, PlainRow } from "./primitives";
import { Result, useTransient } from "./misc-actions";
import "./pages-misc.css";

const APP_VERSION = "2.9.0";
const CHECK_MS = 900;
const LATEST = "You're on the latest version";
const ANALYTICS_SUMMARY = "Always on. No code, paths or prompts.";

/** The disclosure, word for word from src/ui/settings/sections/privacy-section.tsx. */
const DISCLOSURE: readonly string[] = [
  "Deck sends first-party usage stats. They are always on and cannot be turned off in this build. No code, file paths or prompts are ever included.",
  "Deck sends one small daily snapshot: a fresh random id for that day, the date, Deck's version, platform and architecture, launch counts per built-in agent (custom agents count as one bucket), how often the browser, explorer and usage surfaces were opened, the day's highest tab and pane counts, whether sessions were restored at launch, how many of Deck's own update checks and downloads ran or failed, and how many update installs it started. The daily id is random every day and is never derived from your machine, so days cannot be linked.",
  "Deck never sends code, file paths, repository or branch names, prompts, terminal output, hostname, username, locale or timezone. Raw records expire after 35 days. The data is stored on Deck's own Cloudflare Worker; Cloudflare processes ordinary connection metadata at its edge as the infrastructure provider.",
];

export function AboutPage() {
  const checking = useSignal(false);
  const verdict = useSignal("");
  const notes = useTransient();
  const privacy = useTransient();

  const checkForUpdates = (): void => {
    if (checking.value) return;
    checking.value = true;
    verdict.value = "";
    setTimeout(() => {
      checking.value = false;
      verdict.value = LATEST;
    }, CHECK_MS);
  };

  return (
    <div class="srd-misc">
      <PageIntro page="about" />
      <Group title="Deck">
        <PlainRow label="Version" desc={<span role="status">{verdict.value}</span>}>
          <span class="srd-misc-version">{APP_VERSION}</span>
          <Action disabled={checking.value} onClick={checkForUpdates}>
            {checking.value ? "Checking…" : "Check for updates"}
          </Action>
        </PlainRow>
        <PlainRow label="Release notes">
          <Result text={notes.text.value} />
          <Action onClick={() => notes.show("Opened")}>Open</Action>
        </PlainRow>
      </Group>
      <Group
        title="Usage analytics"
        moreLabel="What's sent"
        more={
          <>
            {DISCLOSURE.map((paragraph) => (
              <p key={paragraph} class="srd-misc-note">
                {paragraph}
              </p>
            ))}
            <div class="srd-misc-actions">
              <Action onClick={() => privacy.show("Opened")}>
                Read the full privacy notice
                <DeckIcon icon={ArrowSquareOut} size={ROW_ICON} />
              </Action>
              <Result text={privacy.text.value} />
            </div>
          </>
        }
      >
        <p class="srd-misc-note">{ANALYTICS_SUMMARY}</p>
      </Group>
    </div>
  );
}
