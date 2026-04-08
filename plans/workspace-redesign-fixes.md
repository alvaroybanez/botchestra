# Plan: Workspace Redesign Fixes

> Source PRD: https://github.com/alvaroybanez/botchestra/issues/96

## Architectural decisions

Durable decisions that apply across all phases:

- **Branch**: All work on existing `ralph/run-20260408-120140` branch (worktree at `trees/ralph-20260408-120140/`).
- **Route**: `/persona-configs/$configId` — unchanged.
- **URL state**: Search params validated by `validatePersonaConfigDetailSearch` — `tab`, `selectedUserId`, `selectedTranscriptId`, `selectedGenerationUserId`, `selectedReviewStudyId`, `selectedVariantId`, `forceSuggestAxesError`.
- **History convention**: Tab changes push to history (new entry). In-tab selections (user, transcript, variant) replace the current entry. This diverges from the existing `replace: true` convention on other routes, scoped only to persona config detail.
- **Loading tiers**: Shell tier (config + viewerAccess) renders immediately. Workspace tier handles its own data loading. No change to query call sites — all queries still fire on mount.
- **ErrorBoundary**: Simple class component, no library. Reset on tab change.

---

## Phase 1: History navigation — push for tab switches, replace for selections

**User stories**: 1 (back/forward restores tabs)

### What to build

Change `onSearchChange` in the router so that tab switches push a new history entry while in-tab selection changes continue to replace. The `onSearchChange` callback accepts a patch object — when the patch contains a `tab` key that differs from the current tab, omit `replace: true` so TanStack Router pushes. Otherwise, keep `replace: true`.

### Acceptance criteria

- [ ] Switching tabs pushes a new history entry (back button returns to previous tab).
- [ ] Selecting a user/transcript/variant within a tab replaces the current entry (back button does not cycle through every row click).
- [ ] Deep-linking to a tab via URL still works.
- [ ] Tests verify `navigate` is called without `replace` for tab changes and with `replace: true` for in-tab selections.

---

## Phase 2: Workspace-scoped loading boundaries

**User stories**: 2 (shell visible during load)

### What to build

Split the monolithic loading gate in the detail page into two tiers. The shell tier checks only `config` and `viewerAccess` — once those resolve, the shell, tabs, and summary rail render. Each workspace component receives its data props and renders its own `LoadingCard` when its specific data is still undefined.

### Acceptance criteria

- [ ] Shell, tabs, and summary rail render as soon as `config` and `viewerAccess` are available.
- [ ] Each workspace shows its own loading state when its data props are undefined.
- [ ] The "not found" state still renders when `config === null`.
- [ ] No workspace crashes when receiving undefined data props during loading.
- [ ] Tests verify the shell renders while workspace data is still loading.

---

## Phase 3: ErrorBoundary wrapping

**User stories**: 3 (crash isolation)

### What to build

Create a simple React ErrorBoundary class component and wrap each workspace render slot. When a workspace throws during render, the boundary catches it and shows a workspace-scoped error card with a "Try again" button. The boundary resets when the active tab changes so the user can navigate away and back to retry.

### Acceptance criteria

- [ ] A render error in one workspace does not crash the shell, tabs, summary rail, or other workspaces.
- [ ] The error fallback shows a clear message and a "Try again" button.
- [ ] Switching away from a crashed tab and back resets the error state.
- [ ] Test verifies a throwing workspace renders the fallback without affecting the shell.

---

## Phase 4: ARIA fixes

**User stories**: 4, 5 (screen reader correctness)

### What to build

Fix ARIA semantics across four workspace components:

- **Users and Transcripts workspaces**: Replace `<button role="option">` with `<div role="option" tabIndex={-1}>`. Move the `onClick` handler to the div. Update the keyboard navigation queries accordingly.
- **Generation workspace**: Move `role="grid"` from `<TableBody>` to the `<Table>` element.
- **Review workspace**: Move `role="grid"` from the wrapper `<div>` to the `<table>` element. Add `aria-sort` attributes (`ascending`, `descending`, or `none`) to sortable column headers.

### Acceptance criteria

- [ ] No `<button role="option">` elements remain — list items use `<div role="option">`.
- [ ] `role="grid"` is on `<table>` elements, not on `<tbody>` or wrapper divs.
- [ ] Sortable column headers have `aria-sort` attributes reflecting current sort state.
- [ ] Keyboard navigation still works after the element changes.
- [ ] Tests verify roles are on the correct elements using `getByRole` / `getAllByRole`.

---

## Phase 5: Test and resilience cleanup

**User stories**: 6, 7 (test validity, partial batch failures)

### What to build

Two independent fixes:

1. Replace the vacuous `expect(container).toBeDefined()` assertion with a meaningful check that verifies the loading indicator is actually rendered (e.g., assert the loading card text is present).
2. In the Generation workspace, switch `handleRetryFailed` from `Promise.all` to `Promise.allSettled`. Surface both success count and individual failure reasons in the notice/error state so partial batch failures are distinguishable from total failures.

### Acceptance criteria

- [ ] The previously vacuous test now asserts on actual rendered content (loading card text or element).
- [ ] `handleRetryFailed` uses `Promise.allSettled` and reports partial success/failure counts.
- [ ] A test verifies the partial failure reporting behavior.
