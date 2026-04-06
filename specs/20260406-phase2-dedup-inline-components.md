# Phase 2 -- Deduplicate Inline Components

Replace every inline `SummaryValue`, `StateCard`, `FindingsStateCard`,
`ReviewStateCard`, `SeverityBadge`, `StudyStatusBadge`, and `RunStatusBadge`
with imports from the Phase 1 shared components.

Phase 1 must create the following shared component files before Phase 2 begins:

| Shared component file | Exports |
|---|---|
| `@/components/summary-value` | `SummaryValue` |
| `@/components/state-card` | `StateCard` |
| `@/components/severity-badge` | `SeverityBadge` |
| `@/components/status-badge` | `StudyStatusBadge`, `RunStatusBadge` |
| `@/components/page-header` | `PageHeader` |
| `@/components/filter-bar` | `FilterBar` |

---

## SummaryValue prop-variance audit

Every inline `SummaryValue` accepts `{ label: string; value: string }` but the
rendering varies slightly:

| File | Wrapper element | Extra classes |
|---|---|---|
| study-pages.tsx | `<div class="rounded-lg bg-card/50 p-3">` | `mt-1 text-sm font-medium` on dd |
| study-findings-page.tsx | `<div class="rounded-lg bg-card/50 p-3">` | `mt-1 break-words text-sm font-medium` on dd |
| study-report-page.tsx | `<div class="rounded-lg bg-card/50 p-3">` | `mt-1 break-words text-sm font-medium leading-6` on dd |
| study-runs-page.tsx | `<div class="rounded-lg bg-card/50 p-3">` | `mt-1 break-words text-sm font-medium` on dd |
| study-personas-page.tsx | `<div class="rounded-lg bg-card/50 p-3">` | `mt-1 break-words text-sm font-medium` on dd |
| admin-diagnostics-page.tsx | `<div class="space-y-1">` | **Different layout** -- no bg, no rounding, uses `<p>` not `<dt>/<dd>` |
| transcript-pages.tsx | `<div class="space-y-1">` | **Different layout** -- no bg, uses `<p>` not `<dt>/<dd>`, `text-sm leading-6` |
| persona-variant-review-grid.tsx | `<div class="rounded-lg border bg-background p-4">` | **Different layout** -- adds border, bg-background, larger padding |

**Decision needed for Phase 1**: The shared `SummaryValue` should accept an
optional `variant` prop (e.g. `"card"` (default), `"inline"`, `"bordered"`) or
an optional `className` override. The most common variant (bg-card/50, rounded,
p-3, dt/dd) covers 5 of 8 files. The remaining 3 files use a simpler or
bordered variant.

---

## StateCard prop-variance audit

| File | Props | Notes |
|---|---|---|
| study-pages.tsx L1868-1879 | `{ title: string; body: string }` | Standard Card with CardHeader/CardContent |
| study-runs-page.tsx L580-591 | `{ title: string; body: string }` | Identical to study-pages |
| study-findings-page.tsx L696-713 | `{ title: string; description: string }` | Same Card but prop is `description` not `body` |
| study-report-page.tsx L836-853 | `{ title: string; description: string }` | Same as findings |
| study-personas-page.tsx L348-365 | `{ title: string; description: string }` | Same as findings |
| admin-diagnostics-page.tsx L472-487 | `{ description: string; title: string }` | Uses `CardDescription` instead of `CardContent` -- **unique variant** |

**Decision needed for Phase 1**: The shared `StateCard` should accept
`{ title: string; description: string }` (most common name). The
admin-diagnostics variant that uses `CardDescription` can be handled by an
optional `variant="compact"` prop, or it can keep its own `DiagnosticsStateCard`
locally (since it is unique to that page).

---

## File-by-file checklist

### 1. `study-shared.tsx` (258 LOC -> ~200 LOC)

