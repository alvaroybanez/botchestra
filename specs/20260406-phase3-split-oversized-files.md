# Phase 3 -- Split oversized route files

Date: 2026-04-06
Source files: `persona-config-pages.tsx` (4507 LOC), `transcript-pages.tsx` (1531 LOC), `study-pages.tsx` (2044 LOC)
Total: 8,082 LOC across 3 files

---

## 1. persona-config-pages.tsx (4507 LOC)

### 1a. Component / function / type inventory

| Symbol | Kind | Lines | Used by |
|---|---|---|---|
| `PersonaConfigDoc` | type alias | 22 | everywhere |
| `SyntheticUserDoc` | type alias | 23 | detail page, users tab |
| `AxisDefinition` | type alias | 24 | axes tab, list page |
| `PersonaConfigId` | type alias | 25 | everywhere |
| `TranscriptDoc` | type alias | 26 | transcripts tab, detail page |
| `TranscriptId` | type alias | 27 | transcripts tab, detail page |
| `TranscriptSignalDoc` | type alias | 28 | transcripts tab |
| `ConfigTranscriptAttachment` | type | 29-35 | transcripts tab |
| `ViewerAccess` | type | 37-42 | list page, detail page |
| `AxisFormValue` | type | 44-52 | everywhere (axes) |
| `ConfigFormValue` | type | 54-59 | list page (create), detail page (edit) |
| `SuggestedAxisState` | type | 61-66 | axes generation UI |
| `InlineToastState` | type | 68-71 | list page, detail page |
| `ExtractionMode` | type | 73 | transcripts tab |
| `TranscriptEvidenceSnippet` | type | 75-80 | transcripts tab |
| `ExtractionArchetypeState` | type | 82-91 | transcripts tab |
| `ExtractionReviewAxisState` | type | 93-98 | transcripts tab |
| `ExtractionStatus` | type | 100-127 | transcripts tab |
| `axisKeyPattern` | const | 129 | validation helpers |
| `SyntheticUserFormValue` | type | 131-136 | users tab |
| `ConfirmationState` | type | 138-151 | detail page |
| `ConfigVariantReviewData` | type | 152-159 | review tab |
| `emptyAxis` | fn | 161-169 | everywhere (axes) |
| `emptyConfigForm` | fn | 171-176 | list page, detail page |
| `emptySyntheticUserForm` | fn | 178-183 | users tab |
| **`PersonaConfigsPage`** | **export component** | **185-666** | router |
| **`PersonaConfigDetailPage`** | **export component** | **668-2436** | router |
| `SuggestedAxisCard` | component | 2438-2585 | list page, axes tab |
| `ConfigFormCard` | component | 2587-2732 | list page, overview tab |
| `AxisEditorCard` | component | 2735-2849 | axes tab, guided extraction |
| `AxisInput` | component | 2851-2873 | axis editor, suggested card |
| `SyntheticUserCard` | component | 2875-2933 | users tab |
| `ImportPackDialog` | component | 2936-2998 | list page |
| `ConfirmationDialog` | component | 3000-3046 | detail page |
| `AxisLibraryImportDialog` | component | 3048-3161 | list page, axes tab |
| `TranscriptExtractionPanel` | component | 3163-3848 | transcripts tab |
| `ModeSelectionCard` | component | 3850-3874 | extraction panel |
| `TranscriptSignalList` | component | 3876-3902 | extraction panel |
| `TranscriptAttachmentDialog` | component | 3904-4048 | transcripts tab |
| `InlineToast` | component | 4050-4066 | list page, detail page |
| `CopyIdRow` | component | 4068-4086 | overview tab |
| `ExpandChevron` | component | 4088-4108 | axes accordion |
| `LoadingSpinner` | component | 4110-4117 | various |
| `LoadingCard` | component | 4119-4130 | everywhere (loading states) |
| `ConfigGrid` | component | 4132-4163 | list page |
| `StatusBadge` | component | 4166-4181 | list page, detail page |
| `SummaryValue` | component | 4183-4190 | everywhere |
| `configToFormValue` | fn | 4192-4199 | detail page |
| `axisToFormValue` | fn | 4201-4224 | everywhere (axes) |
| `axisFormToPayload` | fn | 4226-4236 | everywhere (axes) |
| `parseEvidenceSnippets` | fn | 4238-4243 | users tab |
| `formatTimestamp` | fn | 4245-4250 | everywhere |
| `getErrorMessage` | fn | 4252-4267 | everywhere |
| `getSuggestAxesErrorMessage` | fn | 4269-4277 | axes generation |
| `getAxisKeys` | fn | 4279-4283 | axes merge |
| `normalizeAxisFormValue` | fn | 4285-4295 | axes validation |
| `validateAxesForExtraction` | fn | 4297-4334 | transcripts tab |
| `normalizeAxisKey` | fn | 4336-4344 | everywhere (axes) |
| `validateSelectedAxes` | fn | 4346-4380 | axes generation |
| `mergeAxesIntoFormValue` | fn | 4382-4405 | axes generation |
| `formatDuplicateAxisToast` | fn | 4407-4415 | axes generation |
| `upsertAxisValue` | fn | 4417-4445 | archetype editing |
| `formatAxisValue` | fn | 4447-4454 | archetype review |
| `dedupeEvidenceSnippets` | fn | 4456-4469 | archetype merge |
| `formatTranscriptDerivedNotes` | fn | 4471-4481 | apply extraction |
| `formatTranscriptSignalStatus` | fn | 4483-4496 | extraction panel |
| `textareaClassName` | const | 4498-4499 | forms |
| `selectClassName` | const | 4501-4502 | forms |

