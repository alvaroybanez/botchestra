# Agentic Design System — Implementation Plan

> Source: Figma "AGENTIC DESIGN SYSTEM (v1.1)"
> File: `https://www.figma.com/design/M4A1rykYBlFjuQThSssDm0`

---

## Design System Overview

### Typography (3 typefaces)

| Role | Font | Tailwind utility | Styles |
|------|------|-----------------|--------|
| **Headings** | Playfair Display (serif) | `font-heading` | H1 (page titles), H2 (sections), H3 (cards) |
| **Body** | Geist (sans) | `font-body` | Body, Body Bd, Body Sm, Body Sm Bd, Body Xs, Body Xs Bd |
| **Labels + Buttons** | Geist Mono | `font-label` | Label Md, Label Md (Underline), Label Sm, Button Label Md/Sm — always uppercase with tracking |

### Colors (from Figma palette)

**8 chromatic scales** (100–800): Pink, Red, Orange, Yellow, Blue, Teal, Purple, Green

**Neutral scale (N100–N900):**

| Token | Hex | Usage |
|-------|-----|-------|
| N100 | #FFFFFF | Cards, popovers |
| N200 | #F7F7F7 | Canvas background |
| N300 | #E5E5E5 | Borders |
| N400 | #CCCCCC | — |
| N500 | #8F8F8F | — |
| N600 | #707070 | Muted foreground |
| N700 | #363636 | — |
| N800 | #191919 | Primary foreground, text |
| N900 | #000000 | — |

**Semantic mapping:**

```css
--color-background: #F7F7F7    /* N200 — canvas, NOT white */
--color-card: #FFFFFF           /* N100 — cards float on canvas */
--color-primary: #191919        /* N800 — dark buttons */
--color-destructive: #F0202D    /* R600 */
--color-ring: #4D93FC           /* B400 — blue focus ring */
--color-success: #4CE160        /* G400 */
--color-warning: #FF8606        /* O400 */
--color-info: #4D93FC           /* B400 */
```

### Shadows (4 elevations)

| Level | Usage | CSS |
|-------|-------|-----|
| Card | Default card, list items | `0 1px 3px rgba(0,0,0,0.04), 0 1px 2px -1px rgba(0,0,0,0.03)` |
| Dropdown | Menus, popovers | `0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)` |
| Drawer | Side panels, sheets | `0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -4px rgba(0,0,0,0.04)` |
| Modal | Dialogs | `0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.06)` |

### Component Library (77 component sets, 2080+ components)

Avatars, Avatar Groups, Badges, Breadcrumbs, Buttons (Primary/Secondary/Ghost + Social + Groups), AI State, Chat Messages, Chat Input, Code Blocks, Checkboxes, Dropdowns, File Upload, Modals, Navbar (3 variants: v1, v2 Open, v2 Collapsed), Pagination, Progress Bars (multiple sizes), Radio Buttons, Search, Switches, Steppers, Tabs (32 variants), Tables (cell types: text, badge, avatar, editable, progress), Text Areas, Text Inputs, Toasts, Tooltips, 2000+ Icons

### The "Agentic" Character

