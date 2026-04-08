# Plan: Persona Config Detail Experience Redesign

> Source PRD: https://github.com/alvaroybanez/botchestra/issues/85

## Architectural decisions

Durable decisions that apply across all phases:

- **Routes**: Keep the existing detail route at `/persona-configs/$configId`.
- **Workspace URL state**: Use search params for active tab, selected entities, and key filters/sort to preserve deep links and back/forward behavior.
- **Information architecture**: Tabs are fixed to **Overview, Users, Transcripts, Generation, Review** with a compact sticky summary/action rail across tabs.
- **Data loading strategy**: Use a lightweight always-on summary contract, then tab-scoped contracts loaded only for the active tab. Rollout style is foundation first, then tab-by-tab contract expansion.
- **Migration rule**: Add new contracts first and retire monolithic/legacy contracts only after UI cutover stabilizes.
- **Review data boundary**: Reuse the existing pack variant review contract for the Review workspace in this redesign.
- **Key models**: `personaConfigs`, `syntheticUsers`, `transcripts`, `configTranscripts`, `transcriptExtractionRuns`, `batchGenerationRuns`, `personaVariants`, and `studies`.
- **Permissions**: Keep existing authenticated-route and viewer-access permission gates for write and destructive actions.
- **Interaction boundaries**: Unmount inactive tabs, preserve per-tab state, and use bounded internal scrolling + pagination (no virtualization in this pass unless needed).
- **Flags and telemetry**: Keep `forceSuggestAxesError`; add no new telemetry in this implementation.

---

## Phase 1: Shell, URL state, and summary foundation

**User stories**: Workspace Spec 1 (Detail Shell + Sticky Summary Rail), In Scope deep-linking/back-forward behavior

### What to build

Deliver the new workspace shell end-to-end: tab navigation, URL-synced workspace state, and a sticky summary/action rail that remains visible across all tabs. Introduce the lightweight always-on summary contract and active-workspace loading/error boundaries.

### Acceptance criteria

- [ ] Route remains `/persona-configs/$configId`.
- [ ] Active tab and key workspace state persist in URL search params.
- [ ] Browser back/forward restores tab and URL-driven workspace state.
- [ ] Sticky summary/action rail stays visible while navigating tabs.
- [ ] Publish/archive/back actions remain reachable from all tabs.
- [ ] Loading/error boundaries are scoped to the active workspace only.
- [ ] No full-page “wall of cards” interaction remains in the primary detail experience.

---

## Phase 2: Overview workspace

**User stories**: Workspace Spec 2 (Overview Tab), Editing + Actions locked decisions

### What to build

Implement the Overview workspace as the orientation and draft-editing surface: status/version/counts/health summary plus draft-only metadata and shared-axis editing, with read-only behavior for published/archived states.

### Acceptance criteria

- [ ] Overview shows orientation summary (status, version, axis/user/transcript counts, generation health).
- [ ] Metadata and shared-axis editing are available only in draft mode.
- [ ] Published/archived configs render read-only Overview content.
- [ ] Overview edits do not reset state in other tabs.
- [ ] Existing draft validation behavior remains enforced.

---

## Phase 3: Users canonical inspector workspace

**User stories**: Workspace Spec 3 (Users Tab)

### What to build

Deliver the canonical synthetic-user surface as a split-pane workspace with search/filter/sort on the master pane and a persistent narrative inspector pane for bio, axes, evidence, notes, and contextual actions. Include inline draft editing and delete-with-confirmation flows.

### Acceptance criteria

- [ ] Users workspace uses split-pane master-detail interaction.
- [ ] Master pane supports search, source filters, and source-first sorting.
- [ ] Inspector shows bio, axis values, evidence, notes, and contextual actions.
- [ ] Inline edit and delete-with-confirmation flows work in draft mode.
- [ ] First row auto-selects on load and after filter changes.
- [ ] Selected user is URL-synced and survives tab switches.
- [ ] Keyboard navigation works across list and inspector workflows.

---

## Phase 4: Transcripts workspace

**User stories**: Workspace Spec 4 (Transcripts Tab)

### What to build

Implement a dedicated split-pane transcript workspace with attach/detach/open flows and an inline extraction stepper (mode selection, guided/cost preparation, processing/results review), keeping transcript operations isolated from unrelated workspaces.

### Acceptance criteria

- [ ] Transcript management and extraction review are consolidated in the Transcripts workspace.
- [ ] Attach, detach, and open transcript flows are available and permission-safe.
- [ ] Inline extraction stepper supports mode -> guided/cost -> processing/results flow.
- [ ] Extraction states and errors remain workspace-scoped.
- [ ] Evidence links route correctly to transcript detail.

---

## Phase 5: Generation workspace

**User stories**: Workspace Spec 5 (Generation Tab)

### What to build

Deliver a three-zone generation workspace: controls and cost estimate, run progress/failure state, and generated-user status table with generated-first default ordering plus optional source-expansion toggle. Preserve permitted retry/regenerate actions.

### Acceptance criteria

- [ ] Generation workspace uses the three-zone layout.
- [ ] Generation controls and cost estimate are glanceable and actionable.
- [ ] Run progress and failure states are visible without leaving the workspace.
- [ ] Generated-user table defaults to generated-first ordering with optional toggle to include all source types.
- [ ] Active run state gates conflicting actions.
- [ ] Retry/regenerate actions remain available where permissions and state allow.
- [ ] Status and recovery actions are keyboard accessible.

---

## Phase 6: Review workspace

**User stories**: Workspace Spec 6 (Review Tab)

### What to build

Implement a dense accepted-variant table with a sticky narrative inspector, preserving numeric scan speed while enabling context inspection without leaving the table surface. Keep sorting/filtering/study selection and URL-synced row selection.

### Acceptance criteria

- [ ] Review workspace keeps a dense accepted-variant table surface.
- [ ] Sticky inspector provides narrative/context details for the selected variant.
- [ ] Sorting, filtering, and study selection are preserved.
- [ ] Selected variant is URL-synced and stable across refresh/back-forward.
- [ ] Keyboard row navigation is supported.
- [ ] Numeric scan speed remains preserved while context inspection is available.

---

## Phase 7: Stabilization, quality gates, and contract retirement

**User stories**: Testing Strategy, Definition of Done

### What to build

Run a hardening pass across all workspaces: module-first tests, router smoke coverage, and explicit accessibility/keyboard/focus checks. Validate URL deep-linking and workspace-scoped loading/error behavior end-to-end, then retire superseded monolithic contracts and paths after stabilization criteria are met.

### Acceptance criteria

- [ ] Module-first tests cover shell plus all five workspaces and adapter boundaries.
- [ ] Router smoke tests cover route wiring and tab deep-link entry points.
- [ ] Explicit keyboard/focus/ARIA assertions pass for tabs, list/table selection, and inspector behavior.
- [ ] URL deep-linking and back/forward behavior pass for tab + key selection/filter state.
- [ ] Workspace-scoped loading/empty/error states are validated across all tabs.
- [ ] Full workflow parity is maintained for publish/archive, transcript operations, extraction, generation, and review.
- [ ] Superseded monolithic contracts/paths are retired only after stabilization gates pass.