### 1b. Dependency graph

```
PersonaConfigsPage
  reads: configs, axisDefinitions, suggestAxes, createDraft, importJson
  uses: ConfigGrid, ConfigFormCard, SuggestedAxisCard, ImportPackDialog,
        AxisLibraryImportDialog, InlineToast, LoadingCard, StatusBadge
  state: form, suggestedAxes, isSuggestionPanelOpen, isAxisLibraryOpen, etc.

PersonaConfigDetailPage
  reads: config, syntheticUsers, axisDefinitions, transcriptLibrary,
         configTranscripts, batchGenerationRun, viewerAccess, extractionStatus,
         extractionCostEstimate, configVariantReview
  contains 4 tabs inlined as TabsContent blocks:
    - "configuration" (overview) tab -- uses ConfigFormCard, axes accordion
    - "users" tab -- uses PersonaGenerationSection (external), SyntheticUserCard
    - "transcripts" tab -- uses TranscriptExtractionPanel,
                           TranscriptAttachmentDialog
    - "review" tab -- uses PersonaVariantReviewGrid (external)
  state: ~30 useState hooks sharing one component scope
  uses: ConfirmationDialog, AxisLibraryImportDialog, InlineToast, LoadingCard,
        StatusBadge, SummaryValue, CopyIdRow, ExpandChevron, LoadingSpinner
```

### 1c. Proposed cut plan

#### `persona-config-shared.tsx` (~150 LOC)
All shared types, constants, and pure helper functions:
- Types: `PersonaConfigDoc`, `SyntheticUserDoc`, `AxisDefinition`, `PersonaConfigId`, `TranscriptDoc`, `TranscriptId`, `TranscriptSignalDoc`, `ConfigTranscriptAttachment`, `ViewerAccess`, `AxisFormValue`, `ConfigFormValue`, `SuggestedAxisState`, `InlineToastState`, `ExtractionMode`, `TranscriptEvidenceSnippet`, `ExtractionArchetypeState`, `ExtractionReviewAxisState`, `ExtractionStatus`, `SyntheticUserFormValue`, `ConfirmationState`, `ConfigVariantReviewData`, `axisKeyPattern`
- Factory functions: `emptyAxis`, `emptyConfigForm`, `emptySyntheticUserForm`
- Conversion: `configToFormValue`, `axisToFormValue`, `axisFormToPayload`, `normalizeAxisKey`, `normalizeAxisFormValue`
- Validation: `validateSelectedAxes`, `validateAxesForExtraction`, `getAxisKeys`, `mergeAxesIntoFormValue`, `formatDuplicateAxisToast`
- Utility: `parseEvidenceSnippets`, `formatTimestamp`, `getErrorMessage`, `getSuggestAxesErrorMessage`, `upsertAxisValue`, `formatAxisValue`, `dedupeEvidenceSnippets`, `formatTranscriptDerivedNotes`, `formatTranscriptSignalStatus`
- UI primitives: `LoadingCard`, `SummaryValue`, `StatusBadge`, `InlineToast`, `ExpandChevron`, `LoadingSpinner`, `CopyIdRow`, `AxisInput`, `ConfirmationDialog`
- CSS constants: `textareaClassName`, `selectClassName`