- [ ] **Delete `StudyStatusBadge`** (lines 157-177, 21 lines)
- [ ] **Delete `RunStatusBadge`** (lines 179-200, 22 lines)
- [ ] **Add re-exports** at top of file:
  ```ts
  export { StudyStatusBadge, RunStatusBadge } from "@/components/status-badge";
  ```
- [ ] **Remove `cn` import** if no other usages remain (only used by the two badges)
- [ ] **Keep untouched**: `StudyTabsNav`, `StudyOverviewLinkButton`, `formatTimestamp`, `formatDuration`, search validators, type exports
- [ ] **Expected LOC reduction**: ~43 lines deleted, +1 re-export line = net ~42 LOC saved

All downstream files already import `StudyStatusBadge` / `RunStatusBadge` from
`@/routes/study-shared`, so the re-export keeps them working without
touching importers. Later, a cleanup pass can point importers directly at
`@/components/status-badge`.

---

### 2. `study-pages.tsx` (2044 LOC -> ~1600 LOC target)

- [ ] **Delete inline `StateCard`** (lines 1868-1879, 12 lines)
  - 6 call sites: lines 105, 229, 598, 607, 1486, 1491
  - Shared `StateCard` must accept `{ title, description }`. The inline version
    uses `body` as the prop name. All 6 call sites must rename `body=` to
    `description=`.
- [ ] **Delete inline `SummaryValue`** (lines 1885-1892, 8 lines)
  - 53 usages throughout the file
  - Inline version uses `mt-1 text-sm font-medium` (no `break-words`). The
    shared component should use the `break-words` variant as default; visual
    diff is negligible.
- [ ] **Add imports**:
  ```ts
  import { StateCard } from "@/components/state-card";
  import { SummaryValue } from "@/components/summary-value";
  ```
- [ ] **Replace header blocks with `PageHeader`**:
  - Study list header (~lines 78-100): breadcrumb + h2 + description + action buttons
  - Study overview header (~lines 540-570): subtitle + h2 + StudyStatusBadge + description + actions
  - Study create header: similar pattern
  - Each header block is ~20-30 lines of JSX. Replacing with `<PageHeader>` saves ~15-25 lines each.
- [ ] **Prop adapter**: Rename `body` -> `description` at all `StateCard` call sites
- [ ] **Expected LOC reduction**: ~20 (StateCard+SummaryValue defs) + ~60 (PageHeader replacements) + ~360 (estimated from overall target) = ~444 lines

---

### 3. `study-findings-page.tsx` (802 LOC -> ~550 LOC target)

- [ ] **Delete inline `SummaryValue`** (lines 667-674, 8 lines)
  - 12 usages across the file
- [ ] **Delete inline `SeverityBadge`** (lines 676-694, 19 lines)
  - 1 call site: line inside FindingCard
  - Inline uses `DemoFinding["severity"]` as the prop type. The shared
    component must accept `string` or the same union type.
- [ ] **Delete inline `FindingsStateCard`** (lines 696-713, 18 lines)
  - 5 call sites: lines 91, 100, 116, 379, 383
  - Props are `{ title, description }` -- matches the shared `StateCard` signature.
    Rename `FindingsStateCard` to `StateCard` at all call sites.
- [ ] **Add imports**:
  ```ts
  import { SummaryValue } from "@/components/summary-value";
  import { SeverityBadge } from "@/components/severity-badge";
  import { StateCard } from "@/components/state-card";
  ```
- [ ] **Replace filter UI with `FilterBar`**:
  - The filter card (lines ~236-360) contains 6 filter controls (severity,
    synthetic user, axis key, axis min, axis max, outcome, URL prefix) plus
    a "Clear filters" button and a showing-count line. If `FilterBar` can
    accept filter definitions declaratively, this block shrinks from ~130 lines
    to ~30.
- [ ] **Replace header block with `PageHeader`** (lines ~213-250): ~25 lines saved
- [ ] **Prop adapter for SeverityBadge**: Inline accepts `severity: DemoFinding["severity"]`.
  Shared component should accept `severity: string` and map colors internally.
