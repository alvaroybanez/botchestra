#!/bin/bash
set -e

REPO_ROOT=$(git rev-parse --show-toplevel)

if [ -n "$1" ]; then
  BRANCH="$1"
  WORKTREE_DIR="$REPO_ROOT/trees/${BRANCH//\//-}"
else
  RUN_ID="$(date +%Y%m%d-%H%M%S)"
  BRANCH="ralph/run-${RUN_ID}"
  WORKTREE_DIR="$REPO_ROOT/trees/ralph-${RUN_ID}"
fi

# Count open issues that aren't PRDs
iterations=$(gh issue list --state open --json title --jq '[.[] | select(.title | startswith("PRD:") | not)] | length')

if [ "$iterations" -eq 0 ]; then
  echo "No open slice issues found. Nothing for Ralph to do."
  exit 0
fi

echo "=== Ralph AFK — $iterations slice issues on branch: $BRANCH ==="

# Fetch PRD issue body
prd=$(gh issue list --state open --json title,body --jq '.[] | select(.title | startswith("PRD:")) | .body' | head -1)

# Read the most recently modified plan file
plan_file=$(ls -t "$REPO_ROOT"/plans/*.md 2>/dev/null | head -1)
plan=$(cat "$plan_file" 2>/dev/null || echo "No plan file found")

# Read the prompt template
prompt_template=$(cat "$REPO_ROOT/ralph/prompt.md")

# Set up worktree — reuse existing or create new
existing_worktree=$(git worktree list --porcelain | grep -B2 "branch refs/heads/$BRANCH" | grep "^worktree " | sed 's/^worktree //')
if [ -n "$existing_worktree" ]; then
  WORKTREE_DIR="$existing_worktree"
  echo "Reusing existing worktree at $WORKTREE_DIR"
elif git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git worktree add "$WORKTREE_DIR" "$BRANCH"
else
  git worktree add -b "$BRANCH" "$WORKTREE_DIR" HEAD
fi

# Worktree is kept after run — browse it in your IDE at trees/
# To clean up manually: git worktree remove trees/ralph-<id>

for ((i=1; i<=iterations; i++)); do
  echo ""
  echo "=== Ralph iteration $i/$iterations ==="

  # Refresh context each iteration (picks up prior iteration's commits/closures)
  commits=$(cd "$WORKTREE_DIR" && git log -n 10 --format="- %h %s (%ad)" --date=short 2>/dev/null || echo "No commits found")
  issues=$(gh issue list --state open --json number,title,body --jq '[.[] | select(.title | startswith("PRD:") | not)] | map("Issue #\(.number): \(.title)\n\(.body)") | join("\n---\n")')

  # Build the full prompt as a temp file to avoid shell argument limits
  prompt_file=$(mktemp)
  cat > "$prompt_file" <<PROMPT_EOF
# Context

## PRD
$prd

## Implementation Plan
$plan

## Recent Commits (on this branch)
$commits

## Open GitHub Issues
$issues

---

$prompt_template
PROMPT_EOF

  # Run Claude as autonomous agent in the worktree
  cd "$WORKTREE_DIR"
  set +e
  claude \
    --print \
    --verbose \
    --output-format stream-json \
    --model opus \
    --dangerously-skip-permissions \
    < "$prompt_file" \
  2>&1 | grep --line-buffered '^{' \
  | jq --unbuffered -rj 'select(.type == "assistant").message.content[]? | select(.type == "text").text // empty'
  exit_code=$?
  set -e

  rm -f "$prompt_file"

  # Safety net: if Claude did work but didn't commit, save it
  cd "$WORKTREE_DIR"
  if [ -n "$(git status --porcelain)" ]; then
    echo ""
    echo "--- Claude left uncommitted changes, saving them ---"
    git add -A
    git commit -m "WIP: ralph iteration $i — uncommitted work saved by afk.sh"
  fi
  cd "$REPO_ROOT"

  # Re-check if there are still open issues (Claude may have closed some)
  remaining=$(gh issue list --state open --json title --jq '[.[] | select(.title | startswith("PRD:") | not)] | length')
  if [ "$remaining" -eq 0 ]; then
    echo ""
    echo "=== All issues resolved after $i iterations ==="
    exit 0
  fi

  echo ""
  echo "--- $remaining issues remaining ---"
done

echo "Ralph complete after $iterations iterations."
