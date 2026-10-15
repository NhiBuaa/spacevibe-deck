import {
  currentLimitWindows,
  limitWindowLabel,
  type AgentLimitReading,
  type LimitWindow,
} from "../../lib/agent-limits";
import type { UsageAgent } from "../../lib/usage-snapshot";
import { AgentGlyph } from "../controls/agent-glyph";
import { usageAgentColor } from "./usage-agent-colors";
import { EM_DASH, USAGE_AGENT_LABEL, USAGE_AGENT_ORDER } from "./usage-format";
import type { AgentLimitsView } from "./use-agent-limits";

export const LOW_ALLOWANCE_PERCENT = 15;
/** Below this the bar warms up; at LOW_ALLOWANCE_PERCENT it turns red and says so in words. */
export const WARM_ALLOWANCE_PERCENT = 30;
/** Within this many points of an even spend the pace reads "on pace". */
const PACE_TOLERANCE_POINTS = 8;
const FIVE_HOURS = 300;
const WEEK_MINUTES = 10080;
const MINUTE_MS = 60_000;
const HOUR_MINUTES = 60;
const DAY_MINUTES = 1440;

function durationLabel(minutes: number): string {
  return minutes === FIVE_HOURS
    ? "5-hour"
    : minutes === WEEK_MINUTES
      ? "Weekly"
      : limitWindowLabel(minutes);
}

function resetLabel(resetsAtMs: number, nowMs: number): string {
  const minutes = Math.max(1, Math.ceil((resetsAtMs - nowMs) / MINUTE_MS));
  if (minutes >= DAY_MINUTES)
    return `${Math.floor(minutes / DAY_MINUTES)}d ${Math.floor((minutes % DAY_MINUTES) / HOUR_MINUTES)}h`;
  if (minutes >= HOUR_MINUTES)
    return `${Math.floor(minutes / HOUR_MINUTES)}h ${minutes % HOUR_MINUTES}m`;
  return `${minutes}m`;
}

function unknownReason(reading: AgentLimitReading | undefined, props: AgentLimitsView): string {
  if (!props.available) return "Limits unavailable on this host";
  if (props.loading) return "Reading limits…";
  if (props.error || reading?.state === "error") return "Could not refresh limits";
  if (reading?.observedAtMs && reading.observedAtMs > props.nowMs)
    return "Limit observation is in the future";
  if (reading?.windows.length) return "Limit data expired or unavailable";
  return "Limit unavailable";
}

const RESET_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

type Pace = "ahead" | "on" | "behind";

/**
 * Where an even spend would sit on the bar: the share of the window still to
 * run. Remaining above it means the agent is being used slower than the clock.
 */
function evenSpendPercent(window: LimitWindow, nowMs: number): number {
  const left = (window.resetsAtMs - nowMs) / (window.durationMinutes * MINUTE_MS);
  return Math.min(100, Math.max(0, left * 100));
}

function paceOf(remaining: number, target: number): Pace {
  if (remaining > target + PACE_TOLERANCE_POINTS) return "ahead";
  return remaining < target - PACE_TOLERANCE_POINTS ? "behind" : "on";
}

const PACE_LABEL: Readonly<Record<Pace, string>> = {
  ahead: "Using it slower than the clock",
  on: "On pace",
  behind: "Using it faster than the clock",
};

function fillColor(agent: UsageAgent, remaining: number): string {
  if (remaining <= LOW_ALLOWANCE_PERCENT) return "var(--allowance-low)";
  if (remaining <= WARM_ALLOWANCE_PERCENT) return "var(--allowance-warm)";
  return usageAgentColor(agent);
}

function AllowanceWindow({
  agent,
  window,
  nowMs,
}: {
  readonly agent: UsageAgent;
  readonly window: LimitWindow;
  readonly nowMs: number;
}) {
  const remaining = Math.floor(100 - window.usedPercent);
  const low = remaining <= LOW_ALLOWANCE_PERCENT;
  const resetsAt = new Date(window.resetsAtMs);
  const target = evenSpendPercent(window, nowMs);
  return (
    <li class={low ? "usage-allowance__window usage-allowance__low" : "usage-allowance__window"}>
      <span class="usage-allowance__label">
        {durationLabel(window.durationMinutes)}
        {low && <span class="usage-allowance__warning">Low</span>}
      </span>
      {/* The bar repeats the percentage beside it; the pace mark is the part that
          adds meaning, so the bar is named by it (DL-16.6). */}
      <span
        class="usage-allowance__bar"
        role="img"
        aria-label={PACE_LABEL[paceOf(remaining, target)]}
        title={PACE_LABEL[paceOf(remaining, target)]}
      >
        <span
          class="usage-allowance__fill"
          style={{ width: `${remaining}%`, background: fillColor(agent, remaining) }}
        />
        <span class="usage-allowance__pace" style={{ left: `${target}%` }} />
      </span>
      <strong>{remaining}%</strong>
      <time
        dateTime={resetsAt.toISOString()}
        title={resetsAt.toLocaleString("en-US", RESET_DATE_FORMAT)}
      >
        Resets in {resetLabel(window.resetsAtMs, nowMs)}
      </time>
    </li>
  );
}

/** Current allowance has no cost-period input (DL-16.1); zero is a real measurement. */
export function RemainingAllowance(props: AgentLimitsView) {
  return (
    <section class="usage-allowance" aria-label="Remaining allowance">
      <h3>Remaining allowance</h3>
      <ul class="usage-allowance__agents">
        {USAGE_AGENT_ORDER.map((agent) => {
          const reading = props.snapshot.find((row) => row.agent === agent);
          const windows =
            props.available && !props.error
              ? [...currentLimitWindows(reading, props.nowMs)].sort(
                  (a, b) => a.durationMinutes - b.durationMinutes,
                )
              : [];
          return (
            <li key={agent} class="usage-allowance__agent">
              <p class="usage-allowance__name">
                <AgentGlyph agent={agent} className="usage-allowance__logo" />
                {USAGE_AGENT_LABEL[agent]}
              </p>
              {windows.length ? (
                <ul class="usage-allowance__windows">
                  {windows.map((window) => (
                    <AllowanceWindow
                      key={window.durationMinutes}
                      agent={agent}
                      window={window}
                      nowMs={props.nowMs}
                    />
                  ))}
                </ul>
              ) : (
                <p class="usage-allowance__none">
                  <span class="usage-allowance__unknown">{EM_DASH}</span>
                  <small>{unknownReason(reading, props)}</small>
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