NOTE: This file will be larger than 150 LOC. The original spec underestimated because there are 19 types plus ~20 helper functions plus ~10 small UI components. Realistic estimate: ~350 LOC. Consider splitting further into `persona-config-types.ts` (types only, ~130 LOC) and `persona-config-shared.tsx` (components + helpers, ~220 LOC) if the team prefers.

#### `persona-configs-list.tsx` (~200 LOC)
- `PersonaConfigsPage` (lines 185-666) -- the page-level component
- `ConfigGrid` (lines 4132-4163) -- renders the grid of config cards
- `ImportPackDialog` (lines 2936-2998) -- import JSON modal
- All state + handlers for create form, import dialog, axis suggestion (create flow), axis library import (create flow)
- Imports from `persona-config-shared.tsx`: all types, `emptyAxis`, `emptyConfigForm`, factory/validation functions, `textareaClassName`, `selectClassName`
- Imports `ConfigFormCard` from `persona-config-overview-tab.tsx`
- Imports `SuggestedAxisCard` from `persona-config-axes-tab.tsx`
- Imports `AxisLibraryImportDialog` from `persona-config-axes-tab.tsx`

#### `persona-config-detail.tsx` (~150 LOC)
- `PersonaConfigDetailPage` wrapper: lines 668-800 (query hooks, loading/null guards)
- Tab shell: the `<Tabs>` + `<TabsList>` + `<TabsTrigger>` layout
- Status banner, action errors, publish/archive buttons
- Delegates each `<TabsContent>` to a dedicated tab component
- All ~30 useState hooks declared here, passed as props to tab components
- `ConfirmationDialog` usage for publish/archive

TRICKY: The 30+ useState hooks are all declared inside `PersonaConfigDetailPage` and used across tabs. The cleanest cut is to keep the state declarations in `persona-config-detail.tsx` and pass state + callbacks as props to each tab component. Do NOT try to use React context -- the state is write-heavy (many updater callbacks) and prop drilling across 4 tabs is cleaner than a context with 30 values.

Alternative: group related state into reducers (e.g., `useExtractionState`, `useSuggestionState`) in `persona-config-shared.tsx` and call them from the detail page. This reduces the prop count per tab.

#### `persona-config-overview-tab.tsx` (~200 LOC)
- The `<TabsContent value="configuration">` section (lines 1768-1985)
- `ConfigFormCard` (lines 2587-2732) -- reused by both list page and overview tab
- `AxisEditorCard` (lines 2735-2849) -- reused by overview, guided extraction, proposed axes
- Summary sidebar (status card, audit trail)
- Axes accordion (read-only for published configs)

#### `persona-config-users-tab.tsx` (~400 LOC)
- The `<TabsContent value="users">` section (lines 1987-2123)
- `SyntheticUserCard` (lines 2875-2933)
- Inline create form for synthetic users
- `PersonaGenerationSection` integration (already an external component)

#### `persona-config-transcripts-tab.tsx` (~350 LOC)
- The `<TabsContent value="transcripts">` section (lines 2125-2289)
- `TranscriptExtractionPanel` (lines 3163-3848) -- this component alone is 685 LOC
- `ModeSelectionCard` (lines 3850-3874)
- `TranscriptSignalList` (lines 3876-3902)
- `TranscriptAttachmentDialog` (lines 3904-4048)

WARNING: `TranscriptExtractionPanel` is 685 LOC by itself. Even after moving it out, the transcripts tab file will be ~400 LOC. Consider keeping `TranscriptExtractionPanel` as its own file `persona-config-extraction-panel.tsx` (~700 LOC) and having the transcripts tab import it. This keeps both files near the target.

#### `persona-config-axes-tab.tsx` (~350 LOC)
The axes generation UI is spread across both the list page (create form) and the detail page (edit draft). The shared pieces are:
- `SuggestedAxisCard` (lines 2438-2585)
- `AxisLibraryImportDialog` (lines 3048-3161)
- Suggestion state management (suggest, toggle, edit, apply, dismiss, merge)

