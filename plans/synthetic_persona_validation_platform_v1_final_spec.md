# Synthetic Persona Validation Platform v1

## 1. Product Definition

Build an internal collaborative web application for research, product, and design teams to validate web flows with synthetic users.

Each study in v1 runs a **single constant task** against **50–100 synthetic persona variants** in parallel browser sessions. Each variant is attached to one agent. The agent receives the study scenario, starting URL, and guardrails, then explores the site in an **unmoderated** way to try to achieve the goal.

The core output is **not** autonomous product change. The core output is a ranked, evidence-backed report of:
- where the flow breaks
- which persona segments are affected
- how severe and repeatable the problem is
- what product/design/copy change is recommended

v1 is inspired by the Persona Generators paper’s emphasis on **support coverage** across diverse behavioral profiles, but the browser runner, replay verification, and issue-ranking workflow are product-layer additions on top of that research.

---

## 2. Final Architecture Decision

### Frontend and control plane
- **Vite + React + TypeScript** frontend
- **Convex** as the application backend and primary system of record
- Convex is responsible for:
  - study metadata
  - persona packs
  - generated variants
  - run states
  - findings metadata
  - report metadata
  - realtime UI updates
  - durable study orchestration

### Browser run plane
- **Cloudflare Worker** as the browser executor service
- **Cloudflare Browser Rendering** with **`@cloudflare/playwright`** for browser automation
- **Cloudflare Durable Objects** for browser leasing, concurrency coordination, and session reuse
- **Cloudflare R2** for screenshots, traces, and other large artifacts

### AI layer
- **Vercel AI SDK** for:
  - persona expansion
  - agent action selection
  - per-run summarization
  - issue clustering helpers
  - recommendation drafting

### Critical boundary
- **Convex handles durable product workflows**
- **Cloudflare handles browser execution**
- **AI SDK handles model/tool orchestration inside those systems**

AI SDK is **not** the durable workflow engine.

---

## 3. Product Principles

1. **Task constant, persona variable**
   - Every run in a cohort receives the same task definition.
   - The persona is the main independent variable.

2. **Unmoderated study behavior**
   - Agents receive a scenario, goal, URL, and guardrails.
   - Agents do **not** receive a hidden step script.
   - Analysts may define hidden evaluator criteria, but agents do not see them.

3. **One persona variant = one isolated run**
   - No shared memory between runs.
   - No cross-agent communication.
   - No collaborative swarm behavior.

4. **Synthetic evidence is directional**
   - Reports must explicitly state that findings are synthetic and should complement, not replace, human research.

5. **Evidence beats narration**
   - Every promoted issue must link to screenshots, trace excerpts, and affected segments.

6. **Replay before promotion**
   - Top failures must be replayed before they become first-class issues, unless the issue is a deterministic single-run blocker.

7. **Minimal but inspectable runtime**
   - Use the smallest viable browser automation setup.
   - Keep detailed evidence only where it improves diagnosis.
   - Avoid overbuilding a general agent platform.

---

## 4. Users and Roles

### Researcher
Can create persona packs, configure studies, launch runs, review findings, annotate evidence, and publish reports.

### Product/Design reviewer
Can inspect live run status, browse findings, filter by segment, comment on issues, and export/share reports.

### Admin
Can manage domain allowlists, credentials, model/provider settings, budgets, organization settings, and browser runtime policies.

---

## 5. MVP Scope

### v1 must include
- collaborative internal web app
- manual persona pack authoring
- JSON persona pack import/export
- two-stage persona variant generation
- unmoderated browser studies
- 50–100 run cohorts
- wave-based run scheduling
- live study monitoring
- replay verification
- issue clustering and ranking
- HTML + JSON report output
- evidence drill-down to individual runs

### v1 must not include
- transcript ingestion and automatic clustering
- inter-agent interaction
- autonomous product changes or PR generation
- production payment flows
- irreversible submissions
- CAPTCHA bypass
- account creation outside preapproved test fixtures
- general-purpose browsing agent framework

