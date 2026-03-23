# PRD-2: BrowserExecutor Deep Module

**Project:** Botchestra — Synthetic Persona Validation Platform
**Phase:** 2 of 5
**Status:** Draft
**Depends on:** PRD-0 (shared contracts)

---

## Problem Statement

Convex is a transactional control plane — its execution model is built for short-lived database mutations, reactive queries, and orchestrated workflows. It has no ability to launch or manage long-lived browser sessions, is not designed to accumulate binary artifacts, and cannot enforce the kind of stateful session isolation that safe synthetic UX testing demands.

Running Playwright inside Convex directly is explicitly forbidden by the spec. Even if it were technically possible, doing so would violate the separation between structured product state (Convex) and browser-adjacent, binary-heavy, concurrency-bounded work (a Worker). The costs, latency profiles, and failure modes of the two concerns are fundamentally incompatible.

BrowserExecutor exists because someone has to own the dirtiest, most stateful part of the system: launching a browser, embodying a persona, navigating a product under test, producing evidence, enforcing guardrails, and cleaning up — all without leaking session state, credentials, or concurrency capacity across runs.

---

## Solution

BrowserExecutor is a Cloudflare Worker deployed at `apps/browser-executor`. It exposes two HTTP endpoints to the outside world and hides everything else.

When Convex dispatches a run, BrowserExecutor:

1. Accepts the `ExecuteRunRequest` payload, validates it, and begins execution in the same request context for v1.
2. Acquires a browser lease from `BrowserLeaseDO`, respecting the hard concurrency cap.
3. Opens a fresh incognito browser context via `@cloudflare/playwright` (Cloudflare Browser Rendering).
4. Executes the persona-driven agent loop: observe → select action via OpenAI → execute → record milestones → check stop conditions → repeat.
5. Captures milestone screenshots, compresses as JPEG, uploads to R2.
6. Enforces guardrails on every action: domain allowlist, forbidden action blocking, credential masking.
7. Generates a post-task self-report using the configured LLM.
8. Pushes `RunProgressUpdate` events back to Convex via the signed callback URL.
9. Closes the browser context unconditionally and releases the lease.

---

## User Stories

### Run Execution

1. As the StudyOrchestrator, I can POST an `ExecuteRunRequest` to `/execute-run` and have the Worker start the run immediately, so that Convex can dispatch a single run without owning the browser lifecycle itself.
2. As the StudyOrchestrator, I can include a signed, short-lived `callbackToken` and a `callbackBaseUrl` in the request so that BrowserExecutor can push progress back to the correct Convex environment.
3. As the StudyOrchestrator, I can specify `taskSpec.maxSteps` and `taskSpec.maxDurationSec` so that runaway agent loops are bounded.
4. As the StudyOrchestrator, I can specify `taskSpec.viewport` and `taskSpec.locale` so that runs reflect the target device and language environment.
5. As the StudyOrchestrator, I can include optional `taskSpec.credentialsRef` so that personas can authenticate without raw credentials appearing in the task payload or any artifact.
6. As the StudyOrchestrator, I receive `heartbeat` progress updates at regular intervals during a run so that I can detect stalled runs.
7. As the StudyOrchestrator, I receive `milestone` progress updates at significant navigation points.
8. As the StudyOrchestrator, I receive a `completion` update with finalOutcome, selfReport, step count, duration, frustration count, and artifact manifest key.
9. As the StudyOrchestrator, I receive a `failure` update with a structured `errorCode` when a run fails.

### Agent Loop and Persona Behavior

10. As the agent, I receive an observation bundle at each step containing current URL, page title, visible text excerpt, interactive element summary, recent action history, and task progress summary.
11. As the agent, I can choose from the full action space — goto, click, type, select, scroll, wait, back, finish, abort.
12. As the agent, I can hesitate, revisit pages, and backtrack for realistic navigation patterns.
13. As the agent, I can abort when frustration exceeds a threshold, generating abandonment events.
14. As the agent, I am prompted with the persona's firstPersonBio, behaviorRules, and tensionSeed on every step.
15. As the agent, I generate a post-task self-report answering configurable questions after the task ends.

### Artifact Capture