Since this logic is reused by both `persona-configs-list.tsx` and `persona-config-detail.tsx`, extract it as reusable components rather than a tab.

#### `persona-config-generation-tab.tsx` (~150 LOC)
- The batch generation section within the users tab
- NOTE: `PersonaGenerationSection` is already extracted to `@/components/persona-generation-section`. This file would be a thin wrapper passing props from the detail page. May be unnecessary if we keep it as part of `persona-config-users-tab.tsx`.

#### `persona-config-review-tab.tsx` (~100 LOC)
- The `<TabsContent value="review">` section (lines 2292-2396)
- Study selector dropdown
- `PersonaVariantReviewGrid` integration (already an external component)
- Minimal logic -- mostly layout and loading/empty states.

### 1d. Shared state that needs extraction

The `PersonaConfigDetailPage` component (lines 668-2436) uses these shared state patterns:

1. **Suggestion state** (reused in both list create-form and detail edit-form):
   - `suggestedAxes`, `isSuggestionPanelOpen`, `isSuggestingAxes`, `suggestionError`
   - Handlers: `handleSuggestAxes`, `handleSuggestionSelectionToggle`, `handleSuggestionEditToggle`, `handleSuggestionAxisChange`, `handleDismissSuggestions`, `handleApplySuggestedAxes`
   - **Extraction strategy**: Create a `useSuggestionState(config, forceSuggestAxesError)` hook in `persona-config-shared.tsx`

2. **Axis library import state** (reused in list and detail):
   - `isAxisLibraryOpen`, `selectedLibraryAxisIds`
   - Handlers: `handleLibrarySelectionToggle`, `handleImportAxisDefinitions`
   - **Extraction strategy**: Bundle into the same hook or a separate `useAxisLibraryImport(draftForm)` hook

3. **Inline toast state** (reused in list and detail):
   - `inlineToast` + auto-dismiss effect
   - **Extraction strategy**: `useInlineToast()` hook in shared

4. **Transcript extraction state** (detail page only, but complex):
   - 15+ state variables: `isExtractionPanelOpen`, `extractionMode`, `preExtractionStep`, `guidedExtractionAxes`, `reviewArchetypes`, `reviewProposedAxes`, `extractionError`, `extractionNotice`, `isStartingExtraction`, `isApplyingExtractionResults`, `discardingArchetypeId`
   - 12+ handlers
   - 5 useEffect hooks that sync extraction status from the backend
   - **Extraction strategy**: Create `useExtractionState(config, configTranscripts, extractionStatus)` hook. This is the highest-risk extraction because the effects depend on `extractionStatus` (a backend query) and mutate many state variables.

5. **Confirmation dialog state** (detail page only):
   - `confirmationState`, `isConfirmingAction`
   - **Extraction strategy**: Simple enough to keep as props from the detail page.

### 1e. Tricky patterns flagged

1. **30+ useState hooks in one function scope**: The `PersonaConfigDetailPage` cannot easily be decomposed without passing many props or creating custom hooks. The recommended approach is to group into 3-4 custom hooks (`useSuggestionState`, `useExtractionState`, `useInlineToast`, `useAxisLibraryImport`) that each return the state + handlers as a bag of values.

2. **Duplicated helper functions**: `formatTimestamp`, `getErrorMessage`, `SummaryValue`, `LoadingCard` all have slightly different implementations across the 3 source files. The split must pick one canonical implementation for each in the shared file.

3. **`SuggestedAxisCard` / `AxisLibraryImportDialog` used by both list and detail**: These are NOT tab-specific. They must be placed in a file importable by both `persona-configs-list.tsx` and `persona-config-detail.tsx`. Best candidate: `persona-config-axes-tab.tsx` (as reusable components) or directly in `persona-config-shared.tsx` if they stay small.

4. **`TranscriptExtractionPanel` is 685 LOC**: Exceeds the 400 LOC target for any single file. Must be its own file or drastically simplified. Recommend `persona-config-extraction-panel.tsx`.

---

## 2. transcript-pages.tsx (1531 LOC)

### 2a. Component / function / type inventory

