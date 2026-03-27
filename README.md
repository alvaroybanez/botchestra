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
│   ├── studies.ts            # Study CRUD & lifecycle
│   ├── studyLifecycleWorkflow.ts  # End-to-end study orchestration
│   ├── waveDispatch.ts       # Wave-based run dispatch
│   ├── runs.ts               # Run management
│   ├── personaPacks.ts       # Persona pack CRUD
│   ├── personaVariantGeneration.ts  # AI-driven variant generation
│   ├── analysisPipeline.ts   # Summarization, clustering, reports
│   ├── analysisQueries.ts    # Analysis read queries
│   ├── rbac.ts               # Role-based access control
│   ├── credentials.ts        # Encrypted credential management
│   ├── observability.ts      # Structured logging & metrics
│   ├── costControls.ts       # Budget guardrails
│   └── ...
├── specs/                    # Product spec & PRDs (PRD-0 through PRD-5)
├── vitest.config.ts          # Root workspace test config
├── tsconfig.base.json        # Shared TypeScript configuration
└── package.json              # Bun workspace root
```

## Prerequisites

- **[Bun](https://bun.sh/)** — package manager and runtime (always use `bun`/`bunx`, never `npm`/`npx`)
- **[Convex](https://convex.dev/)** account — backend platform
- **[Cloudflare](https://www.cloudflare.com/)** account — for the browser executor worker
- **OpenAI API key** — for persona generation and analysis

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

Implementation spans six PRDs (PRD-0 through PRD-5):

### PRD-0 — App Shell
- Convex Auth with password provider (sign-up / sign-in)
- TanStack Router with protected routes and role-aware navigation
- Settings page for API keys, model configuration, and user preferences
- shadcn/ui component library integration

### PRD-1 — Persona Engine
- Persona pack CRUD (create, list, archive, duplicate)
- Multi-axis persona model with configurable dimensions (tech savviness, patience, domain expertise, etc.)
- AI-driven variant generation with demographic and behavioral diversity
- Proto-persona templates for quick-start scenarios
- Variant review workflow (approve / reject / regenerate)

### PRD-2 — Browser Executor
- Cloudflare Worker with Durable Objects for browser lease management
- AI agent loop: observe → decide → act → record
- Guardrail enforcer (URL scope, forbidden actions, step limits, cost caps)
- Step policy with configurable action allowlists
- Milestone-based progress tracking
- Artifact uploading (screenshots, HAR traces, DOM snapshots)
- Self-report generation from agent observations

### PRD-3 — Study Orchestrator
- Full study lifecycle workflow (draft → queued → running → analyzing → completed)
- Wave-based dispatch with configurable concurrency
- Run progress tracking with heartbeat monitoring
- Cancellation fan-out for graceful shutdown
- Cost controls and budget enforcement
- Cron-based health checks

### PRD-4 — Analysis Pipeline
- Automated finding summarization and severity classification
- Observation clustering with affinity scoring
- Analysis notes and annotations
- Report generation with exportable formats
- Finding ranking with configurable algorithms
- Artifact resolution for replay evidence

### PRD-5 — Hardening
- Role-based access control (RBAC) with admin / researcher / viewer roles
- Encrypted credential storage for target site authentication
- Structured observability (audit events, function-level logging, metrics)
- Report export (JSON, CSV) with local file download
- Cost control dashboards and alerts

## Testing

The project has **378 tests** across 45 test files, all passing:

```bash
bun run test
```

- **[Vitest](https://vitest.dev/)** for all test workspaces
- **[convex-test](https://docs.convex.dev/testing)** for Convex function tests
- **Pure function tests** for domain logic (sampling, ranking, guardrails, frustration heuristics)
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
