---
description: "Create a plan file from a feature description or issue"
argument-hint: "<feature description or issue URL>"
---

# /plan

## Variables

- `$1` — Feature description, issue text, or path to a spec file

## Workflow

1. **Read context**: Load `CLAUDE.md` to understand stack, domain types, and guardrails.

2. **Understand scope**: Parse `$1` to identify which domain types and modules are affected. If `$1` references a file, read it.

3. **Map the change**:
   - Which Convex schema tables need creation or modification?
   - Which Convex functions (queries/mutations/actions) are affected?
   - Which frontend components need creation or updates?
   - Which test files need creation or updates?
   - Is Python involved? (browser automation, ML clustering) — if so, note explicitly.

4. **Write the plan**: Create `specs/<timestamp>-<slug>.md` with this structure:
   ```
   # Plan: <title>
   ## Goal
   <one sentence>
   ## Files to Create/Modify
   <table: file path | action (create/modify) | what changes>
   ## Test Strategy
   <what tests to write FIRST, before implementation>
   ## Acceptance Criteria
   <numbered list of verifiable conditions>
   ## Risks
   <anything non-obvious>
   ```

5. **Validate the plan**:
   - Every file maps to the project structure
   - Test files listed BEFORE their corresponding implementation files
   - No file exceeds 400 LOC after the change
   - Convex schema changes are backward-compatible or migration path is noted

## Report

Print the path to the created plan file. Nothing else.
