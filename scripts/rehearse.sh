#!/usr/bin/env bash
# T16: rehearse the Checkpoint 1 demo without waiting for Dev 2, and reset between takes.
#
#   scripts/rehearse.sh open [--label]   open the scripted partial-fix PR on the demo repo
#                                        (from a rehearsal/* branch); --label also adds `argus`
#   scripts/rehearse.sh fix <pr>         push the follow-up fix to that PR (triggers re-verify)
#   scripts/rehearse.sh reset <pr>       remove Argus labels, close the PR and delete its branch
#                                        if it's a rehearsal branch, clear its evidence, reset clones
#
# The real take uses Dev 2's fork (scripts/contributor/DEV2.md); reset works for both.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
get() { sed -n "s/^$1=//p" "$ROOT/.env" | head -1; }
REPO="$(get GITHUB_ORG)/$(get DEMO_REPO)"
DEMO="$ROOT/demo/datewise"
PATCHES="$ROOT/scripts/contributor"

worktree_for() {  # worktree_for <branch> <base>: fresh temporary checkout
  local dir; dir="$(mktemp -d)"
  git -C "$DEMO" fetch -q origin
  git -C "$DEMO" worktree add -q -B "$1" "$dir" "$2"
  echo "$dir"
}

cmd_open() {
  local branch="rehearsal/fix-empty-string-$(date +%H%M%S)" dir
  dir="$(worktree_for "$branch" origin/main)"
  git -C "$dir" apply "$PATCHES/fix-empty-string.patch"
  git -C "$dir" commit -qam "Fix crash when parse_date gets empty string" -m "Fixes #1"
  git -C "$dir" push -q -u origin "$branch"
  git -C "$DEMO" worktree remove --force "$dir"
  local url
  url="$(gh pr create --repo "$REPO" --head "$branch" --base main \
        --title "Fix crash when parse_date gets empty string" \
        --body $'Fixes #1.\n\nparse_date("") now raises DateParseError("empty date string") instead of\nleaking an IndexError. Existing tests pass.\n\n_Rehearsal PR opened by scripts/rehearse.sh._')"
  echo "opened $url"
  if [[ "${1:-}" == "--label" ]]; then
    gh pr edit "${url##*/}" --repo "$REPO" --add-label argus >/dev/null && echo "labelled argus"
  fi
}

cmd_fix() {
  local pr="$1" branch dir
  branch="$(gh pr view "$pr" --repo "$REPO" --json headRefName --jq .headRefName)"
  [[ "$branch" == rehearsal/* ]] || { echo "PR #$pr is not a rehearsal PR (branch $branch); Dev 2 pushes the fix to their own fork" >&2; exit 1; }
  dir="$(worktree_for "$branch" "origin/$branch")"
  git -C "$dir" apply "$PATCHES/fix-blank-string.patch"
  git -C "$dir" commit -qam "Treat whitespace-only input as empty too"
  git -C "$dir" push -q origin "$branch"
  git -C "$DEMO" worktree remove --force "$dir"
  git -C "$DEMO" branch -q -D "$branch" 2>/dev/null || true
  echo "pushed the follow-up fix to PR #$pr ($branch)"
}

cmd_reset() {
  local pr="$1" branch state
  read -r branch state < <(gh pr view "$pr" --repo "$REPO" --json headRefName,state --jq '"\(.headRefName) \(.state)"')
  for label in argus verifying changes-needed verified; do
    gh pr edit "$pr" --repo "$REPO" --remove-label "$label" >/dev/null 2>&1 || true
  done
  echo "PR #$pr: Argus labels removed"
  if [[ "$branch" == rehearsal/* ]]; then
    [[ "$state" == OPEN ]] && gh pr close "$pr" --repo "$REPO" --comment "Rehearsal take finished." >/dev/null && echo "PR #$pr: closed"
    gh api -X DELETE "repos/$REPO/git/refs/heads/$branch" >/dev/null 2>&1 && echo "branch $branch: deleted" || true
    git -C "$DEMO" branch -q -D "$branch" 2>/dev/null || true
  fi
  rm -rf "$ROOT/shared/evidence/pr-$pr"
  echo "evidence for PR #$pr: cleared"
  "$ROOT/scripts/setup_workspaces.sh" >/dev/null && echo "agent clones: reset to origin/main"
}

case "${1:-}" in
  open)  cmd_open "${2:-}" ;;
  fix)   [[ -n "${2:-}" ]] || { echo "usage: $0 fix <pr>" >&2; exit 2; }; cmd_fix "$2" ;;
  reset) [[ -n "${2:-}" ]] || { echo "usage: $0 reset <pr>" >&2; exit 2; }; cmd_reset "$2" ;;
  *) sed -n '2,11p' "$0"; exit 2 ;;
esac
