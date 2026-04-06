# Phase 1 -- Extract shared domain components

## Overview

Extract 6 shared components from duplicated inline definitions across 10 route files.
Two test files are created first (project convention: tests before implementation).

---

## 1. `summary-value.tsx` -- SummaryValue + SummaryGrid

### Current inline copies (9 files)

| File | Wrapper element | dt classes | dd classes | Container classes |
|---|---|---|---|---|
| `study-pages.tsx` | `div.rounded-lg.bg-card/50.p-3` | `font-label text-[10px] text-muted-foreground` | `mt-1 text-sm font-medium` | uses `<dt>` / `<dd>` |
| `study-findings-page.tsx` | `div.rounded-lg.bg-card/50.p-3` | `font-label text-[10px] text-muted-foreground` | `mt-1 break-words text-sm font-medium` | uses `<dt>` / `<dd>` |
| `study-report-page.tsx` | `div.rounded-lg.bg-card/50.p-3` | `font-label text-[10px] text-muted-foreground` | `mt-1 break-words text-sm font-medium leading-6` | uses `<dt>` / `<dd>` |
| `study-runs-page.tsx` | `div.rounded-lg.bg-card/50.p-3` | `font-label text-[10px] text-muted-foreground` | `mt-1 break-words text-sm font-medium` | uses `<dt>` / `<dd>` |
| `study-personas-page.tsx` | `div.rounded-lg.bg-card/50.p-3` | `font-label text-[10px] text-muted-foreground` | `mt-1 break-words text-sm font-medium` | uses `<dt>` / `<dd>` |
| `admin-diagnostics-page.tsx` | `div.space-y-1` (no card bg) | `font-label text-[10px] text-muted-foreground` (uses `<p>`) | `font-medium` (uses `<p>`) | NOT a `<dl>` -- uses plain divs |
| `transcript-pages.tsx` | `div.space-y-1` (no card bg) | `font-label text-[10px] text-muted-foreground` (uses `<p>`) | `text-sm leading-6` (uses `<p>`) | NOT a `<dl>` -- uses plain divs |
| `persona-config-pages.tsx` | `div.rounded-lg.bg-card/50.p-3` | `text-xs font-medium text-muted-foreground` (uses `<dt>`) | `mt-1 break-words text-sm font-medium` (uses `<dd>`) | uses `<dt>` / `<dd>` |
| `persona-variant-review-grid.tsx` | `div.rounded-lg.border.bg-background.p-4` | `text-sm font-medium text-muted-foreground` (uses `<dt>`) | `mt-1 break-words text-sm font-medium` (uses `<dd>`) | uses `<dt>` / `<dd>` |

### Unified component design

```ts
type SummaryValueVariant = "card" | "inline" | "bordered";

interface SummaryValueProps {
  label: string;
  value: string;
  /** Visual variant. Default: "card" */
  variant?: SummaryValueVariant;
  className?: string;
}
```

Variant mapping:
- `"card"` (default) -- `rounded-lg bg-card/50 p-3`, `<dt>` with `font-label text-[10px] text-muted-foreground`, `<dd>` with `mt-1 break-words text-sm font-medium`.  Covers study-pages, study-findings, study-report, study-runs, study-personas, persona-config-pages.
- `"inline"` -- `space-y-1`, `<p>` with `font-label text-[10px] text-muted-foreground`, `<p>` with `text-sm leading-6`.  Covers admin-diagnostics and transcript-pages.
- `"bordered"` -- `rounded-lg border bg-background p-4`, `<dt>` with `text-sm font-medium text-muted-foreground`, `<dd>` with `mt-1 break-words text-sm font-medium`.  Covers persona-variant-review-grid.

All variants use semantic `<dt>`/`<dd>` in the shared component (the inline `<p>` versions are upgraded).

### SummaryGrid

```ts
interface SummaryGridProps {
  children: React.ReactNode;
  /** Grid column class, e.g. "sm:grid-cols-2". Default: none (stacked). */
  columns?: string;
  className?: string;
}
```

Renders `<dl className={cn("grid gap-3", columns, className)}>`.

No animation on SummaryValue itself. Stagger animation belongs to the parent list (see AnimatedList below) or is applied ad-hoc by the consumer. SummaryValue is a pure presentational component.

---

## 2. `status-badge.tsx` -- StudyStatusBadge, RunStatusBadge, SeverityBadge, ConfigStatusBadge

### Current inline copies

