# Validation Contract — Study Execution Pipeline

Mission: Wire the Botchestra study execution pipeline from Convex dispatch through browser execution and back.

Three milestones: **Browser Wiring**, **AI Action Selector**, **End-to-End**.

---

## Browser Wiring (VAL-BWIRE-*)

### VAL-BWIRE-001: Adapter implements BrowserLike interface

The production Cloudflare Playwright adapter must satisfy the `BrowserLike` type:
`newContext(options: BrowserContextOptions)` returns a `BrowserContext` which exposes `newPage()` and `close()`.

**Pass condition:** A TypeScript compilation succeeds with the adapter assigned to a `BrowserLike`-typed variable with no type errors.
**Evidence:** `tsc --noEmit` passes; adapter file imports and implements `BrowserLike` from `runExecutor.ts`.

---

### VAL-BWIRE-002: BrowserPage implements full page contract

The adapter's `BrowserPage` implementation must provide all required methods:
`snapshot()`, `screenshot(options?)`, `goto(url)`, `click(selector)`, `type(selector, text)`, `select(selector, value)`, `scroll(deltaY?)`, `wait(durationMs?)`, `back()`.

`snapshot()` must return a `BrowserPageSnapshot` with fields: `url`, `title`, `visibleText`, `interactiveElements` (plus optional `pageFingerprint`, `branchOptions`, `isMajorBranchDecision`, `navigationError`, `httpStatus`, `deadEnd`, `agentNotes`).

**Pass condition:** Unit test calls every method on the adapter page and receives correctly-shaped responses (not just `undefined`).
**Evidence:** Vitest test file asserting return types and non-null values for `snapshot()`, `screenshot()`, and navigation methods.

---

### VAL-BWIRE-003: BrowserContext lifecycle management

`newContext()` must accept `BrowserContextOptions` with `locale` and `viewport` fields. `context.close()` must release resources without throwing.

**Pass condition:** Integration test creates a context with `{ locale: "en-US", viewport: { width: 1280, height: 720 } }`, opens a page, performs an action, then closes the context without error.
**Evidence:** Vitest test with mock or real adapter exercising the full lifecycle.

---

### VAL-BWIRE-004: Production handler resolves browser from env binding

`createExecuteRunHandler` → `resolveBrowser()` must correctly handle:
1. An injected `BrowserLike` via `options.browser` (direct passthrough).
2. An `env.BROWSER` binding that already satisfies `BrowserLike` (has `newContext`).
3. An `env.BROWSER` binding with a `launch()` method (Cloudflare style) — calls `launch()`, uses result, calls `close()` in finally block.
4. Returns `null` and responds `500 misconfigured_worker` if neither is available.

**Pass condition:** Each code path is exercised in a unit test and produces the expected `ResolvedBrowser` or 500 response.
**Evidence:** Vitest tests covering all 4 branches of `resolveBrowser`.

---

### VAL-BWIRE-005: Build produces deployable Worker bundle

`bun run build` (or equivalent) in `apps/browser-executor` must produce a valid Cloudflare Worker bundle without build errors.

**Pass condition:** Build command exits 0; output bundle exists at the expected path.
**Evidence:** CI build step or manual `bun run build` log with exit code 0.

---

### VAL-BWIRE-006: Deployed /health endpoint responds 200

The Worker's `/health` route (POST) must return `{ "status": "ok" }` with HTTP 200.

**Pass condition:** `curl -X POST https://<deployed-url>/health` returns 200 with JSON body `{ "status": "ok" }`.
**Evidence:** HTTP response log or integration test asserting status and body.

---

### VAL-BWIRE-007: Existing tests still pass

All existing unit and integration tests in `apps/browser-executor` must continue to pass after adapter wiring changes.

**Pass condition:** `bun run test` (or `bunx vitest run`) in `apps/browser-executor` exits 0 with no failures.
**Evidence:** Full test output showing all suites passed.

---

### VAL-BWIRE-008: /execute-run accepts valid ExecuteRunRequest

