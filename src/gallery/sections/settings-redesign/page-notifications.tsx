import { signal } from "@preact/signals";
import { registryEntry, settings, update, type DemoSettings } from "./model";
import { Action, Group, PageIntro, PlainRow, SettingRow, Switch } from "./primitives";
import { Result, useTransient } from "./misc-actions";
import "./pages-misc.css";

/*
 * Notifications page. The OS permission is simulated by two module-level
 * signals (not page-local state): the real answer lives in macOS and outlives
 * this page, so leaving and coming back must not forget it.
 */

type Permission = "not-asked" | "asking" | "granted" | "denied";

const ASK_MS = 700;
const RECHECK_MS = 1200;
const EVENT_KEYS = ["notifyNeedsYou", "notifyFinished", "notifyErrors"] as const;
const BLOCKED_TEST = "Blocked — open System Settings";
const DEMO_DENY_LABEL = "Demo: deny the next request";

const PERMISSION_STATUS: Readonly<
  Record<Permission, { readonly label: string; readonly tone: "ok" | "error" | "idle" }>
> = {
  "not-asked": { label: "Not asked yet", tone: "idle" },
  asking: { label: "Asking…", tone: "idle" },
  granted: { label: "Allowed", tone: "ok" },
  denied: { label: "Blocked in System Settings", tone: "error" },
};

const permission = signal<Permission>("not-asked");
const denyNext = signal(false);

/** The OS prompt. A decided answer comes back at once, like the real one. */
function requestPermission(): Promise<"granted" | "denied"> {
  const current = permission.value;
  if (current === "granted" || current === "denied") return Promise.resolve(current);
  permission.value = "asking";
  return new Promise((resolve) => {
    setTimeout(() => {
      const answer = denyNext.value ? "denied" : "granted";
      permission.value = answer;
      resolve(answer);
    }, ASK_MS);
  });
}

/** Turning off never prompts; turning on only sticks once the OS says yes. */
async function setNotifications(next: boolean, onDenied: () => void): Promise<void> {
  if (!next) {
    update({ notifications: false });
    return;
  }
  if ((await requestPermission()) === "granted") update({ notifications: true });
  else onDenied();
}

/** Demo: coming back from System Settings re-reads the answer, unless the demo keeps denying. */
function openSystemSettings(): void {
  if (denyNext.value) return;
  setTimeout(() => {
    permission.value = "granted";
  }, RECHECK_MS);
}

export function NotificationsPage() {
  const s = settings.value;
  const status = PERMISSION_STATUS[permission.value];
  const asking = permission.value === "asking";
  const denied = useTransient();
  const opened = useTransient();
  const test = useTransient();

  const sendTest = async (): Promise<void> => {
    const answer = await requestPermission();
    test.show(answer === "granted" ? "Sent" : BLOCKED_TEST);
  };

  return (
    <div class="srd-misc">
      <PageIntro page="notifications" />
      <Group
        title="Alerts"
        more={
          <>
            <SettingRow k="notifyWhileFocused">
              <Switch
                label={registryEntry("notifyWhileFocused").label}
                checked={s.notifyWhileFocused}
                disabled={!s.notifications}
                onChange={(next) => update({ notifyWhileFocused: next })}
              />
            </SettingRow>
            <PlainRow
              label={
                <span
                  class="srd-misc-demo"
                  title="Prototype only — simulates the answer macOS gives"
                >
                  {DEMO_DENY_LABEL}
                </span>
              }
            >
              <Switch
                label={DEMO_DENY_LABEL}
                checked={denyNext.value}
                onChange={(next) => {
                  denyNext.value = next;
                }}
              />
            </PlainRow>
          </>
        }
      >
        <SettingRow k="notifications">
          <Result text={denied.text.value} />
          <Switch
            label={registryEntry("notifications").label}
            checked={s.notifications}
            disabled={asking}
            onChange={(next) => void setNotifications(next, () => denied.show("Not allowed"))}
          />
        </SettingRow>
        {EVENT_KEYS.map((key) => (
          <SettingRow key={key} k={key}>
            <Switch
              label={registryEntry(key).label}
              checked={s[key]}
              disabled={!s.notifications}
              onChange={(next) => update({ [key]: next } as Partial<DemoSettings>)}
            />
          </SettingRow>
        ))}
      </Group>
      <Group title="System">
        <PlainRow label="Permission">
          <span class={`srd-misc-status srd-misc-status--${status.tone}`}>
            <span class={`srd-misc-dot srd-misc-dot--${status.tone}`} aria-hidden="true" />
            {status.label}
          </span>
          {permission.value === "denied" && (
            <>
              <Result text={opened.text.value} />
              <Action
                onClick={() => {
                  opened.show("Opened");
                  openSystemSettings();
                }}
              >
                Open System Settings
              </Action>
            </>
          )}
        </PlainRow>
        <PlainRow label="Test notification" desc={<Result text={test.text.value} />}>
          <Action disabled={asking} onClick={() => void sendTest()}>
            Send test
          </Action>
        </PlainRow>
      </Group>
    </div>
  );
}
