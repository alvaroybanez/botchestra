# PRD-1: PersonaEngine Deep Module

**Project:** Botchestra — Synthetic Persona Validation Platform
**Phase:** 1 of 5
**Status:** Draft
**Depends on:** PRD-0

---

## Problem Statement

Researchers need a way to generate large, diverse, behaviorally coherent sets of synthetic persona variants from a small set of hand-authored proto-personas. Without a dedicated system, variant generation would be ad-hoc, inconsistent, and prone to producing near-duplicate or implausible personas that undermine study validity. The PersonaEngine exists to own the full lifecycle of persona packs — from authoring and importing proto-personas, through mathematically principled coverage sampling and AI-driven expansion, to a validation gate that enforces coherence and distinctness — so that studies start with a trustworthy variant cohort and callers never need to understand the internals.

---

## Solution

PersonaEngine is a deep Convex module that exposes a thin, stable interface for managing persona packs and generating validated variant sets. It hides all internal complexity: coverage sampling geometry, axis normalization, LLM prompt construction, structured output parsing, validation scoring, near-duplicate detection, and retry logic. Researchers use `previewVariants(packId, budget)` to inspect the projected pack coverage, while StudyOrchestrator invokes `generateVariantsForStudy(studyId)` to materialize the accepted study-scoped variants that a launch will actually use. Callers never touch sampling math, prompt templates, or regeneration loops. The module writes all accepted variants to Convex tables and exposes a set of queries for the frontend to display pack state and variant grids in real time.

---

## User Stories

### Pack Management

1. As a Researcher, I want to create a new persona pack with a name, description, and context, so that I have a container to build out a behavioral population for a study.
2. As a Researcher, I want to define shared behavioral axes (key, label, description, low/mid/high anchors, weight) on a pack, so that all proto-personas and generated variants share a common measurement space.
3. As a Researcher, I want to save a pack as a draft and return to edit it later, so that pack authoring can happen incrementally over multiple sessions.
4. As a Researcher, I want to publish/freeze a pack, so that once a study is launched against it the variant set cannot change and results remain reproducible.
5. As a Researcher, I want to archive a pack that is no longer in use, so that it no longer appears in active pack lists but its data is preserved for reference.
6. As a Researcher, I want to see a list of all packs with their status, version, and timestamps, so that I can find and manage packs across projects.
7. As an Admin, I want pack mutations to record who created and last modified a pack, so that there is an audit trail for collaborative environments.

### Proto-Persona Editing

8. As a Researcher, I want to add a proto-persona to a pack with a name, summary, and per-persona axis overrides, so that I can anchor the variant space at a meaningful behavioral archetype.
9. As a Researcher, I want to edit an existing proto-persona's name, summary, axes, and notes, so that I can refine archetypes as my understanding of the user population evolves.
10. As a Researcher, I want to delete a proto-persona from a draft pack, so that I can remove archetypes that are redundant or no longer relevant.
11. As a Researcher, I want to attach evidence snippets to a proto-persona, so that there is a rationale trace linking the archetype to real user data or research artifacts.
12. As a Researcher, I want to see the source type of a proto-persona (manual, json_import, transcript_derived), so that I know the provenance of each archetype.

### Import / Export

13. As a Researcher, I want to import a persona pack from a JSON file, so that I can reuse packs authored outside the app or shared by a colleague.
14. As a Researcher, I want to export a persona pack to a JSON file, so that I can share it, version-control it externally, or use it as a starting point for a new pack.
15. As a Researcher, I want import to validate the JSON structure against the pack schema before writing anything to the database, so that malformed imports fail cleanly with a descriptive error rather than corrupting data.

### Variant Generation

