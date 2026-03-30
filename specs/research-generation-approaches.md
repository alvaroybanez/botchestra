# Synthetic User Generation Approaches — Research Comparison

## Current Architecture Summary

### Two-level model: syntheticUser → personaVariant

| Entity | Role | Schema location | Current limit |
|---|---|---|---|
| **syntheticUser** | Archetype / proto-persona. Has a name, summary, axes (with anchors), evidence snippets, source type. Belongs to a `personaPack`. | `syntheticUsers` table | **10 per pack** (`MAX_SYNTHETIC_USERS_PER_PACK`) |
| **personaVariant** | Expanded instance of a syntheticUser for a specific study. Has axis values (numeric [-1,1]), firstPersonBio, behaviorRules, tensionSeed, coherence/distinctness scores. | `personaVariants` table | Bounded by run budget: **50–100** per study (`MIN_RUN_BUDGET`..`MAX_RUN_BUDGET`) |

**Current flow:**
1. A `personaPack` contains ≤10 syntheticUsers and shared axes (3–5 axes).
2. When a study is created, `planVariants()` allocates the budget evenly across syntheticUsers, then samples axis positions using Halton sequences (70% edge-heavy, 30% interior).
3. Each sampled axis-value vector is expanded into a full persona card via one LLM call (`generateCandidate`), producing firstPersonBio, behaviorRules, tensionSeed, coherenceScore.
4. Validation gate rejects low-coherence or near-duplicate variants; retries up to 3 times.

### Key constraints for scaling to 100–1000
- `MAX_SYNTHETIC_USERS_PER_PACK = 10` — generation currently happens at the **variant** level, not the syntheticUser level.
- `MAX_RUN_BUDGET = 100` — hard cap on variants per study.
- `resolveRunBudget()` enforces 50–100 range.
- Halton-sequence distance rejection becomes expensive at O(n²) for large n.
- Each variant requires 1 LLM call (+ up to 3 retries), so 1000 variants = 1000–4000 LLM calls.

---

## Approach Comparison

### A. Combinatorial Grid

**Method:** Define discrete positions per axis (e.g., low=-0.8, mid=0, high=0.8). Enumerate all combinations across k axes. For k=5 with 3 levels each: 3⁵ = 243 grid points. Expand each into a full persona.

| Criterion | Assessment |
|---|---|
| **Diversity coverage** | ⭐⭐⭐ Excellent coverage of corners and systematic sweep. Avoids mode collapse by construction. However, misses non-grid regions and over-samples low-information interior. |
| **Scalability (100)** | ⭐⭐⭐ Natural fit: 5 axes × 3 levels = 243, prune to 100 by selecting maximally-distant subset. |
| **Scalability (1000)** | ⭐⭐ Needs 4+ levels per axis to get enough combinations (4⁵=1024). Gets unwieldy at 6+ axes. |
| **Cost efficiency** | ⭐⭐ One LLM call per grid point. No Stage-1 calls. At 1000: ~1000 calls. |
| **Compatibility** | ⭐⭐⭐ Axis values map directly to current schema. No schema changes needed for variants. Grid definition can be a simple config. |
| **Quality** | ⭐⭐ Produces mechanically-distributed points. Many combinations may be semantically incoherent (e.g., "highly impatient" + "highly risk-averse" + "low budget sensitivity" may not map to a real-world user). No autoregressive conditioning to ensure semantic plausibility. |

**Schema/code changes needed:**
- Raise or remove `MAX_RUN_BUDGET = 100` cap.
- Add grid-level config (levels per axis) to study or pack.
- New pure function: `generateCombinatoricGrid(axes, levelsPerAxis)`.
- Replace `planVariants()` with grid-based planner when budget > 100.

---

### B. Scaled Halton Sampling (Current approach, extended)

**Method:** Keep existing Halton-sequence edge/interior sampling but raise the budget cap to 1000. The sampling already uses quasi-random low-discrepancy sequences with distance rejection.

