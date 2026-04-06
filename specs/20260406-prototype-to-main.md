# Plan: Adopt Prototype Component Architecture into Main App

## Goal

Extract duplicated inline components (SummaryValue, StatusBadge, FilterBar, EmptyState, PageHeader, AnimatedList) into shared modules, then split the 5 oversized route files (persona-config-pages 4507 LOC, study-pages 2044, transcript-pages 1531, settings-page 1133, axis-library-page 970) into focused files under 400 LOC each.

## Phases

This is a pure frontend refactor — zero Convex schema or backend changes. No new features. Split into 4 phases to keep each PR reviewable.

### Phase 1: Extract shared domain components

| File path | Action | What changes |
|---|---|---|
| `apps/web/src/components/summary-value.tsx` | Create | `SummaryValue` + `SummaryGrid` — animated `<dl>` with stagger. Replaces 9 inline copies. |
| `apps/web/src/components/status-badge.tsx` | Create | `StudyStatusBadge`, `RunStatusBadge`, `SeverityBadge`, `ConfigStatusBadge` using map lookups. Replaces inline badge logic in `study-shared.tsx`, `study-findings-page.tsx`, `study-report-page.tsx`, `transcript-pages.tsx`. |
| `apps/web/src/components/filter-bar.tsx` | Create | `FilterBar`, `FilterSelect`, `FilterSearch` composables. Replaces ad-hoc filter UI in runs, findings, axis library. |
| `apps/web/src/components/page-header.tsx` | Create | `PageHeader` (eyebrow + title + description + actions slot). Replaces repeated header pattern across all pages. |
| `apps/web/src/components/animated-list.tsx` | Create | Generic `AnimatedList<T>` with stagger. Replaces copy-pasted `motion.div` + `delay: i * 0.04` in every list page. |
| `apps/web/src/components/empty-state.tsx` | Create | `EmptyState` (icon + title + description + action). Replaces inline empty-state divs. |
| `apps/web/src/components/summary-value.test.tsx` | Create | Render test: correct labels, values, stagger delay props. |
| `apps/web/src/components/status-badge.test.tsx` | Create | Snapshot tests: each status string maps to correct variant + label. |

### Phase 2: Deduplicate inline components in route files

Replace every inline `SummaryValue`, `StateCard`, `FindingsStateCard`, `ReviewStateCard`, `SeverityBadge`, and `StudyStatusBadge`/`RunStatusBadge` with imports from Phase 1.

| File path | Action | What changes |
|---|---|---|
| `apps/web/src/routes/study-shared.tsx` | Modify | Remove `StudyStatusBadge`, `RunStatusBadge` definitions. Re-export from `@/components/status-badge`. Keep `StudyTabsNav`, `formatTimestamp`, `formatDuration`, search validators. |
| `apps/web/src/routes/study-pages.tsx` | Modify | Replace inline `StateCard`, `SummaryValue` with imports. Replace header blocks with `PageHeader`. Target: ~1600 LOC (from 2044). |
| `apps/web/src/routes/study-findings-page.tsx` | Modify | Replace `SeverityBadge`, `SummaryValue`, `FindingsStateCard` with imports. Replace filter UI with `FilterBar` composables. Target: ~550 LOC (from 802). |
| `apps/web/src/routes/study-report-page.tsx` | Modify | Replace `SeverityBadge`, `SummaryValue` with imports. Target: ~700 LOC (from 948). |
| `apps/web/src/routes/study-runs-page.tsx` | Modify | Replace `SummaryValue`, `StateCard`, filter UI with imports. Target: ~400 LOC (from 600). |
| `apps/web/src/routes/study-personas-page.tsx` | Modify | Replace `SummaryValue`, `StateCard` with imports. Target: ~280 LOC (from 389). |
| `apps/web/src/routes/admin-diagnostics-page.tsx` | Modify | Replace `SummaryValue` with import. Target: ~400 LOC (from 543). |
| `apps/web/src/routes/transcript-pages.tsx` | Modify | Replace `SummaryValue`, `SeverityBadge` with imports. (This file also needs splitting in Phase 3.) |
| `apps/web/src/components/persona-variant-review-grid.tsx` | Modify | Replace inline `SummaryValue` with import. |
| `apps/web/src/components/persona-generation-section.tsx` | Modify | Replace inline `SummaryValue` with import if present. |

### Phase 3: Split oversized route files

