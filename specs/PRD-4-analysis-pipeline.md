# PRD-4: AnalysisPipeline Deep Module

**Project:** Botchestra — Synthetic Persona Validation Platform
**Phase:** 4 of 5
**Status:** Draft
**Depends on:** PRD-0, PRD-3

---

## Problem Statement

When a study cohort finishes execution, the raw data is a flat list of browser run records — outcome codes, milestone screenshots, self-report responses, frustration event counts, and artifact keys. This data is too voluminous and unstructured for a researcher or product reviewer to read directly. Without automated synthesis, every study would require manual triage across 50–100 run records before any finding could be articulated.

The AnalysisPipeline exists to close this gap. It consumes completed run data and produces a ranked, evidence-backed report that a product or design reviewer can read without first understanding how the underlying system works.

---

## Solution

AnalysisPipeline is a **deep module**: one public entry point (`analyzeStudy`) hides a four-stage AI pipeline. Callers do not need to know the stages exist. The module delivers:

1. A structured per-run summary for every completed run.
2. Issue clusters: groups of semantically and spatially similar failures with title, affected segments, evidence, replay confidence, recommendation, and severity.
3. A ranked issue list ordered by a deterministic `impact_score` formula.
4. A `StudyReport` record with headline metrics, ordered issue cluster IDs, and keys to HTML and JSON report artifacts in R2.
5. A Findings explorer for interactive filtering and annotation.
6. A Report page for management-ready consumption and export.

---

## User Stories

### Researcher

1. As a Researcher, when a study transitions to `analyzing`, the pipeline starts automatically.
2. As a Researcher, I want every completed run to receive a structured summary classifying outcome, failure point, and representative quote.
3. As a Researcher, I want runs with similar failure patterns automatically clustered into named issue groups.
4. As a Researcher, I want each cluster to carry an AI-assigned severity label (blocker, major, minor, cosmetic).
5. As a Researcher, I want each cluster to include affected proto-persona IDs and axis ranges.
6. As a Researcher, I want representative run IDs surfaced per cluster for evidence drill-down.
7. As a Researcher, I want each cluster to carry `replayConfidence` from the replay verification stage.
8. As a Researcher, I want each cluster to include an AI-generated recommendation.
9. As a Researcher, I want each cluster to carry a `confidenceNote` describing the AI's uncertainty.
10. As a Researcher, I want to add freetext analyst notes to any issue cluster.
11. As a Researcher, I want the report to include a required limitations section stating findings are synthetic and directional.
12. As a Researcher, I want the pipeline to handle runs with terminal error codes gracefully (excluded from clustering, counted in metrics).

### Product/Design Reviewer

13. As a Reviewer, I want to see a ranked issue list at `/studies/:studyId/findings`.
14. As a Reviewer, I want to filter findings by severity.
15. As a Reviewer, I want to filter by proto-persona.
16. As a Reviewer, I want to filter by axis range.
17. As a Reviewer, I want to filter by run outcome.
18. As a Reviewer, I want to filter by URL or URL prefix.
19. As a Reviewer, I want each issue card to link to representative run records.
20. As a Reviewer, I want the Report page to open with headline metrics (completion rate, abandonment rate, median steps, median duration).
21. As a Reviewer, I want each ranked issue as a structured card with title, what broke, where, affected segments, evidence thumbnails, quotes, replay confidence, recommendation, and confidence note.
22. As a Reviewer, I want evidence screenshots to link to full-resolution R2 artifacts.
23. As a Reviewer, I want an "Export JSON" button that downloads the full report artifact.
24. As a Reviewer, I want an "Export HTML" button that downloads a self-contained HTML report.
25. As a Reviewer, I want an internal share link for the report.
26. As a Reviewer, I want analyst notes visible on issue cards in both Findings and Report views.

### Admin

27. As an Admin, I want each analysis stage to use a separately configurable AI model key.
28. As an Admin, I want the pipeline to fail gracefully with an error state if AI calls fail after retries.
29. As an Admin, I want R2 keys for reports stored on the StudyReport record for auditability.

---

## Implementation Decisions

### Module Boundary

