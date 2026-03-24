#!/bin/bash
set -e

cd "$(dirname "$0")/.."

# Install dependencies (idempotent)
bun install

# Ensure Convex AI guidelines are up to date (non-blocking)
bunx convex ai-files install 2>/dev/null || true

echo "Environment ready."
