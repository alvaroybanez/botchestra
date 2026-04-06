# Botchestra

Synthetic persona validation platform -- validates web flows using AI-driven browser agents with synthetic personas.

## Monorepo Map
- `apps/web` -- React 19 + TanStack Router + Tailwind v4 + shadcn/ui frontend
- `apps/browser-executor` -- Cloudflare Worker with `@cloudflare/playwright`
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
- `agent_docs/convex-patterns.md` -- data model, dual-validator pattern, RBAC, workflows, state machines
- `agent_docs/frontend-patterns.md` -- routing, component organization, state management, styling
- `agent_docs/testing-patterns.md` -- Convex tests, frontend tests, AI mocking, file naming
- `agent_docs/packages-overview.md` -- AI wrapper, shared schemas, browser executor

## Guardrails
- Never run Playwright inside Convex directly.
- Never let agents see hidden success criteria.
- Never promote findings without replay evidence.
- Never couple the frontend directly to R2 object structure.