| Badge | Files |
|---|---|
| `StudyStatusBadge` | `study-shared.tsx` (canonical, already exported) |
| `RunStatusBadge` | `study-shared.tsx` (canonical, already exported) |
| `SeverityBadge` | `study-findings-page.tsx`, `study-report-page.tsx` (identical) |
| `ConfigStatusBadge` | `transcript-pages.tsx` (uses `cn`), `persona-config-pages.tsx` (named `StatusBadge`, uses `cn`, slightly different font classes) |

### Status-to-style maps

#### StudyStatusBadge -- `status: string`

| Status | bg | text |
|---|---|---|
| `draft` | `bg-slate-200` | `text-slate-700` |
| `persona_review` | `bg-violet-100` | `text-violet-800` |
| `ready` | `bg-sky-100` | `text-sky-800` |
| `queued` | `bg-amber-100` | `text-amber-800` |
| `running` | `bg-blue-100` | `text-blue-800` |
| `replaying` | `bg-indigo-100` | `text-indigo-800` |
| `analyzing` | `bg-fuchsia-100` | `text-fuchsia-800` |
| `completed` | `bg-emerald-100` | `text-emerald-800` |
| `failed` | `bg-rose-100` | `text-rose-800` |
| `cancelled` | `bg-zinc-200` | `text-zinc-700` |

Base classes: `font-label rounded-full px-2.5 py-0.5 text-[10px]`
Label transform: `status.replaceAll("_", " ")`

#### RunStatusBadge -- `status: string`

| Status | bg | text |
|---|---|---|
| `queued` | `bg-amber-100` | `text-amber-800` |
| `dispatching` | `bg-orange-100` | `text-orange-800` |
| `running` | `bg-blue-100` | `text-blue-800` |
| `success` | `bg-emerald-100` | `text-emerald-800` |
| `hard_fail` | `bg-rose-100` | `text-rose-800` |
| `soft_fail` | `bg-pink-100` | `text-pink-800` |
| `gave_up` | `bg-violet-100` | `text-violet-800` |
| `timeout` | `bg-yellow-100` | `text-yellow-800` |
| `blocked_by_guardrail` | `bg-red-100` | `text-red-800` |
| `infra_error` | `bg-slate-300` | `text-slate-800` |
| `cancelled` | `bg-zinc-200` | `text-zinc-700` |

Base classes: `font-label rounded-full px-2.5 py-0.5 text-[10px]`
Label transform: `status.replaceAll("_", " ")`

#### SeverityBadge -- `severity: "blocker" | "major" | "minor" | "cosmetic"`

| Severity | bg | text |
|---|---|---|
| `blocker` | `bg-rose-100` | `text-rose-800` |
| `major` | `bg-amber-100` | `text-amber-800` |
| `minor` | `bg-sky-100` | `text-sky-800` |
| `cosmetic` | `bg-slate-200` | `text-slate-700` |

Base classes: `font-label rounded-full px-2.5 py-0.5 text-[10px]`
Label: raw severity string (no transform needed)

#### ConfigStatusBadge -- `status: "draft" | "published" | "archived"`

| Status | bg | text |
|---|---|---|
| `draft` | `bg-amber-100` | `text-amber-800` |
| `published` | `bg-emerald-100` | `text-emerald-800` |
| `archived` (fallback) | `bg-slate-200` | `text-slate-700` |

Base classes: `font-label rounded-full px-2.5 py-0.5 text-[10px]`
Label: raw status string

Note: `persona-config-pages.tsx` uses `rounded-full px-2.5 py-0.5 text-xs font-medium` (slightly different from the `font-label text-[10px]` pattern). Normalize to the `font-label text-[10px]` convention used everywhere else.

### Shared component props

```ts
interface StatusBadgeProps {
  className?: string;
}

interface StudyStatusBadgeProps extends StatusBadgeProps {
  status: string;
}

interface RunStatusBadgeProps extends StatusBadgeProps {
  status: string;
}

interface SeverityBadgeProps extends StatusBadgeProps {
  severity: "blocker" | "major" | "minor" | "cosmetic";
}

interface ConfigStatusBadgeProps extends StatusBadgeProps {
  status: "draft" | "published" | "archived";
}
```

Implementation uses `Record<string, string>` map lookups with a fallback class.

### Migration note

`StudyStatusBadge` and `RunStatusBadge` are currently exported from `study-shared.tsx`. After extraction, `study-shared.tsx` should re-export them from the new file (or all consumers update their imports). Phase 2 handles the actual re-wiring; in Phase 1, create the component with all four badges exported and verify with tests.

