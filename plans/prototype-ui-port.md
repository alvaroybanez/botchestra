# Plan: Prototype UI Port

> Source PRD: https://github.com/alvaroybanez/botchestra/issues/71

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: All existing route paths stay unchanged. All pages require authentication and show the sidebar. The unauthenticated shared report view (`?shared=1`) is removed.
- **Data layer**: Convex queries, mutations, auth guards, RBAC checks, and `validateSearch` functions stay untouched. Only rendering (JSX) changes.
- **Component hierarchy**: `components/ui/` for shadcn primitives, `components/domain/` for app visual vocabulary (PageHeader, StatusBadge, SummaryGrid, etc.), feature folders under `routes/` for page-specific code.
- **CSS tokens**: Hex palette from prototype replaces oklch defaults. Severity tokens added. Geist-only typography (Playfair Display removed).
- **Dependencies**: `motion`, `lucide-react`, and Radix primitives already installed. No new deps needed.
- **Deduplication**: Shared domain components created once, inline copies (`SummaryValue` x7, `SeverityBadge` x2, etc.) removed gradually as each page is rewritten.

### Module structure policy

Split by **reason to change**, not by file count. Same rules, different formation per feature:

- Exported page components → own files
- Pure utilities, types, mappers, validation → `model/` or named files, never a "shared.tsx" junk drawer
- Tab content, dialog flows, panels with own state → separate files when they are real UI concepts (>80-120 LOC, independently testable)
- Tiny one-off helpers (<20 LOC), small markup wrappers → keep inline

Split into a feature folder when: file >800 LOC, >2 exported components, >5 private components, or >5 non-trivial helpers.

---

## Phase 1: Design foundation and cleanup

**User stories**: 22, 23

### What to build

Replace the CSS token system, clean up dead scaffolding code, and consolidate utilities. This phase touches no page rendering but unblocks every subsequent phase.

- Replace the entire `@theme inline` block in `index.css` with the prototype's hex palette, severity tokens, font variables, shadow variables, and font/shadow utility classes
- Add `muted` variant to the Badge primitive
- Remove Playfair Display from `index.html`
- Move `formatTimestamp` and `formatDuration` from `study-shared.tsx` to `lib/utils.ts`; re-export from `study-shared.tsx`
- Delete `skeleton-pages.tsx` entirely; move `DEMO_STUDY_ID` / `DEMO_PACK_ID` to `study-demo-data.ts`
- Delete `RoutePlaceholder`, `RoutePlaceholderProps`, and `contentRoutePlaceholders` from `placeholders.tsx`; keep only `NotFoundPlaceholder`
- Delete the placeholder-count test from `router.test.tsx`

### Acceptance criteria

- [ ] `@theme inline` uses hex values matching `prototype/src/index.css`, including severity tokens with `-foreground` and `-muted` variants
- [ ] Font utilities (`font-heading`, `font-body`, `font-label`) and shadow utilities are defined
- [ ] Badge has a `muted` variant
- [ ] No Playfair Display reference in `index.html`
- [ ] `formatTimestamp` and `formatDuration` importable from `@/lib/utils`
- [ ] `skeleton-pages.tsx` deleted; `DEMO_STUDY_ID` / `DEMO_PACK_ID` in `study-demo-data.ts`
- [ ] `placeholders.tsx` exports only `NotFoundPlaceholder`
- [ ] `bun run typecheck` passes
- [ ] `bun vitest run` full suite passes

---

## Phase 2: Shared domain components

**User stories**: 3, 5, 9, 12

### What to build

Create the reusable visual vocabulary in `components/domain/`. Every subsequent phase consumes these. Each component gets a test file.

- **PageHeader** — eyebrow + title + description + actions slot
- **SummaryValue / SummaryGrid** — animated `<dl>` cards with Framer Motion stagger
- **AnimatedList\<T\>** — generic list with stagger entrance
- **StudyStatusBadge** — map-based lookup rendering semantic Badge variants, pulse indicator for running/replaying
- **RunStatusBadge** — map-based lookup for run outcome statuses
- **SeverityBadge** — blocker/major/minor/cosmetic with severity color tokens
- **ConfigStatusBadge** — draft/published/archived
- **FilterBar / FilterSelect / FilterSearch** — composable filter strip
- **EmptyState** — icon + title + description + optional action CTA

