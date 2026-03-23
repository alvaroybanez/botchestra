---
description: "Implement a plan file using TDD — tests first, then code"
argument-hint: "<path to plan file>"
---

# /build

## Variables

- `$1` — Path to a plan file (e.g., `plans/20260310-persona-extraction.md`)

## Verification Split

Before building, classify each file in the plan:

| Code type | Verification | Approach |
|---|---|---|
| **Logic**: business rules, algorithms, validations, data transformations, persona generation, analysis clustering | Tests must pass (TDD — test first) | Tracer bullet → RED/GREEN loop |
| **Glue**: UI components, integrations, route handlers, Convex functions that just wire things | Typecheck + lint (tests written after, for important behaviors) | Implement → tsc/eslint → add tests for key behaviors |
| **Config**: schema definitions, config files, styling, barrel exports, type declarations | Typecheck + lint only | Implement → tsc/eslint |

**The principle: agents must always have a verification mechanism. That mechanism isn't always a test.** Forcing TDD on config and glue produces fake tests. Skipping verification on logic produces broken code. Match the tool to the code.

## Workflow

1. **Load plan**: Read `$1` and `CLAUDE.md`. Extract the file list, behaviors to test, and acceptance criteria. Classify each file per the split above.

2. **Verify preconditions**:
   - Plan file exists and has the expected sections
   - `git status` — working tree must be clean. If not, stop and report.

3. **Create branch**: `git checkout -b feat/<slug-from-plan-title>` or `git switch -c feat/<slug-from-plan-title>`

4. **Build LOGIC files (TDD — test first)**:

   a. **Tracer bullet**: Pick the first behavior. Write ONE test that verifies it through the public interface. Run it, confirm it fails (RED). Write minimum code to pass (GREEN). Commit.

   b. **Incremental loop** — for each remaining behavior, one at a time:
      - **RED**: Write ONE test for the next behavior. Describes WHAT, not HOW. Public interface only. Run it — confirm it fails.
      - **GREEN**: Minimum code to make it pass. No speculative features. Run it — confirm it passes.
      - **Commit**: `git add -A && git commit -m "<conventional commit message>"`

   **NEVER write multiple tests before implementing.** That's horizontal slicing — it produces tests that verify imagined behavior instead of actual behavior.

5. **Build GLUE files (implement first, verify after)**:
   - Write the implementation
   - Run `bunx tsc --noEmit` and `bunx eslint .` — fix any errors
   - If the glue has important observable behavior (e.g., a route that transforms data), write tests AFTER for those specific behaviors
   - Commit

6. **Build CONFIG files (typecheck only)**:
   - Write the config/schema/types
   - Run `bunx tsc --noEmit` — fix any errors
   - Commit

7. **Refactor** (only when GREEN — all tests passing):
   - Extract duplication
   - Deepen shallow modules (many small methods → fewer, richer ones)
   - Move logic to where data lives (feature envy)
   - Introduce value objects for primitive obsession
   - Run tests after each refactor step — if any fail, undo and retry
   - Commit: `git add -A && git commit -m "refactor: <what improved>"`

8. **Final validation**: Run all quality gates. All must pass. Fix and re-run if not.

9. **Commit any remaining changes** with `chore: final cleanup`.

## Quality Gates

**TypeScript (always)**:
- `bunx tsc --noEmit`
- `bunx eslint .`
- `bunx vitest run`

**Python (only if .py files exist in the changeset)**:
- `ruff check .`
- `mypy --strict <changed python dirs>`
- `pytest -x -q`

**Convex (if schema changed)**:
- `bunx convex dev --once` or equivalent validation that schema compiles

## Rules

- **Classify first.** Before touching any file, know if it's logic, glue, or config. When in doubt, treat it as logic (require tests).
- **Vertical slices for logic.** One RED→GREEN cycle at a time. Never batch tests.
- **Commit-time hooks enforce verification freshness, not branch completeness.** If each slice has the right passing tests or typechecks, the commit is valid. Completeness checks happen in `/review`.
- **Test behavior, not implementation.** Tests use public interfaces only. If a test breaks on refactor but behavior hasn't changed, the test was wrong. Test names describe WHAT ("user can checkout with valid cart"), not HOW ("checkout calls paymentService.process").
- **Mock only at system boundaries**: LLM providers (via Vercel AI SDK), browser automation, external APIs, time/randomness. Never mock internal modules — if you need to, the interface design is wrong.
- **Never force TDD on glue/config.** Writing `expect(config).toBeDefined()` just to have a test-first is worse than no test. Use the right verification for the code type.
- **Never refactor while RED.** Get to GREEN first, then refactor with confidence.
- One commit per logical unit. Not one giant commit at the end.
- If implementation reveals a gap in the plan, note it in stdout but continue. Don't modify the plan file.
- Max 400 LOC per file. Split in the same commit if exceeded.

## Report

```
Built: <plan file>
Branch: <branch name>
Commits: <count>
Tests: <passed>/<total>
Quality gates: PASS | FAIL (detail)
```
