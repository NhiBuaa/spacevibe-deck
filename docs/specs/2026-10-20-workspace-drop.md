# Workspace import by drag and drop

Approved direction: the owner requested immediate implementation on 2026-10-20
after the proposal to preserve terminal path insertion.

## Requirements

- External folders dropped on Deck chrome or the Open Board become saved workspaces.
  A regular file selects its containing directory. No directory is created on disk.
- A batch may contain several files and folders. Canonical directory paths are
  deduplicated; the first workspace is selected in the Open Board. Existing recents
  are reused. Selecting a workspace never launches an agent.
- The existing recent-workspace limit applies. A batch exceeding that many unique
  folders is rejected with an explanation rather than silently dropping entries.
- Terminal panes keep their existing path insertion behavior. Internal drags and
  plain text do not import workspaces.
- Native filesystem validation and image grants stay behind the preload's
  File-backed API. Synthetic files, missing paths and special files are rejected.
- During validation, repeat drops and launch actions must not race the selection.
  Invalid batches report a recoverable error without partially adding recents.
- Existing drafts retain their prompt and explicit agent choice.
- Embedded third-party browser content is a separate native view: its own drop
  behavior remains unchanged; Deck chrome around it accepts workspace drops.

## Acceptance

- Folder, regular file, mixed batch, duplicate directory, missing path and rejected
  grant are covered by focused tests.
- Drop routing preserves terminal insertion and leaves internal/text drags alone.
- Recents persist across relaunch. Repeated drops do not duplicate rows.
- An isolated Electron run exercises the affected flows and captures the drop hint
  and selected workspace. The owner reviews the screenshot before a UI commit.

Execution and evidence: [implementation plan](../plans/2026-10-20-workspace-drop.md).