| Symbol | Kind | Lines | Used by |
|---|---|---|---|
| `TranscriptDoc` | type alias | 23 | everywhere |
| `PersonaConfigDoc` | type alias | 24 | detail page (attach dialog) |
| `TranscriptId` | type alias | 25 | everywhere |
| `ViewerAccess` | type | 27-32 | both pages |
| `TranscriptContent` | type | 34-47 | detail page |
| `TranscriptMetadataFormState` | type | 49-53 | detail page |
| `supportedTranscriptExtensions` | const | 55 | list page |
| `transcriptSelectClassName` | const | 56-57 | list page (filters) |
| `emptyTranscriptMetadataForm` | fn | 59-63 | detail page |
| **`TranscriptsPage`** | **export component** | **65-507** | router |
| **`TranscriptDetailPage`** | **export component** | **510-1263** | router |
| `LoadingCard` | component | 1266-1277 | both pages |
| `HighlightedTranscriptText` | component | 1279-1311 | detail page |
| `ConfigStatusBadge` | component | 1313-1328 | detail page |
| `SummaryValue` | component | 1330-1337 | both pages |
| `buildOptimisticTranscript` | fn | 1339-1362 | list page |
| `formatTimestamp` | fn | 1364-1369 | both pages |
| `parseTags` | fn | 1371-1380 | detail page |
| `getTranscriptExtension` | fn | 1382-1390 | list page |
| `inferContentType` | fn | 1392-1396 | list page |
| `statusBadgeVariant` | fn | 1398-1407 | both pages |
| `formatTranscriptStatus` | fn | 1409-1422 | both pages |
| `formatTranscriptFilterSummary` | fn | 1424-1464 | list page |
| `getErrorMessage` | fn | 1466-1488 | both pages |
| `highlightText` | fn | 1490-1531 | detail page |

### 2b. Dependency graph

```
TranscriptsPage
  reads: transcriptsQuery, viewerAccess, uploadTranscript
  uses: LoadingCard, SummaryValue, statusBadgeVariant, formatTranscriptStatus,
        formatTranscriptFilterSummary, buildOptimisticTranscript,
        getTranscriptExtension, inferContentType
  imports: Badge (ui), formatTimestamp (study-shared -- but also local copy)

TranscriptDetailPage
  reads: normalizedTranscriptId, transcriptQuery, viewerAccess, configs,
         transcriptPacks, getTranscriptContent, updateTranscriptMetadata,
         deleteTranscript, attachTranscript, detachTranscript
  uses: HighlightedTranscriptText, ConfigStatusBadge, SummaryValue, LoadingCard
  imports: NotFoundPlaceholder, Dialog (ui)
```

### 2c. Proposed cut plan

#### `transcripts-list.tsx` (~300 LOC)
- `TranscriptsPage` (lines 65-507)
- `buildOptimisticTranscript` (lines 1339-1362)
- `formatTranscriptFilterSummary` (lines 1424-1464)
- Local constants: `supportedTranscriptExtensions`, `transcriptSelectClassName`
- Local helpers: `getTranscriptExtension`, `inferContentType`
- Imports shared items from a small local shared block (or inline): `LoadingCard`, `SummaryValue`, `statusBadgeVariant`, `formatTranscriptStatus`, `formatTimestamp`, `getErrorMessage`

#### `transcript-detail.tsx` (~400 LOC)
- `TranscriptDetailPage` (lines 510-1263)
- `HighlightedTranscriptText` (lines 1279-1311)
- `highlightText` (lines 1490-1531)
- `ConfigStatusBadge` (lines 1313-1328)
- `emptyTranscriptMetadataForm` (lines 59-63)
- `parseTags` (lines 1371-1380)
- Imports shared items

#### Shared items (inlined or from existing shared files)
The transcript files share fewer items than persona-config. Options:
- Duplicate small helpers (`LoadingCard`, `SummaryValue`, `formatTimestamp`, `getErrorMessage`) if they already exist in a shared file.
- Better: import `formatTimestamp` from `@/routes/study-shared` (already exported), and consolidate `getErrorMessage`, `LoadingCard`, `SummaryValue` into a new `@/routes/shared-ui.tsx` or into `persona-config-shared.tsx` if that is renamed to something more general.

**Recommendation**: Create `@/routes/shared-ui.tsx` containing `LoadingCard`, `SummaryValue`, `getErrorMessage`, `formatTimestamp` -- these are duplicated across all 3 source files with near-identical implementations. `formatTimestamp` already exists in `study-shared.tsx`, so re-export from there or move to `shared-ui.tsx`.

