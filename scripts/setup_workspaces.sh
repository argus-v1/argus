#!/usr/bin/env bash
# T7: give the Triager, Reproducer and Skeptic each their own read-only clone
# of the demo repo, and make sure the shared evidence folder exists.
# Safe to re-run: existing clones are reset to origin/main.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ORG="${GITHUB_ORG:-argus-v1}"
REPO="${DEMO_REPO:-datewise}"
URL="https://github.com/$ORG/$REPO.git"

mkdir -p "$ROOT/shared/evidence"

for role in triager reproducer skeptic; do
  dir="$ROOT/agents/$role/repo"
  if [[ -d "$dir/.git" ]]; then
    git -C "$dir" fetch -q --prune origin
    git -C "$dir" checkout -q --detach origin/main
    git -C "$dir" reset -q --hard origin/main
    git -C "$dir" clean -qfdx
    # drop local pr-* branches from earlier runs
    git -C "$dir" for-each-ref --format='%(refname:short)' 'refs/heads/pr-*' |
      xargs -r git -C "$dir" branch -q -D
    git -C "$dir" checkout -q -B main origin/main
  else
    git clone -q "$URL" "$dir"
  fi
  # Agents read and test; they never push. GitHub writes go through the orchestrator.
  git -C "$dir" remote set-url --push origin no-push://agents-do-not-push
  echo "$role: $(git -C "$dir" log --oneline -1)"
done