- [ ] **Expected LOC reduction**: ~45 (component defs) + ~100 (FilterBar) + ~25 (PageHeader) + ~82 (other) = ~252 lines

---

### 4. `study-report-page.tsx` (948 LOC -> ~700 LOC target)

- [ ] **Delete inline `SummaryValue`** (lines 827-834, 8 lines)
  - 16+ usages across the file (ResolvedStudyReportPage + IssueCard)
- [ ] **Delete inline `SeverityBadge`** (lines 855-869, 15 lines)
  - 1 call site: inside IssueCard
  - Same prop variance as findings-page -- `severity: DemoFinding["severity"]`
- [ ] **Delete inline `ReportStateCard`** (lines 836-853, 18 lines)
  - 4 call sites
  - Props `{ title, description }` match shared `StateCard`
- [ ] **Delete inline `MetricCard`** (lines 818-825, 8 lines)
  - 4 call sites inside headline metrics
  - If the shared `SummaryValue` supports a `variant="metric"` with
    `font-heading text-3xl`, this can be absorbed. Otherwise keep `MetricCard`
    local or create a shared component.
- [ ] **Add imports**:
  ```ts
  import { SummaryValue } from "@/components/summary-value";
  import { SeverityBadge } from "@/components/severity-badge";
  import { StateCard } from "@/components/state-card";
  ```
- [ ] **Replace header block with `PageHeader`**: shared/non-shared header
  inside `ReportShell` (~lines 395-465, ~70 lines of header JSX). Saves ~40 lines.
- [ ] **Prop adapters**: Rename `ReportStateCard` -> `StateCard` at call sites
- [ ] **Expected LOC reduction**: ~49 (component defs) + ~40 (PageHeader) + ~159 (other target) = ~248 lines

---

### 5. `study-runs-page.tsx` (600 LOC -> ~400 LOC target)

- [ ] **Delete inline `SummaryValue`** (lines 571-578, 8 lines)
  - 8 usages (in run list items and RunDetail)
- [ ] **Delete inline `StateCard`** (lines 580-591, 12 lines)
  - 3 call sites: lines loading, not-found, select-a-run
  - Props `{ title, body }` -- rename `body` -> `description` at call sites
- [ ] **Add imports**:
  ```ts
  import { SummaryValue } from "@/components/summary-value";
  import { StateCard } from "@/components/state-card";
  ```
- [ ] **Replace filter card with `FilterBar`**: The filter card (~lines 168-225,
  ~60 lines) contains 4 controls (outcome, persona, URL contains). Saves ~30 lines.
- [ ] **Replace header block with `PageHeader`** (~lines 134-158): ~20 lines saved
- [ ] **Prop adapter**: Rename `body` -> `description` at StateCard call sites
- [ ] **Expected LOC reduction**: ~20 (component defs) + ~50 (FilterBar + PageHeader) + ~130 (other target) = ~200 lines

---

### 6. `study-personas-page.tsx` (389 LOC -> ~280 LOC target)

- [ ] **Delete inline `SummaryValue`** (lines 339-346, 8 lines)
  - 3 usages inside VariantReviewContent
- [ ] **Delete inline `ReviewStateCard`** (lines 348-365, 18 lines)
  - 2 call sites (loading, not-found states)
  - Props `{ title, description }` match shared `StateCard`
- [ ] **Delete local `formatTimestamp`** (lines 367-372, 6 lines)
  - Already imported from `study-shared` at the top of the file but a local copy
    exists. The local version takes `number` (not `number | undefined`). Migrate
    call sites to use the study-shared import.
- [ ] **Add imports**:
  ```ts
  import { SummaryValue } from "@/components/summary-value";
  import { StateCard } from "@/components/state-card";
  ```
  And update `study-shared` import to include `formatTimestamp` (check if already there).