POST `/execute-run` with a well-formed `ExecuteRunRequest` body (matching `ExecuteRunRequestSchema` from `@botchestra/shared`) and a valid callback token must:
1. Not return 400 (invalid_request) or 401 (invalid_callback_token).
2. Begin execution (returns 200 on success or an appropriate error status for run-level failures).

**Pass condition:** Integration test or manual curl with a valid payload receives a non-400/non-401 response. Invalid payloads receive 400 with `issues` array.
**Evidence:** HTTP response logs for both valid and invalid payloads.

---

### VAL-BWIRE-009: /execute-run rejects invalid payloads

POST `/execute-run` with:
- Malformed JSON → 400 `invalid_json`.
- Missing required fields → 400 `invalid_request` with Zod issues.
- Invalid/expired callback token → 401 `invalid_callback_token`.

**Pass condition:** Each rejection case returns the documented status code and error shape.
**Evidence:** Vitest test (existing tests in `index.test.ts`) covering all rejection paths.

---

### VAL-BWIRE-010: Lease client integration via Durable Object

`resolveLeaseClient()` resolves a `BrowserLeaseClient` from `env.BROWSER_LEASE` (Durable Object namespace). The client must implement `acquire({ runId, leaseTimeoutMs })` returning `{ ok: true, leaseId }` or `{ ok: false, errorCode: "LEASE_UNAVAILABLE" }`, and `release(leaseId)`.

**Pass condition:** Unit test with a mock Durable Object namespace verifies `acquire` and `release` call the correct internal endpoints.
**Evidence:** Vitest test asserting fetch calls to `https://browser-lease.internal/acquire` and `/release`.

---

## AI Action Selector (VAL-AISEL-*)

### VAL-AISEL-001: Receives observation bundle + persona + task spec + history

The `selectAction` function must receive a `SelectActionInput` containing:
- `request`: full `ExecuteRunRequest` (includes `personaVariant` with `axisValues`, `firstPersonBio`, `behaviorRules`; and `taskSpec` with `goal`, `successCriteria`, `allowedActions`, `forbiddenActions`).
- `stepIndex`: current step number.
- `page`: `BrowserPageSnapshot` with current DOM state.
- `observation`: `ObservationBundle` with token-budgeted text summary.
- `actionHistory`: array of `ObservationActionHistoryEntry` for prior steps.

**Pass condition:** Unit test constructs a `SelectActionInput` with all fields populated and passes it to the selector without error. The selector uses persona fields in its prompt/logic.
**Evidence:** Test fixture showing all input fields are present and consumed.

---

### VAL-AISEL-002: Returns valid AgentAction with rationale

`selectAction` must return an `AgentAction` with:
- `type`: one of the allowed action types (`goto`, `click`, `type`, `select`, `scroll`, `wait`, `back`, `finish`, `abort`).
- Relevant fields populated (`url` for goto, `selector` for click/type/select, `text` for type, `value` for select).
- `rationale`: non-empty string explaining the decision.

**Pass condition:** Unit test asserts returned action has a valid `type` from `AllowedActionSchema` and a non-empty `rationale`.
**Evidence:** Vitest assertion on return shape across multiple scenario inputs.

---

### VAL-AISEL-003: Action validated against guardrails before execution

After `selectAction` returns, `runExecutor` calls `isActionAllowed(action, request.taskSpec)`. If the action violates guardrails:
- The run terminates with `GUARDRAIL_VIOLATION`.
- A `guardrailCode` is set (one of `ACTION_NOT_ALLOWED`, `DOMAIN_BLOCKED`, `FORBIDDEN_ACTION`, `URL_VIOLATION`).
- A terminal milestone with `actionType: "guardrail_violation"` is captured.

**Pass condition:** Unit test where `selectAction` returns a forbidden action (e.g., a `goto` to a blocked domain) and the run fails with `errorCode: "GUARDRAIL_VIOLATION"` and the correct `guardrailCode`.
**Evidence:** Vitest test asserting `result.ok === false`, `result.errorCode`, `result.guardrailCode`, and milestone capture.

---

### VAL-AISEL-004: Falls back to heuristic on LLM failure

