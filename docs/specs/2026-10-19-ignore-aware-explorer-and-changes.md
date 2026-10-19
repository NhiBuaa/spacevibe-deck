# Ignore-aware Explorer and Changes watch

Date: 2026-10-19
Status: Built on `feat/ignore-aware-explorer` 2026-10-19, pending the owner's eye review of the E2E screenshots and merge. Open questions answered as recommended.
Owner checkout: `/Users/kyantran/Documents/Development/spacevibe-workspace/spacevibe-deck`
Baseline: `main` at `247dfc0e` (2026-10-19). Plans under `docs/plans/` are gitignored and exist
only in the primary checkout.
Host: Electron only. One new IPC channel; the browser preview and any host without it keep
today's fixed list.
Parent: [Explorer and Changes](2026-10-10-explorer-and-changes.md). This record **supersedes**
the parent's EXP6, its Delivery slice 7 and its open decision 5, and adds a performance
requirement for the Changes watch that the parent never had. Every other requirement stays with
the parent. The parent's slice 7 note that it "reuses slice 5's file listing" does not apply:
quick open has not shipped, and nothing here depends on it.
Plan: `docs/plans/2026-10-19-ignore-aware-explorer-and-changes.md` (primary checkout only).

## Summary

Two features share one main-process classifier that asks git, through `git check-ignore`, which
paths its ignore rules cover:

- **A. Changes watch.** The recursive watch behind the Changes list stops announcing bursts in
  which every path is ignored, so an `npm install` or a build writing only ignored output no
  longer makes Deck run `git status` about once a second.
- **B. Explorer tree.** The tree hides what the repository ignores instead of a fixed list of
  four names. A new **Show ignored files** toggle on the root row shows those entries dimmed.
  `.git` stays hidden under every toggle. The fixed list survives only as the fallback for a
  listing git cannot answer for.

Decided by the owner on 2026-10-19, not reopened here:

1. **Git answers, not a matcher.** No ignore-matching library and no new dependency, so no fork.
2. **A separate Show ignored files toggle**, default off, per workspace, in memory. Turned down:
   the parent's open decision 5 recommendation that Show hidden files also reveal ignored
   entries. Dot-entries (`.env`, `.github`) and ignored output (`node_modules`, `coverage`) are
   different questions, and one control would make it impossible to see `.github` without
   `node_modules`.
3. **Hidden by default, dimmed when shown.** Not dimmed-always.
4. **Fail open.** Whenever git cannot answer, both features behave exactly as they do today.
5. **Read-only.** `check-ignore` is the only new git verb; nothing writes to the repository.

## Background

Current behaviour, read at `247dfc0e`.

### Changes watch

- The recursive root watch keeps every path outside `.git`
  ([`changes-watch.ts:214-221`](../../electron/git/changes-watch.ts); the `return true` is
  `:219`). Under `.git`, [`keepsRootGitPath`](../../electron/git/changes-watch.ts) (`:79-89`)
  keeps `index`, `HEAD`, `packed-refs` and `refs/**` minus `*.lock`; `.git/info/exclude` is
  dropped. A null filename counts as a change (`:192-194`). The out-of-root git-dir watch keeps
  `index` and `HEAD` (`:222-228`).
- `touch()` (`:169-179`) arms one 100 ms timer (`EMIT_INTERVAL_MS`, `:29`) on the first kept
  event and absorbs the rest; when it fires it emits `git:changed { root }` once. Nothing
  classifies paths.
- The renderer's scheduler turns each event into a read: 150 ms debounce, 1 s max wait, 1 s
  minimum spacing ([`changes-scheduler.ts:20-22`](../../src/files/changes/changes-scheduler.ts)).
  A read is `rev-parse`, `status` and `diff --numstat`
  ([`changes.ts:356-399`](../../electron/git/changes.ts)). Measured 2026-10-10: 5,000 new files
  under `node_modules/` gave 5,002 watch events in about 0.3 s
  ([changes-list plan](../plans/2026-10-10-changes-list.md), Facts). Each 100 ms window of such a
  burst emits, so a long install reads about once a second although the list cannot change.

### Explorer tree

- [`EXCLUDED_NAMES`](../../src/files/file-tree.ts) (`:34-39`) hides `.git`, `node_modules`,
  `dist` and `target` under every toggle; `isVisible` (`:53-58`) applies it before Show hidden,
  and `isHidden` (`:42-44`) covers dot-entries. Its comment (`:27-33`) says `.gitignore` awareness
  would need a matcher dependency; asking git needs none. Two effects: a tracked `dist/` or
  `target/` can never be shown, and ignored output not on the list (`coverage/`,
  `dist-electron/`) clutters the tree.
