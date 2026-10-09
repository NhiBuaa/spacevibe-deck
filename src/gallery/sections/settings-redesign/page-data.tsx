import { useSignal } from "@preact/signals";
import { useEffect, useRef } from "preact/hooks";
import {
  PAGES,
  REGISTRY,
  isModified,
  keysInScope,
  registryEntry,
  resetKeys,
  settings,
  update,
  type DemoSettings,
} from "./model";
import { Action, Group, PageIntro, PlainRow } from "./primitives";
import { ConfirmAction, Result, useTransient } from "./misc-actions";
import "./pages-misc.css";

const SETTINGS_PATH = "~/Library/Application Support/SpaceVibe Deck/settings.json";
const IMPORT_FILE = "preferences.json";
const EXPORT_MS = 5000;

/** What the fake import file holds; the preview shows only what differs from now. */
const IMPORT_PREFS = { fontFamily: "Menlo", fontSize: 12, scrollback: 50_000 } as const;

const PREFERENCE_KEYS = keysInScope("preference");
const LAYOUT_KEYS = keysInScope("layout");

const sentence = (words: readonly string[]): string => {
  const text = words.join(", ").toLowerCase();
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
};
const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? "" : "s"}`;
const lines = (count: number): string => `${count / 1000}k lines`;

/** The scope of "Reset preferences", read from the registry so the text cannot drift from the code. */
const PREFERENCE_PAGES = PAGES.filter((page) =>
  REGISTRY.some((entry) => entry.page === page.id && entry.scope === "preference"),
).map((page) => page.label);
const PREFERENCE_SCOPE = `${PREFERENCE_PAGES.join(", ")} — keeps layout, logo, workspaces and session logs`;
const LAYOUT_SCOPE = sentence(LAYOUT_KEYS.map((key) => registryEntry(key).label));

interface ImportChange {
  readonly label: string;
  readonly from: string;
  readonly to: string;
}

function importChanges(current: DemoSettings): readonly ImportChange[] {
  const all: readonly ImportChange[] = [
    { label: "Font", from: current.fontFamily, to: IMPORT_PREFS.fontFamily },
    { label: "Size", from: `${current.fontSize}px`, to: `${IMPORT_PREFS.fontSize}px` },
    { label: "Scrollback", from: lines(current.scrollback), to: lines(IMPORT_PREFS.scrollback) },
  ];
  return all.filter((change) => change.from !== change.to);
}

function ImportPreview({
  changes,
  onApply,
  onCancel,
}: {
  readonly changes: readonly ImportChange[];
  readonly onApply: () => void;
  readonly onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("button:not(:disabled)")?.focus();
  }, []);
  return (
    <div class="srd-misc-import" role="group" aria-label="Import preview" ref={ref}>
      <span class="srd-misc-import__title">
        {changes.length === 0
          ? "Nothing to change"
          : `${plural(changes.length, "change")} from ${IMPORT_FILE}`}
      </span>
      {changes.length > 0 && (
        <ul class="srd-misc-diff">
          {changes.map((change) => (
            <li key={change.label}>
              <span>{change.label}</span>
              <span class="srd-misc-diff__to">
                {change.from} → {change.to}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div class="srd-misc-import__actions">
        <Action disabled={changes.length === 0} onClick={onApply}>
          Apply
        </Action>
        <Action onClick={onCancel}>Cancel</Action>
      </div>
    </div>
  );
}

export function DataPage() {
  const s = settings.value;
  const finder = useTransient();
  const exported = useTransient(EXPORT_MS);
  const imported = useTransient(EXPORT_MS);
  const previewing = useSignal(false);
  const importTrigger = useRef<HTMLSpanElement>(null);

  const changes = importChanges(s);
  const changedPreferences = PREFERENCE_KEYS.filter((key) => isModified(key, s)).length;
  const changedLayout = LAYOUT_KEYS.filter((key) => isModified(key, s)).length;

  const closePreview = (): void => {
    previewing.value = false;
    importTrigger.current?.querySelector("button")?.focus();
  };

  return (
    <div class="srd-misc">
      <PageIntro page="data" />
      <Group title="Your data">
        <PlainRow
          label="Settings file"
          desc={
            <span class="srd-misc-path" title={SETTINGS_PATH}>
              {SETTINGS_PATH}
            </span>
          }
        >
          <Result text={finder.text.value} />
          <Action onClick={() => finder.show("Opened")}>Show in Finder</Action>
        </PlainRow>
        <PlainRow label="Export preferences" desc={<Result text={exported.text.value} />}>
          <Action
            onClick={() =>
              exported.show(
                `Saved ${plural(PREFERENCE_KEYS.length, "preference")} — layout not included`,
              )
            }
          >
            Export…
          </Action>
        </PlainRow>
        <PlainRow label="Import preferences" desc={<Result text={imported.text.value} />}>
          <span class="srd-misc-contents" ref={importTrigger}>
            <Action
              onClick={() => {
                previewing.value = true;
              }}
            >
              Import…
            </Action>
          </span>
        </PlainRow>
        {previewing.value && (
          <ImportPreview
            changes={changes}
            onCancel={closePreview}
            onApply={() => {
              update(IMPORT_PREFS);
              imported.show(`Applied ${plural(changes.length, "change")}`);
              closePreview();
            }}
          />
        )}
      </Group>
      <Group title="Start over">
        <PlainRow label="Reset preferences" desc={PREFERENCE_SCOPE} danger>
          <ConfirmAction
            danger
            disabled={changedPreferences === 0}
            confirmLabel={`Reset ${plural(changedPreferences, "preference")}?`}
            resultLabel="Reset"
            onConfirm={() => resetKeys(PREFERENCE_KEYS)}
          >
            Reset
          </ConfirmAction>
        </PlainRow>
        <PlainRow label="Reset layout" desc={LAYOUT_SCOPE}>
          <ConfirmAction
            disabled={changedLayout === 0}
            confirmLabel="Reset layout?"
            resultLabel="Reset"
            onConfirm={() => resetKeys(LAYOUT_KEYS)}
          >
            Reset
          </ConfirmAction>
        </PlainRow>
      </Group>
    </div>
  );
}
