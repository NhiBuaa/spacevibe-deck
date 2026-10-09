import { EXTERNAL_APPS, registryEntry, settings, update } from "./model";
import { Choice, Group, PageIntro, PlainRow, SettingRow, Switch, TextValue } from "./primitives";
import { ConfirmAction } from "./misc-actions";
import "./pages-misc.css";

const APP_OPTIONS = EXTERNAL_APPS.map(({ id, label }) => ({ value: id, label }));
const TAB_SIZE_OPTIONS = [2, 4, 8].map((size) => ({ value: String(size), label: String(size) }));
const HOME_PLACEHOLDER = "http://localhost:3000";
const HOME_PROBLEM = "Use an http:// or https:// address";
const WEB_PROTOCOLS: readonly string[] = ["http:", "https:"];

/** Why a home address is refused, or null. `new URL` alone accepts `localhost:3000` as a scheme. */
function homeProblem(draft: string): string | null {
  try {
    return WEB_PROTOCOLS.includes(new URL(draft.trim()).protocol) ? null : HOME_PROBLEM;
  } catch {
    return HOME_PROBLEM;
  }
}

/** Nothing is stored in the prototype; the real host clears the `persist:deck-browser` partition. */
const clearBrowsingData = (): void => undefined;

export function FilesPage() {
  const s = settings.value;
  return (
    <div class="srd-misc">
      <PageIntro page="files" />
      <Group title="Paths">
        <SettingRow k="externalApp">
          <Choice
            label={registryEntry("externalApp").label}
            value={s.externalApp}
            options={APP_OPTIONS}
            onChange={(externalApp) => update({ externalApp })}
          />
        </SettingRow>
      </Group>
      <Group title="Editor">
        <SettingRow k="editorTabSize">
          <Choice
            label={registryEntry("editorTabSize").label}
            value={String(s.editorTabSize)}
            options={TAB_SIZE_OPTIONS}
            onChange={(size) => update({ editorTabSize: Number(size) })}
          />
        </SettingRow>
        <SettingRow k="editorWordWrap">
          <Switch
            label={registryEntry("editorWordWrap").label}
            checked={s.editorWordWrap}
            onChange={(editorWordWrap) => update({ editorWordWrap })}
          />
        </SettingRow>
      </Group>
      <Group
        title="Browser"
        more={
          <PlainRow label="Clear browsing data" desc="Cookies and site storage">
            <ConfirmAction
              confirmLabel="Clear cookies and storage?"
              resultLabel="Cleared"
              onConfirm={clearBrowsingData}
            >
              Clear
            </ConfirmAction>
          </PlainRow>
        }
      >
        <SettingRow k="browserHome">
          <TextValue
            label={registryEntry("browserHome").label}
            value={s.browserHome}
            placeholder={HOME_PLACEHOLDER}
            validate={homeProblem}
            onCommit={(browserHome) => update({ browserHome })}
          />
        </SettingRow>
      </Group>
    </div>
  );
}
