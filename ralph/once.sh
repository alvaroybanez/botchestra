#!/bin/bash
set -e

REPO_ROOT=$(git rev-parse --show-toplevel)
branch="ralph/once-$(date +%Y%m%d-%H%M%S)"
worktree_dir="/tmp/ralph-worktree-$$"

echo "=== Ralph once — branch: $branch ==="

# Create worktree on a new branch from current HEAD
git worktree add -b "$branch" "$worktree_dir" HEAD

# Gather context
commits=$(git log -n 5 --format="%H%n%ad%n%B---" --date=short 2>/dev/null || echo "No commits found")
issues=$(gh issue list --state open --json number,title,body,comments --jq '[.[] | select(.title | startswith("PRD:") | not)]')
prd=$(gh issue list --state open --json title,body --jq '.[] | select(.title | startswith("PRD:")) | .body' | head -1)
plan=$(cat "$REPO_ROOT/plans/persona-config-detail-experience-redesign.md" 2>/dev/null || echo "No plan file found")
prompt=$(cat "$REPO_ROOT/ralph/prompt.md")

# Run claude in the worktree
cd "$worktree_dir"
claude --permission-mode acceptEdits \
  "PRD: $prd Plan: $plan Previous commits: $commits GitHub Issues: $issues $prompt"

# Return and clean up
cd "$REPO_ROOT"
git worktree remove "$worktree_dir" --force 2>/dev/null || rm -rf "$worktree_dir"