| File path | Action | What changes |
|---|---|---|
| **persona-config-pages.tsx (4507 LOC) split into:** | | |
| `apps/web/src/routes/persona-configs-list.tsx` | Create | `PersonaConfigsPage` — list with status badges, create/archive/publish. ~200 LOC. |
| `apps/web/src/routes/persona-config-detail.tsx` | Create | `PersonaConfigDetailPage` — wrapper with tabs. ~150 LOC. |
| `apps/web/src/routes/persona-config-overview-tab.tsx` | Create | Config metadata, status card. ~200 LOC. |
| `apps/web/src/routes/persona-config-users-tab.tsx` | Create | Synthetic user management, inline creation. ~400 LOC. |
| `apps/web/src/routes/persona-config-transcripts-tab.tsx` | Create | Transcript attachments, signal extraction. ~350 LOC. |
| `apps/web/src/routes/persona-config-axes-tab.tsx` | Create | Shared axes editor, AI-suggested axes. ~350 LOC. |
| `apps/web/src/routes/persona-config-generation-tab.tsx` | Create | Batch generation UI (currently in `PersonaGenerationSection`). ~150 LOC (delegates to component). |
| `apps/web/src/routes/persona-config-review-tab.tsx` | Create | Variant review grid wrapper. ~100 LOC (delegates to component). |
| `apps/web/src/routes/persona-config-shared.tsx` | Create | Shared types, helpers, context for config detail tabs. ~150 LOC. |
| `apps/web/src/routes/persona-config-pages.tsx` | Delete | Replaced by the above files. |
| **transcript-pages.tsx (1531 LOC) split into:** | | |
| `apps/web/src/routes/transcripts-list.tsx` | Create | `TranscriptsPage` — upload, filter, list. ~300 LOC. |
| `apps/web/src/routes/transcript-detail.tsx` | Create | `TranscriptDetailPage` — content viewer, metadata form, signal highlights. ~400 LOC. |
| `apps/web/src/routes/transcript-pages.tsx` | Delete | Replaced by the above. |
| **study-pages.tsx (2044 LOC) split into:** | | |
| `apps/web/src/routes/studies-list.tsx` | Create | `StudiesListPage` — study cards, create CTA. ~200 LOC. |
| `apps/web/src/routes/study-new.tsx` | Create | `StudyCreationWizardPage` — form. ~400 LOC. |
| `apps/web/src/routes/study-overview.tsx` | Create | `StudyOverviewPage` — summary, task spec, run config, launch/cancel. ~400 LOC. |
| `apps/web/src/routes/study-pages.tsx` | Delete | Replaced by the above. |

### Phase 4: Update router and clean up dead code

| File path | Action | What changes |
|---|---|---|
| `apps/web/src/router.tsx` | Modify | Update imports to point to new split files. Remove old single-file imports. No route path changes — same URLs. |
| `apps/web/src/routes/skeleton-pages.tsx` | Modify | Remove dead skeleton page components (`StudiesSkeletonPage`, etc.). Keep `DEMO_STUDY_ID` and `DEMO_PACK_ID` exports only. |
| `apps/web/src/routes/placeholders.tsx` | Modify | Remove any components now superseded by `EmptyState`. |
| `apps/web/src/index.css` | Modify | Add `--color-severity-blocker`, `--color-severity-major`, `--color-severity-minor`, `--color-severity-cosmetic` tokens (used by `SeverityBadge`). |

## Test Strategy

Tests written FIRST, before each implementation step:

1. **Phase 1 tests** (before creating shared components):
   - `apps/web/src/components/summary-value.test.tsx` — renders label, value, detail; accepts index for stagger
   - `apps/web/src/components/status-badge.test.tsx` — each status string renders correct variant and label; unknown status falls back to muted

2. **Phase 2 tests** (before deduplication):
   - Run existing `axis-library-page.test.tsx` and `settings-page.test.tsx` as regression after each file edit
   - Run `router.test.tsx` to verify no routes break

3. **Phase 3 tests** (before splitting files):
   - `apps/web/src/routes/persona-configs-list.test.tsx` — list renders, status badges appear, create button present
   - `apps/web/src/routes/studies-list.test.tsx` — study cards render, progress bars, create CTA
   - Run full test suite after each file split to catch broken imports

4. **Phase 4 tests**:
   - `apps/web/src/router.test.tsx` — verify all routes still resolve after import changes
   - Full `bun run typecheck` to catch any dangling references

## Acceptance Criteria

1. Zero new features — identical user-facing behavior before and after
2. `SummaryValue` is defined in exactly 1 file and imported everywhere (currently 9 copies)
3. `SeverityBadge` is defined in exactly 1 file (currently 2+ copies)
4. `StudyStatusBadge` / `RunStatusBadge` are defined in exactly 1 file (currently in `study-shared.tsx` + inlined elsewhere)
5. No route file exceeds 400 LOC (currently: persona-config-pages 4507, study-pages 2044, transcript-pages 1531, settings-page 1133)
6. All existing tests pass without modification (except import path updates)
7. `bun run typecheck` passes with zero errors
8. `bun run build` produces a working bundle
9. No `(api as any)` casts are introduced or increased
10. Severity color tokens are in `index.css` instead of hardcoded hex values

## Risks

- **persona-config-pages.tsx is 4507 LOC**: Splitting this requires understanding the implicit state shared between its ~15 inline components. The `persona-config-shared.tsx` file must capture that shared context correctly. Read the entire file before splitting.
- **Demo data coupling**: `study-pages.tsx` checks `studyId === DEMO_STUDY_ID` inline. When splitting, each new file needs the same conditional. Consider a `useStudyData(studyId)` hook that returns demo or live data transparently.
- **Import chains**: Several route files import from `study-shared.tsx`. Phase 2 re-exports from there to avoid changing downstream imports, but Phase 4 should audit whether direct imports from `@/components/status-badge` would be cleaner.
- **Animation storyboards**: The prototype uses explicit `TIMING` config objects at file top. The current app has similar patterns in some files but not all. Phase 2 should add storyboard comments where missing, but NOT change any actual animation values — behavior must stay identical.
- **Test file naming**: Current tests use `*.test.tsx` co-located in `routes/`. New shared component tests should go in `components/` following the same pattern.
