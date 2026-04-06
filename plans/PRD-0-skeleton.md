# PRD-0: Skeleton

**Project:** Botchestra — Synthetic Persona Validation Platform
**Phase:** 0 of 5
**Status:** Draft
**Depends on:** Nothing

---

## Problem Statement

No module of the Botchestra platform can be built in isolation until a shared structural foundation exists. The persona engine needs a Convex schema to persist packs and variants. The browser executor needs Zod contracts to speak to Convex. The frontend needs a router and auth session to render any screen at all. The AI layer needs a configurable model registry before any action can call a language model. Without these foundations in place first, every downstream team would be forced to define their own conventions, creating structural drift that is expensive to unify later.

This PRD delivers the skeleton: the monorepo, the complete Convex data model, authentication, the shared Zod contract package, the AI model configuration package, the frontend app shell with all route stubs, and the browser executor stub. Nothing functional ships in this phase beyond the ability to run the dev stack, authenticate, and navigate between empty route shells.

---

## Solution

PRD-0 delivers a fully wired but largely empty platform skeleton. Every downstream PRD can be built by filling in the stubs this phase creates, without needing to touch project structure, tooling, or foundational configuration again.

Concretely, this phase ships:

- A Bun workspace monorepo with `apps/web`, `apps/browser-executor`, `convex/`, `packages/shared`, and `packages/ai`
- An initial Convex schema covering the core v1 domain tables plus Convex Auth tables
- Convex Auth configured with the password provider (email + password, no OAuth)
- `packages/shared` exporting Zod schemas for the `ExecuteRunRequest` and `RunProgressUpdate` contracts used by the Worker–Convex boundary
- `packages/ai` exporting a per-task model configuration map and a thin `generateWithModel` wrapper over the Vercel AI SDK
- A Vite + React + TanStack Router app shell in `apps/web` with shadcn/ui initialized and all route stubs rendering placeholder content
- A Cloudflare Worker stub in `apps/browser-executor` that handles `POST /health` and `POST /execute-run` (immediately returns 501 Not Implemented)
- TypeScript project references wired across all workspaces
- Vitest configured in each package and app

---

## User Stories

1. As a developer joining the project, I want to run a single command to install all workspace dependencies, so that I can be productive immediately without reading per-package setup docs.
2. As a developer, I want to run the Vite dev server on port 5180 and the Convex dev backend in parallel with a single bun script, so that I can work on frontend and backend simultaneously without managing multiple terminal sessions manually.
3. As a researcher, I want to land on the login screen when I open the app without a valid session, so that unauthenticated access to any screen is prevented.
4. As a researcher, I want to create an account using my email address and a password, so that I can access the platform without needing external OAuth credentials.
5. As a researcher, I want to log in with my email and password and be redirected to the studies list, so that my session is established and I can start working immediately.
6. As a researcher, I want to log out and be returned to the login screen, so that I can safely end my session on a shared machine.
7. As a researcher, I want the app to remember my session across page refreshes, so that I do not have to re-authenticate after every browser reload.
8. As a developer, I want all application routes to be defined in a single router configuration, so that I can see the complete URL structure of the app in one place.
9. As a developer, I want to navigate to `/studies` and see a placeholder studies list screen, so that I can confirm the route is wired and rendering before building out the real list.
10. As a developer, I want to navigate to `/studies/new` and see a placeholder study creation screen, so that I can confirm the wizard route is registered.
11. As a developer, I want to navigate to `/studies/:studyId/overview`, `/studies/:studyId/personas`, `/studies/:studyId/runs`, `/studies/:studyId/findings`, and `/studies/:studyId/report` and see distinct placeholder screens, so that I can confirm all per-study tab routes are registered before any module fills them in.
12. As a developer, I want to navigate to `/persona-packs` and see a placeholder pack list screen, so that the persona engine module has a home route to build against.
13. As a developer, I want to navigate to `/persona-packs/:packId` and see a placeholder pack detail screen, so that the pack editor module has a home route to build against.
14. As a developer, I want to navigate to `/settings` and see a placeholder settings screen, so that the admin module has a home route to build against.
15. As a developer, I want navigation from `/` to redirect automatically to `/studies`, so that users always land on a meaningful screen.
16. As a developer, I want a shared sidebar or navigation shell rendered on all authenticated routes, so that downstream modules can add navigation items without re-implementing the shell.
17. As a developer working on the Worker–Convex boundary, I want to import `ExecuteRunRequest` and `RunProgressUpdate` Zod schemas from `packages/shared`, so that I have a single source of truth for the contract without duplicating type definitions.
18. As a developer working on the AI layer, I want to import a task-category model map from `packages/ai` and call `generateWithModel("expansion", prompt)`, so that I can switch models per task category from a central config without touching call sites.
19. As an admin, I want the AI model configuration to be overridable at the environment level, so that the team can swap models for different environments without a code change.
20. As a developer, I want every package and app to have a `vitest` configuration ready to run, so that I can write and run tests immediately without setting up the test runner myself.
21. As a developer, I want TypeScript strict mode enabled across all workspaces with shared base configs, so that type errors are caught at the boundary where they occur rather than at the caller.
22. As a developer, I want the Convex schema to define the core v1 domain tables with their fields, union types, and indexes, so that downstream PRDs can write queries and mutations against a stable foundation and limit later schema changes to additive support fields/tables.
23. As a developer, I want the Convex schema to define the Convex Auth tables alongside the domain tables, so that user identity is available as a foreign key in domain records from day one.
24. As a developer building the browser executor module, I want a Cloudflare Worker stub with a working `POST /health` endpoint and a stubbed `POST /execute-run` returning 501, so that I have a deployable starting point with the correct Worker entry structure.
25. As a developer, I want the monorepo to use Bun workspaces (not Turborepo or Nx), so that the build toolchain remains minimal and consistent with the team's existing tooling preference.

