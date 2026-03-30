---
name: rename-worker
description: Performs systematic codebase-wide renames across Convex, React, tests, and shared packages
---

# Rename Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Codebase-wide identifier/table/route renames that touch many files. Requires systematic find-and-replace with verification at each layer.

## Required Skills

None.

## Work Procedure

1. **Read context**: Read the feature description for exact rename mapping. Read AGENTS.md for rename conventions.

2. **Inventory all occurrences**:
   - Use `rg` to find ALL occurrences of the old identifier across the codebase
   - Group by layer: schema, backend functions, backend tests, frontend components, frontend tests, shared packages, specs
   - Count total occurrences per file for progress tracking
   - Exclude auto-generated files (`convex/_generated/`) — these will regenerate

3. **Rename in dependency order** (bottom-up to minimize intermediate breakage):
   a. **Schema** (`convex/schema.ts`) — table names, field names, indexes
   b. **Shared packages** (`packages/shared/`) — Zod schemas, types
   c. **Backend functions** (`convex/*.ts`, excluding tests) — function names, imports, internal references
   d. **Backend tests** (`convex/*.test.ts`) — test helpers, test data, assertions
   e. **Frontend components and pages** (`apps/web/src/`) — component names, imports, route paths, UI labels
   f. **Frontend tests** (`apps/web/src/*.test.*`)
   g. **File renames** — rename files whose names contain the old identifier
   h. **Router** (`apps/web/src/router.tsx`) — route paths, param names
   i. **Sidebar** (`apps/web/src/components/app-sidebar.tsx`) — navigation labels

4. **After each layer**, run:
   - `bun run typecheck` to catch broken imports/references immediately
   - Fix any issues before proceeding to next layer

5. **Verify completeness**:
   - `rg "oldIdentifier" --type ts` should return 0 matches (excluding migration code)
   - `bun run test` — ALL tests pass
   - `bun run typecheck` — clean

6. **Handle Convex schema migration** (if renaming tables with deployed data):
   - The schema rename creates new tables; old table data needs migration
   - For dev deployment: widen (add new tables) -> migrate data -> narrow (remove old tables)
   - Use `bunx convex dev --once` to validate schema changes

## Example Handoff

```json
{
  "salientSummary": "Renamed personaPack -> personaConfig across 60 files (537 occurrences). Schema table personaPacks -> personaConfigs with all FK fields updated. Routes /persona-packs -> /persona-configs. All 471 tests pass, typecheck clean.",
  "whatWasImplemented": "Full rename: schema table + 6 FK fields, 26 backend functions, 30 test files, 8 frontend files, router routes, sidebar label. File renames: personaPacks.ts -> personaConfigs.ts, etc.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {"command": "bun run typecheck", "exitCode": 0, "observation": "No type errors"},
      {"command": "bun run test", "exitCode": 0, "observation": "471 tests passing"},
      {"command": "rg personaPack --type ts", "exitCode": 1, "observation": "0 matches"}
    ],
    "interactiveChecks": []
  },
  "tests": { "added": [], "modified": ["All existing tests updated with new names"] },
  "discoveredIssues": []
}
```

## When to Return to Orchestrator

- Circular import issues that can't be resolved by ordering
- Deployed data migration requires user confirmation
- Third-party package references the old name (can't rename)