Types (`TranscriptDoc`, `TranscriptId`, `ViewerAccess`, `TranscriptContent`, `TranscriptMetadataFormState`) stay local to transcript files since they are not shared with persona-config or study pages. `ViewerAccess` is duplicated across persona-config and transcript files -- consolidate in `shared-ui.tsx`.

### 2d. Tricky patterns

1. **Optimistic update in TranscriptsPage**: `buildOptimisticTranscript` creates a fake `TranscriptDoc` and splices it into local state before the backend confirms. This must stay in `transcripts-list.tsx`.

2. **Content loading effect chain**: `TranscriptDetailPage` has 4 `useEffect` hooks that chain: normalized ID -> transcript doc -> content loading -> highlight scroll. All must remain in `transcript-detail.tsx`.

---

## 3. study-pages.tsx (2044 LOC)

### 3a. Component / function / type inventory

| Symbol | Kind | Lines | Used by |
|---|---|---|---|
| `DEFAULT_ALLOWED_ACTIONS` | const | 27 | wizard, overview |
| `DEFAULT_FORBIDDEN_ACTIONS` | const | 28 | wizard, overview |
| `ACTIVE_RUN_STATUSES` | const | 29 | overview |
| `TERMINAL_OUTCOME_LABELS` | const | 30-39 | overview |
| `PersonaConfigListItem` | type alias | 41 | wizard |
| `ActiveRunListItem` | type | 42-48 | overview |
| `StudyFormValue` | type | 50-66 | wizard, overview (draft editor) |
| `StudyActionConfirmationState` | type | 68-74 | overview |
| `emptyStudyForm` | fn | 76-98 | wizard |
| **`StudiesListPage`** | **export component** | **100-165** | router |
| **`StudyCreationWizardPage`** | **export component** | **167-579** | router |
| **`StudyOverviewPage`** | **export component** | **581-620** | router |
| `DemoStudyOverviewPage` | component | 622-880 | overview (demo branch) |
| `StudyFindingsPage` | export component | 882-898 | router (NOTE: now in study-findings-page.tsx) |
| `StudyReportPage` | export component | 900-916 | router (NOTE: now in study-report-page.tsx) |
| `StudyListCard` | component | 918-963 | list page |
| `StudyOverviewResolved` | component | 966-1466 | overview (live branch) |
| `StudyStatusPage` | component | 1468-1541 | findings, report |
| `StudyDraftEditor` | component | 1543-1819 | overview |
| `StudyConfirmationDialog` | component | 1822-1866 | overview |
| `StateCard` | component | 1868-1879 | various |
| `Field` | component | 1881-1883 | wizard, draft editor |
| `SummaryValue` | component | 1885-1892 | everywhere |
| `ProgressBar` | component | 1894-1918 | overview |
| `PhaseStatusChip` | component | 1920-1943 | overview |
| `getCompletionPercentage` | fn | 1945-1951 | overview |
| `getReplayChipStatus` | fn | 1953-1963 | overview |
| `getAnalysisChipStatus` | fn | 1965-1975 | overview |
| `parseLineSeparatedList` | fn | 1977-1982 | wizard, draft editor |
| `getErrorMessage` | fn | 1984-1999 | various |
| `studyToFormValue` | fn | 2001-2019 | overview |
| `studyFormToTaskSpec` | fn | 2021-2038 | wizard, overview |
| `textareaClassName` | const | 2040-2041 | wizard, draft editor |
| `selectClassName` | const | 2043-2044 | wizard, draft editor |

### 3b. Dependency graph

```
StudiesListPage
  reads: api.studies.listStudies
  uses: StudyListCard, StateCard, StudyStatusBadge (from study-shared)
  NOTE: self-contained, no demo check

StudyCreationWizardPage
  reads: api.personaConfigs.list, api.studies.createStudy
  uses: Field, SummaryValue, StateCard
  state: form (StudyFormValue), isSubmitting, errorMessage

StudyOverviewPage
  checks: studyId === DEMO_STUDY_ID -> DemoStudyOverviewPage
  otherwise: queries api.studies.getStudy -> StudyOverviewResolved

DemoStudyOverviewPage
  reads: static demoStudyOverview, demoRuns, demoRunSummary (from study-demo-data)
  uses: SummaryValue, ProgressBar, PhaseStatusChip, StudyTabsNav, etc.

StudyOverviewResolved
  reads: viewerAccess, updateStudy, launchStudy, cancelStudy, runSummary, runs
  uses: StudyDraftEditor, StudyConfirmationDialog, SummaryValue, ProgressBar,
        PhaseStatusChip, StudyTabsNav, RunStatusBadge
  state: form, isEditing, confirmationState, etc.
```

