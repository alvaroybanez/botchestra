# Botchestra

**Synthetic Persona Validation Platform** — an internal web application for validating web flows using synthetic persona-driven browser agents. Design a study, generate diverse synthetic personas, let AI agents walk through your web flows, and analyze the results with automated summarization, clustering, and severity ranking.

## Architecture

| Layer | Technology | Workspace |
|---|---|---|
| **Frontend** | Vite + React 19 + TanStack Router + Tailwind v4 + shadcn/ui | `apps/web` |
| **Backend** | Convex (control plane & system of record) | `convex/` |
| **Browser Executor** | Cloudflare Worker + Durable Objects + `@cloudflare/playwright` | `apps/browser-executor` |
| **AI** | OpenAI via Vercel AI SDK (`ai` + `@ai-sdk/openai`) | `packages/ai` |
| **Auth** | Convex Auth with password provider | `convex/auth.ts` |
| **Shared** | Zod schemas and domain types | `packages/shared` |
| **Monorepo** | Bun workspaces | root `package.json` |

## Monorepo Structure

```
botchestra/
├── apps/
│   ├── web/                  # Vite + React 19 SPA (port 5180)
│   └── browser-executor/     # Cloudflare Worker — agent loop, guardrails, artifacts
├── packages/
│   ├── ai/                   # Vercel AI SDK wrapper (configurable model map)
│   └── shared/               # Zod schemas and shared types
├── convex/                   # Convex backend — schema, mutations, queries, workflows
│   ├── schema.ts             # Source-of-truth data model
│   ├── personaConfigs.ts     # Persona configuration CRUD & lifecycle
│   ├── axisLibrary.ts        # Org-scoped axis library (search, CRUD)
│   ├── axisGeneration.ts     # LLM-powered axis auto-generation
│   ├── batchGeneration.ts    # Batch synthetic user generation (100-1000+)
│   ├── batchGeneration/      # Grid anchor Cartesian product & expansion
│   ├── transcripts.ts        # Transcript upload & management
│   ├── transcriptExtraction.ts  # LLM-driven synthetic user extraction
│   ├── configTranscripts.ts  # Transcript ↔ config attachment
│   ├── studies.ts            # Study CRUD & lifecycle
│   ├── studyLifecycleWorkflow.ts  # End-to-end study orchestration
│   ├── waveDispatch.ts       # Wave-based run dispatch
│   ├── runs.ts               # Run management
│   ├── analysisPipeline.ts   # Summarization, clustering, reports
│   ├── analysisQueries.ts    # Analysis read queries
│   ├── rbac.ts               # Role-based access control
│   ├── credentials.ts        # Encrypted credential management
│   ├── observability.ts      # Structured logging & metrics
│   ├── costControls.ts       # Budget guardrails
│   └── ...
├── specs/                    # Product spec & PRDs
├── vitest.config.ts          # Root workspace test config
├── tsconfig.base.json        # Shared TypeScript configuration
└── package.json              # Bun workspace root
```

## Prerequisites