When the LLM-backed `selectAction` throws or times out, the system must fall back to a heuristic selector. The existing `createFallbackActionSelector` provides this:
- Step 0: clicks the first interactive element (if `click` is allowed).
- Otherwise: returns `finish` or the first allowed action.

**Pass condition:** Unit test where the primary selector throws; the handler falls back to heuristic and the run continues (does not crash).
**Evidence:** Test showing LLM selector rejects, fallback produces a valid `AgentAction`, and the run produces a result (not an unhandled exception).

---

### VAL-AISEL-005: Persona-aware — different axis values produce different choices

Given two `SelectActionInput`s identical except for `personaVariant.axisValues` (e.g., high vs. low `techSavviness`), the selector should produce demonstrably different action sequences or rationales.

**Pass condition:** Integration test with two persona variants showing at least one difference in action choice or rationale text within the first 3 steps.
**Evidence:** Test log comparing action sequences for two personas on the same page state.

---

### VAL-AISEL-006: Goal-directed — works toward success criteria

Given a `taskSpec` with `goal` and `successCriteria`, the selector must produce actions that make progress toward the goal (e.g., navigating to the correct page, filling forms matching the scenario).

**Pass condition:** In a controlled test scenario with a known-good page, the selector produces at least one action that advances toward `successCriteria` within 5 steps (e.g., clicks a relevant link, fills a required field).
**Evidence:** Test asserting the action sequence contains at least one goal-advancing action (judged by action target matching criteria keywords).

---

### VAL-AISEL-007: Respects allowed/forbidden actions

The selector must never return an action type not in `taskSpec.allowedActions`. Even if the LLM suggests a forbidden action type, the post-validation in `isActionAllowed` catches it.

**Pass condition:** Unit test with `allowedActions: ["click", "finish"]` and the selector never returns `goto`, `type`, etc. If it does, `isActionAllowed` fails the run.
**Evidence:** Vitest test constraining allowed actions and asserting returned type is within the allowed set.

---

### VAL-AISEL-008: Navigation guardrail enforced on goto URLs

When `selectAction` returns a `goto` action, `validateNavigation(url, allowedDomains)` must verify the URL domain is in `taskSpec.allowedDomains`. Violation returns `domain_not_allowed` → `DOMAIN_BLOCKED` guardrail code.

**Pass condition:** Test with `allowedDomains: ["example.com"]` and a `goto` to `https://evil.com` fails with `GUARDRAIL_VIOLATION` / `DOMAIN_BLOCKED`.
**Evidence:** Vitest assertion on the failure result.

---

## End-to-End (VAL-E2E-*)

### VAL-E2E-001: BROWSER_EXECUTOR_URL environment variable configured in Convex

The Convex deployment must have `BROWSER_EXECUTOR_URL` set (via `convex env set` or dashboard). `waveDispatch.ts` reads it with a fallback to `http://localhost:8787`.

**Pass condition:** `convex env get BROWSER_EXECUTOR_URL` returns a valid HTTPS URL pointing to the deployed Worker.
**Evidence:** Environment variable value log (URL only, not secrets).

---

### VAL-E2E-002: Wave dispatch HTTP call reaches Worker

`dispatchStudyWave` in `waveDispatch.ts` creates runs, then dispatches them via the Workpool. Each dispatched run action sends an HTTP POST to `BROWSER_EXECUTOR_URL/execute-run` with a serialized `ExecuteRunRequest`.

**Pass condition:** Dispatching a study wave for a study with queued runs results in HTTP calls to the Worker. Worker access logs show incoming POST to `/execute-run`.
**Evidence:** Convex function return value showing `dispatchedRunCount > 0` and Worker request logs.

---

### VAL-E2E-003: Callback token generated and validated round-trip

Convex generates a callback token (HMAC-signed, containing `runId` and `exp`) and includes it in `ExecuteRunRequest.callbackToken`. The Worker validates it via `validateCallbackToken`. The Convex callback endpoint also validates inbound callback tokens.

**Pass condition:** A token generated by Convex is accepted by the Worker; a tampered token is rejected with 401.
**Evidence:** Round-trip test: generate token → send to Worker → Worker accepts → Worker calls back to Convex → Convex validates.