### 3c. Proposed cut plan

#### `studies-list.tsx` (~200 LOC)
- `StudiesListPage` (lines 100-165)
- `StudyListCard` (lines 918-963)
- Imports from `study-shared.tsx`: `StudyStatusBadge`, `emptyStudyDetailSearch`, `formatTimestamp`

#### `study-new.tsx` (~400 LOC)
- `StudyCreationWizardPage` (lines 167-579)
- `Field` (line 1881-1883)
- `emptyStudyForm` (lines 76-98)
- `DEFAULT_ALLOWED_ACTIONS` (line 27), `DEFAULT_FORBIDDEN_ACTIONS` (line 28)
- `studyFormToTaskSpec` (lines 2021-2038), `parseLineSeparatedList` (lines 1977-1982)
- `SummaryValue` (lines 1885-1892) -- or import from shared
- `textareaClassName`, `selectClassName`
- `getErrorMessage` (lines 1984-1999) -- or import from shared
- `PersonaConfigListItem`, `StudyFormValue` types

#### `study-overview.tsx` (~400 LOC)
- `StudyOverviewPage` (lines 581-620) -- the DEMO_STUDY_ID branch point
- `DemoStudyOverviewPage` (lines 622-880)
- `StudyOverviewResolved` (lines 966-1466)
- `StudyDraftEditor` (lines 1543-1819)
- `StudyConfirmationDialog` (lines 1822-1866)
- `StateCard` (lines 1868-1879)
- `ProgressBar` (lines 1894-1918)
- `PhaseStatusChip` (lines 1920-1943)
- `getCompletionPercentage` (lines 1945-1951)
- `getReplayChipStatus` (lines 1953-1963)
- `getAnalysisChipStatus` (lines 1965-1975)
- `studyToFormValue` (lines 2001-2019)
- `StudyActionConfirmationState`, `ActiveRunListItem` types
- `ACTIVE_RUN_STATUSES`, `TERMINAL_OUTCOME_LABELS` constants

WARNING: This file will be ~500 LOC because `StudyOverviewResolved` alone is 500 lines, and `DemoStudyOverviewPage` is 258 lines. Mitigation options:
1. Split demo into `study-overview-demo.tsx` (~260 LOC) imported by `study-overview.tsx` (~350 LOC).
2. Extract `StudyDraftEditor` (277 LOC) into its own file `study-draft-editor.tsx`, reused by `study-overview.tsx`.
Option 2 is preferred because `StudyDraftEditor` shares `StudyFormValue` and form field patterns with `study-new.tsx`.

#### Dead exports to remove (CONFIRMED)
`StudyFindingsPage` and `StudyReportPage` (lines 882-916) plus `StudyStatusPage` (lines 1468-1541) are dead code. The router already imports these from the separately-extracted `study-findings-page.tsx` and `study-report-page.tsx`. Nothing imports them from `study-pages.tsx`. Delete them during the split -- this removes ~220 LOC from the source file and simplifies the split.

### 3d. The DEMO_STUDY_ID pattern

`StudyOverviewPage` (line 588) checks `studyId === DEMO_STUDY_ID` and branches to `DemoStudyOverviewPage`. This pattern exists only in the overview page. After the split:
- `study-overview.tsx` imports `DEMO_STUDY_ID` from `@/routes/skeleton-pages`
- `study-overview.tsx` imports demo data from `@/routes/study-demo-data`
- No other split file needs the demo check.

### 3e. `useStudyData(studyId)` hook consideration

The spec suggests a `useStudyData(studyId)` hook for demo/live transparency. This would:
- Return `{ study, isLoading, isDemo }` where study is either the live query or the static demo object
- Eliminate the `if (studyId === DEMO_STUDY_ID)` branch

This is a nice-to-have but NOT required for the file split. Implement it as a follow-up to avoid mixing refactor types.

---

## 4. Router update plan (router.tsx)

After the split, `router.tsx` imports change from:

