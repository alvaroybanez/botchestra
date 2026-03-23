---
description: "Review current branch against its plan file and project spec"
argument-hint: "<path to plan file>"
---

# /review

## Variables

- `$1` — Path to the plan file this branch implements

## Workflow

1. **Load context**: Read `$1` (plan), `CLAUDE.md` (project rules), and the git diff:
   ```
   git diff main --stat
   git diff main --name-only
   ```

2. **Completeness check**: For every file in the plan's "Files to Create/Modify" table:
   - Verify the file exists (creates) or was modified (modifications)
   - Flag any planned file missing from the diff

3. **Acceptance criteria check**: For each criterion in the plan:
   - State: MET, PARTIALLY MET, or NOT MET
   - Provide evidence (test name, code location, or observation)

4. **Code quality scan**:
   - `bunx tsc --noEmit`
   - `bunx eslint .`
   - `bunx vitest run`
   - Python gates if applicable: `ruff check .`, `mypy --strict`, `pytest -x -q`
   - Check no file exceeds 400 LOC: `find . -name '*.ts' -o -name '*.tsx' -o -name '*.py' | xargs wc -l | sort -rn | head -20`

5. **Spec drift check**: Read changed files and verify:
   - Domain types match the entities defined in CLAUDE.md
   - Convex schema matches domain types
   - Production guardrails intact (whitelist enforcement, immutable transcripts)
   - Provenance chains intact (IssueCluster → AgentRun → PersonaVariant → ProtoPersona)
   - Vercel AI SDK used for all LLM calls (no raw provider SDKs)

6. **Test quality scan**: Review test files in the changeset. This is where completeness checks live.

   **Per-test-file smells**:
   - Tests mock internal modules instead of system boundaries → BLOCKER
   - Tests assert on call counts or order of internal functions → WARNING
   - Tests verify through external means (DB queries, direct internals) instead of public interface → WARNING
   - Tests describe HOW, not WHAT, in test names or assertions → WARNING

   **Branch-level completeness**:
   - Every logic test file has at least one error, edge, or boundary case test → WARNING if missing
   - Logic test files are at least 60% the line count of their implementation → WARNING if thin
   - Shallow module pattern: many exported functions with thin implementations → NOTE

7. **Categorize findings**:
   - **BLOCKER**: Must fix before merge (failing tests, type errors, missing guardrails, spec drift, internal mocking)
   - **WARNING**: Should fix (style violations, missing edge case tests, borderline LOC, implementation-coupled tests)
   - **NOTE**: Optional improvement (naming, refactor opportunities, shallow modules)

## Report

```
Plan: <plan file>
Branch: <branch name>
Commits: <count>

## Completeness
<table: planned file | status>

## Acceptance Criteria
<table: criterion | MET/PARTIAL/NOT MET | evidence>

## Quality Gates
TypeScript: PASS/FAIL
ESLint: PASS/FAIL
Tests: <passed>/<total>
LOC max: <largest file and line count>

## Test Completeness
<table: test file | error path coverage (✓/✗) | ratio vs impl | smells found>

## Issues
### Blockers (<count>)
- <issue>

### Warnings (<count>)
- <issue>

### Notes (<count>)
- <issue>

## Verdict: READY | NEEDS WORK
```