- [ ] **Rename at call sites**: `ReviewStateCard` -> `StateCard`
- [ ] **Replace header block with `PageHeader`** (~lines 250-276): ~20 lines saved
- [ ] **Expected LOC reduction**: ~32 (component defs + formatTimestamp) + ~20 (PageHeader) + ~57 (other target) = ~109 lines

---

### 7. `admin-diagnostics-page.tsx` (543 LOC -> ~400 LOC target)

- [ ] **Delete inline `SummaryValue`** (lines 519-526, 8 lines)
  - 11 usages across the file
  - **IMPORTANT: Different markup** -- uses `<div class="space-y-1">` with `<p>`
    elements instead of the `<dt>/<dd>` card variant. Needs the `variant="inline"`
    or a `className` override in the shared component.
- [ ] **Delete inline `MetricCard`** (lines 510-517, 8 lines)
  - 6 usages in the "Live study health" card
  - Uses `<div class="rounded-lg bg-card/50 p-3">` with `<p>` elements and
    `font-heading text-2xl`. Similar to report-page MetricCard but slightly
    different (text-2xl vs text-3xl, p-3 vs p-4).
- [ ] **Delete inline `DiagnosticsStateCard`** (lines 472-487, 16 lines)
  - 1 call site (loading state)
  - Uses `CardDescription` inside `CardHeader` (no `CardContent`). This is
    unique enough that it can either stay local or the shared `StateCard` can
    accept a `variant="description-only"`.
- [ ] **Add import**:
  ```ts
  import { SummaryValue } from "@/components/summary-value";
  ```
- [ ] **Prop adapter**: Pass `variant="inline"` (or equivalent) to all
  `SummaryValue` usages in this file since the visual style is different.
- [ ] **Replace header block with `PageHeader`** (~lines 92-108): ~15 lines saved
- [ ] **Expected LOC reduction**: ~32 (component defs) + ~15 (PageHeader) + ~96 (other target) = ~143 lines

---

### 8. `transcript-pages.tsx` (1531 LOC)

- [ ] **Delete inline `SummaryValue`** (lines 1330-1337, 8 lines)
  - 11 usages across the file
  - **IMPORTANT: Different markup** -- uses `<div class="space-y-1">` with `<p>`
    elements, same as admin-diagnostics. Needs the `variant="inline"` or
    `className` override.
- [ ] **No `SeverityBadge`** present -- spec was incorrect for this file.
- [ ] **Note**: `ConfigStatusBadge` (lines 1313-1328) is a local status badge
  for persona config status. It is NOT `StudyStatusBadge` or `RunStatusBadge`
  and should remain local (or be added to the shared status-badge module in a
  later phase).
- [ ] **Add import**:
  ```ts
  import { SummaryValue } from "@/components/summary-value";
  ```
- [ ] **Prop adapter**: Pass `variant="inline"` to `SummaryValue` usages.
- [ ] **Expected LOC reduction**: ~8 lines (SummaryValue def only)

---

### 9. `persona-variant-review-grid.tsx` (422 LOC)

- [ ] **Delete inline `SummaryValue`** (lines 378-385, 8 lines)
  - 3 usages (axis anchors: Low/Mid/High)
  - **IMPORTANT: Different markup** -- uses `<div class="rounded-lg border bg-background p-4">`
    with `<dt>/<dd>`. Has border + bg-background + p-4 (vs bg-card/50 + p-3).
    Needs `variant="bordered"` or `className` override.
- [ ] **Add import**:
  ```ts
  import { SummaryValue } from "@/components/summary-value";
  ```
- [ ] **Prop adapter**: Pass `variant="bordered"` (or equivalent) to `SummaryValue`.
- [ ] **Expected LOC reduction**: ~8 lines

---

### 10. `persona-generation-section.tsx` (700 LOC)

- [ ] **No `SummaryValue` present** -- confirmed by search. No action needed.
- [ ] **No `SeverityBadge` present** -- confirmed by search. No action needed.
- [ ] **SKIP this file entirely.**

---

## Execution order