- **Mono labels** (Geist Mono) give it a technical/terminal feel — agent status, form fields, badges, buttons all use this
- **Serif headings** (Playfair Display) add sophistication against the technical base
- **Near-monochrome palette** — black/white/gray dominates, color reserved for status semantics
- **Light gray canvas** (#F7F7F7) with white cards and subtle shadows — cards "float"
- **Rounded corners** (12px) on cards, generous whitespace
- **Borderless cards** — shadows provide separation instead of borders

---

## Phase 0: Foundation Layer (DONE)

### Step 1: Install fonts
- **Files:** `apps/web/index.html`, `apps/web/src/index.css`
- Added Playfair Display via Google Fonts CDN
- Added Geist Sans + Geist Mono via Vercel CDN
- Registered `--font-heading`, `--font-body`, `--font-label` CSS variables
- Created `@utility` classes: `font-heading`, `font-body`, `font-label`
- Set body font-family to Geist

### Step 2: Replace color tokens
- **File:** `apps/web/src/index.css`
- Replaced all achromatic OKLCH tokens with Figma hex values
- Added semantic status tokens: `--color-success`, `--color-warning`, `--color-info`
- Added 4 shadow elevation variables + `@utility` classes
- Changed `--radius` from 0.625rem to 0.75rem

### Step 3: Restyle existing shadcn components
- **Button** — `font-label text-xs`, sm size `h-8 text-[11px]`
- **Badge** — `font-label text-[10px]`, added `success`/`warning`/`info` variants
- **Card** — borderless with `shadow-card`, `font-heading` on CardTitle
- **Input** — `font-body`, `bg-card` background
- **Progress** — slimmer `h-2`, `bg-accent` track
- **Table** — `font-label text-[11px]` on TableHead

### Step 4: Install missing shadcn components
- `bunx shadcn@latest add tabs tooltip avatar switch skeleton separator sheet sonner`
- Restyled Tabs triggers with `font-label`, active state with `bg-primary shadow-card`
- Restyled Skeleton with `bg-accent`

### Step 5: Update layout chrome
- **Sidebar** — mono "BOTCHESTRA" header, left-border active indicator, removed "Validation Console" subtitle
- **Canvas** — gray background via token change (N200), cards float on it

### Step 6: Update page headers (all 14 route files)
- Eyebrow labels: `font-label text-xs text-muted-foreground`
- Page titles: `font-heading text-3xl tracking-tight`
- Section titles: `font-heading text-xl/2xl tracking-tight`

### Step 7: Update inline component patterns (all route files)
- SummaryValue: `font-label text-[10px]` labels, `bg-card/50` containers
- StateCard/LoadingCard: `font-heading` on CardTitle
- StatusBadge/SeverityBadge: `font-label text-[10px]` base
- MetricCard: `font-heading` on values
- StudyListCard: `shadow-card` with `hover:shadow-dropdown` transition
- Run list cards: borderless with shadow
- Empty states: `border-border/50 bg-card/30`

---

## Phase 1: App Shell (Sidebar + Layout) (DONE)

**Screen: `AppSidebar` + `AuthenticatedLayout`**

- Grouped nav sections: ORCHESTRATE (Studies), CONFIGURE (Persona Configs, Axis Library, Transcripts), ANALYZE (Settings, Diagnostics)
- Mono uppercase section labels (`font-label text-[10px]`)
- Lucide icons per nav item
- Collapsible sidebar with spring-driven width transition (motion `visualDuration: 0.3, bounce: 0.15`)
- Icon-only collapsed mode with tooltips
- User footer with avatar + name + log out button
- `SidebarProvider` context for collapse state
- `min-w-0` on main content to prevent sidebar-push overflow

---

## Phase 2: Studies List (`/studies`) (DONE)

- Study cards with `shadow-card` → `hover:shadow-dropdown` transitions
- Serif heading, mono labels, translucent summary values
- Empty state with dashed border card

---

## Phase 3: Study Creation Wizard (`/studies/new`)

| Element | Treatment |
|---------|-----------|
| Stepper | Figma STEPPER component — numbered steps, Departure Mono labels |
| Form inputs | Figma Text Input — mono uppercase labels, Geist body in fields |
| Persona selection | Card-based selector with Avatar components |
| **Animation** | Step transitions: spring slide. Form fields: staggered fade |

---

## Phase 4: Study Detail — Overview (`/studies/$studyId/overview`) (DONE)

- Study tabs with motion `layoutId` sliding active indicator (spring `visualDuration: 0.25, bounce: 0.15`)
- Progress bar fills with spring animation (motion `visualDuration: 0.6, bounce: 0.1`)
- Active run cards with pulsing blue dot (`animate-ping`) and blue ring highlight
- Active run cards stagger-in with `motion.div`
- Study list cards stagger-in on the `/studies` page

---

## Phase 5: Study Detail — Personas (`/studies/$studyId/personas`)

| Element | Treatment |
|---------|-----------|
| Filter bar | Search component + dropdown selects + range inputs |
| Table | Figma cell types — text, badge, avatar |
| Review panel | Sheet (right drawer, `shadow-drawer`) with persona detail |
| **Animation** | Table rows stagger in. Panel slides in with spring |

---

## Phase 6: Study Detail — Runs (`/studies/$studyId/runs`) (DONE)

- Run list items stagger-in with `motion.button` (delay `index * 0.04`, spring)
- Running/dispatching runs show pulsing blue dot indicator
- Run selection highlights with primary border

---

## Phase 7: Study Detail — Findings (`/studies/$studyId/findings`) (DONE)

- Finding cards stagger-in with `motion.div` (delay `index * 0.05`, spring)
- Smooth re-render on filter changes

---

## Phase 8: Study Detail — Report (`/studies/$studyId/report`)

| Element | Treatment |
|---------|-----------|
| Shared mode | No sidebar, centered, "Botchestra" watermark footer |
| Report header | Serif H1, mono labels, export button group |
| Ranked issues | Numbered with severity-colored left border |
| **Animation** | None in shared mode. Normal: issue cards stagger |

---

## Phase 9: Persona Configs (`/persona-configs`)

| Element | Treatment |
|---------|-----------|
| Config list | Figma table cell types |
| Config detail | Card-based, axis definitions as editable rows |
| **Animation** | Generation progress bar + persona avatar spring-in |

---

## Phase 10: Utility Screens

| Screen | Treatment |
|--------|-----------|
| **Axis Library** | Sortable table, add via modal (`shadow-modal`) |
| **Transcripts** | Figma File Upload, code block viewer |
| **Settings** | Switch with label toggles, serif section headers |
| **Admin Diagnostics** | Dense metrics, mini tables, mono labels |

---

## Phase 11: Micro-interactions & Polish

| Detail | Treatment |
|--------|-----------|
| Page transitions | 150ms crossfade between routes |
| Loading states | Skeleton components matching content shape |
| Toast notifications | Sonner with semantic color variants |
| Tooltips | On all icon-only buttons and truncated text |
| Focus rings | Blue ring (B400) on all interactive elements |
| Keyboard shortcuts | Shown in button labels (⌘S, ⌘N) |
| Empty states | Crafted per-list/table with CTA |
| Error boundaries | Destructive badge + retry button |

---

## Execution Order

Phase 0 → 2 → 4 → 6 → 7 → 1 → 3 → 5 → 8 → 9 → 10 → 11

Foundation and most-visible screens first, then creation flow, then secondary screens, then final polish.

---

## Decision Log

- **Heading font**: Playfair Display (Google Fonts) — substitutes Figma's New York serif. Cross-platform consistent.
- **Label font**: Geist Mono (Vercel CDN) — Departure Mono not available on fontsource/Google Fonts. Can swap later if self-hosted.
- **Card style**: Borderless with shadow-card — shadows provide separation on gray canvas, borders removed.
- **Badge sizing**: Compact `text-[10px]` with `font-label` — matches Figma's tight badge aesthetic.
