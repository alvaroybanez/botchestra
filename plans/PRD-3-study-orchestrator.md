# PRD-3: StudyOrchestrator Deep Module

**Project:** Botchestra — Synthetic Persona Validation Platform
**Phase:** 3 of 5
**Status:** Draft
**Depends on:** PRD-0, PRD-1, PRD-2

---

## Problem Statement

Launching a cohort of 50–100 browser runs against a live URL is not a single operation — it is a durable, multi-phase state machine that must survive retries, handle stale runners, enforce concurrency limits against a finite browser pool, verify failure reproducibility before promoting findings, and hand off cleanly to the analysis pipeline when the cohort is done.

Without a dedicated orchestration layer, every concern — scheduling waves, tracking run outcomes, detecting stale heartbeats, deciding when replay is warranted, and triggering the analysis pipeline — bleeds into callers that have no business owning it.

---

## Solution

StudyOrchestrator is a Convex-backed deep module that owns the full lifecycle of a study from creation through final report hand-off. It exposes a thin, stable interface to callers and hides all complexity internally.

**What it exposes:**
- Lifecycle mutations: `createStudy`, `updateStudy`, `launchStudy`, `cancelStudy`
- A single progress callback endpoint for the Worker: `onRunProgress`
- Queries: `getStudy`, `listStudies`, `getRunSummary`, `getRun`, `listRuns`

**What it hides:**
- The study status state machine (10 states)
- The run status state machine (11 states)
- Wave-based dispatch using Convex Workpool
- Durable study-level orchestration using Convex Workflow
- Heartbeat monitoring and stale-run detection
- The full replay verification flow
- Transition to `analyzing` state and triggering of the AnalysisPipeline
- Cancellation fan-out

---

## User Stories

### Researcher — Study Creation and Configuration

1. As a Researcher, I can call `createStudy` with a draft payload and receive a study in `draft` state, so I can iterate on the task spec before committing.
2. As a Researcher, I can call `updateStudy` to patch any field on a `draft` study.
3. As a Researcher, I can set `postTaskQuestions` to a custom list or accept the default five questions.
4. As a Researcher, I can define hidden `successCriteria` that will never be revealed to the browser agent.
5. As a Researcher, I can set `activeConcurrency` per study, knowing the system enforces a hard cap of 30.
6. As a Researcher, I can set `environmentLabel` on every study for explicit environment tracking.

### Researcher — Launch Flow

7. As a Researcher, I can call `launchStudy(id)` on a `ready` study and trust the system will dispatch waves without further input.
8. As a Researcher, the study moves to `persona_review` if study-scoped variants have not yet been generated and confirmed for that study, blocking dispatch.
9. As a Researcher, I see the study transition from `queued` to `running` when the first wave dispatches.
10. As a Researcher, I am blocked from launching a `draft` study.
11. As a Researcher, I cannot launch a study referencing an unpublished persona pack.
12. As a Researcher, I must explicitly acknowledge before launching against a production-like environment.

### Researcher — Live Monitoring

13. As a Researcher, I can see queued, running, and completed run counts updated in real time.
14. As a Researcher, I can see which persona variants are currently active.
15. As a Researcher, I can see a breakdown of completed runs by outcome type as they accumulate.
16. As a Researcher, I can see when the study enters `replaying` state.
17. As a Researcher, I can see when the study enters `analyzing` state.

### Researcher — Cancellation

18. As a Researcher, I can cancel a study and all queued runs are immediately cancelled.
19. As a Researcher, running runs receive a stop signal via heartbeat acknowledgement.
20. As a Researcher, I can see who cancelled, when, and why in the audit trail.
21. As a Researcher, I cannot cancel a completed/failed/cancelled study.

### Product/Design Reviewer — Run Inspection

22. As a Reviewer, I can get the full run record including persona summary, milestones, artifact links, self-report, and outcome.
23. As a Reviewer, I can filter runs by outcome, persona segment, or URL.
24. As a Reviewer, I can see a milestone timeline with screenshot links for each run.
25. As a Reviewer, I can inspect self-report answers for each run.
26. As a Reviewer, I can follow artifact links without coupling to R2 structure directly.

### Admin — Policy

27. As an Admin, I can configure the platform-wide hard cap for `activeConcurrency`.
28. As an Admin, I can see per-study model token usage and browser time usage.
29. As an Admin, I can access an audit trail of every launch and cancellation.

---

## Implementation Decisions

### State Machines

**Study status machine:**
`draft → persona_review → ready → queued → running → replaying → analyzing → completed` (plus `failed`, `cancelled`)

Transitions enforced inside Convex mutations. `persona_review` is a gate state. `replaying` entered automatically after initial cohort completes. `analyzing` entered after replay, triggering AnalysisPipeline.