### deferred to v1.1+
- transcript upload and proto-persona extraction
- cross-study learning and benchmark dashboards
- evaluator optimization loops
- copy/config experiment generation
- multi-step memory across studies
- 200+ run cohorts by default

---

## 6. High-Level Product Workflows

### Workflow A: Create persona pack
1. Create a new persona pack.
2. Define shared behavioral axes.
3. Add 1–10 proto-personas.
4. Attach evidence snippets or rationale.
5. Save as draft.
6. Preview generated variants.
7. Publish/freeze the pack.

### Workflow B: Create study
1. Select a persona pack.
2. Define study scenario and goal.
3. Enter starting URL.
4. Configure allowed domains/actions.
5. Define hidden success criteria and stop conditions.
6. Set run budget and environment.
7. Review guardrails.
8. Launch study.

### Workflow C: Monitor run
1. See queued/running/completed/failed counts in realtime.
2. Inspect currently running personas.
3. Open a run detail view.
4. Review milestone screenshots and current outcome state.
5. Pause/cancel the study if needed.

### Workflow D: Review findings
1. Read headline metrics.
2. Open ranked issue clusters.
3. Filter by persona segment, proto-persona, severity, and flow location.
4. Drill into representative runs.
5. Add analyst comments.
6. Publish/share report.

---

## 7. System Architecture

## 7.1 Frontend: Vite + React

### Required frontend stack
- Vite
- React
- TypeScript
- React Router
- Convex React client
- shared Zod schemas from a common package

### Required screens
- `/studies`
- `/studies/new`
- `/studies/:studyId/overview`
- `/studies/:studyId/personas`
- `/studies/:studyId/runs`
- `/studies/:studyId/findings`
- `/studies/:studyId/report`
- `/persona-packs`
- `/persona-packs/:packId`
- `/settings`

### Required UI capabilities
- realtime study status updates
- persona variant preview grid
- run table with live status and filters
- run detail drawer/page with artifact preview
- findings explorer with segment filters
- report page suitable for sharing internally

---

## 7.2 Convex Control Plane

Convex is the primary source of truth for business state.

### Convex responsibilities
- persistence of all structured product data
- role-aware queries and mutations
- study lifecycle orchestration
- run scheduling and wave control
- aggregation of run results
- replay coordination
- report generation state
- live subscriptions to UI
- audit log

### Convex components to use
- **Workflow** for study-level durable orchestration
- **Workpool** for bounded-concurrency job dispatch and prioritization

### Why this boundary exists
Convex is the best place to manage:
- collaborative product state
- live UI subscriptions
- durable intent recording
- scheduling and retries
- study-level state transitions

It is **not** the place to run headless browsers directly.

---

## 7.3 Cloudflare Browser Executor

The browser executor is a separate TypeScript service deployed as a Cloudflare Worker.

### Responsibilities
- accept run execution requests
- acquire or reuse browser sessions
- create isolated browser contexts
- execute the persona-driven task loop
- emit progress callbacks
- upload screenshots and artifacts to R2
- return final structured results

### Required Worker internals
- `RunExecutorWorker`
- `BrowserLeaseDO` Durable Object
- `ArtifactUploader`
- `RunReporter`

### Browser session policy
- reuse browser sessions when safe
- use a fresh incognito/browser context per run
- never share cookies/session state between runs
- always close contexts
- always close browser sessions when no longer needed

---

## 7.4 Artifact Storage

### Source of truth split
- **Convex** stores structured metadata and artifact manifests
- **R2** stores screenshots, key HTML snapshots, JSON traces, and exported reports

### Rationale
Binary artifacts are high-volume and browser-adjacent. Metadata and collaboration state belong in Convex.

---

## 7.5 Shared AI Layer