16. As the StudyOrchestrator, first page and final page are always captured as milestone screenshots.
17. As the StudyOrchestrator, every fatal error state, abandonment state, and success state is always captured.
18. As the StudyOrchestrator, significant branch decisions, repeated failure loops, and dead ends are captured conditionally.
19. As the StudyOrchestrator, screenshots are JPEG by default for predictable storage costs.
20. As the StudyOrchestrator, I receive an `artifactManifestKey` pointing to a structured JSON manifest in R2.

### Guardrails

21. As an Admin, every navigation action is checked against `taskSpec.allowedDomains` before execution.
22. As an Admin, any action matching `taskSpec.forbiddenActions` is blocked and logged.
23. As an Admin, credential values are masked in all screenshots, logs, and progress update payloads.
24. As an Admin, incoming requests validate the signed `callbackToken`.
25. As an Admin, every guardrail violation is emitted as a structured event in the run's artifact trail.

### Concurrency and Lease Management

26. As the platform, `BrowserLeaseDO` enforces a hard concurrency cap (default 30).
27. As the platform, I receive a structured rejection when the concurrency cap is full so the wave scheduler can retry.
28. As the platform, browser sessions are reused across runs where safe (isolated incognito contexts).
29. As the platform, every run opens a fresh incognito context never shared with another run.
30. As the platform, `BrowserLeaseDO` tracks session ownership and reclaims leaked leases via timeout.

### Error Handling

31. As the StudyOrchestrator, I receive typed error codes: `LEASE_UNAVAILABLE`, `MAX_STEPS_EXCEEDED`, `MAX_DURATION_EXCEEDED`, `GUARDRAIL_VIOLATION`, `BROWSER_ERROR`.
32. As the platform, browser contexts and sessions are always closed in a `finally` block.

---

## Implementation Decisions

### Worker Architecture

- Single Cloudflare Worker in `apps/browser-executor`, two HTTP routes: `POST /execute-run` and `POST /health`.
- Request dispatch in `index.ts`; all business logic in internal modules.
- Runs in the Cloudflare Browser Rendering environment with `@cloudflare/playwright` binding.
- In v1, `/execute-run` is a blocking Worker request that stays open for the life of one run while still emitting progress callbacks to Convex. A true acknowledge-and-detach model is deferred until the platform introduces a queue-backed execution path.

### BrowserLeaseDO (Durable Object)

- Single named instance per Worker deployment. In-memory map of `{ leaseId -> { runId, acquiredAt, timeoutMs } }`.
- Acquire: reject immediately if `activeCount >= hardCap`. Release: remove by leaseId, idempotent.
- Leak reclamation: Durable Object alarm fires every 60 seconds, removes leases older than `leaseTimeoutMs`.
- `hardCap` configurable via Worker binding (`env.BROWSER_CONCURRENCY_HARD_CAP`).
- `RunCoordinatorDO` deferred to v1.1.

### Browser Session Policy

- New browser context (`browser.newContext()`) per run with incognito settings.
- Context closed in `finally` block regardless of outcome.
- Browser session pooled through `BrowserLeaseDO`, reused where platform allows.

### Agent Loop (`runExecutor.ts`)

- Synchronous loop within Worker execution context (Browser Rendering has extended CPU budget).
- Each iteration: build observation → call OpenAI for action selection → apply guardrails → execute → check stop conditions → conditionally record milestone → update frustration counters.
- Observation bundle caps visible text at a configured token budget.
- Action selection prompt defined internally (not in `packages/ai`).
- The loop must not rely on `ctx.waitUntil()` to keep browser execution alive after the response is sent; any `waitUntil()` usage is limited to best-effort non-critical work such as logging.

### Frustration Heuristics (`stepPolicy.ts`)

All implemented as pure functions:
- Same URL visited within last N steps (default N=5)
- Same action + selector repeated without change
- Repeated validation error on consecutive steps
- `wait` action with no dynamic content change
- Contradictory navigation (forward then immediately back)
- Post-step confusion keywords
- `abort` immediately after error/dead-end
- When `frustrationCount >= frustrationAbortThreshold` (default 5), loop halts with `finalOutcome: ABANDONED`.

### Milestone Capture Policy