---

## Implementation Decisions

**Monorepo tooling:** Bun workspaces with a root `package.json` defining the workspace glob. No Turborepo, no Nx. Scripts are defined at the root level and delegate to each workspace. Bun handles symlink resolution for cross-workspace imports.

**Workspace structure:** Four workspaces — `apps/web`, `apps/browser-executor`, `packages/shared`, `packages/ai`. Convex lives at the repo root under `/convex` (standard Convex convention, not a Bun workspace package).

**TypeScript:** Each workspace has its own `tsconfig.json` extending a root `tsconfig.base.json`. Strict mode is on everywhere. Project references are used where `composite: true` is needed. The Convex directory uses its own `tsconfig.json` per Convex conventions.

**Convex schema:** The schema is the canonical definition of persisted state. The skeleton defines the core v1 product tables using native Convex validators (`v.object`, `v.string`, `v.union`, `v.literal`, `v.array`, `v.optional`, `v.number`, `v.boolean`, `v.id`). No Zod in the schema file itself — Zod is used only in function argument validation via `convex-helpers`. Indexes are defined where queries by foreign key or status field are obviously needed. Convex Auth tables are added via the `convex-auth` library's `defineSchema` helper. Later PRDs may add support tables and additive optional fields where hardening or reporting requires them, but they should not rewrite these core table shapes.

