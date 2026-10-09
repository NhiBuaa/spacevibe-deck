import { Bell, CheckCircle, HandPalm, WarningOctagon, type Icon } from "@phosphor-icons/react";
import { settings, update, type DemoSettings } from "../../settings-redesign/model";
import { Choice } from "../../settings-redesign/primitives";
import { ToneIcon } from "./control-parts";
import { Spot } from "./control-spot";
import { ToggleTile } from "./control-toggle-tile";

const RULE_OPTIONS = [
  { value: "background", label: "Background only" },
  { value: "always", label: "Always" },
];

type EventKey = "notifyNeedsYou" | "notifyFinished" | "notifyErrors";

interface EventTile {
  readonly key: EventKey;
  readonly icon: Icon;
  readonly label: string;
  readonly hint: string;
}

const EVENTS: readonly EventTile[] = [
  {
    key: "notifyNeedsYou",
    icon: HandPalm,
    label: "Needs you",
    hint: "An agent asked a question or needs permission",
  },
  {
    key: "notifyFinished",
    icon: CheckCircle,
    label: "Finished",
    hint: "An agent completed its task",
  },
  { key: "notifyErrors", icon: WarningOctagon, label: "Errors", hint: "An agent hit a failure" },
];

/** The master switch, then which events may interrupt you, then when. */
export function NotificationsArea() {
  const s = settings.value;
  const off = !s.notifications;
  const none = s.notifications && !s.notifyNeedsYou && !s.notifyFinished && !s.notifyErrors;
  return (
    <div class="ctl-notify">
      <div class="ctl-notify__master">
        <ToggleTile
          k="notifications"
          icon={Bell}
          label="Notifications"
          checked={s.notifications}
          onChange={(notifications) => update({ notifications })}
        />
        {none && (
          <p class="ctl-flag" role="status">
            <ToneIcon tone="warn" />
            No event is on, so nothing will notify you
          </p>
        )}
      </div>
      <div class="ctl-notify__events" role="group" aria-label="Events">
        {EVENTS.map((event) => (
          <ToggleTile
            key={event.key}
            k={event.key}
            icon={event.icon}
            label={event.label}
            title={event.hint}
            checked={s[event.key]}
            disabled={off}
            onChange={(next) => update({ [event.key]: next } as Partial<DemoSettings>)}
          />
        ))}
      </div>
      <div class={`ctl-module ${off ? "is-disabled" : ""}`}>
        <fieldset class="ctl-plain" disabled={off}>
          <Spot k="notifyWhileFocused">
            <Choice
              label="While Deck is in front"
              value={s.notifyWhileFocused ? "always" : "background"}
              options={RULE_OPTIONS}
              onChange={(value) => update({ notifyWhileFocused: value === "always" })}
            />
          </Spot>
        </fieldset>
      </div>
    </div>
  );
}