Use a shared internal package for:
- prompts
- tool schemas
- Zod contracts
- provider configuration
- retry policies
- output validation helpers

### AI SDK usage by subsystem
- **Convex actions**:
  - persona expansion
  - run summarization
  - cluster labeling
  - recommendation drafting
- **Cloudflare Worker**:
  - per-step action selection
  - in-run reflection
  - post-task self-report generation

---

## 8. Data Model

All examples below are domain types. Actual Convex schema and indexes should follow the same structure.

```ts
export type StudyStatus =
  | "draft"
  | "persona_review"
  | "ready"
  | "queued"
  | "running"
  | "replaying"
  | "analyzing"
  | "completed"
  | "failed"
  | "cancelled";

export type RunStatus =
  | "queued"
  | "dispatching"
  | "running"
  | "success"
  | "hard_fail"
  | "soft_fail"
  | "gave_up"
  | "timeout"
  | "blocked_by_guardrail"
  | "infra_error"
  | "cancelled";

export type Severity = "blocker" | "major" | "minor" | "cosmetic";

export interface Axis {
  key: string;
  label: string;
  description: string;
  lowAnchor: string;
  midAnchor: string;
  highAnchor: string;
  weight: number;
}

export interface ProtoPersona {
  id: string;
  name: string;
  summary: string;
  axes: Axis[];
  sourceType: "manual" | "json_import" | "transcript_derived";
  sourceRefs: string[];
  evidenceSnippets: string[];
  notes?: string;
}

export interface PersonaPack {
  id: string;
  orgId: string;
  name: string;
  description: string;
  context: string;
  sharedAxes: Axis[];
  protoPersonas: ProtoPersona[];
  version: number;
  status: "draft" | "published" | "archived";
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface PersonaVariant {
  id: string;
  personaPackId: string;
  protoPersonaId: string;
  axisValues: Record<string, number>; // normalized to [-1, 1]
  edgeScore: number;
  tensionSeed: string;
  firstPersonBio: string;
  behaviorRules: string[];
  coherenceScore: number;
  distinctnessScore: number;
  accepted: boolean;
}

export interface TaskSpec {
  scenario: string;
  goal: string;
  startingUrl: string;
  allowedDomains: string[];
  allowedActions: AllowedAction[];
  forbiddenActions: ForbiddenAction[];
  successCriteria: string[]; // hidden from agent
  stopConditions: string[];
  postTaskQuestions: string[];
  maxSteps: number;
  maxDurationSec: number;
  environmentLabel: string;
  locale: string;
  viewport: { width: number; height: number };
  credentialsRef?: string;
  randomSeed?: string;
}

export type AllowedAction =
  | "goto"
  | "click"
  | "type"
  | "select"
  | "scroll"
  | "wait"
  | "back"
  | "finish"
  | "abort";

export type ForbiddenAction =
  | "external_download"
  | "payment_submission"
  | "email_send"
  | "sms_send"
  | "captcha_bypass"
  | "account_creation_without_fixture"
  | "cross_domain_escape"
  | "file_upload_unless_allowed";

export interface Study {
  id: string;
  orgId: string;
  personaPackId: string;
  name: string;
  description?: string;
  taskSpec: TaskSpec;
  runBudget: number;
  activeConcurrency: number;
  status: StudyStatus;
  launchRequestedBy?: string;
  launchedAt?: number;
  completedAt?: number;
  cancellationReason?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface RunMilestone {
  stepIndex: number;
  timestamp: number;
  url: string;
  title: string;
  actionType: string;
  rationaleShort: string;
  screenshotKey?: string;
  note?: string;
}

export interface RunRecord {
  id: string;
  studyId: string;
  personaVariantId: string;
  protoPersonaId: string;
  status: RunStatus;
  replayOfRunId?: string;
  startedAt?: number;
  endedAt?: number;
  durationSec?: number;
  stepCount?: number;
  finalUrl?: string;
  finalOutcome?: string;
  selfReport?: {
    perceivedSuccess: boolean;
    hardestPart?: string;
    confusion?: string;
    confidence?: number;
    suggestedChange?: string;
  };
  frustrationCount: number;
  milestoneKeys: string[];
  artifactManifestKey?: string;
  summaryKey?: string;
  workerSessionId?: string;
  errorCode?: string;
}

export interface IssueCluster {
  id: string;
  studyId: string;
  title: string;
  summary: string;
  severity: Severity;
  affectedRunCount: number;
  affectedRunRate: number;
  affectedProtoPersonaIds: string[];
  affectedAxisRanges: Record<string, { min: number; max: number }>;
  representativeRunIds: string[];
  replayConfidence: number;
  evidenceKeys: string[];
  recommendation: string;
  confidenceNote: string;
  score: number;
}

export interface StudyReport {
  id: string;
  studyId: string;
  headlineMetrics: {
    completionRate: number;
    abandonmentRate: number;
    medianSteps: number;
    medianDurationSec: number;
  };
  issueClusterIds: string[];
  segmentBreakdownKey: string;
  limitations: string[];
  htmlReportKey?: string;
  jsonReportKey?: string;
  createdAt: number;
}
```

