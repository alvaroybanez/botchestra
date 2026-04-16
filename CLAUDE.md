# Botchestra

Synthetic persona validation platform -- validates web flows using AI-driven browser agents with synthetic personas.

- IMPORTANT: Codex will review your output once you are done.

## Monorepo Map
- `apps/web` -- React 19 + TanStack Router + Tailwind v4 + shadcn/ui frontend
- `apps/browser-executor` -- Cloudflare Worker with `@cloudflare/puppeteer` + a `BrowserLeaseDO` Durable Object (Browser Rendering binding)
- `convex/` -- Convex backend (schema is source of truth for all persisted data)
- `packages/ai` -- AI wrapper (`@ai-sdk/openai`); never hardcode model names
- `packages/shared` -- Shared types and utilities
- `specs/` -- Full spec and PRDs; read before implementing features

## How to Work
- Always use `bun`. Never `npm` or `npx` (use `bunx` instead).
- Dev server runs on port 5180.
- Bug fixes start with a failing test, then the fix.
- Before writing Convex functions, read `convex/_generated/ai/guidelines.md`.
## Deep Dive Docs
Read these when working in the relevant area:
- `docs/convex-patterns.md` -- data model, dual-validator pattern, RBAC, workflows, state machines
- `docs/frontend-patterns.md` -- routing, component organization, state management, styling
- `docs/testing-patterns.md` -- Convex tests, frontend tests, AI mocking, file naming
- `docs/packages-overview.md` -- AI wrapper, shared schemas, browser executor

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

## Guardrails
- Never run the headless browser (`@cloudflare/puppeteer`) inside Convex directly — it runs only in the `apps/browser-executor` Worker.
- Never let agents see hidden success criteria.
- Never promote findings without replay evidence.
- Never couple the frontend directly to R2 object structure.
- Do not store every DOM snapshot for every step.
- Do not build transcript ingestion (deferred to v1.1).

<!-- convex-ai-start -->
This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read `convex/_generated/ai/guidelines.md` first** for important guidelines on how to correctly use Convex APIs and patterns. The file contains rules that override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running `npx convex ai-files install`.
<!-- convex-ai-end -->