| Criterion | Assessment |
|---|---|
| **Diversity coverage** | ⭐⭐⭐ Halton sequences are designed for uniform space-filling. Edge-heavy split (70/30) ensures extreme profiles are covered. Distance rejection prevents clustering. |
| **Scalability (100)** | ⭐⭐⭐ Already works (current max). |
| **Scalability (1000)** | ⭐⭐ Feasible but distance rejection loop becomes O(n²) — each candidate checks against all accepted samples. At 1000 samples in 5D space, this is ~500K distance calculations per generation pass. The `minimumDistanceThreshold` may need to shrink, which reduces de-duplication value. Also, `MAX_ATTEMPTS_PER_PLAN_SLOT = 512` may be insufficient if the space is crowded. |
| **Cost efficiency** | ⭐⭐ One LLM call per variant. At 1000: ~1000–4000 calls (with retries). No overhead for trait-profile stage. |
| **Compatibility** | ⭐⭐⭐⭐ Minimal changes. Just raise `MAX_RUN_BUDGET`. |
| **Quality** | ⭐⭐ Same issue as Grid: axis values are sampled mathematically, not semantically conditioned. A point at (-0.9, 0.2, 0.7, -0.5, 0.1) has no guarantee of coherence as a "real person." Coherence is only checked post-hoc by the LLM's expansion + validation gate. |

**Schema/code changes needed:**
- Change `MAX_RUN_BUDGET` from 100 to 1000.
- Optimize distance rejection: use a spatial index (k-d tree) instead of brute-force O(n²).
- Possibly reduce `minimumDistanceThreshold` dynamically based on budget and dimensionality.
- Consider batching LLM expansion calls (parallel Promise.all batches of 10-20).

---

### C. Paper's Two-Stage Autoregressive Approach

**Method:** Inspired by Google's "Persona Generators" paper:
- **Stage 1 (Trait Profile Generation):** An LLM generates intermediate trait profiles one-at-a-time, autoregressively. Each new profile is conditioned on all previously generated profiles to maximize diversity across axes. The LLM "sees" what's been generated and explicitly tries to fill gaps. Output: a set of lightweight trait vectors + short description seeds.
- **Stage 2 (Expansion):** Each trait profile is expanded into a full persona card in parallel (like current `generateCandidate`).

| Criterion | Assessment |
|---|---|
| **Diversity coverage** | ⭐⭐⭐⭐ Best diversity guarantee. The LLM actively avoids mode collapse because it conditions on the existing population. Can identify underrepresented corners and intentionally fill them. Semantic coherence is baked in — the LLM only generates trait combinations that make sense as real users. |
| **Scalability (100)** | ⭐⭐⭐ Stage 1 is sequential (100 LLM calls) but outputs are lightweight (just trait values + seed text). Stage 2 is embarrassingly parallel. |
| **Scalability (1000)** | ⭐ Stage 1 context window becomes the bottleneck. At 1000 profiles, the accumulated context of all prior profiles may exceed context limits (~200 tokens × 1000 = 200K tokens). Requires windowing/summarization strategies. Also 1000 sequential LLM calls for Stage 1 = significant latency. |
| **Cost efficiency** | ⭐ Most expensive. Stage 1: N calls (sequential, growing context). Stage 2: N calls (parallel). Total: 2N calls minimum. At 1000: ~2000+ calls, with Stage 1 using increasingly expensive long-context inference. |
| **Compatibility** | ⭐⭐ Needs a new intermediate representation. Could model Stage 1 output as syntheticUsers (new source type), or as a new `traitProfile` entity. Requires expanding `MAX_SYNTHETIC_USERS_PER_PACK` if using syntheticUser level, or adding a new table. |
| **Quality** | ⭐⭐⭐⭐ Highest quality. Trait combinations are semantically grounded because the LLM reasons about which real-world user profiles are missing. Avoids impossible combinations. |

**Schema/code changes needed:**
- New generation action: `generateTraitProfilesAutoregressive()` — Stage 1 loop.
- Either: (a) raise `MAX_SYNTHETIC_USERS_PER_PACK` to 1000 and generate at syntheticUser level, or (b) add a new `traitProfiles` table as an intermediate step.
- Stage 1 output schema: `{ axisValues: Record<string, number>, seedDescription: string, intendedGap: string }`.
- Windowing strategy for Stage 1 at scale: summarize prior profiles into a coverage histogram rather than listing them all.
- Modify `personaVariantGeneration.ts` to accept trait profiles as input instead of only syntheticUsers.
- New prompt engineering for the autoregressive diversity-maximizing Stage 1 call.

