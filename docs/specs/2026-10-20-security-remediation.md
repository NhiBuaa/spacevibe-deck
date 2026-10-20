# Verified security and data-integrity remediation

- Started: 2026-10-20
- Status: Implemented and verified in the remediation branch on 2026-10-20. Native and production checks remain outside this acceptance scope.
- Audit baseline: `1fc50042`; implementation base: `1d6aa7cc`.
- Authorization: the owner requested fixes for the confirmed High and Medium findings
  from the two security reviews, with verified root causes only.

## Scope and acceptance criteria

Each row requires a regression that demonstrates the original incorrect behavior before
the fix and passes afterwards. Tests use isolated fixtures, never production credentials
or user processes.

| ID | Verified root cause | Required behavior |
| --- | --- | --- |
| S1 | Git observation honors fsmonitor and clean/process filters | Reading Changes does not execute repository-configured callbacks. Ordinary repositories and linked worktrees remain readable. |
| S2 | Git metadata uses an unrestricted synchronous read | `.git` and `commondir` reads reject special/oversized files without blocking. |
| S3 | Project metadata and programmatic paste preserve control bytes | Skill names cannot terminate bracketed paste; normal multiline prompt text remains usable. |
| S4 | Mermaid loads image resources before sanitizing output | Packaged diagram rendering cannot load external HTTP(S) images; ordinary diagrams remain available. |
| S5 | Cancelled account clients share writable session storage | Old exchanges cannot write or remove a newer flow's session. |
| S6 | Credential deletion errors are swallowed | Failed durable sign-out is reported accurately; successful offline local sign-out still works. |
| S7 | Callback request URL parsing can throw out of its handler | Malformed targets receive a bounded error response and do not end the active listener. |
| S8 | Transfer reservation/claim lack participant authorization | Only the source may reserve and only its selected destination may claim; unrelated windows cannot receive scrollback/output or pane access. |
| S9 | Update consent only inventories the current renderer | Installation checks every live pane and dirty file through main before teardown. |
| S10 | Journal index uses separate read/write requests | Concurrent window journal changes cannot lose a persisted window from restore. |
| S11 | Windows ancestry checks age only against the root | A descendant older than its current parent is excluded before foreground selection. |
| S12 | Foreground shell workloads classify as idle | Only a proven idle pane shell skips busy confirmation; child/script shells remain busy or unknown. |

## Implementation decisions

- Keep existing UI surfaces and flat IPC conventions. Add only the narrow main-owned
  operations needed for authoritative update consent and atomic journal indexing.
- The owner's remediation instruction authorizes the already identified ownership,
  process-classification, coordinator and close/quit changes. No unrelated R4 refactor,
  dependency change, signing/release change, or sibling-repository edit is included.
- Preserve corrupt-file write locks and unrelated concurrent work.
- No production database migration, credential access, deployment, push or release.

## Exclusions

Unverified TOCTOU scenarios, the latent `killForeground` race, end-to-end output
backpressure, OAuth exchange deadlines, dependency advisories without demonstrated
reachability, and the historical feedback migration are not part of these fixes.
Any newly discovered problem must be verified and distinguished from this accepted scope.

## Verification limits

Targeted tests, TypeScript, changed-file lint/format, relevant policy suites, and independent
review are required. Native macOS/Windows behavior, actual updates, production Supabase
settings and owner visual acceptance are not implied by module checks. This is corrective
work, not a new feature or visual redesign.