- **[Bun](https://bun.sh/)** — package manager and runtime (always use `bun`/`bunx`, never `npm`/`npx`)
- **[Convex](https://convex.dev/)** account — backend platform
- **[Cloudflare](https://www.cloudflare.com/)** account — for the browser executor worker
- **OpenAI API key** — for persona generation, axis generation, transcript extraction, and analysis

## Setup

```bash
# 1. Install dependencies
bun install

# 2. Configure environment variables
#    Copy and fill in the required keys:
cp .env.local.example .env.local
#    Required variables:
#      CONVEX_DEPLOYMENT — your Convex deployment URL
#      OPENAI_API_KEY    — OpenAI API key for AI features

# 3. Start Convex dev server + web frontend (port 5180)
bun run dev

# 4. (Optional) Start the browser executor worker
cd apps/browser-executor && bunx wrangler dev
```

## Available Scripts

| Command | Description |
|---|---|
| `bun run dev` | Start web frontend (port 5180) + Convex dev server concurrently |
| `bun run test` | Run all tests across the monorepo via Vitest |
| `bun run typecheck` | Type-check all workspaces |
| `bun run build` | Build all workspaces |

## Key Features

### Persona Configurations
Create, edit, publish, and archive persona configurations with shared axes, synthetic users, and transcript attachments. Configurations progress through a draft → published → archived lifecycle with validation at each transition.

### Axis Library
Org-scoped, searchable library of axis definitions. Auto-populated from axes in published persona configurations and enriched via manual curation. Axes define the behavioral and demographic dimensions used to generate diverse synthetic users.

### Axis Generation
LLM-powered auto-generation of axes from configuration context. Given a persona config's purpose and target audience, suggests 3–5 relevant axes with level definitions to accelerate config authoring.

### Transcript Ingestion
Upload interview transcripts and extract synthetic users via LLM analysis. Supports two modes:
- **Auto-discover** — the LLM identifies persona patterns and proposes synthetic users from the transcript
- **Guided** — provide axis hints to steer extraction toward specific dimensions

### Batch Synthetic User Generation
Generate 100–1,000+ synthetic users at scale:
- **Grid anchor Cartesian product** — combines per-axis granularity levels (3/5/7) to create anchor profiles
- **Sequential LLM expansion** — enriches each anchor into a full synthetic user with demographics and behavioral traits
- Cost estimation before generation, real-time progress tracking, and individual profile regeneration

### Studies
Create studies linked to published persona configurations. Studies orchestrate browser-agent runs against target web flows using the generated synthetic users.

### Browser Executor
Cloudflare Worker with Durable Objects for browser lease management. Deployed to Cloudflare Workers with Browser Rendering for headless browser automation.

- **Puppeteer adapter** — bridges `@cloudflare/puppeteer` to the internal `BrowserLike`/`BrowserPage` interfaces, extracting DOM snapshots with interactive elements for the AI agent loop
- **AI action selector** — persona-aware, goal-directed action selection using `generateWithModel("action")` with structured JSON output, graceful fallback to heuristic on LLM failure/timeout, and runtime action validation
- **Agent loop** — observe → decide → act → record with guardrails (allowed/forbidden actions, domain allowlist), step policies, frustration detection, milestone tracking, and artifact uploading
- **Heartbeat cancellation** — Worker respects `shouldStop` signals from Convex heartbeat responses for graceful run termination
- **Secret redaction** — all outbound callbacks and responses have sensitive values replaced with `[REDACTED]`

### Analysis Pipeline
Automated finding summarization, severity classification, observation clustering, and report generation with exportable formats (JSON, CSV).

### Hardening
Role-based access control (RBAC), encrypted credential storage, structured observability, cost control dashboards, and report exports.

## Testing

The project has tests across 68 test files:

```bash
bun run test
```

- **[Vitest](https://vitest.dev/)** for all test workspaces
- **[convex-test](https://docs.convex.dev/testing)** for Convex function tests
- **Pure function tests** for domain logic (sampling, ranking, guardrails, grid anchors, frustration heuristics)
- **Mock browser abstractions** — no real browser tests in CI

Tests are organized as a Vitest workspace spanning `packages/*/vitest.config.ts`, `apps/*/vitest.config.ts`, and `convex/vitest.config.ts`.

## Conventions

- **Package manager:** Always `bun` / `bunx`, never `npm` / `npx`
- **Canonical types:** Convex schema is the single source of truth for persisted data
- **Validation:** Zod-first with `convex-helpers` (`zCustomQuery` / `zCustomMutation`); same schemas shared between backend and frontend forms
- **AI models:** Never hardcode model names — use the configurable per-task-category model map from `packages/ai`
- **Prompts:** Each deep module owns its own prompts internally (no shared prompts package)
- **Bug-fixing:** Write a failing test first, then fix the bug
- **Deep modules:** PersonaEngine · StudyOrchestrator · BrowserExecutor · AnalysisPipeline · ArtifactStore · GuardrailEnforcer