---

### D. Hybrid: Grid Anchors + Interior Sampling

**Method:** Use the combinatorial grid to define "anchor" points at axis extremes and midpoints. Then use Halton sampling to fill the interior space between anchors. The grid guarantees coverage of important corners; the sampling fills the continuous space.

| Criterion | Assessment |
|---|---|
| **Diversity coverage** | ⭐⭐⭐⭐ Anchors guarantee extremes are covered. Interior sampling avoids the "hollow middle" problem of pure grid approaches. Best of both deterministic and quasi-random. |
| **Scalability (100)** | ⭐⭐⭐ 32 corner anchors (2⁵) + 68 interior samples = 100. Clean split. |
| **Scalability (1000)** | ⭐⭐⭐ 32–243 anchors + 757–968 interior samples. The grid portion doesn't grow problematically. Interior sampling scales linearly. |
| **Cost efficiency** | ⭐⭐⭐ Same as approaches A/B: one LLM call per point. No overhead for intermediate representation. At 1000: ~1000 calls. |
| **Compatibility** | ⭐⭐⭐ Builds naturally on existing code. Grid generation is a new pure function; interior sampling reuses existing Halton sampler. |
| **Quality** | ⭐⭐ Same semantic coherence concern as A/B — axis values are mathematically determined, not LLM-grounded. Coherence validated post-hoc. |

**Schema/code changes needed:**
- Raise `MAX_RUN_BUDGET` to 1000.
- New pure function: `generateGridAnchors(axes, levels)`.
- Modify `planVariants()` to accept pre-defined anchor points and fill remaining budget with Halton interior samples.
- Optimize distance rejection as in approach B.

---

## Summary Comparison Table

| | A: Grid | B: Scaled Halton | C: Two-Stage Paper | D: Hybrid |
|---|---|---|---|---|
| **Diversity** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Scalability @100** | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| **Scalability @1000** | ⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐⭐ |
| **Cost efficiency** | ⭐⭐ | ⭐⭐ | ⭐ | ⭐⭐⭐ |
| **Schema compatibility** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| **Semantic quality** | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Implementation effort** | Low | Minimal | High | Medium |

---

## Recommendation

**For 100-scale: Approach D (Hybrid) is the pragmatic winner.**
- Minimal code changes: add grid-anchor generation, reuse existing Halton sampler.
- Deterministic corner coverage + quasi-random interior = excellent diversity.
- One LLM call per variant = cost-efficient.
- Fully compatible with current schema (just raise `MAX_RUN_BUDGET`).

**For 1000-scale: A phased approach combining D + elements of C.**

1. **Phase 1 (immediate):** Implement D (Hybrid) with budget cap raised to 1000. This gets you 1000 diverse persona variants quickly and cheaply. Pure-math diversity, post-hoc LLM quality check.

2. **Phase 2 (optional quality upgrade):** Add a lightweight Stage-1 "semantic seeding" step from approach C, but only for the anchor points (32–100 anchors). Instead of autoregressively generating all 1000 trait profiles, have the LLM review and validate/adjust the grid anchors for semantic coherence. Then expand all points. This gives you the quality benefits of C without the scalability cost.

**Key insight:** The current two-level model (syntheticUser → personaVariant) maps well to the paper's two-stage approach. syntheticUsers are already "intermediate representations" (archetypes with axis positions). The scaling question is whether to create more syntheticUsers (raise the 10-per-pack cap) or more variants per syntheticUser (raise the 100-per-study cap). For 1000-scale, the answer is **both**: ~50–100 syntheticUsers (auto-generated as anchors) × 10–20 variants each = 500–2000 total variants.

### Minimum required changes for any approach

| Change | Approaches |
|---|---|
| Raise `MAX_RUN_BUDGET` from 100 to ≥1000 | All |
| Raise `MAX_SYNTHETIC_USERS_PER_PACK` from 10 to ≥100 | C, and recommended for D at scale |
| Optimize O(n²) distance rejection | B, D at 1000-scale |
| New grid/anchor generation pure function | A, D |
| New autoregressive Stage-1 action | C |
| New `traitProfiles` table or expanded syntheticUser sourceType | C |
| Batch LLM expansion (parallel batches) | All at 1000-scale |
