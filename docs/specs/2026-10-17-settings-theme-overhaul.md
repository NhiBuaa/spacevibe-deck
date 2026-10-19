# Settings and theme overhaul

Date: 2026-10-17
Status: Approved for development, 2026-10-19, except slice P1 (see
[Resolved decisions](#resolved-decisions)). The owner took decisions 1–5 on 2026-10-17 and
answered every open decision and approved the forks below on 2026-10-19. Each slice still
gets its own short plan before code; the plan needs no further approval unless it departs from
this spec.
Owner checkout: `/Users/kyantran/Documents/Development/spacevibe-workspace/spacevibe-deck`
Baseline: `main` at `4623445c` (2026-10-17). The primary checkout holds another session's
uncommitted `CHANGELOG.md`, `docs/DESIGN-LANGUAGE.md`, `src/styles/11-settings-*.css` and
`src/styles/12-usage.css`; this spec touches none of them.
Host: Electron only. The Tauri host was removed on 2026-10-13, so nothing here degrades
through `available`.
Related records: the audit and function table in
[`docs/plans/2026-10-04-settings-redesign.md`](../plans/2026-10-04-settings-redesign.md)
(local plan, gitignored; it stays the audit and the P1–P3 phasing, and its requirements move
here) and the Studio integration in `docs/plans/2026-10-04-settings-studio.md`.

## Purpose

Bring Deck's Settings up to the standard of the desktop apps the owner studied, on four fronts: a theme system where each theme carries its own tokens; a Settings
surface that can be searched, linked into and reset by page; terminal typography and
notification options that are fixed or missing today; and feedback that tells the user what
their change did. The owner asked for one large spec; slices keep each delivery reviewable.

The studied apps are not named in repository records. Their source is under a source-available
licence, so everything below is an idea or an observed behaviour; no text, code, colour value or
asset is copied. The research notes live outside the repository.

## Decisions (owner, 2026-10-17)

1. **Explicit tokens per theme.** A theme declares the chrome tokens, the terminal colours
   (background, foreground, cursor, selection and the 16 ANSI colours) and the editor and
   syntax colours itself. Deck stops deriving chrome from the terminal theme with
   `color-mix`. Turned down: a hybrid where a theme declares only core tokens and the rest
   derives (smaller files, but no per-token control).
2. **All six existing presets go**: `deck-dark`, `deck-light`, `tokyo-night`, `dracula`,
   `one-dark`, `catppuccin-mocha`. A new built-in set is designed against the new token
   model. Turned down: keeping Deck Dark and Light and dropping only the other four.
3. **Appearance scope**: a theme picker with a swatch chip and Light and Dark groups, a
   follow-system mode with a separate light and dark theme, theme import and export with a
   starter file, and an in-app token editor with a live preview.
4. **Companion settings in scope**: Settings search and deep links, terminal typography,
   notification sound and rules, per-project overrides, and the feedback group in
   [Requirements, area E](#e-feedback-and-safety). Settings gaps not listed here stay out
   ([Out of scope](#out-of-scope)).

5. **Adopt shadcn-style components and Tailwind CSS gradually** (owner, 2026-10-17): slow and
   sure, one reviewed step at a time, never a one-pass rewrite. Settings is the first and only
   surface in this spec ([G](#g-base-components)). The direction is decided; the dependencies it
   implies are not, and each needs its own approval ([Constraints](#constraints)).

Decision 3 reverses two earlier records. The 2026-08-19 decision that light and dark are the
only theme choice, and the retirement of the theme gallery, theme import and colour overrides
from Settings, stop applying when the theme slices ship. The plan's "Not proposed" line for
them is superseded by this spec.

## Requirements

Each requirement has an id used by the plan and its checks. "Today" statements were read from
the tree on 2026-10-17.

### A. Theme system

Today: `THEME_PRESETS` in [`themes.ts`](../../src/settings/themes.ts) holds six presets;
Settings offers Light or Dark; chrome tokens derive from `(background, foreground)` through
[`derive-colors.ts`](../../src/lib/derive-colors.ts) (DL-2.2); `monacoThemeFor`
([`editor-host.ts`](../../src/files/editor-host.ts)) maps the theme to Monaco; custom theme
loading, import and four colour overrides still build but are unmounted.

- **THM-1 Theme file.** A theme is one JSON document: `id` (slug), `name`, optional `author`,
  `version`, `description`, `type` (`dark` or `light`), `ui` (the chrome tokens),
  `terminal` (16 ANSI plus background, foreground, cursor, cursor accent, selection) and
  `editor` (editor and syntax colours). The renderer validates it with a schema and rejects
  unknown or malformed colours; it does not repair them. The exact token list is a plan
  deliverable: it must cover every `:root` token in DL §2 that derives today.
- **THM-2 Switching.** Selecting a theme sets every chrome, terminal and editor token with no
  component change. A theme never reads another theme's values. The first paint after launch
  uses the stored theme with no flash of a different one.
- **THM-3 Built-in set.** The new set contains at least one dark and one light theme, is
  designed against THM-1, and is reviewed by eye in the gallery before it ships (decision 2).
  The set is fixed by [decision 6](#resolved-decisions).
- **THM-4 Migration.** A stored `themeId` or `colorOverrides` that no longer resolves falls
  back to the default theme for the stored mode. Nothing is written over an unreadable
  `settings.json` (the existing write lock still applies). The retired `colorOverrides` key is
  dropped on the next write like the three keys `settings-merge.ts` already drops.
- **THM-5 Picker.** The Appearance section lists themes in Light and Dark groups, each row
  with a swatch chip of the theme's own colours and its name, plus a Custom group for
  imported themes. Keyboard: arrows move, Enter selects; the row is announced by name.
- **THM-6 Follow system.** A "System" choice applies one chosen light theme and one chosen
  dark theme and switches when the operating system's appearance changes, with no restart.
- **THM-7 Import.** Import accepts a `.json` file up to 256 KB. Outcomes are reported
  distinctly: file too large, not parseable, schema failure with the first problem named,
  id already used by a built-in (refused), id already used by an imported theme (updated, and
  the count says so). A partial success reports what was skipped.
- **THM-8 Export and starter.** The user can export any theme as a file and download a
  starter file built from the active theme.
- **THM-9 Token editor.** The user can duplicate a theme and edit its tokens with a live
  preview of chrome, terminal and editor. Built-in themes are read-only; the editor works on
  a custom copy. Each token can be reset to the value it had when the copy was made.
- **THM-10 Contrast.** DL-3.5's text floors (`--text-primary` 8:1, `--text-muted` 6:1,
  `--text-faint` 4.5:1) hold for every built-in theme and stay tested. An imported or edited
  theme that misses a floor is accepted, shows a warning naming the failing tokens, and is
  never silently altered.

### B. Settings spine, search and deep links

Today: ten categories, no search, no link to a setting, the last category is not kept across
launches ([`active-category-store.ts`](../../src/ui/settings/active-category-store.ts)).
A reference app keeps a hand-written search registry of about 100 entries; its maintenance cost
is the thing to avoid.

- **SET-1 Registry.** One renderer registry describes every setting: key, page, group, label,
  keywords, default, scope (preference, layout or data) and whether a change reaches existing
  or only new sessions. Search, change marks, page reset and deep links read it. A test fails
  when a `Settings` key has no registry entry or a registry entry has no key.
- **SET-2 Search.** A field at the top of the rail filters by label, keyword and description.
  While a query is active the rail shows the matching pages with counts, the matching rows are
  highlighted, and a results line states the count and offers Clear. If the current page has
  no match, Settings moves to the first page that does. No match shows an explicit empty state.
- **SET-3 Deep links.** Every setting and page has an id. Code can open Settings at a page or
  scroll to and highlight a row. Entry points: the agent picker and launch page "manage
  agents" (today they set only the category), a "Settings…" link on toasts and banners that
  concern a setting, and the command surface. ⌘, reopens the last page for the session.
- **SET-4 Page anatomy.** Changed rows carry a mark. The page head shows how many rows changed
  and a "Reset page" action. Layout, density and the Studio look follow the
  [DL §11 patterns](../DESIGN-LANGUAGE.md); a redesign of those patterns needs the owner's eye
  review, not per-rule approval.

### C. Terminal and editor typography

Today: the terminal has `lineHeight: 1.25`, `cursorStyle: "bar"` and `cursorBlink: true`
hard-coded ([`pane.ts`](../../src/terminal/pane.ts) lines 217–232); font family and size are
shared by terminals and the built-in editor; `minimumContrastRatio` is deliberately unset
(pane.ts lines 258–262: it flattens agent TUIs' dim text).

- **TYP-1 Terminal options.** Line height, letter spacing, font weight, cursor style
  (block, bar, underline) and cursor blink become settings with validated ranges, and apply to
  open terminals without a restart.
- **TYP-2 Separate editor typography.** The built-in editor gets its own font family, size and
  line height. Terminal zoom actions keep working on the terminal only; an editor zoom is
  decided in the plan.
- **TYP-3 Live preview.** Each surface has a preview that reflects the draft values before
  they are committed.
- **TYP-4 Missing font.** If the chosen font is not installed, a banner under the preview says
  so and names the fallback. The check does not run during typing.
- **TYP-5 Per-surface reset.** A reset appears for a surface only while it differs from its
  defaults.
- **TYP-6 Invalid input.** A numeric field out of range or off-step shows its allowed range
  and keeps the draft until fixed or discarded; it never reverts without saying so.
- Ligatures and a minimum contrast ratio are out, per [Resolved decisions](#resolved-decisions): the
  first needs a new dependency and the second reverses a recorded choice.

### D. Notifications

Today: one switch for agent notifications, which requests OS permission
([`notifications-section.tsx`](../../src/ui/settings/sections/notifications-section.tsx));
the native alert is sent from [`native-notification.ts`](../../src/lib/native-notification.ts)
through the host (`electron/ipc/register-shell.ts`).

- **NTF-1 Rules.** The user chooses when a turn-complete alert fires (never, only when Deck is
  in the background, always) and separately switches needs-input and permission alerts.
- **NTF-2 Sound.** A sound can be turned off, its volume set, and one of a small bundled set
  chosen. A "Send test" action plays and notifies with the current choice.
- **NTF-3 Permission state.** The page shows whether the OS permits notifications and, when it
  does not, says so and offers to open the operating system's notification settings.
- **NTF-4 Custom sound.** Choosing a user file (`.mp3`, `.wav` or `.ogg`, size-limited) is
  bundled sounds only, per [Resolved decisions](#resolved-decisions); a user file is out of scope.

### E. Feedback and safety

- **FBK-1 Save status.** The Settings header shows Saving, Saved or "Couldn't save" with a
  retry that re-sends the failed keys' current values, never a stale patch. Autosaved free-text
  fields report their own state.
- **FBK-2 Shortcut recording.** A chord the terminal reserves is refused with the reason. A
  chord the operating system reserves is saved with a warning. A conflict offers Reassign.
  Backspace or Delete unbinds, and the recorder says so. "Reset all" asks first.
- **FBK-3 Honest reset.** Restore defaults lists what it resets and what it keeps. It offers
  preferences and layout separately, and a page reset affects only that page's keys.
- **FBK-4 Destructive actions.** Removing an agent or a saved command, and resetting
  everything, is confirmed. The confirmation names what is lost.
- **FBK-5 Theme feedback.** A theme change applies at once and needs no toast; a failed
  import or write is reported through THM-7 and FBK-1.

### F. Per-project overrides

Today: settings are global; `workspaces.json` and `repositories.json` hold per-workspace and
per-repository state but no preferences. This area is the largest and is not yet shaped: it
cannot be planned until its two open items in [Resolved decisions](#resolved-decisions) are answered.

- **PRJ-1 Scope.** A project (repository) can override a small named set of settings; every
  other setting stays global. The override shows its inherited value and a "Reset to
  inherited" action.
- **PRJ-2 Candidate keys.** Default worktree folder, default agent and setup behaviour are the
  candidates; the owner chooses the set.
- **PRJ-3 Trust.** An override that runs a command or changes a path is not applied until the
  user has trusted that project.

### G. Base components

Raised by the owner on 2026-10-17 while comparing the mock with the reference app: Deck has no
base component layer, so look, spacing and type cannot be controlled in one place. Evidence
(2026-10-17, `main` at `4623445c`): `src/ui/controls/` holds row and field helpers
(`config-row.tsx`, `commit-input.tsx`, `shortcut-capture.tsx`) but no Button, Switch, Select,
Dialog or Notice; outside the gallery there are 214 raw `<button>` uses across 92 files; the
`cfg-btn` class is applied by hand in 26 files (68 uses); `role="switch"` is re-implemented in
six files; the row and button styling lives in global stylesheets
([`07-config-rows.css`](../../src/styles/07-config-rows.css),
[`11-settings-screen.css`](../../src/styles/11-settings-screen.css)). The mock needed seven
stylesheets of overrides to re-skin one frame, which is the same cost a real restyle would pay.

- **BASE-1 Primitives.** Settings is built from one set of components, each with its look in
  one stylesheet and its variants as props, not as caller-side classes: Button, Switch,
  Segmented, Menu (select), Stepper, TextField, Row, Group, Notice and Dialog. A page imports
  them; it does not write `cfg-*` class names or its own switch.
- **BASE-2 Single source of look.** Heights, radii, type sizes, spacing and states of those
  components read tokens declared once. Changing the look of every Settings control is a
  token or component-stylesheet edit that touches no page. A test fails when a Settings page
  renders a raw `<button>` or applies `cfg-btn` directly.
- **BASE-3 Accessible by construction.** Roles, names, focus order, disabled and invalid
  states, and reduced motion are decided in the component, so a page cannot omit them.
- **BASE-4 Specimens.** The gallery shows each primitive in every state, in light and dark and
  in every built-in theme, and is the review surface for the look.
- **BASE-5 Scope of migration.** Settings only in this spec. The rest of the app keeps its
  current controls until a later spec migrates it; the components must not require that
  migration.
- **BASE-6 Gradual adoption (decision 5).** Components follow the shadcn model, source copied
  into the repository and owned by it, built on Tailwind utilities and small variant helpers.
  Adoption is a strangler: a control moves only when its page is already being changed by a
  slice of this spec; old and new controls coexist; each step ships alone with its checks and
  can be reverted alone. Nothing is migrated "while here".
- **BASE-7 Coexistence.** Tailwind must not change anything it was not asked to. Its global
  reset stays off (the stylesheet has no global `box-sizing` reset and relies on that, see the
  layout traps), its utilities sit in a cascade layer below Deck's stylesheets, and its theme
  maps onto Deck's tokens so a theme change (area A) restyles base components with no extra
  work. A utility never carries a literal colour (DL-2.1).
- **BASE-8 Spike before adoption.** Before any dependency lands, a throwaway spike on a
  separate branch answers with measurements: does the chosen headless primitive set work
  through the `preact/compat` alias (focus trap, portals, controlled state, IME) in the
  packaged Electron app; the size added to the renderer bundle and the stylesheet; whether the
  policy suites that read stylesheets still pass; and which shadcn defaults (shadows, blur,
  `transition-all`, custom select popovers) must be rewritten to meet DL §1.

## Constraints

- **Dependencies are a fork.** DL-1.1 allows no runtime dependency beyond CSS, Preact and one
  icon package; Tailwind (build-time), variant helpers (`class-variance-authority`, `clsx`,
  `tailwind-merge`) and any headless primitive library (Radix or similar) each need the
  owner's approval and a DL-1.1 rewrite. shadcn defaults also conflict with DL-1.2
  (`transition-all`), DL-1.3 (blurred shadows) and DL-1.4 (custom select popovers instead of
  native selects); the copied source is edited to comply, or the rule changes by decision. The
  bundle, signing and release configuration are also forks under AGENTS.md; a dependency step
  is reviewed as one.
- **DL invariants are a fork.** Explicit tokens contradict DL-2.2 (chrome is a function of
  background and foreground only), and touch DL §2's token table, DL-3.5 and DL-3.6. The
  change rewrites those rules in the same commit, and the tests that read them
  (`derive-colors.test.ts`, the policy suites in `scripts/` and `src/styles/`) are updated
  with it. The owner approves the approach before slice T1 starts. DL §11 and the Studio rules
  are patterns and need only eye review.
- **Demo surface.** Every UI slice is first built as gallery specimens (the gallery already
  carries `settings-explore` explorations) and reviewed by eye before integration.
- **E2E gate.** Slices that add a user-facing flow end with the `test-deck-app` walk of the
  affected flows in the running Electron app, with an isolated `userData`.
- **No telemetry change.** Nothing here adds an event or a field to the daily snapshot.
- **English only** for strings and docs (R1). Minimal visible text; tooltips carry explanation.
- **Windows.** Every requirement states its Windows behaviour in the plan. Follow-system and
  notification permission need a Windows check before release; none is available today.
- **Security.** An imported theme is data only. Its colour strings are validated before they
  reach CSS or Monaco, and its file is never executed or fetched from a URL.
- **Main stays green.** Each slice passes the `pre-push` set. Per-project overrides touch
  persistence and worktree creation, which AGENTS.md lists as seams; they need a plan and
  cross-boundary verification.

## Out of scope

Not in this spec; candidates for a later one. Each was seen in a reference app or in the
redesign plan:

copy-on-select; file auto-save; a Permissions page; an Experimental flags page; per-agent
environment variables and resume or fork arguments; a terminal daemon session manager; global
settings export and import; a settings CLI; update channel; an in-app language setting
(Deck is English only, R1); cloud accounts, organisations, teams, billing and remote access
(Deck has no backend). Hotkey search and a layout-aware keymap are also left out.

## Resolved decisions

Owner, 2026-10-19. Numbers are the ones the earlier draft used.

1. **Built-in set (THM-3).** Two Deck-authored themes (one dark, one light) plus a short
   curated set of widely liked palettes, each designed token by token, not converted from the
   old presets. The exact palettes are chosen in the T1 plan and reviewed by eye in the gallery.
2. **Token list (THM-1).** Keep the role names of DL §2; each role becomes an explicit theme
   value. No other app's names are adopted.
3. **Derived tones (THM-1).** A theme provides the base tone. Hover and selection washes
   (DL-21) and seams stay formulas on top of it, so they cannot drift between themes.
4. **Ligatures.** Out of this spec; they need a new xterm addon dependency.
5. **Minimum contrast.** Not offered as a setting. Too-dark ANSI colours are handled inside
   theme validation (THM-10).
6. **Custom sound (NTF-4).** Out of this spec. Bundled sounds only.
7. **Per-project overrides (PRJ-1 to PRJ-3).** Stay in this spec and ship last. The two items
   still open are the key set and where overrides live (`workspaces.json`,
   `repositories.json` or a new store). They are decided at the start of P1, after the trust
   model of PRJ-3 is agreed with the owner. P1 is the only slice that may stop for a decision.
8. **Token editor depth (THM-9).** All tokens are editable, grouped by area.
9. **Settings look (BASE-2).** Keep the DL §11 chrome. DL-4.4, DL-20 and the five radius roles
   are untouched, so B0b bakes the current look into the components.
10. **Component location (BASE-1).** `src/ui/controls/`, which already holds the row and field
    helpers. No new directory.
11. **Tailwind (BASE-6/7).** Utilities only, in a layer below the existing stylesheets, no
    global reset, theme mapped onto Deck's tokens, no literal colours in utilities.
12. **Headless primitives (BASE-6).** Decided after the B0a spike: a behaviour comes from a
    library only if the spike shows it works through `preact/compat` in the packaged app at an
    acceptable size. Native `<select>` stays either way (DL-1.4).
13. **Variant helpers.** Take `clsx` and `class-variance-authority`; skip `tailwind-merge` until
    a real class conflict appears.

### Fork approvals

Given by the owner on 2026-10-19. They cover the work below and nothing wider; a slice whose
plan needs more asks again.

- **DL §2 and §3.** Rewrite DL-2.2, DL-3.5 and DL-3.6 and the §2 token table for explicit
  per-theme tokens, in the same commit as T1, with `derive-colors.test.ts` and the policy
  suites updated with it.
- **Dependencies.** Tailwind (build-time), `clsx` and `class-variance-authority`, and a
  headless primitive library only as decision 12 allows. Rewrite DL-1.1 in the commit that adds
  the first one. **Gate:** B0a measures first (`preact/compat`, bundle and stylesheet size,
  policy suites). If the spike fails any of them, B0b stops and the owner is asked; no
  dependency lands on a failed spike.
- **shadcn defaults.** The copied source is edited to comply with DL-1.2 to DL-1.4
  (`transition-all`, blurred shadows, custom select popovers); the rules do not change.
- **Not approved here:** per-project storage and trust (P1), bundle or signing configuration
  changes beyond the dependencies above, and any sibling repo.

## Delivery slices

Slices run in order; the first row not `Done` is the next work. Each gets its own short plan
before code; the approvals in [Resolved decisions](#resolved-decisions) cover it. Slices B0a and B0b should land before the page slices so they do not build on the old controls. The fork approvals above cover T1 and B0b; P1 does not have one.

| # | Slice | Covers | Depends on | Fork | Status |
| --- | --- | --- | --- | --- | --- |
| 0a | B0a Spike (throwaway branch, no merge) | BASE-8 | owner decision 5 (2026-10-17) | none; answers the dependency fork with measurements | Next |
| 0b | B0b Base components for Settings | BASE-1–7 | B0a passing | DL-1.1 to 1.4, approved; look unchanged | Waiting on B0a |
| 1 | T1 Token schema, new built-in set, migration | THM-1–4, THM-10 | none | DL §2/§3, approved | Next |
| 2 | S1 Settings registry and honest reset | SET-1, SET-4, FBK-3 | none | none | Core Done 2026-10-19 (`ccf87680`); rows outside the editor and shortcuts keep no mark |
| 3 | S2 Search and deep links | SET-2, SET-3 | S1 | none | Core Done 2026-10-19 (`462433bd`); toast and banner links, command entry and ⌘, last page remain |
| 4 | T2 Picker and follow system | THM-5, THM-6 | T1 | none | Waiting on T1 |
| 5 | F1 Feedback group | FBK-1, FBK-2, FBK-4, FBK-5 | S1 | none | Next |
| 6 | Y1 Terminal and editor typography | TYP-1–6 | S1 | none | Next |
| 7 | N1 Notification rules and sound | NTF-1–3 | S1 | none | Next |
| 8 | T3 Import, export, starter | THM-7, THM-8 | T1 | none | Waiting on T1 |
| 9 | T4 Token editor | THM-9 | T3 | none | Waiting on T3 |
| 10 | P1 Per-project overrides | PRJ-1–3 | decision 7 (open items) | persistence seam; owner decides keys, storage and trust at P1 start | Last |

## Acceptance

The spec is accepted when every slice has met its own checks: the policy suites and the tests beside the changed
files pass; a gallery specimen has been reviewed by eye; and, for user-facing flows, the
`test-deck-app` walk is reported with each flow and its result. A merged slice is not the
acceptance of the spec; the owner's native walk is.