```ts
import {
  PersonaConfigDetailPage as PersonaConfigDetailRoutePage,
  PersonaConfigsPage as PersonaConfigsRoutePage,
} from "@/routes/persona-config-pages";
```

To:

```ts
import { PersonaConfigsPage as PersonaConfigsRoutePage } from "@/routes/persona-configs-list";
import { PersonaConfigDetailPage as PersonaConfigDetailRoutePage } from "@/routes/persona-config-detail";
```

Similarly for transcript and study imports:

```ts
// Before
import { TranscriptDetailPage, TranscriptsPage } from "@/routes/transcript-pages";
import { StudiesListPage, StudyCreationWizardPage, StudyOverviewPage } from "@/routes/study-pages";

// After
import { TranscriptsPage } from "@/routes/transcripts-list";
import { TranscriptDetailPage } from "@/routes/transcript-detail";
import { StudiesListPage } from "@/routes/studies-list";
import { StudyCreationWizardPage } from "@/routes/study-new";
import { StudyOverviewPage } from "@/routes/study-overview";
```

Delete `StudyFindingsPage`, `StudyReportPage`, and `StudyStatusPage` from `study-pages.tsx` -- they are confirmed dead code (router already imports from separate files).

---

## 5. Test files to create

### `persona-configs-list.test.tsx`
- Renders list with active and archived configs
- Shows empty state when no configs
- Opens create form on button click
- Create form submit calls `createDraft` and navigates
- Import dialog opens and submits JSON
- Axis suggestion flow: suggest -> review -> apply
- Axis library import flow: browse -> select -> import
- Archived configs rendered inside `<details>` element

### `studies-list.test.tsx`
- Renders loading state
- Renders list of study cards with status badges
- Each card shows run summary progress
- Empty state shows create CTA
- Create button links to `/studies/new`

---

## 6. File creation order (recommended)

Implement in this order to keep the app working at every step:

1. **`shared-ui.tsx`** -- extract duplicated `getErrorMessage`, `LoadingCard`, `SummaryValue`, `ViewerAccess`, consolidate `formatTimestamp` with existing `study-shared.tsx` export
2. **`persona-config-shared.tsx`** -- types, helpers, small UI components
3. **`persona-configs-list.tsx`** + delete old export from `persona-config-pages.tsx`
4. **`persona-config-overview-tab.tsx`** -- `ConfigFormCard`, `AxisEditorCard`
5. **`persona-config-axes-tab.tsx`** -- `SuggestedAxisCard`, `AxisLibraryImportDialog`
6. **`persona-config-users-tab.tsx`** -- `SyntheticUserCard`, inline form
7. **`persona-config-transcripts-tab.tsx`** + **`persona-config-extraction-panel.tsx`**
8. **`persona-config-review-tab.tsx`**
9. **`persona-config-detail.tsx`** -- compose tabs, rewire router
10. **`transcripts-list.tsx`** + **`transcript-detail.tsx`** -- rewire router
11. **`studies-list.tsx`** + **`study-new.tsx`** + **`study-overview.tsx`** -- rewire router
12. **Update `router.tsx`** imports
13. **Delete `persona-config-pages.tsx`, `transcript-pages.tsx`, `study-pages.tsx`** once all imports are rewired
14. **Create test files**: `persona-configs-list.test.tsx`, `studies-list.test.tsx`

---

## 7. Risk summary

| Risk | Severity | Mitigation |
|---|---|---|
| 30 useState hooks in PersonaConfigDetailPage | HIGH | Group into 3-4 custom hooks (`useSuggestionState`, `useExtractionState`, `useInlineToast`) |
| TranscriptExtractionPanel is 685 LOC | MEDIUM | Give it its own file `persona-config-extraction-panel.tsx` |
| Duplicated helpers across 3 source files | MEDIUM | Canonical implementations in `shared-ui.tsx` |
| study-overview.tsx exceeds 400 LOC target | MEDIUM | Extract `StudyDraftEditor` or `DemoStudyOverviewPage` to their own files |
| persona-config-shared.tsx exceeds 150 LOC target | LOW | Split into types file + shared components file if needed |
| Dead `StudyFindingsPage` / `StudyReportPage` exports | LOW | CONFIRMED dead -- safe to delete during split |
| `DEMO_STUDY_ID` conditional only in overview | LOW | Stays in `study-overview.tsx`, no propagation needed |
