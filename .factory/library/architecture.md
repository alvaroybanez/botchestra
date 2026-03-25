# Architecture

Architectural decisions, patterns, and conventions for the Botchestra platform.

**What belongs here:** Key patterns, module boundaries, data flow, conventions discovered during implementation.

---

## Monorepo Structure
```
apps/web              — Vite + React 19 + TanStack Router + Tailwind v4 + shadcn/ui
apps/browser-executor — Cloudflare Worker (agent loop, browser rendering)
convex/               — Convex backend (schema, functions, auth)
packages/shared       — Zod schemas for Worker↔Convex contracts
packages/ai           — AI model config wrapper (per-task model resolution)
```

## Key Conventions
- **Convex schema is source of truth** for persisted data
- **Zod validation** on all Convex function arguments via convex-helpers
- **AI calls** go through packages/ai wrapper — never hardcode model names
- **Deep modules**: PersonaEngine, StudyOrchestrator, BrowserExecutor, AnalysisPipeline own their prompts internally
- **No Playwright in CI** — all browser tests use MockBrowserPage
- **Published persona packs are immutable** (frozen)
- **Record encoding**: Convex doesn't support open-ended records, use typed arrays ({key, value}) instead

## Frontend Conventions
- TanStack Router v1 with code-based routing (NOT file-based)
- shadcn/ui components in apps/web/src/components/ui/
- Tailwind v4 with CSS-first config (no tailwind.config.ts)
- ConvexAuthProvider wraps RouterProvider
- In frontend tests that mock generated Convex function references, use `getFunctionName` from `convex/server` to distinguish `api.*` refs at runtime
- Dev server on port 5180

## Convex Conventions
- Explicit modules map in tests (no import.meta.glob)
- convex-test for function tests
- Auth tables via @convex-dev/auth defineSchema helper
- No convex.config.ts yet — needed when installing workflow/workpool (Milestone 4)

## Cloudflare Worker Conventions
- Module syntax: export default { fetch(request, env, ctx) }
- Bindings: ARTIFACTS (R2), KV, BROWSER_LEASE (DO), BROWSER (Browser Rendering)
- wrangler.toml in apps/browser-executor/
- All secrets in .dev.vars (gitignored)
