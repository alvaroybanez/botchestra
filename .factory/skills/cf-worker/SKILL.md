---
name: cf-worker
description: Implements Cloudflare Worker features (browser-executor modules)
---

# Cloudflare Worker

NOTE: Startup and cleanup are handled by `worker-base`. This skill defines the WORK PROCEDURE.

## When to Use This Skill

Features in `apps/browser-executor/`: Worker entry point, Durable Objects, agent loop modules, R2 integration, progress reporting, browser adapter, AI action selector. All Cloudflare Worker-specific code.

## Required Skills

None (no browser UI to test — all verification via unit tests and wrangler dev).

## Work Procedure

1. **Read context**: Read the feature description, preconditions, and expectedBehavior carefully. Read `apps/browser-executor/wrangler.toml` for bindings. Read `packages/shared/src/index.ts` for Zod schemas. Read `.factory/library/architecture.md` for conventions.

2. **Write tests first (RED)**:
   - Pure function tests with Vitest (guardrails, heuristics, policies, adapters, selectors)
   - For browser adapter: mock `@cloudflare/puppeteer` types — never launch real browsers in tests
   - For AI action selector: mock `generateWithModel` from `@botchestra/ai` — never make real LLM calls
   - For Worker integration: standard Vitest with mocks
   - For Durable Objects: test the DO class directly with mocked state
   - Run `bunx vitest run --exclude '**/browserLeaseDO*'` — tests should FAIL (red)

3. **Implement (GREEN)**:
   - Module-syntax Worker: `export default { async fetch(request, env, ctx) {} }`
   - Export Durable Object classes from the same entry point
   - All payloads validated against shared Zod schemas from `@botchestra/shared`
   - TypeScript with `@cloudflare/workers-types`
   - For adapter: use `@cloudflare/puppeteer` (NOT regular puppeteer). `puppeteer.launch(env.BROWSER)` for CF Browser Rendering.
   - For AI selector: use `generateWithModel("action", ...)` from `@botchestra/ai`. Include timeout handling and fallback to heuristic.
   - Run `bunx vitest run --exclude '**/browserLeaseDO*'` — tests should PASS (green)

4. **Verify with wrangler** (if the feature adds/changes HTTP endpoints or deploys):
   - `cd apps/browser-executor && bunx wrangler dev --port 8787`
   - Test endpoints with curl
   - Kill wrangler when done (`lsof -ti :8787 | xargs kill -9 2>/dev/null || true`)

5. **Run validators**:
   - `bunx vitest run --exclude '**/browserLeaseDO*'` (all tests pass)
   - `bun run typecheck` (no type errors)

## Example Handoff

```json
{
  "salientSummary": "Created PuppeteerBrowserAdapter implementing BrowserLike and PuppeteerPageAdapter implementing BrowserPage. Adapter bridges @cloudflare/puppeteer to existing interfaces. snapshot() extracts URL, title, visible text, and interactive elements. 12 tests covering all page methods, lifecycle, and error handling.",
  "whatWasImplemented": "PuppeteerBrowserAdapter: newContext(options) creates incognito context with viewport/locale, returns PuppeteerBrowserContext with newPage() and close(). PuppeteerPageAdapter: implements all BrowserPage methods (snapshot, screenshot, goto, click, type, select, scroll, wait, back). snapshot() uses page.evaluate() to extract DOM state including interactive elements with selectors.",
  "whatWasLeftUndone": "",
  "verification": {
    "commandsRun": [
      {"command": "bunx vitest run --exclude '**/browserLeaseDO*'", "exitCode": 0, "observation": "517 tests passing across 55 files"},
      {"command": "bun run typecheck", "exitCode": 0, "observation": "No type errors"}
    ],
    "interactiveChecks": []
  },
  "tests": {
    "added": [
      {"file": "apps/browser-executor/src/puppeteerAdapter.test.ts", "cases": [
        {"name": "implements BrowserLike interface", "verifies": "Type compatibility"},
        {"name": "snapshot returns BrowserPageSnapshot shape", "verifies": "DOM extraction"},
        {"name": "screenshot returns Uint8Array", "verifies": "Screenshot capture"},
        {"name": "goto navigates to URL", "verifies": "Navigation"},
        {"name": "context lifecycle create and close", "verifies": "Resource cleanup"}
      ]}
    ]
  },
  "discoveredIssues": []
}
```

## AI Integration Notes

When features involve AI-powered action selection:
- Use `generateWithModel("action", { prompt, system })` from `@botchestra/ai` (packages/ai) — never import OpenAI directly
- Model resolution is handled by the ai package's config map (`MODEL_CONFIG.action`)
- In CF Worker context, `OPENAI_API_KEY` comes from env/secrets, not `process.env`
- Mock `generateWithModel` in tests — do NOT make real LLM calls
- The AI selector must handle: malformed LLM responses (parse errors), timeouts (10s budget), and fall back to `createFallbackActionSelector`
- Parse LLM output as JSON, validate against AgentAction shape, handle parse failures gracefully

## Puppeteer Adapter Notes

When features involve the browser adapter:
- Use `@cloudflare/puppeteer` (NOT regular puppeteer)
- Import: `import puppeteer from "@cloudflare/puppeteer"`
- The adapter bridges CF puppeteer's API to the `BrowserLike`/`BrowserPage` interfaces defined in `runExecutor.ts`
- In production: `puppeteer.launch(env.BROWSER)` connects to CF Browser Rendering
- `snapshot()` must use `page.evaluate()` to extract interactive elements (inputs, buttons, links, selects) with their selectors, labels, and types
- In tests: mock the puppeteer API, never launch real browsers
- The `BrowserExecutorEnv` type should include OPENAI_API_KEY for the AI selector

## Deployment Notes

When features involve deployment:
- Build: `cd apps/browser-executor && bunx wrangler deploy`
- For dry-run: `bunx wrangler deploy --dry-run --outdir dist`
- Secrets: `cd apps/browser-executor && bunx wrangler secret put CALLBACK_SIGNING_SECRET` and `bunx wrangler secret put OPENAI_API_KEY`
- Read secret values from `.dev.vars` file and pipe them: `echo "$VALUE" | bunx wrangler secret put SECRET_NAME`
- `wrangler.toml` already has correct bindings — do NOT modify
- After deploy, verify: `curl -X POST https://botchestra-browser-executor.alvaroybanez-dash-cloudflare-com.workers.dev/health`

## When to Return to Orchestrator

- wrangler.toml bindings need changes
- New Cloudflare features needed (Queues, D1, etc.)
- Real Browser Rendering testing required (needs Paid plan)
- Shared Zod schemas in packages/shared need modification
- Deployment fails with auth or configuration errors
- @cloudflare/puppeteer has compatibility issues with the Worker environment
