---
title: Botchestra — One-Pager
date: 2026-04-16
---

# Botchestra

**Synthetic persona validation platform.** Product teams define a "study" (target URL + task + allowed/forbidden actions + hidden success criteria); Botchestra runs it at scale using AI-driven browser agents that each embody a distinct synthetic persona. Output: completion rates, frustration clusters, severity-ranked findings, HTML/JSON reports.

**Who uses it:** UX researchers and product owners who want to surface usability issues before shipping, without running live user tests.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vite 6 · React 19 · TanStack Router · Tailwind v4 · shadcn/ui · Framer Motion — port 5180 |
| Backend | Convex 1.34 (realtime DB, queries, mutations, actions, auth) |
| Auth | `@convex-dev/auth` (password provider) + RBAC (`researcher` / `reviewer` / `admin`) |
| Orchestration | `@convex-dev/workflow` (durable study lifecycle) + `@convex-dev/workpool` (max 30 concurrent runs) |
| AI | Vercel AI SDK (`ai` v4 + `@ai-sdk/openai`) via `packages/ai` — per-task-category model map, never hardcoded |
| Browser executor | Cloudflare Worker + `BrowserLeaseDO` Durable Object + `@cloudflare/puppeteer` on the Browser Rendering binding |
| Storage | R2 (artifacts, HMAC-signed URLs) · KV (session cache) |
| Monorepo | Bun workspaces (never npm/npx) |
| Tests | Vitest · `convex-test` · `@cloudflare/vitest-pool-workers` — no real browsers in CI |

## Architecture

```
apps/web  ⇄  convex/ (control plane)  ─HTTP→  apps/browser-executor (Worker + DO)
                                                        ↓
                                               R2 · KV · Browser Rendering
```

Six cross-cutting "deep modules" (conceptual, not folders): **PersonaEngine**, **StudyOrchestrator**, **BrowserExecutor**, **AnalysisPipeline**, **ArtifactStore**, **GuardrailEnforcer**. Each module owns its own prompts internally — no shared prompts package.

## Study run flow

1. User creates study linked to a published persona config; Convex Workflow starts.
2. `waveDispatch` fans out via Workpool (cap 30) with HTTP POSTs to the Worker.
3. Worker: HMAC-validate callback token → acquire lease from `BrowserLeaseDO` → observe-decide-act loop (snapshot → AI picks action with structured output, heuristic fallback → guardrails check → execute).
4. Worker uploads screenshots + manifest to R2; POSTs results back to Convex. Heartbeat polling respects `shouldStop: true` for graceful cancellation.
5. `analysisPipeline` summarizes → clusters → severity-ranks → writes HTML/JSON reports to R2.
6. Frontend subscribes reactively; artifacts served via signed URLs.

## Conventions

- **Canonical types:** Convex schema is the single source of truth for persisted data.
- **Validation:** Zod-first with `convex-helpers` `zCustomQuery`/`zCustomMutation`; the same Zod schemas are shared with `react-hook-form`.
- **Hidden success criteria:** agents never see them — enforced server-side.
- **Bug-fixing:** failing test first, then fix.
- **Secret redaction:** outbound callbacks and responses replace sensitive values with `[REDACTED]`.

## Deep-dive docs

- `docs/convex-patterns.md` — data model, dual-validator, RBAC, workflows, state machines
- `docs/frontend-patterns.md` — routing, component organization, state, styling
- `docs/testing-patterns.md` — Convex tests, frontend tests, AI mocking
- `docs/packages-overview.md` — `packages/ai`, `packages/shared`, `apps/browser-executor`