---

## 3. `filter-bar.tsx` -- FilterBar, FilterSelect, FilterSearch

### Current inline patterns

Every route page builds its own filter card with `<Card>/<CardHeader>/<CardContent className="grid gap-4 ...">`. The internal structure is always:
- A `<div className="grid gap-2">` containing `<Label>` + `<select>` or `<Input>`
- The select element uses a shared `selectClassName` string (copy-pasted into 5+ files)

### Unified component design

```ts
interface FilterBarProps {
  title?: string;               // CardTitle text (default: "Filters")
  columns?: string;             // grid column class (default: "lg:grid-cols-2")
  children: React.ReactNode;    // FilterSelect / FilterSearch / custom children
  footer?: React.ReactNode;     // "Showing X of Y" + clear button area
  className?: string;
}

interface FilterSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  placeholder?: string;         // text for the "all" option (default: "All")
  className?: string;
}

interface FilterSearchProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number" | "url" | "datetime-local";
  min?: string;
  max?: string;
  step?: string;
  className?: string;
}
```

FilterBar wraps children in `<Card>/<CardHeader>/<CardContent className={cn("grid gap-4", columns)}>`.
FilterSelect renders `<div className="grid gap-2"><Label /><select className={selectClassName} /></div>`.
FilterSearch renders `<div className="grid gap-2"><Label /><Input /></div>`.

The shared `selectClassName` constant is exported for edge cases where a consumer needs a raw `<select>`.

---

## 4. `page-header.tsx` -- PageHeader

### Current inline pattern (every route page)

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
  <div className="space-y-3">
    <p className="font-label text-xs text-muted-foreground">{eyebrow}</p>
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-heading text-3xl tracking-tight">{title}</h2>
        {badge}
      </div>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  </div>
  <div className="flex flex-wrap gap-3">{actions}</div>
</div>
```

Found in: study-pages (StudiesListPage, StudyCreationWizardPage, StudyOverviewPage, StudyStatusPage), study-findings-page, study-report-page, study-runs-page, study-personas-page, admin-diagnostics-page, transcript-pages.

Some pages use `<h1>` (shared report view) while most use `<h2>`. Some pages omit the eyebrow. Some pages use `lg:` breakpoints instead of `sm:`.

### Unified component design

```ts
interface PageHeaderProps {
  /** Small label above the title (e.g. "Study Console"). Optional. */
  eyebrow?: string;
  /** Page title. Required. */
  title: string;
  /** Badge element rendered inline with the title. Optional. */
  badge?: React.ReactNode;
  /** Description text below the title. Optional. */
  description?: string;
  /** Right-aligned action buttons. Optional. */
  actions?: React.ReactNode;
  /** Heading level. Default: "h2". */
  as?: "h1" | "h2" | "h3";
  className?: string;
}
```

---

## 5. `animated-list.tsx` -- AnimatedList<T>

### Current inline animation patterns

| File | `initial` | `animate` | `transition` |
|---|---|---|---|
| `study-pages.tsx` (StudiesListPage) | `{ opacity: 0, y: 10 }` | `{ opacity: 1, y: 0 }` | `{ delay: index * 0.04, type: "spring", visualDuration: 0.3, bounce: 0.1 }` |
| `study-pages.tsx` (active runs) | `{ opacity: 0, y: 8 }` | `{ opacity: 1, y: 0 }` | `{ delay: 0.05 }` (fixed, not staggered) |
| `study-findings-page.tsx` | `{ opacity: 0, y: 12 }` | `{ opacity: 1, y: 0 }` | `{ delay: index * 0.05, type: "spring", visualDuration: 0.3, bounce: 0.1 }` |
| `study-runs-page.tsx` | `{ opacity: 0, y: 8 }` | `{ opacity: 1, y: 0 }` | `{ delay: index * 0.04, type: "spring", visualDuration: 0.25, bounce: 0.1 }` |

### Unified component design

```ts
interface AnimatedListProps<T> {
  items: T[];
  keyExtractor: (item: T) => string;
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Stagger delay per item in seconds. Default: 0.04 */
  staggerDelay?: number;
  /** Initial y offset in pixels. Default: 10 */
  initialY?: number;
  /** Spring visual duration. Default: 0.3 */
  springDuration?: number;
  /** Spring bounce. Default: 0.1 */
  springBounce?: number;
  className?: string;
}
```

Renders:
```tsx
<div className={cn("space-y-4", className)}>
  {items.map((item, index) => (
    <motion.div
      key={keyExtractor(item)}
      initial={{ opacity: 0, y: initialY }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * staggerDelay,
        type: "spring",
        visualDuration: springDuration,
        bounce: springBounce,
      }}
    >
      {renderItem(item, index)}
    </motion.div>
  ))}