1. **study-shared.tsx** first -- replace badge definitions with re-exports so
   all downstream files keep working
2. **study-findings-page.tsx** and **study-report-page.tsx** -- they have the
   most component types to replace (SummaryValue + SeverityBadge + StateCard)
3. **study-pages.tsx** -- largest file, biggest LOC win
4. **study-runs-page.tsx** and **study-personas-page.tsx** -- medium files
5. **admin-diagnostics-page.tsx** and **transcript-pages.tsx** -- require the
   `variant="inline"` SummaryValue support from Phase 1
6. **persona-variant-review-grid.tsx** -- requires the `variant="bordered"`
   SummaryValue support

Run `bun vitest run` after each file to verify no regressions. The existing
tests in `router.test.tsx`, `settings-page.test.tsx`, and
`axis-library-page.test.tsx` must all pass at every step.

---

## Summary table

| File | Current LOC | Target LOC | Components removed | Imports added |
|---|---|---|---|---|
| study-shared.tsx | 258 | ~216 | StudyStatusBadge, RunStatusBadge | re-export from @/components/status-badge |
| study-pages.tsx | 2044 | ~1600 | StateCard, SummaryValue | StateCard, SummaryValue, PageHeader |
| study-findings-page.tsx | 802 | ~550 | SummaryValue, SeverityBadge, FindingsStateCard | SummaryValue, SeverityBadge, StateCard, FilterBar, PageHeader |
| study-report-page.tsx | 948 | ~700 | SummaryValue, SeverityBadge, ReportStateCard, MetricCard | SummaryValue, SeverityBadge, StateCard, PageHeader |
| study-runs-page.tsx | 600 | ~400 | SummaryValue, StateCard | SummaryValue, StateCard, FilterBar, PageHeader |
| study-personas-page.tsx | 389 | ~280 | SummaryValue, ReviewStateCard, formatTimestamp (local) | SummaryValue, StateCard, PageHeader |
| admin-diagnostics-page.tsx | 543 | ~400 | SummaryValue, MetricCard, DiagnosticsStateCard | SummaryValue (variant="inline"), PageHeader |
| transcript-pages.tsx | 1531 | ~1523 | SummaryValue | SummaryValue (variant="inline") |
| persona-variant-review-grid.tsx | 422 | ~414 | SummaryValue | SummaryValue (variant="bordered") |
| persona-generation-section.tsx | 700 | 700 | -- (SKIP) | -- |
| **Totals** | **8237** | **~6783** | | ~1454 LOC saved |

---

## Phase 1 prerequisites

Before any Phase 2 work begins, the shared components must handle these variants:

1. **SummaryValue** must support at least 3 visual variants:
   - `"card"` (default): `rounded-lg bg-card/50 p-3`, `<dt>/<dd>`
   - `"inline"`: `space-y-1`, `<p>` elements, no background (admin-diagnostics, transcript-pages)
   - `"bordered"`: `rounded-lg border bg-background p-4`, `<dt>/<dd>` (persona-variant-review-grid)

2. **StateCard** must accept `{ title: string; description: string }` and
   render Card > CardHeader > CardTitle + CardContent > p.

3. **SeverityBadge** must accept `severity: string` (not a narrow type tied to
   DemoFinding).

4. **StudyStatusBadge / RunStatusBadge** must match the current implementations
   in study-shared.tsx exactly.

5. **PageHeader** and **FilterBar** specs are TBD based on the repeating
   patterns identified above.

---

## Prop rename map

| File | Old prop | New prop | Component |
|---|---|---|---|
| study-pages.tsx (6 sites) | `body` | `description` | StateCard |
| study-runs-page.tsx (3 sites) | `body` | `description` | StateCard |
| study-findings-page.tsx | (already `description`) | -- | StateCard (was FindingsStateCard) |
| study-report-page.tsx | (already `description`) | -- | StateCard (was ReportStateCard) |
| study-personas-page.tsx | (already `description`) | -- | StateCard (was ReviewStateCard) |