16. As a Researcher, I want the system to generate a full validated variant set for a specific study from its selected pack and run budget, so that I do not need to understand sampling geometry or prompt engineering to prepare a launch.
17. As a Researcher, I want the system to allocate variants evenly across proto-personas and distribute any remainder to higher-complexity proto-personas, so that every archetype has minimum representation and more complex archetypes get proportionally more exploration.
18. As a Researcher, I want 70% of generated variants to be edge-heavy and 30% to be interior, so that the study achieves broad support coverage while still sampling central behavioral profiles.
19. As a Researcher, I want minimum distance enforced between variants in axis space, so that the cohort is not dominated by near-duplicates.
20. As a Researcher, I want each variant to include a `firstPersonBio` (80–150 words), 5–8 `behaviorRules`, and a `tensionSeed`, so that agents have enough behavioral grounding to act distinctively in a study.
21. As a Researcher, I want the generation pipeline to automatically regenerate variants that fail validation, so that the final cohort always meets coherence and distinctness thresholds without manual intervention.
22. As a Researcher, I want to call `previewVariants(packId, budget)` before committing, so that I can inspect the projected coverage distribution and axis spread without writing any variants to the database.
23. As a Researcher, I want a summary returned from study variant generation that includes accepted count, rejected count, retry count, and coverage metrics, so that I can assess generation quality at a glance.
24. As a Researcher, I want variant generation to respect a configurable run budget between 50 and 100, defaulting to 64, so that study sizing is controlled and within platform limits.

### Variant Review

25. As a Researcher, I want to browse generated variants for a pack in a grid view showing axis values, edge score, and bio preview, so that I can spot-check the variant population before launching a study.
26. As a Researcher, I want to see each variant's coherence score and distinctness score, so that I understand why borderline variants were accepted or rejected.
27. As a Researcher, I want to filter variants by proto-persona or axis range, so that I can verify that each archetype is adequately represented.

---

## Implementation Decisions

### Module Boundary

PersonaEngine is a deep module. The public interface is deliberately small: a set of Convex mutations for pack and proto-persona lifecycle, one pack-level preview action (`previewVariants`) and one orchestration-facing materialization action (`generateVariantsForStudy`), plus a set of queries. Nothing about sampling algorithms, prompt text, validation thresholds, or retry counts is exposed. If those internals change, callers are unaffected.

### Convex as Canonical Data Store

All pack, proto-persona, and variant state lives in Convex. The schema is canonical. All function arguments use Zod validators via `convex-helpers`. Callers never write directly to `personaVariants` — StudyOrchestrator calls `generateVariantsForStudy(studyId)` and PersonaEngine owns all writes.

### Normalized `protoPersonas` Table

Proto-personas are a separate normalized table keyed by `packId`, not embedded in the `personaPacks` document. This avoids document-size growth as evidence snippets accumulate and simplifies per-proto-persona queries and edits without loading the full pack.

### AI Integration via `packages/ai`

All LLM calls go through the thin `packages/ai` wrapper for provider configuration, retry policy, and output validation helpers. PersonaEngine owns its own prompt templates internally — they are not part of a shared prompts layer. Model names are never hardcoded; the model for persona expansion and the model for validation scoring are resolved from org-level settings at call time. OpenAI is the default provider via `@ai-sdk/openai`.

### Stage 1: Coverage Sampling (Internal)

The sampler operates per proto-persona. It produces axis-space coordinates normalized to `[-1, 1]`. The 70/30 edge/interior split is implemented as a weighted sampling strategy: edge-heavy points are sampled near the boundaries of each axis; interior points fill the center. Minimum distance enforcement runs as a post-pass that rejects candidates that are too close to already-accepted points and replaces them. All sampling logic is pure TypeScript functions — no AI involved at this stage.

### Stage 2: Persona Expansion (Internal)

Each sampled coordinate is sent to the LLM with a structured prompt that includes the pack context, the proto-persona summary, the axis definitions, and the target axis values. The model returns a structured object containing `firstPersonBio`, `behaviorRules`, and `tensionSeed`. The expansion prompt enforces: no self-negating contradiction, no protected-class stereotyping, no excessive backstory, task-relevant behavior priority, and internal coherence. Structured output parsing uses the AI SDK's schema-bound generation.

### Validation Gate (Internal)

After expansion, each variant is scored for coherence (internal consistency of bio and rules) and distinctness (distance from all accepted variants in the current batch). Variants below either threshold are rejected and queued for regeneration up to a configurable retry limit. Near-duplicate detection uses axis-space distance as the primary signal, with bio similarity as a secondary filter. Variants with a tension seed that makes the task implausible are also rejected. Validation scoring may use the LLM for coherence and uses pure math for distinctness and distance.

### Variant Allocation (Internal)

Given a budget `B` and `N` proto-personas: each gets `floor(B/N)` variants. The remainder `B mod N` is distributed one additional variant at a time to proto-personas ordered by a complexity proxy (number of axis overrides, length of evidence snippets, manual complexity annotation if present).

