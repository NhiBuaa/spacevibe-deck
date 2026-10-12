/**
 * Session restore — the data the Keep chapter's restore widget reads.
 *
 * Three panes, each typing the resume command its own CLI takes. The commands
 * are the real ones — `src/lib/agent-resume.ts`'s COMMAND_TABLE — because a
 * made-up flag is the kind of detail the people this page is for will check.
 *
 * All three are the table's ID forms, which is what a restore of a KNOWN
 * session types. Two of those are easy to get wrong in opposite directions:
 * claude's id form is `claude --resume <id>` and carries NO permission-skipping
 * flag — that one belongs to the agent catalog's *launch* command, never to
 * the resume table — and codex's is `codex resume <id>`, where `codex resume
 * --last` is the *latest* form, asking for whatever ran last rather than for
 * the session being restored.
 */

export const RESTORE_PANES = [
  {
    agent: "claude",
    cmd: "claude --resume 0f3a91c2",
    lines: [
      { text: "Restored — 41 messages of context.", cls: "t-dim" },
      {
        text: "Still open: the pane divider drifts on resize.",
        cls: "t-agent",
      },
    ],
    foot: "41 messages restored · claude-opus-5",
  },
  {
    agent: "codex",
    cmd: "codex resume 019a4f1c",
    lines: [
      { text: "Restored — session 019a4f1c.", cls: "t-dim" },
      { text: "96 passed · 0 failed from the last run.", cls: "t-ok" },
    ],
    foot: "session 019a4f1c · gpt-5-codex",
  },
  {
    agent: "opencode",
    cmd: "opencode -s 3b77ae",
    lines: [
      { text: "Restored — 12.4k tokens of context.", cls: "t-dim" },
      { text: "Waiting on your next instruction.", cls: "t-body" },
    ],
    foot: "12.4k tokens · claude-sonnet-5",
  },
];