---

## 9. Persona Generation Pipeline

## 9.1 Input model
v1 uses **manual persona packs** or **JSON import**.

Each pack defines:
- context
- shared axes
- proto-personas
- optional evidence snippets

## 9.2 Stage 1: Coverage sampling
For each proto-persona:
- sample the shared axis space
- bias toward support coverage
- allocate **70% edge-heavy** variants and **30% interior** variants
- enforce minimum distance between variants
- normalize axis values to `[-1, 1]`

### Default cohort sizing
- default run budget: **64**
- minimum: **50**
- maximum: **100**

### Variant allocation rule
1. split runs evenly across proto-personas
2. distribute remainder to higher-complexity proto-personas
3. maintain minimum representation for every proto-persona

## 9.3 Stage 2: Persona expansion
Each sampled point becomes a concise persona card.

### Required fields
- `firstPersonBio`: 80–150 words
- `behaviorRules`: 5–8 bullet rules
- `tensionSeed`: one mild internal tension

### Rules for generation
- no self-negating contradiction
- no protected-class stereotyping
- no excessive narrative backstory
- prioritize task-relevant behavior
- maintain internal coherence

### Examples of useful behavioral dimensions
- digital confidence
- trust skepticism
- patience under friction
- budget sensitivity
- urgency
- aversion to risk
- willingness to compare options
- sensitivity to confusing copy

## 9.4 Validation gate
Reject or regenerate any variant if:
- coherence score is below threshold
- distinctness score is below threshold
- variant is near-duplicate of another
- tension seed makes the task implausible

---

## 10. Study Definition

Each study must define a single goal-based task.

### Required fields
- `name`
- `personaPackId`
- `scenario`
- `goal`
- `startingUrl`
- `allowedDomains`
- `successCriteria` (hidden from agent)
- `stopConditions`
- `runBudget`
- `environmentLabel`

### Defaults
- `maxSteps = 25`
- `maxDurationSec = 420`
- `activeConcurrency = 20`
- `postTaskQuestions = default set`

### Default post-task questions
- Do you think you completed the task?
- What was the hardest part?
- What confused or frustrated you?
- How confident are you that you did the right thing?
- What would you change?

### Hidden evaluator criteria
Analysts can define success criteria such as:
- reached target page
- completed form without fatal validation error
- selected correct option
- did not abandon

These are used for evaluation and ranking but are **not** revealed to the agent.

---

## 11. Runtime Execution Model

## 11.1 Scheduler model
Run cohorts in **waves**, not as a single uncontrolled burst.

### Why
Cloudflare Browser Rendering has platform-level concurrency and launch limits, so the system must schedule runs with bounded concurrency.

