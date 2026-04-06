# Phase 4 -- Update router and clean up dead code

Depends on Phase 3 (file splits) being complete before execution.

---

## 1. Router import updates (`apps/web/src/router.tsx`)

Phase 3 will extract page components from the three monolithic files into individual modules.
The router must switch its imports to point at the new split files.
No route paths, `validateSearch`, or component wiring changes -- only the `import` lines at the top of the file.

### 1a. Study pages (lines 24-27)

**Old (lines 24-27):**
```ts
import {
  StudiesListPage as StudiesRoutePage,
  StudyCreationWizardPage as StudyCreationWizardRoutePage,
  StudyOverviewPage as StudyOverviewRoutePage,
} from "@/routes/study-pages";
```

**New (three separate imports):**
```ts
import { StudiesListPage as StudiesRoutePage } from "@/routes/studies-list";
import { StudyCreationWizardPage as StudyCreationWizardRoutePage } from "@/routes/study-new";
import { StudyOverviewPage as StudyOverviewRoutePage } from "@/routes/study-overview";
```

> `study-findings-page`, `study-personas-page`, `study-report-page`, `study-runs-page`
> already have their own files -- no import changes needed for those.

### 1b. Persona config pages (lines 19-22)

**Old (lines 19-22):**
```ts
import {
  PersonaConfigDetailPage as PersonaConfigDetailRoutePage,
  PersonaConfigsPage as PersonaConfigsRoutePage,
} from "@/routes/persona-config-pages";
```

**New (two separate imports):**
```ts
import { PersonaConfigDetailPage as PersonaConfigDetailRoutePage } from "@/routes/persona-config-detail";
import { PersonaConfigsPage as PersonaConfigsRoutePage } from "@/routes/persona-configs-list";
```

### 1c. Transcript pages (lines 38-41)

**Old (lines 38-41):**
```ts
import {
  TranscriptDetailPage as TranscriptDetailRoutePage,
  TranscriptsPage as TranscriptsRoutePage,
} from "@/routes/transcript-pages";
```

**New (two separate imports):**
```ts
import { TranscriptDetailPage as TranscriptDetailRoutePage } from "@/routes/transcript-detail";
import { TranscriptsPage as TranscriptsRoutePage } from "@/routes/transcripts-list";
```

### 1d. Unchanged imports (no action needed)

These already point at single-file modules and stay as-is:

| Line | Import |
|------|--------|
| 15 | `AdminDiagnosticsPage` from `@/routes/admin-diagnostics-page` |
| 16 | `AxisLibraryPage` from `@/routes/axis-library-page` |
| 17 | `LoginPage` from `@/routes/login` |
| 18 | `NotFoundPlaceholder` from `@/routes/placeholders` |
| 28 | `StudyFindingsPage` from `@/routes/study-findings-page` |
| 29 | `StudyPersonasPage` from `@/routes/study-personas-page` |
| 30 | `StudyReportPage` from `@/routes/study-report-page` |
| 31 | `StudyRunsPage` from `@/routes/study-runs-page` |
| 32 | `SettingsPage` from `@/routes/settings-page` |
| 33-36 | `validateStudyDetailSearch`, `validateStudyReportSearch` from `@/routes/study-shared` |
| 37 | `SignupPage` from `@/routes/signup` |

---

## 2. Skeleton pages cleanup (`apps/web/src/routes/skeleton-pages.tsx`)

### What to keep

| Export | Reason | Consumers |
|--------|--------|-----------|
| `DEMO_STUDY_ID` | Used by 6 files | `study-demo-data.ts`, `study-pages.tsx`, `study-findings-page.tsx`, `study-personas-page.tsx`, `study-report-page.tsx`, `study-runs-page.tsx` |
| `DEMO_PACK_ID` | Used by `skeleton-pages.tsx` itself (demo config link) -- but also referenced indirectly | Keep for now; only internal usage but shared constant |

### What to remove

Every skeleton component is only referenced inside `skeleton-pages.tsx` itself -- zero external consumers:

| Component | Lines | Status |
|-----------|-------|--------|
| `StudiesSkeletonPage` | 41-121 | Dead -- remove |
| `StudiesNewSkeletonPage` | 123-130 | Dead -- remove |
| `StudyDetailSkeletonPage` | 132-207 | Dead -- remove |
| `PersonaConfigsSkeletonPage` | 209-251 | Dead -- remove |
| `PersonaConfigDetailSkeletonPage` | 253-261 | Dead -- remove |
| `SettingsSkeletonPage` | 263-269 | Dead -- remove |
| `RouteDetailsCard` (private) | 271-307 | Dead (only used by skeletons) -- remove |
| `withoutKey` (private) | 309-313 | Dead (only used by skeletons) -- remove |
| `studyTabs` (const) | 12-39 | Dead (only used by `StudyDetailSkeletonPage`) -- remove |

### Resulting file

After cleanup, `skeleton-pages.tsx` becomes a tiny constants-only file:

```ts
export const DEMO_STUDY_ID = "demo-study" as const;
export const DEMO_PACK_ID = "demo-config" as const;
```

Remove all other imports at the top of the file:
- `Link` from `@tanstack/react-router` -- dead
- `cn` from `@/lib/utils` -- dead
- `Button` from `@/components/ui/button` -- dead
- `contentRoutePlaceholders`, `RoutePlaceholder` from `@/routes/placeholders` -- dead
- `emptyStudyDetailSearch` from `@/routes/study-shared` -- dead

---

## 3. Placeholders cleanup (`apps/web/src/routes/placeholders.tsx`)

### Current exports and consumers

| Export | Consumers |
|--------|-----------|
| `contentRoutePlaceholders` | `router.test.tsx` (line 18, used in placeholder-count test at line 961), `skeleton-pages.tsx` (dead after step 2) |
| `RoutePlaceholder` | `skeleton-pages.tsx` only (dead after step 2) |
| `NotFoundPlaceholder` | `router.tsx` (line 18, line 318), `transcript-pages.tsx` (line 6, line 821) |

### Decision

After Phase 3 + the skeleton cleanup above, only two references survive:

1. `NotFoundPlaceholder` -- still used by router.tsx and transcript-pages.tsx. **Keep.**
2. `contentRoutePlaceholders` -- used by `router.test.tsx` in the "renders 10 distinct authenticated placeholders" test. **Keep for now** (see test update note below), but may be removed in a later phase if the test is rewritten.
3. `RoutePlaceholder` component -- zero remaining consumers. **Remove.**
4. `RoutePlaceholderProps` type -- only used by `RoutePlaceholder`. **Remove.**

### Concrete removals

Remove these sections from `placeholders.tsx`:

1. **`RoutePlaceholderProps` type** (lines 1-7)
2. **`RoutePlaceholder` function** (lines 82-130) -- the entire exported component

### Note on EmptyState overlap

The spec mentions removing "components now superseded by `EmptyState`". Investigation shows:
- Phase 1 was supposed to create `apps/web/src/components/empty-state.tsx`, but it does **not exist yet** as a standalone component.
- The only `EmptyState` in the codebase is a local (non-exported) function inside `admin-diagnostics-page.tsx` (line 489).
- `RoutePlaceholder` is the closest analog, but it serves a different purpose (dev/scaffold placeholder vs. data-empty state).
- **Action:** Remove `RoutePlaceholder` since it has no consumers after skeleton cleanup. No further EmptyState-driven removals are needed in this phase.

---

## 4. CSS severity tokens (`apps/web/src/index.css`)

### Where to add

Inside the `@theme inline { ... }` block, after the semantic color group (success/warning/info) which ends at line 23. The severity tokens form a logical group of their own.

**After this block (lines 20-23):**
```css
  --color-success: #4CE160;
  --color-success-foreground: #0C3100;
  --color-warning: #FF8606;
  --color-warning-foreground: #2F1604;
  --color-info: #4D93FC;
  --color-info-foreground: #19133A;
```

**Insert:**
```css

  --color-severity-blocker: #F0202D;
  --color-severity-blocker-foreground: #FFFFFF;
  --color-severity-blocker-muted: #FFE4E6;
  --color-severity-major: #FF8606;
  --color-severity-major-foreground: #FFFFFF;
  --color-severity-major-muted: #FEF3C7;
  --color-severity-minor: #4D93FC;
  --color-severity-minor-foreground: #FFFFFF;
  --color-severity-minor-muted: #DBEAFE;
  --color-severity-cosmetic: #707070;
  --color-severity-cosmetic-foreground: #FFFFFF;
  --color-severity-cosmetic-muted: #E5E5E5;
```