Thin public interface:
- Action: `analyzeStudy(studyId)` — full pipeline entry point
- Mutation: `addNote(issueId, note, authorId)` — analyst annotation
- Query: `getReport(studyId)`, `listFindings(studyId, filters)`, `getIssueCluster(id)`
- Filters: severity, protoPersonaId, axisKey + axisMin + axisMax, outcome, urlPrefix

### AI Integration

All calls via `@ai-sdk/openai` through `packages/ai` wrapper. AnalysisPipeline owns its prompts internally. Model names never hardcoded — resolved from settings per task category (summarization, clustering, recommendation).

### Stage 1: Per-run Summarization

For each completed run, generate: outcome classification, likely failure point, last successful state, blocking text/error, frustration markers, self-reported confidence, representative quote. Runs with `infra_error` or `cancelled` excluded from summarization but counted in headline metrics.

### Stage 2: Issue Clustering

Multi-signal similarity approach — AI receives all summaries and groups by: failure summary similarity, page/location similarity, URL/path similarity, action sequence similarity, shared error text, shared abandonment pattern. Each cluster materialized as an `IssueCluster` record.

### Stage 3: Ranking

```
impact_score = severity_weight × affected_run_rate × replay_confidence × segment_spread
```

Default severity weights: blocker=1.0, major=0.6, minor=0.3, cosmetic=0.1

`segment_spread` in range `[1.0, 1.5]`:
```
segment_spread = 1.0
  + 0.25 × min(distinctProtoPersonaCount / totalProtoPersonaCount, 1.0)
  + 0.25 × min(distinctAxisRangeCount / totalAxisCount, 1.0)
```

### Stage 4: Report Generation

Headline metrics computed from run records: completionRate, abandonmentRate, medianSteps, medianDurationSec.

`StudyReport` record written with: headlineMetrics, issueClusterIds (ordered by score), segmentBreakdownKey, limitations (3 required statements), htmlReportKey, jsonReportKey.

HTML report rendered server-side via string templating. Self-contained with embedded/linked screenshots. JSON report is serialized StudyReport + all IssueCluster records.

### Analyst Notes

`addNote` appends to `analystNotes` array on IssueCluster. Notes are immutable in v1 (no edit/delete). Included in exports.

---

## Testing Decisions

### Pure Function Tests

- `computeImpactScore(severity, affectedRunRate, replayConfidence, segmentSpread)` — all severity levels, boundary values, known outputs.
- `computeSegmentSpread(...)` — floor at 1.0, ceiling at 1.5, proportional behavior.
- `computeHeadlineMetrics(runs)` — completion rate, abandonment rate, medians; empty array handling.
- `rankClusters(clusters)` — descending score order, stable sort.
- `buildLimitationsSection()` — all three required statements present.

### Integration Tests

- Clustering: 10 synthetic summaries with known overlap patterns → assert correct cluster assignments.
- Report structure: fixed fixtures → assert headlineMetrics, non-empty issueClusterIds, 3 limitations, non-null report keys.
- `addNote`: assert append behavior, not overwrite.

### Edge Cases

- Zero successful runs: valid report with empty clusters, zero rates.
- All runs `infra_error`: report generated with empty clusters, limitations still present.
- Ranking when `replayConfidence` is zero: never ranks above positive-confidence cluster of same severity.

---

## Out of Scope

- Browser execution (BrowserExecutor)
- Replay decisions (StudyOrchestrator decides which runs to replay)
- Persona generation (PersonaEngine)
- Study lifecycle state transitions (StudyOrchestrator)
- Cross-study benchmarking (deferred to v1.1+)
- Evaluator optimization (deferred to v1.1+)
- Real-time clustering during in-progress studies

---

## Further Notes

- **Trigger dependency**: `analyzeStudy` is called exclusively by StudyOrchestrator after replay verification. Must fail fast if runs are still in non-terminal status.
- **ArtifactStore dependency**: Reads R2 keys from Convex records. Does not upload artifacts.
- **Model configurability**: All three task categories read model ID from settings at call time. Admin can switch models without code deployment.
- **HTML report self-sufficiency**: Must be viewable without app access. Screenshots embedded or referenced via long-lived public URLs. Includes limitations verbatim.
- **Note immutability**: Append-only in v1. Edit/delete is a v1.1 concern.