- Always-capture: step 0, finish/abort step, HTTP/navigation errors.
- Conditional: `shouldCaptureConditionalMilestone(stepState, history)` pure function checks for branch decisions, loop detection, dead-end patterns.
- Screenshots: `page.screenshot({ type: 'jpeg', quality: 80 })` by default, configurable.
- R2 keys: `runs/{runId}/milestones/{stepIndex}_{actionType}.jpg`. Manifest at `runs/{runId}/manifest.json`.

### Guardrails (`guardrails.ts`)

- `validateNavigation(url, allowedDomains)`: pure function, hostname check.
- `validateAction(actionType, forbiddenActions)`: pure function.
- `maskCredentials(text, credentials)`: pure function, replaces resolved credential values with `[MASKED]`.
- `validateCallbackToken(token, secret)`: HMAC signature + expiry verification.
- Violations return structured results, not exceptions.

### Progress Reporting (`progressReporter.ts`)

- Outbound callbacks to `callbackBaseUrl + '/api/run-progress'` with Bearer token.
- Heartbeats emitted inline during the run loop or from loop-adjacent timers while the request remains open.
- Milestones sent synchronously after screenshot upload.
- All payloads validated against `RunProgressUpdate` Zod schema before transmission.

### R2 Storage

- Bucket binding: `env.ARTIFACTS`. All keys prefixed `runs/{runId}/`.
- Upload retries: 3 attempts with exponential backoff. Upload failure does not fail the run.
- Manifest and summary written atomically at run end.

---

## Testing Decisions

### Unit Tests (pure functions — highest priority)

- `guardrails.ts`: validateNavigation, validateAction, maskCredentials, validateCallbackToken
- `stepPolicy.ts`: all frustration heuristics in isolation, threshold abort behavior
- `observationBuilder.ts`: token budget capping, element filtering, history truncation
- `milestonePolicy.ts`: conditional trigger conditions, always-capture milestones
- `progressReporter.ts` payload construction: Zod-valid payloads for all update types

### Miniflare Tests (Worker integration)

- `POST /health` returns 200 with correct shape.
- `POST /execute-run` with mocked `BROWSER` binding — verify the blocking run path completes, milestones upload, completion callback is sent, and the final HTTP response matches the terminal run outcome.
- `BrowserLeaseDO` directly: concurrency cap, lease release, alarm-based leak reclamation.

### Agent Loop Integration Tests (mocked browser)

- Abstract Playwright `Page` behind thin `IBrowserPage` interface.
- Test: two-step task → completion.
- Test: maxSteps exceeded → failure with `MAX_STEPS_EXCEEDED`.
- Test: frustration abort after N repeated-URL steps → `ABANDONED`.
- Test: forbidden action → `GUARDRAIL_VIOLATION`.
- Test: navigation outside allowedDomains → blocked.

### No real-browser tests in CI

Real Cloudflare Browser Rendering is not available in CI. All tests use `MockBrowserPage`. E2E tests against real Browser Rendering run manually in staging.

---

## Out of Scope

- Wave scheduling, run queue management (StudyOrchestrator)
- Study lifecycle state transitions (StudyOrchestrator)
- Persona generation (PersonaEngine)
- Analysis pipeline: summarization, clustering, ranking (AnalysisPipeline)
- Report generation
- Replay orchestration (StudyOrchestrator decides which runs to replay)
- Frontend UI
- Authentication and authorization
- Transcript ingestion

---

## Further Notes

- **CF Browser Rendering limits**: Hard cap of 30 in `BrowserLeaseDO` is below platform limits. Configurable via env var. Session reuse amortizes cold-start latency (1–3 seconds).
- **Cost**: OpenAI API calls dominate per-run cost. Milestone-only capture is the primary storage cost lever. Third-party analytics/media blocking reduces per-step duration.
- **Callback token security**: HMAC-signed, scoped to specific `runId`, includes expiry timestamp. Signing secret injected as Worker secret.
- **Artifact retention**: Single R2 bucket with manual lifecycle rules in v1. Two-tier retention is a v1.1 concern.
- **Why v1 stays blocking:** Cloudflare `waitUntil()` only guarantees about 30 seconds of post-response execution, which is too brittle for multi-minute browser runs. The blocking request path is the simpler and safer v1 contract.
