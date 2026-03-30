#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Install dependencies (idempotent)
bun install

# Ensure Convex AI guidelines are up to date (non-blocking)
bunx convex ai-files install 2>/dev/null || true

# Wire OPENAI_API_KEY to Convex deployment if not already set
if [ -f "apps/browser-executor/.dev.vars" ]; then
  OPENAI_KEY=$(grep '^OPENAI_API_KEY=' apps/browser-executor/.dev.vars | cut -d'=' -f2-)
  if [ -n "$OPENAI_KEY" ]; then
    bunx convex env set OPENAI_API_KEY "$OPENAI_KEY" 2>/dev/null || true
  fi
fi

echo "Environment ready."