---

### VAL-E2E-004: Worker sends heartbeat callbacks to Convex

During execution, `progressReporter.sendHeartbeat()` POSTs a `RunProgressUpdate` with `eventType: "heartbeat"` to `callbackBaseUrl + "/api/run-progress"`. Convex's `recordRunHeartbeat` mutation updates `lastHeartbeatAt` on the run document.

**Pass condition:** After a run starts, the run document's `lastHeartbeatAt` field is updated to a recent timestamp.
**Evidence:** Query the run document and verify `lastHeartbeatAt > run.startedAt`.

---

### VAL-E2E-005: Worker sends milestone callbacks to Convex

On milestone capture, `progressReporter.sendMilestone()` POSTs `eventType: "milestone"` with `stepIndex`, `url`, `title`, `actionType`, `rationaleShort`, and optional `screenshotKey`. Convex's `appendRunMilestone` inserts into `runMilestones` table and appends `screenshotKey` to `run.milestoneKeys`.

**Pass condition:** After a run with at least one milestone, the `runMilestones` table has matching records and the run's `milestoneKeys` array is non-empty.
**Evidence:** Convex query returning milestone documents for the run.

---

### VAL-E2E-006: Worker sends completion callback and run settles

On successful run, `progressReporter.sendCompletion()` POSTs `eventType: "completion"` with `finalOutcome`, `stepCount`, `durationSec`, `frustrationCount`, `selfReport`, and `artifactManifestKey`. Convex maps `finalOutcome` via `mapCompletionOutcomeToRunStatus`:
- `"SUCCESS"` → `"success"`
- `"ABANDONED"` → `"gave_up"`

The run document transitions to a terminal status.

**Pass condition:** After Worker returns 200, the run document has `status === "success"` or `status === "gave_up"` and fields `stepCount`, `durationSec`, `frustrationCount` are populated.
**Evidence:** Run document query showing terminal status and populated result fields.

---

### VAL-E2E-007: Worker sends failure callback and run settles

On failed run, `progressReporter.sendFailure()` POSTs `eventType: "failure"` with `errorCode`, optional `guardrailCode`, `message`, and `selfReport`. Convex maps `errorCode` via `mapFailureCodeToRunStatus`:
- `MAX_STEPS_EXCEEDED` / `MAX_DURATION_EXCEEDED` → `"timeout"`
- `GUARDRAIL_VIOLATION` → `"blocked_by_guardrail"`
- `LEASE_UNAVAILABLE` / `BROWSER_ERROR` → `"infra_error"`

**Pass condition:** After a run failure, the run document has the correct terminal status and `errorCode`/`errorMessage` fields are set.
**Evidence:** Run document query showing mapped status and error details.

---

### VAL-E2E-008: Heartbeat monitor cron registered and functional

`convex/crons.ts` registers `monitorStaleRuns` at `HEARTBEAT_MONITOR_INTERVAL_SECONDS` interval. The monitor identifies runs in `"running"` status whose `lastHeartbeatAt` is older than the staleness threshold and transitions them to a failure state.

**Pass condition:** (a) Cron is registered (verified by `crons.ts` source). (b) A run with a stale heartbeat is transitioned to a terminal failure status by the monitor.
**Evidence:** (a) `crons.ts` contents showing the interval registration. (b) `convex-test` unit test: insert a run with old `lastHeartbeatAt`, invoke `monitorStaleRuns`, assert run status changed.

---

### VAL-E2E-009: Study UI shows run progress

The frontend study detail page must display:
- Study status (queued / running / completed).
- List of runs with their statuses.
- Run milestones (step index, action type, URL).
- Findings summary (if analysis pipeline is wired).

**Pass condition:** Manual or automated UI test: create a study, dispatch runs, verify the UI reflects run statuses and milestones within a reasonable polling interval.
**Evidence:** Screenshot or DOM assertion showing run cards with status badges and milestone timeline.

---

### VAL-E2E-010: Secrets are redacted in all callbacks and responses

`redactSecrets()` is applied to the run result, self-report, and all progress updates before they leave the Worker. Secret values (from `resolveSecrets`) are replaced with `[REDACTED]`.