### Default policy
- default active concurrency: **20**
- hard cap in app config: **30** unless infra team raises browser limits
- queue remainder until a slot is available

### Study lifecycle states
`draft -> ready -> queued -> running -> replaying -> analyzing -> completed`

---

## 11.2 Browser executor contract

### Request payload
```ts
interface ExecuteRunRequest {
  runId: string;
  studyId: string;
  personaVariant: PersonaVariant;
  taskSpec: TaskSpec;
  callbackToken: string;
  callbackBaseUrl: string;
}
```

### Response contract
The executor should acknowledge dispatch immediately when possible, then push progress and completion back to Convex.

If the first implementation is simpler as a blocking HTTP call, that is acceptable only if:
- max run duration stays well below the platform timeout envelope
- progress state is still periodically written back

---

## 11.3 Agent loop
Each run follows this loop:

1. acquire browser lease
2. create fresh context
3. navigate to starting URL
4. observe rendered state
5. choose one next action
6. execute action
7. record milestone if warranted
8. repeat until stop condition
9. answer post-task questions
10. upload artifacts
11. close context and release session
12. finalize run state

### Observation bundle per step
- current URL
- page title
- visible text excerpt
- interactive element summary
- last few actions
- screenshot or DOM-derived snapshot when needed
- task progress summary

### Action space
- goto
- click
- type
- select
- scroll
- wait
- back
- finish
- abort

### Human-like behavior rules
- reason from rendered state
- allow hesitation and backtracking
- do not act like an omniscient DOM solver
- do not optimize for shortest path at all costs
- allow abandonment when frustration is high

---

## 11.4 Milestones and evidence capture

### Always capture
- first page
- final page
- every fatal error state
- abandonment state
- success state

### Capture conditionally
- first major branch decision
- repeated failure loops
- confusing validation state
- representative dead end

### Do not capture by default
- video
- full high-volume traces for every run
- screenshots on every single step

---

## 11.5 Frustration/confusion heuristics
Create a frustration event when any of the following occurs:
- same page revisited in a loop
- same action repeated without progress
- repeated validation error
- timeout-like idling
- contradictory navigation pattern
- explicit self-report of confusion
- abandonment immediately after an error message or dead end

---

## 12. Replay Verification

Replay is mandatory in v1.

### Replay flow
1. identify top candidate issue groups
2. select representative runs per candidate
3. rerun each selected scenario **2 additional times**
4. compute replay confidence

### Promotion rule
Promote an issue cluster only if it has:
- at least **2 affected runs**, or
- **1 severe blocker** with replay reproduction

### Replay confidence
`replay_confidence = reproduced_failures / replay_attempts`

---

## 13. Analysis Pipeline

## 13.1 Per-run summarization
Generate a structured summary for each run:
- outcome
- likely failure point
- last successful state
- blocking text/error
- frustration markers
- self-reported confidence
- representative quote

## 13.2 Issue clustering
Cluster runs using a combination of:
- failure summary similarity
- page/location similarity
- URL/path similarity
- recent action sequence similarity
- shared validation/error text
- shared abandonment pattern

## 13.3 Ranking formula
```txt
impact_score = severity_weight × affected_run_rate × replay_confidence × segment_spread
```

### Default severity weights
- blocker = 1.0
- major = 0.6
- minor = 0.3
- cosmetic = 0.1

### segment_spread
Boost issues that affect:
- multiple proto-personas
- multiple axis ranges
- many variants near different corners of the space

## 13.4 Final report structure
The report must open with:
- completion rate
- abandonment rate
- median steps
- median duration
- top issue clusters

Each issue cluster must include:
- title
- what broke
- where it broke
- affected persona segments
- evidence screenshots
- representative synthetic quotes
- replay confidence
- recommendation
- confidence note

### Required limitations section
The report must explicitly say:
- findings are synthetic and directional
- agents may miss or invent behavior relative to humans
- human follow-up is recommended for high-stakes decisions