**Run status machine:**
`queued → dispatching → running → [success | hard_fail | soft_fail | gave_up | timeout | blocked_by_guardrail | infra_error | cancelled]`

`dispatching` is a brief in-flight state for crash detection.

### Convex Workflow

Study lifecycle implemented as a durable Convex Workflow handling: persona_review confirmation → study-scoped variant materialization via PersonaEngine → wave dispatch via Workpool → waitForCohort → replayTopFailures → finalizeReport. Only the Workflow advances study state past `running`.

### Convex Workpool

`@convex-dev/workpool` for bounded-concurrency dispatch. Pool size = `study.activeConcurrency`. All runs enqueued at launch; pool manages ordering and concurrency.

### Run Dispatch Protocol

`ExecuteRunRequest` from `packages/shared`. In v1, the Worker call is a blocking HTTP action per run rather than an immediate acknowledge-and-detach RPC. Progress still arrives via `onRunProgress` during execution so the UI and watchdog logic do not depend on waiting for the terminal HTTP response alone.

### `onRunProgress` Callback Endpoint

Single HTTP action endpoint mounted at `callbackBaseUrl + '/api/run-progress'`. Validates `callbackToken`. Handles: heartbeat (update `lastHeartbeatAt`), milestone (append to run), completion (set status + write self-report), failure (set error status + code). Idempotent against replayed callbacks.

### Heartbeat Monitoring

Scheduled Convex function every 60 seconds. Marks runs with stale heartbeats as `infra_error`. Returns Workpool slots.

### Replay Verification Flow

1. Identify candidate issue groups with ≥2 affected runs OR 1 severe blocker
2. Select 1 representative run per candidate
3. Re-dispatch each scenario 2 additional times with `isReplay: true`
4. Compute `replay_confidence = reproduced_failures / replay_attempts`
5. Promote only if: ≥2 affected original runs OR 1 severe blocker with `replay_confidence > 0`

### Cancellation Fan-Out

Sets queued runs to `cancelled` immediately. Running runs get `cancellationRequestedAt`; next heartbeat ACK includes `shouldStop: true`. Audit event recorded.

---

## Testing Decisions

### Study State Machine Tests

- Valid and invalid transitions for every state.
- Launch blocked on draft studies, unpublished packs, unacknowledged production.

### Run State Machine Tests

- Valid transitions. Duplicate completion callbacks are idempotent. Late callbacks on cancelled runs ignored.

### Wave Scheduling Tests

- With `activeConcurrency=3` and `runBudget=7`, verify at most 3 concurrent, all 7 eventually dispatched.
- Hard cap of 30 enforced regardless of study config.

### Heartbeat Monitor Tests

- Stale heartbeat → `infra_error`. Recent heartbeat → not stale. Slot returned to pool.

### Replay Verification Tests

- Candidate selection with known cluster sizes. No-replay case when threshold not met.
- `replay_confidence` computation: 2/2, 0/2, 1/2.
- Promotion rule: single blocker with replay vs. without.

### Callback Processing Tests

- Invalid/expired token rejected. Milestone appends. Completion writes outcome + triggers summarization.

### Cancellation Tests

- Queued runs → cancelled. Running runs → cancellationRequestedAt. Completed study → error.

### Integration Tests (mocked Worker)

- Full launch → dispatch → completion → analyzing flow.
- Wave concurrency respected.
- Replay dispatches exactly 2 additional runs per candidate.
- Stale heartbeat → infra_error → slot freed → next run dispatched.

---

## Out of Scope

- Browser execution (BrowserExecutor)
- Persona generation and variant expansion (PersonaEngine)
- Issue clustering, ranking, and recommendation drafting (AnalysisPipeline)
- Guardrail definition (Admin settings / Hardening)
- Report rendering and export
- Persona pack CRUD
- Findings annotation

---

## Further Notes

- **PersonaEngine dependency**: At launch, the Workflow requires a study-specific variant cohort. If that cohort has not yet been generated for the target `studyId`, it enters `persona_review`, invokes PersonaEngine to materialize the cohort from the study's selected pack and budget, and only then allows dispatch.
- **BrowserExecutor dependency**: Communication via `ExecuteRunRequest` (outbound) and `RunProgressUpdate` (inbound) from `packages/shared`.
- **Callback token security**: HMAC-signed, scoped to `runId`, includes expiry. Validated on every `onRunProgress` call.
- **Audit log**: Append-only table with actor identity, study ID, action type, timestamp, and config snapshot.
- **Convex reactivity**: Live monitor uses reactive queries (`getRunSummary`, `listRuns`). No polling.