### Acceptance criteria

- [ ] All components render correctly and are importable from `@/components/domain/*`
- [ ] StatusBadge family: every known status maps to correct variant and label; unknown statuses fall back to muted
- [ ] SummaryValue/SummaryGrid: renders `<dl>/<dt>/<dd>` with correct labels and values
- [ ] PageHeader: renders eyebrow, title, description, actions slot
- [ ] FilterBar: FilterSelect fires onChange, FilterSearch fires onChange
- [ ] EmptyState: renders icon, title, description, optional action
- [ ] All tests pass
- [ ] No existing page code is modified in this phase

---

## Phase 3: Studies list + creation wizard

**User stories**: 4, 5, 20

### What to build

First page rewrites. Create `routes/study/` feature folder. Rewrite the studies list page using PageHeader, AnimatedList, StudyStatusBadge, and study cards with progress bars. Rewrite the study creation wizard. Extract study types, mappers, and draft editor into feature folder files. Update router imports. Delete rewritten portions from `study-pages.tsx`.

### Acceptance criteria

- [ ] `routes/study/` feature folder exists with list page, creation wizard, and extracted model/utils
- [ ] Studies list renders study cards with status badges, progress bars, and success rate labels
- [ ] Study creation wizard renders and functions identically to before (form validation, Convex mutation)
- [ ] Router imports updated to point at new files
- [ ] No file in the feature folder exceeds 400 LOC
- [ ] Existing router tests updated and passing
- [ ] `bun run typecheck` and `bun vitest run` pass

---

## Phase 4: Study tabs + overview

**User stories**: 6, 7

### What to build

Create the new `StudyTabs` component with Framer Motion `layoutId` animated indicator and search param forwarding. Rewrite study overview page using PageHeader, SummaryGrid, task spec card, and run config card. Move into `routes/study/`.

### Acceptance criteria

- [ ] `StudyTabs` component renders animated tab bar with active indicator
- [ ] Tab navigation preserves `detailSearch` params across tab switches
- [ ] Study overview displays SummaryGrid (total runs, success rate, active runs, created date)
- [ ] Task spec and run config cards render study metadata
- [ ] Launch/cancel buttons appear based on study status
- [ ] Router tests for study overview updated and passing

---

## Phase 5: Study runs + study personas

**User stories**: 8, 9, 21

### What to build

Rewrite study runs page with master-detail layout, FilterBar (outcome filter + persona name search), RunStatusBadge, and run detail card with failure reasons. Rewrite study personas page with persona variant cards, axis value distributions, and coherence scores. Extract any study model/utils accumulated so far.

### Acceptance criteria

- [ ] Runs page shows filterable run list with master-detail layout
- [ ] Outcome filter and persona search filter runs correctly
- [ ] Selected run detail shows steps, duration, outcome, and failure reason (if applicable)
- [ ] Personas page displays persona variants with axis distributions and coherence scores
- [ ] Both pages use StudyTabs with search param forwarding
- [ ] Inline `SummaryValue` and `StateCard` copies in these files are deleted
- [ ] Tests updated and passing

---

## Phase 6: Study findings + study report

**User stories**: 10, 11, 13

### What to build

Rewrite study findings page with SeverityBadge, severity filter, issue cluster cards (affected runs, replay confidence, impact score, representative quote, recommendation). Rewrite study report page with summary metrics and ranked findings. Remove the unauthenticated shared report layout: delete `isSharedReportLocation`, the sidebar-less layout branch in `router.tsx`, and the `shared` search param from `validateStudyReportSearch`.

### Acceptance criteria

- [ ] Findings page renders issue cluster cards with all fields from prototype
- [ ] Severity filter shows/hides findings by severity level
- [ ] EmptyState shown when no findings match filters
- [ ] Report page renders summary metrics and ranked findings
- [ ] `isSharedReportLocation` and sidebar-less layout branch removed from `router.tsx`
- [ ] `shared` param removed from `StudyReportSearch` type and `validateStudyReportSearch`
- [ ] All pages require authentication — no unauthenticated report access
- [ ] Inline `SeverityBadge` copies deleted from findings and report files
- [ ] Tests updated and passing