---

## 14. Frontend Requirements

## 14.1 Study dashboard
Must show:
- recent studies
- status chips
- run progress bars
- report availability
- owner and updated timestamp

## 14.2 Persona pack manager
Must support:
- create/edit/delete draft packs
- shared axis editor
- proto-persona editor
- JSON import/export
- publish/freeze
- preview generated variants

## 14.3 Study creation wizard
Must support:
- selecting a persona pack
- editing task spec
- selecting run budget
- configuring environment and guardrails
- launch review screen

## 14.4 Live monitor
Must support:
- queued/running/completed counts
- currently running variants
- run failures by type
- cancel/pause action
- link into run detail pages

## 14.5 Run inspector
Must support:
- persona summary
- timeline of milestone events
- screenshots
- final self-report
- final outcome classification
- artifact links

## 14.6 Findings explorer
Must support:
- issue rank list
- filters by severity, persona, axis range, outcome, URL
- representative runs
- analyst notes/comments

## 14.7 Report page
Must support:
- management summary
- issue cards
- evidence links
- export JSON
- export HTML
- internal share link

---

## 15. Convex Function Boundaries

Actual naming can vary, but the module boundaries must look roughly like this.

### Queries
- `personaPacks.list`
- `personaPacks.get`
- `studies.list`
- `studies.get`
- `studies.getRunSummary`
- `runs.get`
- `findings.listByStudy`
- `reports.getByStudy`
- `settings.get`

### Mutations
- `personaPacks.createDraft`
- `personaPacks.updateDraft`
- `personaPacks.publish`
- `studies.createDraft`
- `studies.updateDraft`
- `studies.launch`
- `studies.cancel`
- `runs.recordDispatch`
- `runs.recordHeartbeat`
- `runs.recordMilestone`
- `runs.complete`
- `runs.fail`
- `findings.addNote`

### Actions
- `personas.generateVariants`
- `analysis.summarizeRun`
- `analysis.clusterIssues`
- `analysis.generateRecommendations`
- `reports.renderHtml`
- `executor.dispatchRun`

### Workflow / Workpool orchestration
- `studyWorkflow.start`
- `studyWorkflow.waitForCohort`
- `studyWorkflow.replayTopFailures`
- `studyWorkflow.finalizeReport`

---

## 16. Cloudflare Worker Interfaces

### Endpoint: `POST /execute-run`
Starts one browser run.

### Endpoint: `POST /health`
Infra health check only.

### Internal Worker modules
- `browserPool.ts`
- `runExecutor.ts`
- `progressReporter.ts`
- `artifactStore.ts`
- `guardrails.ts`
- `stepPolicy.ts`

### Durable Objects
#### `BrowserLeaseDO`
Responsibilities:
- manage active browser/session count
- reuse sessions where safe
- enforce hard concurrency cap
- track session ownership
- reclaim leaked leases

#### `RunCoordinatorDO` (optional in v1)
Responsibilities:
- manage progress batching
- throttle callback writes
- simplify cancellation/heartbeats

---

## 17. Guardrails and Safety Rules

### Environment guardrails
- staging/preview by default
- production only for whitelisted domains and test tenants
- fixture credentials only
- explicit environment label on every study

### Action guardrails
- no irreversible submissions
- no payment completion
- no email/SMS sends
- no CAPTCHA bypass
- no file uploads unless explicitly allowed
- no navigation outside allowed domains

### Secret handling
- credentials never appear in screenshots or logs
- typed secrets are masked in run events
- callback tokens must be signed and short-lived

### Analyst guardrails
- require explicit acknowledgement before launching on production-like environments
- log who launched each study and with what configuration

---

## 18. Cost and Performance Controls

