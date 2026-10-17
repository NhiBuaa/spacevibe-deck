#!/bin/sh
# Where main stands against origin/main, before a push or a rebase: dirty files,
# the last commits, and how far each side has moved. Read-only.
set -eu

git fetch -q origin
git status --porcelain
git log --oneline -3
echo "behind/ahead of origin/main: $(git rev-list --left-right --count origin/main...HEAD)"