### Token values rationale

Derived from the hardcoded Tailwind classes currently used in the two `SeverityBadge` implementations:

| Severity | Current hardcoded classes | Token (bg) | Token (text) | Token (muted/pill bg) |
|----------|-------------------------|------------|--------------|----------------------|
| blocker | `bg-rose-100 text-rose-800` | `#F0202D` (matches `--color-destructive`) | `#FFFFFF` | `#FFE4E6` (rose-100) |
| major | `bg-amber-100 text-amber-800` | `#FF8606` (matches `--color-warning`) | `#FFFFFF` | `#FEF3C7` (amber-100) |
| minor | `bg-sky-100 text-sky-800` | `#4D93FC` (matches `--color-info`) | `#FFFFFF` | `#DBEAFE` (sky-100 approx) |
| cosmetic | `bg-slate-200 text-slate-700` | `#707070` (matches `--color-muted-foreground`) | `#FFFFFF` | `#E5E5E5` (matches `--color-accent`) |

The `SeverityBadge` components in `study-findings-page.tsx` (line 676) and `study-report-page.tsx` (line 855) can then be refactored to use `bg-severity-blocker-muted text-severity-blocker` etc., but that refactor is outside Phase 4 scope (Phase 4 just adds the tokens).

---

## 5. Test updates (`apps/web/src/router.test.tsx`)

### 5a. Import for contentRoutePlaceholders (line 18)

```ts
import { contentRoutePlaceholders } from "@/routes/placeholders";
```

**No change needed.** `contentRoutePlaceholders` stays in `placeholders.tsx`.

### 5b. "renders 10 distinct authenticated placeholders" test (lines 960-970)

**No change needed.** The `contentRoutePlaceholders` array is untouched by Phase 4, so the test still passes.

### 5c. Route resolution tests

The test file uses `renderRoute()` to navigate to various paths and checks that pages render.
Phase 4 changes only the import source of page components -- the components themselves, their exports, and the route tree are identical.
**No test changes are required** as long as `bun run typecheck` passes and all existing tests still pass.

### 5d. Validation plan

Run these commands after implementation:

```bash
bun run typecheck               # Catch dangling imports
bun vitest run router.test      # Verify all routes still resolve
bun vitest run                  # Full suite -- no regressions
```

---

## 6. Execution checklist

- [ ] **Prerequisite:** Confirm Phase 3 split files exist:
  - `apps/web/src/routes/studies-list.tsx` (exports `StudiesListPage`)
  - `apps/web/src/routes/study-new.tsx` (exports `StudyCreationWizardPage`)
  - `apps/web/src/routes/study-overview.tsx` (exports `StudyOverviewPage`)
  - `apps/web/src/routes/persona-configs-list.tsx` (exports `PersonaConfigsPage`)
  - `apps/web/src/routes/persona-config-detail.tsx` (exports `PersonaConfigDetailPage`)
  - `apps/web/src/routes/transcripts-list.tsx` (exports `TranscriptsPage`)
  - `apps/web/src/routes/transcript-detail.tsx` (exports `TranscriptDetailPage`)
- [ ] **router.tsx:** Replace 3 multi-import blocks with 7 single-file imports (section 1a-1c above)
- [ ] **skeleton-pages.tsx:** Strip to constants-only file (section 2 above)
- [ ] **placeholders.tsx:** Remove `RoutePlaceholderProps` type and `RoutePlaceholder` component (section 3 above)
- [ ] **index.css:** Add 12 severity token lines after line 23 inside `@theme inline` (section 4 above)
- [ ] **router.test.tsx:** No changes expected -- verify by running tests
- [ ] **Verify:** `bun run typecheck` passes with zero errors
- [ ] **Verify:** `bun vitest run router.test` passes
- [ ] **Verify:** `bun vitest run` full suite passes

---

## 7. Files touched (summary)

| File | Change type |
|------|-------------|
| `apps/web/src/router.tsx` | Edit -- swap 3 import blocks |
| `apps/web/src/routes/skeleton-pages.tsx` | Edit -- delete ~300 lines, keep 2 exports |
| `apps/web/src/routes/placeholders.tsx` | Edit -- delete `RoutePlaceholder` + its type |
| `apps/web/src/index.css` | Edit -- add 12 CSS custom property lines |
| `apps/web/src/router.test.tsx` | No change |
