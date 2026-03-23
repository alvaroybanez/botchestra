---
description: "Run tests, diagnose failures, and fix them"
argument-hint: "[optional: specific test file or pattern]"
---

# /test

## Variables

- `$1` — (Optional) Specific test file or pattern. Defaults to full suite.

## Workflow

1. **Run the test suite**:
   - TypeScript: `bunx vitest run $1` (or full suite if `$1` is empty)
   - Python (if .py test files exist): `pytest -x -v --tb=short $1`

2. **If all tests pass**: Run full quality gates:
   - `bunx tsc --noEmit`
   - `bunx eslint .`
   - Python gates if applicable: `ruff check .`, `mypy --strict`
   - Report PASS and stop.

3. **If tests fail**: For each failing test (max 3 attempts per test):
   a. Read the test file and the source file it tests.
   b. Identify root cause from the traceback. Categorize:
      - **Type error**: Fix types or implementation.
      - **Logic error**: Fix implementation. Do NOT change the test unless the test itself has a bug.
      - **Missing implementation**: Implement the missing function/method.
      - **Test bug**: Only if the assertion is provably wrong against the spec.
   c. Apply the fix.
   d. Re-run the failing test.
   e. If 3 attempts fail on the same test, report it as unresolved and move on.

4. **After all fixes**: Run full suite again.

5. **Commit fixes**: If changes were made and all tests pass:
   `git add -A && git commit -m "fix: resolve test failures"`

## Rules

- Default posture: the test is right, the implementation is wrong.
- Never delete a failing test to make the suite pass.
- After 3 failed attempts on a single test, stop and report.

## Report

```
Suite: <passed>/<total>
Fixed: <count> tests
Unresolved: <count> tests (list names)
Quality gates: PASS | FAIL
```