### Browser controls
- block unnecessary third-party analytics when possible
- optionally block heavy media assets for non-visual-critical studies
- default to JPEG screenshots unless pixel-perfect evidence is required
- capture only milestone screenshots by default
- always close contexts and browser sessions

### Scheduling controls
- wave-based dispatch
- bounded active concurrency
- replay only top candidate failures
- cancel remaining runs if global guardrail breach is detected

### Data controls
- store artifact manifest in Convex
- store binary artifacts in R2
- retain low-value artifacts for a shorter period
- retain report evidence for a longer period

---

## 19. Observability

Must track at least:
- study duration
- run queue delay
- run completion rate
- failure counts by type
- browser lease utilization
- replay rate
- artifact storage volume
- per-study model token usage
- per-study browser time usage

Must provide:
- admin diagnostics page
- per-run infra error codes
- audit trail for launches/cancellations/report publication

---

## 20. Repo Layout

```txt
/apps
  /web                 # Vite + React frontend
  /browser-executor    # Cloudflare Worker
/convex
  /schema.ts
  /personaPacks.ts
  /studies.ts
  /runs.ts
  /findings.ts
  /reports.ts
  /settings.ts
  /workflows.ts
/packages
  /shared              # shared zod schemas + domain types
  /ai                  # AI SDK provider wrappers, prompts, evaluators
  /prompts             # prompt templates and tool instructions
  /ui                  # shared UI components if needed
```

---

## 21. Recommended Build Order

### Phase 1: skeleton
- Vite app shell
- Convex schema and auth
- persona pack CRUD
- study CRUD
- route structure

### Phase 2: persona engine
- stage 1 coverage sampler
- stage 2 persona expansion
- variant review UI

### Phase 3: browser executor
- Worker scaffold
- Browser Rendering integration
- browser lease Durable Object
- single-run execution path

### Phase 4: orchestration
- study launch workflow
- wave scheduler
- live status updates
- artifact upload path

### Phase 5: analysis
- run summaries
- clustering
- replay verification
- report generation

### Phase 6: hardening
- guardrails
- audit logging
- admin diagnostics
- export/share polish

---

## 22. Acceptance Criteria

The build is acceptable when all of the following pass.

1. A researcher can create a persona pack with at least 4 proto-personas in the web UI.
2. A researcher can create and launch a study from the web UI without touching raw APIs.
3. A default study can generate **64** distinct persona variants with validation gates.
4. The system can run those variants in bounded browser waves and reflect progress in realtime.
5. Each run produces structured outcome metadata and milestone artifacts.
6. The system can replay top failures and compute replay confidence.
7. The final report ranks issues and links every issue to evidence.
8. Product/design reviewers can inspect runs and findings through the frontend.
9. Guardrails block non-whitelisted domains and forbidden actions.
10. The report clearly states the synthetic and directional nature of the findings.

---

## 23. Implementation Notes for Codex

### Prefer these choices unless blocked
- use React Router, not Next.js
- use Convex as the product-state source of truth
- use Workflow/Workpool instead of inventing a custom scheduler from scratch
- keep AI SDK calls behind a thin internal abstraction
- keep browser execution isolated in the Worker app
- prefer simple milestone traces over heavyweight always-on tracing

### Avoid these mistakes
- do not run Playwright inside Convex directly
- do not let the agent see hidden success criteria
- do not store every DOM snapshot for every step
- do not couple the frontend directly to R2 object structure
- do not promote findings without replay evidence
- do not build transcript ingestion into v1 critical path

### Definition of done
This is done when a product team can:
1. open the web app
2. create a persona pack
3. launch a study
4. watch runs complete live
5. inspect evidence
6. read a ranked report
7. decide what to fix next

---

## 24. Final One-Sentence Summary

Build a **Vite + React + Convex** internal research product with a **Cloudflare Worker browser executor** and **AI SDK-based persona/agent logic** that runs unmoderated synthetic persona studies, verifies top failures with replay, and outputs ranked evidence-backed product recommendations.
