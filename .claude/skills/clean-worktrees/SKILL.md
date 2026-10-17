---
name: clean-worktrees
description: Report which git worktrees and local branches of this repo are safe to remove, then remove only the rows the owner confirms. Use when the owner asks to clean or prune worktrees or branches, or `git worktree list` shows more than the three-worktree limit. Not for creating worktrees, merging, or deleting `backup/*` branches.
---

# Clean worktrees

The limit is in [AGENTS.md](../../../AGENTS.md#sessions-and-checkouts): at most three worktrees
alive. This skill reports first and removes only what the owner confirms, row by row. Run all
git commands from the primary checkout and read plans there by absolute path.

## Step 1: report only

No git write command in this step. For every worktree in `git worktree list --porcelain`,
except the primary checkout, collect:

| Column | How |
| --- | --- |
| Path, branch or `detached` | porcelain output |
| Last commit date | `git log -1 --format=%cs <head>` |
| In `main` / `origin/main` | `git merge-base --is-ancestor <head> main` (and `origin/main`); exit 0 = merged |
| Dirty | `git -C <path> status --porcelain` is non-empty |
| Unpushed | `git rev-list <head> --not --remotes` is non-empty |
| Detached, orphaned | `git branch -a --contains <head>` is empty |
| Live process | processes whose cwd is inside the path: `lsof -a -d cwd -Fpn` or `pgrep`, filtered by path prefix. Never `lsof +D` (slow) |
| Named by a plan | `grep -rl` the path and the branch name in the primary checkout's `docs/plans/` |

Then list local branches that have no worktree, with the same merged and unpushed columns.
`backup/*` branches are left out of the table; report only their count.

Print one table and propose a verdict per row:

- `remove`: merged into `origin/main`, clean, nothing unpushed, no process, not detached-orphaned.
- `keep (reason)`: name the reason, for example dirty, unpushed, live process, open plan.
- `ask`: any other case, such as merged into local `main` only, or a plan still names it.

Never propose `remove` for: the primary checkout, a dirty worktree, one with unpushed or
unreachable commits, one with a live process, or a `backup/*` branch.

End the report with two lines:

- `Not checked:` each column that could not be computed, and why.
- `Skill gaps:` edits you would make to this skill. Suggest only; do not edit it.

Stop here until the owner replies.

## Step 2: remove the confirmed rows

Only rows the owner named. Re-run the dirty, unpushed and process checks on each one first; the
state may have changed since the report.

1. `git worktree remove <path>`. No `--force`.
2. `git branch -d <branch>`. Never `-D`; if `-d` refuses, report that and leave the branch.

If any command fails or times out, stop. Report `git worktree list` and whether the directory
still exists. Do not retry, do not force, do not clean up the half-done state: a timed-out
worktree command is not a rollback (see [traps](../../../docs/internals/traps.md#data-and-contracts)).

## After removals

Run `git worktree prune --dry-run` and show its output. Run `git worktree prune` only if the
owner agrees. Finish by showing `git worktree list` and the count against the limit.