**Pass condition:** Unit test with a known secret in the result payload verifies the outbound JSON contains `[REDACTED]` instead of the raw value.
**Evidence:** Vitest assertion on `progressReporter` mock call arguments and response body.

---

## Cross-Area (VAL-CROSS-*)

### VAL-CROSS-001: Full pipeline — create study → launch → browser runs → results

End-to-end smoke test covering:
1. Create a study with a persona config and task spec in Convex.
2. Dispatch a wave (`dispatchStudyWave`).
3. Worker receives `ExecuteRunRequest`, launches browser, runs step loop.
4. Worker sends heartbeat, milestone, and completion/failure callbacks.
5. Run settles in Convex with terminal status.
6. Study aggregates are updated (run counts, outcome distribution).

**Pass condition:** A study transitions from `queued` → `running` → `completed` (or appropriate terminal) with at least one settled run.
**Evidence:** Convex queries showing study and run documents at each stage.

---

### VAL-CROSS-002: Persona context influences browser behavior

Two runs with different `personaVariant.axisValues` (e.g., `{ techSavviness: 0.1 }` vs `{ techSavviness: 0.9 }`) on the same task spec produce observably different behavior:
- Different action sequences, or
- Different step counts, or
- Different milestone patterns, or
- Different self-report answers.

**Pass condition:** At least one measurable difference between the two runs' result payloads.
**Evidence:** Comparison of `stepCount`, `frustrationCount`, action history, or self-report fields.

---

### VAL-CROSS-003: Frustration detection triggers early abandonment

The `updateFrustrationState` step policy tracks repeated failures and friction signals. When `shouldAbort` returns true, the run terminates early with `finalOutcome: "ABANDONED"` and a terminal milestone with `actionType: "abandon"`.

**Pass condition:** Unit test with a contrived step history that triggers the frustration threshold produces an `ABANDONED` result before `maxSteps`.
**Evidence:** Vitest test showing `result.finalOutcome === "ABANDONED"` and `result.stepCount < taskSpec.maxSteps`.

---

### VAL-CROSS-004: Artifact manifest persisted and retrievable

After a run, `uploader.writeManifest(result)` writes a JSON manifest to `env.ARTIFACTS` (R2 bucket). The manifest key is returned in the completion callback and stored on the run document as `artifactManifestKey`.

**Pass condition:** Run document has a non-empty `artifactManifestKey`. GET `/artifacts/<key>` with valid signature returns the manifest JSON.
**Evidence:** HTTP GET for the artifact key returns 200 with valid JSON containing run result data.

---

### VAL-CROSS-005: Self-report generated and stored

After run execution, `generateSelfReport()` produces a `SelfReport` with `perceivedSuccess`, optional `hardestPart`, `confusion`, `confidence`, `suggestedChange`, and `answers` (keyed to `postTaskQuestions`). This is included in the completion/failure callback and stored on the run document.

**Pass condition:** Run document `selfReport` field is populated with a valid `SelfReport` shape after run settlement.
**Evidence:** Convex query showing `selfReport.perceivedSuccess` is a boolean and at least one optional field is present.

---

### VAL-CROSS-006: Cost controls evaluated on heartbeat

Each heartbeat callback triggers `evaluateStudyCostControls` for the study. If budget limits are exceeded, the study or its runs may be paused/cancelled.

**Pass condition:** `recordRunHeartbeat` handler calls `ctx.runMutation(internal.costControls.evaluateStudyCostControls, ...)` with the correct `studyId` and `observedAt`.
**Evidence:** Unit test (convex-test) asserting the cost control mutation is invoked during heartbeat processing.

---

### VAL-CROSS-007: Run cancellation respected during execution

If `cancellationRequestedAt` is set on a run document, the heartbeat response includes `shouldStop: true`. The Worker must check this and terminate the run gracefully.

**Pass condition:** Set `cancellationRequestedAt` on a running run; next heartbeat returns `shouldStop: true`; the Worker terminates the run.
**Evidence:** convex-test showing heartbeat returns `shouldStop: true` after cancellation is requested.

---