---

## Phase 7: Persona configs feature folder

**User stories**: 14, 15

### What to build

Split `persona-config-pages.tsx` (4,378 LOC) into `routes/persona-config/` feature folder. Target ~10-12 files following the module structure policy:

- List page and detail shell as page files
- Each tab (overview, users, axes, transcripts, generation, review) as separate tab files
- Form state as a typed context/hook
- Types, mappers, validation as named model files (not a "shared.tsx")
- Dialogs (import pack, axis library import, transcript attachment, confirmation) as component files
- Transcript extraction panel as its own component

Rewrite all page/tab rendering to use domain components. Update router imports. Delete `persona-config-pages.tsx`.

### Acceptance criteria

- [ ] `routes/persona-config/` feature folder exists
- [ ] `persona-config-pages.tsx` deleted
- [ ] No file exceeds 400-500 LOC
- [ ] Form state shared via typed context, consumed by tabs
- [ ] Types, mappers, validation in separate named files
- [ ] Persona configs list renders config cards with ConfigStatusBadge, version, persona count, axis count
- [ ] Persona config detail renders tabs and all tab content
- [ ] All existing persona config functionality preserved (create, edit, publish, archive, AI axis suggestion, transcript extraction)
- [ ] Router imports updated
- [ ] Tests updated and passing

---

## Phase 8: Transcripts feature folder

**User stories**: 16, 17

### What to build

Split `transcript-pages.tsx` (1,531 LOC) into `routes/transcript/` feature folder. Target ~6-9 files:

- List page and detail page
- Viewer component, metadata panel
- Model/types, formatters, helpers

Rewrite rendering to use domain components. Update router imports. Delete `transcript-pages.tsx`.

### Acceptance criteria

- [ ] `routes/transcript/` feature folder exists
- [ ] `transcript-pages.tsx` deleted
- [ ] No file exceeds 400 LOC
- [ ] Transcripts list renders with PageHeader, AnimatedList
- [ ] Transcript detail renders content viewer, metadata, signal highlights
- [ ] Inline `SummaryValue` copy deleted
- [ ] Router imports updated
- [ ] Tests updated and passing

---

## Phase 9: Remaining pages

**User stories**: 16, 18, 19

### What to build

Rewrite axis-library-page, settings-page, and admin-diagnostics-page using domain components (PageHeader, SummaryGrid, FilterBar, EmptyState as applicable). Extract model/utils per the module policy if any file trips the split thresholds.

### Acceptance criteria

- [ ] Axis library page uses PageHeader, filterable tagged list with domain components
- [ ] Settings page uses PageHeader and domain components
- [ ] Diagnostics page uses PageHeader, SummaryGrid, and domain components
- [ ] Inline `SummaryValue` copies deleted from all three files
- [ ] RBAC checks for settings and diagnostics preserved
- [ ] Existing tests for axis-library and settings pages updated and passing

---

## Phase 10: Final cleanup

**User stories**: 1, 2

### What to build

Verify sidebar matches prototype exactly (it was ported in a previous commit — confirm animation, grouping, tooltips, avatar footer). Remove any remaining dead code: unused imports, orphaned files, leftover inline component definitions. Full regression sweep.

### Acceptance criteria

- [ ] Sidebar animation, collapsed tooltips, grouped navigation, and user avatar footer match prototype
- [ ] No dead monolith files remain (`study-pages.tsx`, `persona-config-pages.tsx`, `transcript-pages.tsx` all deleted)
- [ ] No orphaned inline component definitions (grep for `function SummaryValue`, `function StateCard`, etc. returns zero results outside `components/domain/`)
- [ ] `placeholders.tsx` contains only `NotFoundPlaceholder`
- [ ] `bun run typecheck` passes with zero errors
- [ ] `bun vitest run` full suite passes
- [ ] `bun run build` produces a working bundle