### Pack Status Transitions

`draft -> published -> archived`. Published packs are frozen: no mutations to axes, proto-personas, or variants are accepted. Archiving a published pack is allowed. Reverting a published pack to draft is not allowed in v1.

### JSON Import/Export

Import and export use the same canonical JSON shape. Import validates with Zod before any write. Import creates a new pack in `draft` status regardless of the status in the JSON. Export includes all proto-personas and their evidence snippets but does not include generated variants (variants are regenerated per study).

---

## Testing Decisions

### Pure Function Unit Tests

The following are tested as pure functions with no Convex or network dependency:

- **Coverage sampler**: given N proto-personas and a budget, assert correct variant counts, correct 70/30 split, correct axis normalization to `[-1, 1]`, and that minimum distance is enforced between all accepted points.
- **Variant allocation**: assert even split and remainder distribution to higher-complexity proto-personas across multiple budget/count combinations including edge cases (1 proto-persona, budget not evenly divisible, maximum budget).
- **Axis normalization**: assert boundary inputs map to ±1 and midpoint maps to 0.
- **Near-duplicate detection**: assert pairs below the distance threshold are flagged and pairs above are not.
- **JSON schema validation**: assert valid pack JSON passes and invalid JSON produces typed errors at the correct fields.

### Boundary Integration Tests (Convex Test Environment)

- `createPack` / `updatePack` / `publishPack` / `archivePack` lifecycle: assert status transitions and that mutations on published packs are rejected.
- `createProtoPersona` / `updateProtoPersona` / `deleteProtoPersona`: assert correct writes and that operations against a published pack's proto-personas are rejected.
- `generateVariantsForStudy` with a mocked AI layer: assert that the correct number of accepted variants is written to `personaVariants` for the target `studyId`, that allocation across proto-personas matches the rule, and that the summary returned reflects actual DB state.
- Validation gate retry: simulate LLM returning below-threshold variants on first N attempts and assert retries occur up to the limit and that the final accepted count is correct.
- `previewVariants`: assert it returns coverage distribution without writing any rows to `personaVariants`.

### Not Tested Here

The LLM prompt quality (bio coherence, rule relevance) is evaluated manually by researchers during pack review. End-to-end study execution is tested at the study orchestration layer.

---

## Out of Scope

- **Transcript ingestion**: extracting proto-personas from uploaded user research transcripts is deferred to v1.1. The `sourceType: "transcript_derived"` field is reserved in the schema for future use.
- **Study lifecycle decisions**: PersonaEngine materializes study-scoped variants when given a `studyId`, but it does not decide when a study is ready, queued, or launchable. Those state transitions remain the responsibility of StudyOrchestrator.
- **Browser execution**: PersonaEngine does not dispatch runs, manage browser leases, or interact with the Cloudflare Worker layer.
- **Run summarization and issue clustering**: analysis-layer responsibilities.
- **Report generation**: owned by the reporting module.
- **Cross-study learning**: personas are not updated based on study outcomes in v1.
- **Evaluator optimization**: PersonaEngine does not read run outcomes to improve future variant generation.
- **200+ run cohorts**: the budget cap of 100 is a hard constraint in v1.

---

## Further Notes

- **Version field on packs**: incremented on each `publishPack` call. It exists so studies can record which version of a pack was active when they were launched.
- **`previewVariants` is not a cached artifact**: it runs the sampling stage (Stage 1) deterministically but does not run expansion or write study-scoped variants. It returns the projected axis-space distribution, edge/interior counts per proto-persona, and estimated coverage metrics.
- **Regeneration cap**: if retry limit is exhausted, `generateVariantsForStudy` writes the best available variants marked `accepted: false`. The summary surfaces this so the researcher knows which proto-personas need attention. Generation does not fail hard.
- **Study-scoped variants are intentional:** `personaVariants` carry `studyId` so each study has an immutable cohort snapshot derived from a published pack version and budget at generation time.
- **Frozen pack enforcement**: the published check is enforced inside each mutation using a shared `assertPackIsDraft(packId)` helper.
- **No streaming**: persona expansion uses non-streaming structured generation. Variants are written to the DB in batch after all retries complete.
- **Distinctness vs. near-duplicate**: distinctness score is a continuous metric (0–1). Near-duplicate detection is a hard binary threshold. Both can reject a variant independently.
