import { BellSlash } from "@phosphor-icons/react";
import { CHROME_ICON, DeckIcon } from "../../../../ui/controls/deck-icon";
import { AgentMark } from "../../settings-redesign/agent-mark";
import { agentById, type DemoSettings } from "../../settings-redesign/model";
import { Region } from "./canvas-region";
import { testNonce, type RegionId } from "./canvas-regions";
import "./canvas-toasts.css";

/*
 * The notification toasts: one card per enabled event, replayed by "Send test".
 * Notifications off, or every event off, is a dashed slot you can still point at.
 */

type Interactive = { readonly interactive: boolean };
type Changes = { readonly changed: ReadonlySet<RegionId> };

type ToastKey = "notifyNeedsYou" | "notifyFinished" | "notifyErrors";

const TOASTS: readonly {
  readonly part: string;
  readonly key: ToastKey;
  readonly agent: string;
  readonly body: string;
  readonly tone: string;
}[] = [
  {
    part: "needs",
    key: "notifyNeedsYou",
    agent: "claude",
    body: "Needs you · Allow edit?",
    tone: "asked",
  },
  {
    part: "finished",
    key: "notifyFinished",
    agent: "codex",
    body: "Finished · 3 files changed",
    tone: "done",
  },
  {
    part: "errors",
    key: "notifyErrors",
    agent: "opencode",
    body: "Error · build failed",
    tone: "failed",
  },
];

export function Toasts({
  s,
  changed,
  interactive,
}: { readonly s: DemoSettings } & Changes & Interactive) {
  const shown = s.notifications ? TOASTS.filter((toast) => s[toast.key]) : [];
  const dot = changed.has("toast");
  if (shown.length === 0) {
    return (
      <div class="cv-toasts">
        <Region
          region="toast"
          instance="toast:ghost"
          interactive={interactive}
          ghost
          changed={dot}
          class="cv-toast"
          tip="above"
        >
          <DeckIcon icon={BellSlash} size={CHROME_ICON} />
          <span class="cv-ghost-label">{s.notifications ? "No alerts" : "Notifications off"}</span>
        </Region>
      </div>
    );
  }
  return (
    <div class="cv-toasts" key={testNonce.value}>
      {shown.map((toast, index) => {
        const agent = agentById(toast.agent, s);
        return (
          <Region
            key={toast.part}
            region="toast"
            instance={`toast:${toast.part}`}
            part={toast.part}
            interactive={interactive}
            changed={dot && index === 0}
            class="cv-toast"
            tip="above"
          >
            <span class="cv-mark">
              {agent !== undefined && <AgentMark agent={agent} />}
              <span class={`cv-badge is-${toast.tone}`} />
            </span>
            <span class="cv-toast__text">
              <span class="cv-toast__title">{agent?.label}</span>
              <span class="cv-toast__body">{toast.body}</span>
            </span>
          </Region>
        );
      })}
    </div>
  );
}