- The root row carries five 17px controls
  ([`tree-root-actions.tsx:106-151`](../../src/files/ui/tree-root-actions.tsx)). Show hidden
  files (`:127-134`) calls `toggleHidden`
  ([`file-tree-view.tsx:206-212`](../../src/files/ui/file-tree-view.tsx)), which flips the
  per-workspace `showHidden` and calls `refreshTree`, because the filter decides
  `visibleDirectories` ([`file-surface-store.ts:389-394`](../../src/files/file-surface-store.ts)),
  which is the watch scope ([file-surface.md](../internals/file-surface.md#explorer-and-editor)).
- `list_dir` joins names onto the directory as `assertInsideRoot` canonicalized it
  ([`read.ts:136,152`](../../electron/fs/read.ts)), so row paths are realpath'd while the root key
  keeps the renderer's spelling.
- The reveal walk filters with `isVisible`
  ([`tree-reveal.ts:78-80`](../../src/files/tree-reveal.ts)) and re-arms when hidden files turn
  on ([`use-reveal-active-document.ts:46-54`](../../src/files/ui/use-reveal-active-document.ts)).
  Creating a dotted name turns Show hidden on and says so
  ([`file-surface-controller.ts:508-517`](../../src/files/file-surface-controller.ts)).
- Size limits that shape the design: the controller is 768 lines and
  [`14-dock.css`](../../src/styles/14-dock.css) 779, against the 800-line cap. With a document
  open the list is 2/5 of the dock (`14-dock.css:681`), 144px at DL-19.4's 360px floor.

### What git does (measured 2026-10-19, git 2.51.0, macOS, scratch repositories)

- `git --no-optional-locks check-ignore --stdin -z` prints each ignored input path,
  NUL-separated, spelled as given. Exit 0: some ignored. **Exit 1: none ignored**, not a
  failure. Exit 128: fatal.
- It is index-aware. With `dist/` ignored and `dist/out.js` force-added, neither `dist` nor
  `dist/out.js` is reported, while an untracked `dist/new.js` is.
- Children of an ignored directory are reported (`node_modules/a/b/c.js`). A path re-included
  by `!keep.log` is not.
- **One bad path fails the whole batch** with exit 128, after part of the output: a path
  inside a submodule (`fatal: Pathspec 'sub/gen/g' is in submodule 'sub'`) or one outside the
  work tree (`../x`). Run with `-C` inside the submodule, its own rules apply.
- With `core.ignorecase=true`, `Node_Modules` and `A.LOG` match lowercase patterns.
- With the working directory inside an ignored directory, every name and `.` itself are
  reported.
- `.git/index`'s mtime and size are unchanged after a call. 2,000 paths take 11 ms. Outside a
  repository: exit 128, `not a git repository`.

## Goals

- **G1.** Writes that touch only ignored files do not make Deck run `git status`.
- **G2.** The tree shows what the repository treats as source, by the repository's own rules,
  including tracked folders the fixed list hid.
- **G3.** Ignored entries are one press away and visibly marked as ignored.
- **G4.** Where git cannot answer, nothing changes from today.

## Non-goals

Quick open (the parent's EXP4) and its file set. Staging, committing or any other git write.
The browser tab. What the Changes list shows, its bounds and its scheduler. Any PTY, window,
tab, layout or close/quit module. Any dependency, bundle, signing, release channel, updater or
version change: these are Forks in [AGENTS.md](../../AGENTS.md#forks), and the design needs
none. The rail's repository scan, which is investigated separately (E3). Git status marks on
tree rows. Persisting Show ignored files. Recursive watching on Linux. The scope rules of the
explorer's own non-recursive watch (`watch_paths`).

## Requirements and acceptance criteria

IDs use the `IGN` prefix, like the parent's `CHG` and `EXP`, so they do not collide with
AGENTS.md's repo rules R1–R8.

### Shared classifier

- **IGN1. Git's own rules, read-only.** Main classifies with
  `git --no-optional-locks check-ignore --stdin -z`, spawned as
  [`changes.ts`](../../electron/git/changes.ts) spawns: an argv array, the
  `rev-parse --local-env-vars` names dropped from the environment, `LC_ALL=C`,
  `GIT_TERMINAL_PROMPT=0`, `windowsHide`, a 10 s timeout and a 16 MiB buffer. Paths go on stdin,
  relative to the spawn's working directory, with `/` separators. A path that is absolute or
  holds a `..` segment or a NUL is never sent. A path with a `.git` segment is never sent
  either: one below the top level (a nested clone's `node_modules/dep/.git/HEAD`) takes the
  verdict of the directory holding that segment (`node_modules/dep`), which is sent instead,
  and the root's own `.git` belongs to the watch's rules (IGN5). Exit 1
  means nothing is ignored. Any other non-zero exit, a timeout, an overflow or a failed spawn
  means git gave no answer. Acceptance: tests on temp repositories cover exits 0, 1 and 128, a
  tracked file under an ignore pattern, `!` negation, a nested `.gitignore` and
  `.git/info/exclude`. A test proves `.git/index`'s mtime and size are unchanged by a call. The
  only verb spawned is `check-ignore`.
- **IGN2. Cache with a self-checking generation.** One verdict per absolute path, at most
  20,000, cleared wholesale past the cap. Ignored directories are remembered, at most 256, also
  cleared wholesale; a path under a remembered directory is answered "ignored" without a spawn.
  The cache stays valid only while the stamps (size, mtime, ctime and inode, or absence) of
  these files are unchanged: every `.gitignore` from the checkout's top down to the directory of
  each classified path, the common git directory's `info/exclude`, and the governing git
  directory's `index`. A changed stamp clears everything before the call answers, and a call that was already
  waiting on git when that happened discards its answer and asks again, so a late verdict never
  enters the fresh cache. The stamp and root maps are bounded too (named caps, cleared
  wholesale), and entries are keyed by the governing git directory, so a nested repository that
  is not a submodule never shares a verdict with its outer one. Paths go to git with a `./`
  prefix, so a name such as `:secret` is never read as pathspec magic, and a backslash separates
  only on Windows. **The index is
  stamped because git's answer depends on what is tracked:** after `git add -f` inside a
  remembered ignored directory, that file is no longer ignored. This extends the owner's rule
  that the cache resets on a `.gitignore` or `info/exclude` change. Acceptance: a repeated call
  spawns nothing; after a `.gitignore` edit the next call spawns and returns the new verdict;
  after `git add -f` under a remembered directory the file is reported not ignored; both caps
  clear wholesale.
- **IGN3. An ignored root counts as no repository.** A root that git itself ignores (a folder
  opened inside an ignored part of an enclosing repository, such as a home-directory repository
  that ignores `/*`) gets the fallback in the tree (IGN11) and today's emits in the watch.
  Acceptance: a test with a root inside an ignored directory.
- **IGN4. Repository membership is git's answer.** "Not a repository" means git said so (exit
  128, `not a git repository`), never the rail's scan, which calls a subfolder of a repository
  `plain`. Acceptance: a subfolder of a repository is classified by that repository's rules.

### A. Changes watch

- **IGN5. Emit only for a path that matters.** The recursive root watch collects the paths of
  each 100 ms window and classifies them when the window closes. It emits `git:changed` only if
  at least one path is not ignored. These emit without being classified: a null filename, a
  `.git` path `keepsRootGitPath` keeps, `.git/info/exclude` (newly kept), and every event of the
  out-of-root git-dir watch. A path whose last segment is `.gitignore` emits unless its
  directory is ignored, because git reads no `.gitignore` inside an ignored directory.
  Acceptance, in
  main with a fake `io.watch`, a fake classifier and fake timers: a window of ignored paths
  emits nothing; one non-ignored path among 5,000 ignored emits once; each always-emit path
  emits without a classifier call.
- **IGN6. Fail open.** The window emits as today when the classifier gives no answer, when it
  has not answered within 500 ms, when git does not govern the root (IGN3, IGN4), when the
  window holds more than 10,000 distinct paths, or when the same sender's previous
  classification is still running. A capped window is still classified, so the cache learns its ignored
  directories. Acceptance: a test for each case.
- **IGN7. Latency stays inside CHG3.** A non-ignored write reaches `git:changed` after the
  100 ms window plus classification (measured at about 10–20 ms, capped at 500 ms). The
  unchanged scheduler then debounces 150 ms. The worst case before the read starts is therefore
  about 750 ms, inside CHG3's "about a second". Acceptance: with fake timers, a classifier that
  never answers still produces the emit at 600 ms after the first event; in E2E an edit appears
  in the Changes list within 1 s of the write.
- **IGN8. Outcome.** With the Explorer shown on a fixture repository, creating 5,000 files
  under an ignored `node_modules/` causes no `git:changed` and no `git status` spawn. The
  `check-ignore` spawns stop once the directory is remembered. A `.gitignore` or a nested
  `.git/HEAD` written inside `node_modules/` during the burst does not emit either. Editing a
  tracked file that sits under an ignore pattern still emits. Acceptance: E2E with a logging
  `git` shim.

### B. Explorer tree

- **IGN9.** `.git` is never shown, under any combination of toggles.
- **IGN10. Git's verdict replaces the list.** When git answers for a listing, an entry is
  ignored exactly when git reports it, and the fixed list does not apply. With Show ignored
  files off, ignored entries are hidden. A tracked `dist/` or `target/`, and a directory holding
  a tracked file, are shown. Acceptance: tree-model tests, and controller tests with a fake
  client.
- **IGN11. Fallback.** When git gives no answer for a listing, `node_modules`, `dist` and
  `target` count as ignored in that listing: hidden by default, shown dimmed with the toggle on.
  "No answer" covers not a repository, git missing, a failure or timeout, an ignored root, a
  directory over the 10,000-name cap, and a host without the channel or a rejected call (the
  browser preview). A failed ignore query never reaches the status line or the listing's error
  state. Acceptance: a non-git folder hides `node_modules` and shows it dimmed with the toggle
  on; the browser preview renders the tree with the fixed list.
- **IGN12. Two independent filters.** An entry is shown only when every filter that applies to
  it lets it through. An ignored `.env.local` needs both Show hidden files and Show ignored
  files. Acceptance: tree-model tests for all four combinations.
- **IGN13. The Show ignored files toggle.** A sixth control on the root row, after Show hidden
  files and before Refresh, a 17px square like its siblings. Its accessible name is "Show ignored
  files", and its DL-23.10 tooltip is that name alone. `aria-pressed` carries its state and its
  glyph shows it, with no wash, as for Show hidden files. Its tab stop mirrors the root row's
  roving tabindex like its siblings, and Enter or Space toggles it without toggling the root.
  The state is per workspace, in memory, default off, not persisted and not shared between
  windows. Every toggle re-lists the visible directories through `refreshTree`, because the
  filter is part of the watch scope. Acceptance: component tests for the name, `aria-pressed`,
  tooltip, tab index and keys; a store test for the per-workspace default; off after relaunch in
  E2E.
- **IGN14. Shown ignored entries are dimmed.** At rest the name takes an existing colour token
  (proposed `--text-faint`; [open question 1](#open-questions)), and no token is added. Hover
  and the active-document mark look exactly as on any other row. A dimmed row opens, expands,
  takes focus and is marked exactly like any other row. Acceptance: a component test that the
  row carries the ignored class and the same handlers, and the owner's eye review of the E2E
  screenshots.
- **IGN15. A listing appears once.** The controller waits up to 300 ms for git's answer before
  showing a listing. Past that the listing shows with the previous verdict for that directory,
  or the fallback, and the answer is applied when it lands if that listing is still the current
  one. Acceptance: controller tests with a fake client for an answer inside the budget (one
  store write), a late answer, and a stale one (dropped).
- **IGN16. Rule edits re-evaluate.** A change to a `.gitignore` in a visible directory re-lists
  every visible directory at or under it, within the tree's existing 100 ms coalesce. Refresh
  re-asks for every visible directory. Acceptance: a `tree-refresh` test.
- **IGN17. Creating an ignored name keeps it visible.** Creating an entry git ignores while
  Show ignored files is off turns the toggle on and says so on the status line, as a dotted name
  does for Show hidden files today. When both toggles had to turn on, one message names both.
  Acceptance: a controller test; with `*.log` ignored, creating `debug.log` leaves it focused
  and visible, with "Showing ignored files so debug.log is visible."
- **IGN18. Reveal follows the filter.** A document under an ignored path is neither revealed
  nor marked while Show ignored files is off, and the reveal changes no filter, as DL-19.10 says
  for hidden files. Turning the toggle on re-arms the reveal, as Show hidden files does.
  Acceptance: `tree-reveal` and hook tests.
- **IGN19. The channel.** One new channel, `ignored_paths`, with the flat payload
  `{ root, directory, names }` (R6), registered beside the explorer channels. `root` and
  `directory` go through the path guard as `list_dir`'s do, and a directory outside the root is
  rejected. `names` must be an array of at most 10,000 single path segments (no separator, not
  `.` or `..`, no NUL); anything else is rejected, as `stat_files` rejects a malformed batch. A
  git failure never rejects: the reply is `{ kind: "classified", ignored }` with the ignored
  names, or `{ kind: "unavailable", reason }`. Git runs with the canonical directory as its
  working directory and the names as given, so the realpath'd row paths and the root key never
  meet, and a directory inside a submodule is classified by the submodule's rules. The renderer
  reaches the channel only through [`file-client.ts`](../../src/files/file-client.ts) (R8).
  Acceptance: the contract test pins the keys on both sides; handler tests cover the guard,
  malformed names and the cap.
- **IGN20. It fits the row.** The cluster becomes 107px (six 17px controls and five 1px gaps).
  At the 360px floor, with no document and with a document open (a 144px list), the root row has
  no horizontal overflow and the root's name truncates first. Acceptance: E2E screenshots at
  both widths and the owner's eye review, before the DL-19.9 text is rewritten.

## Edge cases

- **Large batches.** One spawn per batch, on stdin. Over 10,000 names, a listing falls back
  (IGN11) and a watch window fails open (IGN6). Output is bounded by the 16 MiB buffer.
- **Negated patterns** (`!keep.log`): git's answer applies, and a re-included entry shows
  undimmed.
- **Nested `.gitignore`**: git applies it. Stamps cover every `.gitignore` from the checkout
  top to the classified directory; one deeper down cannot affect that directory's entries.
- **Global excludes** (`core.excludesFile`): git applies them, but the file is not stamped. An
  edit to it shows after the cache next clears (another stamped change, a cap, or a restart).
  Accepted.
- **`.git/info/exclude`**: stamped, in the common git directory for a linked worktree, and an
  always-emit path for the watch **when the root holds its `.git` directory**. The tree does not
  watch `.git`, so an edit shows in the tree on the next re-list or Refresh. For a linked
  worktree the file lies outside the root and the git-directory watch listens to `index` and
  `HEAD` only, so the watch does not emit for it; the stamp catches the edit on the next call
  and the list reads on the next event, focus or Refresh. Accepted: no new watcher.
- **Index changes** (`git add -f`, `git rm --cached`): stamped. The watch already emits for the
  index; the tree updates on the next re-list or Refresh, because it does not watch the index.
- **Submodules.** In the tree, a listing inside a submodule is classified by the submodule's
  rules, and the submodule's own directory is tracked and shown. In the watch, a window that
  holds a path inside a submodule makes git fail the batch, so it emits
  ([open question 3](#open-questions)).
- **A nested repository that is not a submodule.** The tree classifies inside it by its own
  rules; the watch classifies its paths by the outer repository's rules, which decide what the
  outer `git status` shows.
- **A linked worktree whose git directory is outside the root.** Classification runs from the
  root. The stamps read `index` from `<repo>/.git/worktrees/<name>/` and `info/exclude` from the
  common directory. The git-dir watch's events always emit, as today; an edit to the common
  directory's `info/exclude` is not among them (see above).
- **Case-insensitive filesystems.** Git's `core.ignorecase` governs matching (measured). Answers
  map back by the exact name sent. Two spellings of one path cost two cache entries, never a
  wrong answer.
- **A path un-ignored by an edit.** In the tree, IGN16 re-lists and the entry reappears
  undimmed. In the watch, the `.gitignore` path emits, and the stamp clears the cache before the
  next batch.
- **A root that is a subfolder of a repository**: classified by the repository's rules, and no
  path outside the root is ever sent.
- **Symlinks** are classified as the link itself; git never follows one for ignore rules. A
  symlink out of the root still renders as a leaf.
- **Deleted paths** are classified by name. A deleted ignored file does not emit. A deleted
  directory matched only by a directory-only pattern (`build/`) is no longer known to be a
  directory and emits: an extra read, never a missed one.
- **Names that are not valid UTF-8** reach JavaScript lossily and may not match git's view;
  they read as not ignored, so they show and emit.
- **Windows.** Separators become `/` before reaching git; the path guard's root rejections are
  unchanged.
- **Git missing.** No answer: the fixed list in the tree, and today's emits in the watch. The
  Changes list's own git-missing message is unchanged.

## Risks

- `--text-faint` is also DL-21.4's disabled tone, so a dimmed row may read as disabled.
  Mitigation: hover and the mark raise it like any row, and it behaves like any row.
- With six controls and a document open at the floor, the root's name keeps about 12px instead
  of about 30px.
- A cold spawn on a very large index costs an index read; the 300 ms and 500 ms budgets bound
  the wait the user can see, and the cache makes repeats free.
- The tree keeps a stale verdict after an index or `info/exclude` edit until the next re-list
  or Refresh.
- A classifier bug could hide a real change from the Changes list. Every error path fails open;
  git never reports a tracked file as ignored; focus, turn end and Refresh still read.
- Stamping adds synchronous `stat` calls in main, bounded by the depth of the directories in
  each call.
- The controller and `14-dock.css` sit near the 800-line cap, so new behaviour goes into new
  modules.

## Open questions

1. **The dimmed tone and DL-3.4.** DL-3.4 lists what `--text-faint` carries: descriptions,
   hints, column headers and disabled states. **Recommended:** read an ignored entry's dim as a
   hint and change no invariant; the DL-19.9 pattern text names the tone. **Answer
   (2026-10-19): as recommended.** If the owner reads the
   list as exhaustive, the alternative is a one-phrase amendment adding "ignored entries" — a
   Part I change, so a fork that needs the owner's approved text. Turned down: `opacity`, which
   creates a tone DL-3.5's contrast floors do not cover, and `--text-muted`, which is already
   the rows' resting tone.
2. **The fallback list counts as ignored.** **Recommended: yes** (IGN11). **Answer
   (2026-10-19): yes.** One model in every
   folder, and today `node_modules` in a non-git folder cannot be shown at all.
3. **Submodule paths in a watch window.** **Recommended:** accept the fail-open emit. **Answer
   (2026-10-19): accepted.** If repos
   with submodules show bursts in practice, the fix is grouping a window by its nearest checkout
   and spawning once per group.
4. **Telling assistive technology a row is ignored.** **Recommended: yes** — **Answer
   (2026-10-19): yes** — a short description
   ("Ignored") on the dimmed row, so the state is not conveyed by colour alone (WCAG 1.4.1).

## Acceptance checklist

| Check                                                                                  | Requirement          | Proof               |
| -------------------------------------------------------------------------------------- | -------------------- | ------------------- |
| Only `check-ignore` is spawned; the index is unchanged; exit 1 reads as none ignored    | IGN1                 | unit                |
| Repeats spawn nothing; `.gitignore`, `info/exclude` and index changes clear the cache  | IGN2                 | unit                |
| An ignored root and a non-repository fall back; a repository subfolder is classified   | IGN3, IGN4           | unit                |
| An all-ignored window emits nothing; always-emit paths skip the classifier             | IGN5                 | unit (fake watch)   |
| Error, budget, cap, in-flight and ungoverned root each emit                            | IGN6                 | unit                |
| Emit by 600 ms when the classifier never answers; an edit is listed within 1 s         | IGN7                 | unit, E2E           |
| 5,000 ignored writes cause no `git status`; a tracked file under a pattern still emits | IGN8                 | E2E (git shim)      |
| `.git` never shown                                                                     | IGN9                 | unit, E2E           |
| Git's verdict hides ignored entries; tracked `dist/`, `target/` are shown              | IGN10                | unit, E2E           |
| No answer: fixed list, dimmed when shown; no status-line noise; browser preview works  | IGN11                | unit, E2E           |
| Hidden and ignored filters combine                                                     | IGN12                | unit                |
| Toggle: name, tooltip, `aria-pressed`, tab stop, keys, per workspace, not persisted    | IGN13                | component, E2E      |
| Ignored rows dimmed, behave like any row                                               | IGN14                | component, eye      |
| Verdict within 300 ms: one write; late: applied; stale: dropped                        | IGN15                | unit                |
| A `.gitignore` edit re-lists the visible directories under it                          | IGN16                | unit, E2E           |
| Creating an ignored name turns the toggle on with a status line                        | IGN17                | unit, E2E           |
| Reveal skips ignored paths while off and re-arms when turned on                        | IGN18                | unit                |
| `ignored_paths { root, directory, names }` pinned; guard, malformed and cap rejected    | IGN19                | contract, unit      |
| No overflow at 360px with and without a document open                                  | IGN20                | E2E, eye            |