**Schema tables and key shapes:**
- `personaPacks` — name, description, context, sharedAxes (array of axis objects), version (number), status (union of "draft" | "published" | "archived"), orgId, createdBy, timestamps
- `protoPersonas` — packId (foreign key), name, summary, axes (array), sourceType (union of "manual" | "json_import" | "transcript_derived"), sourceRefs (string array), evidenceSnippets (string array), optional notes
- `personaVariants` — studyId, personaPackId, protoPersonaId (foreign keys), axisValues (record encoded as array of `{key, value}` pairs since Convex does not support open-ended record types natively), edgeScore, tensionSeed, firstPersonBio, behaviorRules (string array), coherenceScore, distinctnessScore, accepted (boolean)
- `studies` — orgId, personaPackId, name, optional description, taskSpec (embedded object matching the spec's `TaskSpec` interface), runBudget, activeConcurrency, status (ten-state union), optional launchRequestedBy/launchedAt/completedAt/cancellationReason, createdBy, timestamps
- `runs` — studyId, personaVariantId, protoPersonaId, status (eleven-state union), optional replayOfRunId, optional timing fields, optional outcome fields, selfReport (optional embedded object), frustrationCount, milestoneKeys (string array), optional artifactManifestKey, optional summaryKey, optional workerSessionId, optional errorCode
- `runMilestones` — runId, studyId (foreign keys), stepIndex, timestamp, url, title, actionType, rationaleShort, optional screenshotKey, optional note. This is the spec's `RunMilestone` type normalized into its own table (the `runs.milestoneKeys` array holds R2 artifact keys for screenshots; `runMilestones` holds the structured event data). Indexed by `(runId, stepIndex)`.
- `issueClusters` — studyId, title, summary, severity (union of "blocker" | "major" | "minor" | "cosmetic"), affectedRunCount, affectedRunRate, affectedProtoPersonaIds (string array), affectedAxisRanges (encoded as array of `{key, min, max}` objects — same encoding strategy as axisValues since Convex doesn't support open-ended records), representativeRunIds (array), replayConfidence, evidenceKeys (string array), recommendation, confidenceNote, score, and room for additive analyst annotation fields in later PRDs
- `studyReports` — studyId, headlineMetrics (embedded: completionRate, abandonmentRate, medianSteps, medianDurationSec), issueClusterIds (array), segmentBreakdownKey, limitations (string array), optional htmlReportKey, optional jsonReportKey, createdAt
- `credentials` — label, encryptedPayload (string), description, allowedStudyIds (optional array for scoping), createdBy, timestamps
- `settings` — orgId (unique), domainAllowlist (string array), maxConcurrency, modelConfig (array of `{taskCategory, modelId}` pairs), runBudgetCap, updatedBy, updatedAt

**Record encoding strategy:** The spec uses `Record<string, T>` in several places (axisValues, affectedAxisRanges). Because Convex does not support open-ended string-keyed records in its validator system, all such fields are stored as typed arrays: `{key: string, value: number}` for axis values, `{key: string, min: number, max: number}` for axis ranges. Helper functions in the model layer convert to and from the record shape that application code expects. This encoding applies consistently to `personaVariants.axisValues`, `issueClusters.affectedAxisRanges`, and `personaPacks.sharedAxes`.

**Convex Auth:** Configured with the `Password` provider from `@convex-dev/auth`. No OAuth. The auth setup follows the standard `convex/auth.ts` + `convex/http.ts` pattern. The frontend wraps the app in `<ConvexAuthProvider>`. Login and signup are handled by Convex Auth's built-in mutations; the frontend calls them directly via the auth client hooks.

**`packages/shared`:** Contains Zod schemas only — no runtime logic. Exports `ExecuteRunRequestSchema` (runId, studyId, personaVariant, taskSpec, callbackToken, callbackBaseUrl), `RunProgressUpdateSchema` (runId, eventType union, payload object), and their inferred TypeScript types. The Worker and Convex action both import from this package. Bun workspace symlinks make the import path `@botchestra/shared`.

**`packages/ai`:** Exports a `MODEL_CONFIG` map keyed by task category (`expansion`, `action`, `summarization`, `clustering`, `recommendation`) with a default model ID per category. Model IDs can be overridden via environment variables following the convention `BOTCHESTRA_MODEL_{CATEGORY}` (e.g., `BOTCHESTRA_MODEL_EXPANSION`). Exports a `generateWithModel(category, options)` function that resolves the correct model from the config map and calls the Vercel AI SDK's `generateText` or `streamText` depending on the options. The package depends on `@ai-sdk/openai` and `ai`. It does not depend on any other workspace package. Import path is `@botchestra/ai`.

**Frontend stack:** Vite, React 19, TypeScript, TanStack Router v1 (routes defined in code, not file-based). shadcn/ui initialized with CSS variables. Tailwind CSS v4. Convex React client (`convex/react`). `ConvexAuthProvider` from `@convex-dev/auth/react` wraps the router. The dev server listens on port 5180. **Deviation from spec:** The spec says "React Router" (section 7.1) but we chose TanStack Router for type-safe route params and prior prototype experience (decided in architecture grill Q5).

**Routing:** All routes are defined in a single router file using TanStack Router's `createRouter` and `createRoute` APIs. The root route checks auth state and redirects unauthenticated users to `/login`. The `/` route redirects to `/studies`. All content routes render a placeholder `<div>` with the route name. A shared layout route renders the sidebar and wraps all authenticated routes.

**shadcn/ui initialization:** `bunx shadcn init` is run in `apps/web`. Only the components needed for the skeleton's auth screens are added in this PRD: `Button`, `Input`, `Label`, `Card`, `Form`. All other components are added by downstream PRDs as needed.

**Browser executor stub:** A standard Cloudflare Worker using the module syntax (`export default { fetch(request, env, ctx) }`). Routes `POST /health` to return `{ status: "ok" }` with HTTP 200. Routes `POST /execute-run` to return `{ error: "not_implemented" }` with HTTP 501. No Durable Objects, no R2, no Playwright in this PRD. `wrangler.toml` is present and valid for local dev with `wrangler dev`. TypeScript is configured for the Cloudflare Worker types (`@cloudflare/workers-types`).

**Vitest:** A root-level `vitest.config.ts` is present but each workspace also has its own config. Tests in this PRD are limited to: one smoke test per package that imports the package's main export and asserts it is defined, plus the auth-adjacent unit tests described in the Testing Decisions section. Convex function tests use `convex-test` (the official Convex testing library).

**Dev scripts:** Root `package.json` defines `dev` (runs Vite dev server and `bunx convex dev` in parallel using `concurrently`), `build` (builds all workspaces), `test` (runs Vitest across all workspaces), and `typecheck` (runs `tsc --noEmit` across all workspaces). All scripts use `bun` — never `npm` or `npx`.

---

## Testing Decisions

**Schema smoke tests (convex-test):** One test that instantiates the Convex test environment, inserts a minimal valid document into each of the domain tables using the schema's validators, and reads it back. This proves the schema compiles and validators accept well-formed data.

**`packages/shared` contract tests:** Unit tests that parse a valid `ExecuteRunRequest` and a valid `RunProgressUpdate` through their Zod schemas and assert `.success` is true. Parse an invalid payload (missing required field) and assert `.success` is false with the correct error path.

**`packages/ai` model config tests:** Unit tests that assert each of the five task categories resolves to a non-empty model ID string from `MODEL_CONFIG`. Assert that the environment variable override mechanism changes the resolved model ID when the env var is set.

**What makes a good test in this phase:** A good skeleton test proves that a boundary contract is correct without asserting behavior that does not exist yet. It should be fast (no real browser, no real network), deterministic, and fail loudly if the structural assumption it encodes is violated.

**What is not tested in this PRD:**
- Auth flows are not tested end-to-end (no Playwright, no browser)
- Frontend routes are not tested (no React testing library setup in this PRD)
- The Worker stub is not integration tested
- No AI model calls are made in any test

---

## Out of Scope

- Any CRUD logic in Convex functions (mutations/queries/actions are stubbed or absent; added by downstream PRDs)
- Persona generation, variant sampling, or any AI-driven content
- Browser execution, Playwright, Durable Objects, or R2
- The live run monitor, findings explorer, report page, or any data-bearing UI
- Convex Workflow and Workpool setup (added in the orchestration PRD)
- Role-based access control enforcement (schema records `createdBy` and `orgId` but no authorization rules are enforced)
- Transcript ingestion (explicitly deferred to v1.1)
- HTML and JSON report export
- Admin diagnostics beyond the settings route stub
- Observability tooling
- CI/CD pipeline configuration
- Cloudflare Pages deployment configuration

---

## Further Notes

- **Convex Auth password provider and company SSO:** The company uses GitLab for identity but GitLab OAuth is not a supported Convex Auth provider. The password provider is the correct choice for v1. SSO can be added as an additional provider later.
- **`packages/ai` does not own prompts:** Module-specific prompts live inside the module. `packages/ai` owns only the model resolution and invocation wrapper.
- **No `packages/ui`:** All shadcn/ui components live in `apps/web/src/components/ui`.
- **No `packages/prompts`:** Prompt templates are colocated with the module that owns the relevant AI call.
- **Normalized `protoPersonas` table:** Proto-personas are a separate table with `packId` foreign key, not embedded in `PersonaPack`. **Deviation from spec:** The spec embeds `protoPersonas: ProtoPersona[]` inside `PersonaPack`. We normalize to avoid document size limits and simplify per-proto-persona queries (decided in architecture grill Q12).
- **`personaVariants` are study-scoped:** Variants have a `studyId` foreign key so variant sets are isolated between study runs of the same pack. **Deviation from spec:** The spec's `PersonaVariant` has `personaPackId` but not `studyId`. We add `studyId` so that regenerating variants for a new study doesn't overwrite variants from a prior study of the same pack.
- **Normalized `runMilestones` table:** The spec defines `RunMilestone` as a type but stores only `milestoneKeys: string[]` on `RunRecord`. We add a `runMilestones` table to store the structured milestone event data (stepIndex, url, title, actionType, rationale) separately from the R2 artifact keys. This makes milestones queryable without loading the full run record.
- **Schema evolution policy:** PRD-0 establishes the core product tables used by PRD-1 through PRD-4. Later PRDs may add support tables such as audit/metrics/guardrail event records or additive optional fields such as analyst notes, but should avoid incompatible rewrites of the core entities defined here.
- **Spec Phase 1 scope difference:** The spec's Phase 1 (skeleton) includes "persona pack CRUD" and "study CRUD." This PRD intentionally defers all CRUD logic to PRD-1 (PersonaEngine) and PRD-3 (StudyOrchestrator) to keep module boundaries clean. The skeleton only provides the schema and route stubs.
- **Callback token signing:** The `callbackToken` field exists in the shared Zod schema but token generation/verification logic is implemented in PRD-3.
- **Port 5180:** The Vite dev server listens on port 5180 per established project convention.