</div>
```

Dependencies: `motion/react` (already in the project).

---

## 6. `empty-state.tsx` -- EmptyState

### Current inline patterns

| File | Pattern |
|---|---|
| `study-pages.tsx` StateCard | `<Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent><p className="text-sm text-muted-foreground">{body}</p></CardContent></Card>` |
| `study-findings-page.tsx` FindingsStateCard | Identical to StateCard |
| `study-report-page.tsx` ReportStateCard | Identical to StateCard |
| `study-runs-page.tsx` StateCard | Identical to StateCard (prop named `body` not `description`) |
| `study-personas-page.tsx` ReviewStateCard | Identical to StateCard |
| `admin-diagnostics-page.tsx` DiagnosticsStateCard | Uses `CardDescription` inside header instead of `CardContent` |
| `admin-diagnostics-page.tsx` EmptyState | Bare `<p className="text-sm text-muted-foreground">{text}</p>` (no card wrapper) |
| `transcript-pages.tsx` LoadingCard | Identical to StateCard |
| `persona-config-pages.tsx` LoadingCard | Identical to StateCard |

### Unified component design

```ts
type EmptyStateVariant = "card" | "inline";

interface EmptyStateProps {
  /** Card title. Required for "card" variant. */
  title?: string;
  /** Description or body text. Required. */
  description: string;
  /** Optional icon component (e.g. Lucide icon). Rendered above the title. */
  icon?: React.ReactNode;
  /** Optional action slot (e.g. a Button). Rendered below the description. */
  action?: React.ReactNode;
  /** Visual variant. Default: "card" */
  variant?: EmptyStateVariant;
  className?: string;
}
```

Variant mapping:
- `"card"` (default) -- wraps in `<Card>/<CardHeader><CardTitle /><CardContent><p>...` matching the existing StateCard pattern.
- `"inline"` -- renders a bare `<p className="text-sm text-muted-foreground">` (covers the admin-diagnostics minimal EmptyState).

When `icon` is provided, it renders above the title inside the CardHeader.
When `action` is provided, it renders below the description inside CardContent.

---

## 7. Test plan -- `summary-value.test.tsx`

Test runner: vitest with `happy-dom` environment.
Pattern: follow existing `settings-page.test.tsx` / `axis-library-page.test.tsx` conventions (ReactDOM.createRoot + act, no @testing-library).

### Test cases

1. **Renders label and value as dt/dd in default "card" variant**
   - Render `<SummaryValue label="Run budget" value="64" />`
   - Assert `<dt>` contains "Run budget"
   - Assert `<dd>` contains "64"
   - Assert wrapper div has `bg-card/50` class

2. **Renders "inline" variant with space-y-1 wrapper**
   - Render `<SummaryValue label="Infra errors" value="12" variant="inline" />`
   - Assert wrapper div has `space-y-1` class
   - Assert wrapper div does NOT have `bg-card/50` class

3. **Renders "bordered" variant with border and bg-background**
   - Render `<SummaryValue label="Low anchor" value="Needs reassurance" variant="bordered" />`
   - Assert wrapper div has `border` and `bg-background` classes

4. **Passes through className to the wrapper**
   - Render `<SummaryValue label="L" value="V" className="mt-4" />`
   - Assert wrapper div has `mt-4` class

5. **SummaryGrid renders children inside a dl with configurable columns**
   - Render `<SummaryGrid columns="sm:grid-cols-2"><SummaryValue label="A" value="1" /></SummaryGrid>`
   - Assert `<dl>` element exists
   - Assert `<dl>` has classes `grid`, `gap-3`, and `sm:grid-cols-2`

6. **SummaryGrid passes through className**
   - Render `<SummaryGrid className="custom">...</SummaryGrid>`
   - Assert `<dl>` has `custom` class

---

## 8. Test plan -- `status-badge.test.tsx`

### Test cases

1. **StudyStatusBadge renders every known status with correct classes**
   For each status in the map (`draft`, `persona_review`, `ready`, `queued`, `running`, `replaying`, `analyzing`, `completed`, `failed`, `cancelled`):
   - Render `<StudyStatusBadge status={status} />`
   - Assert the `<span>` text matches `status.replaceAll("_", " ")`
   - Assert the `<span>` has the expected bg/text class pair from the map

2. **StudyStatusBadge renders an unknown status gracefully**
   - Render `<StudyStatusBadge status="unknown_status" />`
   - Assert it renders "unknown status" as text (the replaceAll still applies)
   - Assert it does NOT throw

3. **RunStatusBadge renders every known status with correct classes**
   Same pattern as StudyStatusBadge for: `queued`, `dispatching`, `running`, `success`, `hard_fail`, `soft_fail`, `gave_up`, `timeout`, `blocked_by_guardrail`, `infra_error`, `cancelled`.

4. **SeverityBadge renders all four severity levels**
   For each severity (`blocker`, `major`, `minor`, `cosmetic`):
   - Render `<SeverityBadge severity={severity} />`
   - Assert text matches the severity string
   - Assert correct bg/text class pair

5. **ConfigStatusBadge renders draft, published, and archived**
   For each status (`draft`, `published`, `archived`):
   - Render `<ConfigStatusBadge status={status} />`
   - Assert text matches the status string
   - Assert correct bg/text class pair

6. **All badges accept and apply a custom className**
   - Render each badge type with `className="custom-extra"`
   - Assert the `<span>` includes `custom-extra` in its className

---

## 9. Order of operations

Per project convention ("bug fixes start with a failing test, then the fix"), tests are written first.

### Step 1 -- Write test files (red)

1. Create `apps/web/src/components/summary-value.test.tsx` with all 6 test cases above. Tests will fail because the component files do not exist yet.
2. Create `apps/web/src/components/status-badge.test.tsx` with all 6 test cases above. Tests will fail because the component files do not exist yet.

### Step 2 -- Create component files (green)

Create in this order (simplest to most complex):

1. `apps/web/src/components/empty-state.tsx` -- no external deps beyond Card
2. `apps/web/src/components/summary-value.tsx` -- SummaryValue + SummaryGrid
3. `apps/web/src/components/status-badge.tsx` -- all four badge components
4. `apps/web/src/components/page-header.tsx` -- PageHeader
5. `apps/web/src/components/filter-bar.tsx` -- FilterBar + FilterSelect + FilterSearch
6. `apps/web/src/components/animated-list.tsx` -- AnimatedList<T> (depends on `motion/react`)

After each component file is created, run `bun run test` in `apps/web` to confirm the corresponding tests pass.

### Step 3 -- Verify all tests pass

```bash
cd apps/web && bun run test
```

All 12+ test cases across both test files should be green.

### Step 4 -- (Phase 2, out of scope) Wire consumers

In a follow-up phase, update every route file to import from the shared components instead of using inline copies. Remove the inline definitions. This phase is NOT part of Phase 1.

---

## 10. File inventory (Phase 1 deliverables)

| File | Type | LOC estimate |
|---|---|---|
| `apps/web/src/components/summary-value.test.tsx` | Test | ~80 |
| `apps/web/src/components/status-badge.test.tsx` | Test | ~120 |
| `apps/web/src/components/summary-value.tsx` | Component | ~50 |
| `apps/web/src/components/status-badge.tsx` | Component | ~90 |
| `apps/web/src/components/filter-bar.tsx` | Component | ~80 |
| `apps/web/src/components/page-header.tsx` | Component | ~40 |
| `apps/web/src/components/animated-list.tsx` | Component | ~35 |
| `apps/web/src/components/empty-state.tsx` | Component | ~45 |

Total: 8 new files, ~540 LOC.

---

## 11. Dependencies and imports

All components import only from:
- `react` (types only)
- `@/lib/utils` (for `cn`)
- `@/components/ui/card` (EmptyState, FilterBar)
- `@/components/ui/input` (FilterBar)
- `@/components/ui/label` (FilterBar)
- `motion/react` (AnimatedList only)

No new package installations required.

---

## 12. Non-goals for Phase 1

- Updating any existing route files to use the new components (Phase 2).
- Removing inline component definitions from route files (Phase 2).
- Creating Storybook stories.
- Adding snapshot tests beyond the status-badge class assertions.
- Extracting MetricCard (admin-diagnostics, study-report) -- these are too few copies (2) and have different heading typography; defer until needed.
