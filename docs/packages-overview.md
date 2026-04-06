# Packages Overview

## packages/ai

AI wrapper around Vercel AI SDK (`@ai-sdk/openai`). Single file: `src/index.ts`.

Exports:
- `TaskCategory` — 5 categories: expansion, action, summarization, clustering, recommendation
- `MODEL_CONFIG` — maps each category to a model string
- `resolveModel(category, override?)` — resolution chain: explicit override → env var `BOTCHESTRA_MODEL_{CATEGORY}` → default
- `generateWithModel(category, options)` — wraps `generateText`/`streamText` with model resolution

Rule: callers pass a `TaskCategory`, never a hardcoded model name.

## packages/shared

Zod schemas for the worker-backend contract. Single file: `src/index.ts`.

Exports:
- `ExecuteRunRequestSchema` — persona variant + task spec + callback info
- `RunProgressUpdateSchema` — discriminated union: heartbeat | milestone | completion | failure
- `SelfReportSchema` — persona self-report structure

## apps/browser-executor

Cloudflare Worker with `@cloudflare/puppeteer` for headless browser execution.

~52 source files in `src/`: `executeRunHandler.ts`, `runExecutor.ts`, `aiActionSelector.ts`, `puppeteerAdapter.ts`, `guardrails.ts`, `selfReport.ts`, `progressReporter.ts`, etc.

Heavily tested with colocated test files. Has its own `vitest.config.ts`.
