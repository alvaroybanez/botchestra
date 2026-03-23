# Botchestra — Synthetic Persona Validation Platform

## Project Overview

Internal web app for validating web flows with synthetic persona-driven browser agents. See `specs/synthetic_persona_validation_platform_v1_final_spec.md` for the full spec and `specs/PRD-*.md` for implementation PRDs.

## Architecture (target — not all implemented yet)

- **Frontend:** Vite + React 19 + TanStack Router + Tailwind v4 + shadcn/ui (`apps/web`) — *scaffolded, not yet functional*
- **Backend:** Convex (control plane, system of record) — *schema defined, no functions yet*
- **Browser Executor:** Cloudflare Worker + `@cloudflare/playwright` (`apps/browser-executor`) — *stub only*
- **AI:** OpenAI via `@ai-sdk/openai` through `packages/ai` wrapper — *placeholder only*
- **Auth:** Convex Auth with password provider — *not yet configured*
- **Monorepo:** Bun workspaces — *implemented*

## Key Conventions

- **Package manager:** Always use `bun`, never `npm` or `npx`. Use `bunx` instead of `npx`.
- **Dev server port:** 5180
- **Canonical types:** Convex schema is the source of truth for persisted data.
- **Validation:** Zod-first with `convex-helpers` `zCustomQuery`/`zCustomMutation`. Same Zod schemas shared between Convex functions and react-hook-form.
- **AI models:** Never hardcode model names. Use configurable per-task-category model map from `packages/ai`.
- **Prompts:** Each deep module owns its own prompts internally. No shared prompts package.
- **Deep modules:** PersonaEngine, StudyOrchestrator, BrowserExecutor, AnalysisPipeline, ArtifactStore, GuardrailEnforcer.
- **Bug-fixing workflow:** Write a failing test first, then fix the bug.

## Testing

- Vitest for all tests
- `convex-test` for Convex function tests
- `@cloudflare/vitest-pool-workers` for Worker tests
- Pure function tests for all domain logic (sampling, ranking, guardrails, frustration heuristics)
- No real browser tests in CI — use mock browser abstractions

## What NOT to Do

- Do not run Playwright inside Convex directly
- Do not let agents see hidden success criteria
- Do not store every DOM snapshot for every step
- Do not couple the frontend directly to R2 object structure
- Do not promote findings without replay evidence
- Do not build transcript ingestion (deferred to v1.1)
