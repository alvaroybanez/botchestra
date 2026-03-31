# Environment

Environment variables, external dependencies, and setup notes.

**What belongs here:** Required env vars, external API keys/services, dependency quirks, platform-specific notes.
**What does NOT belong here:** Service ports/commands (use `.factory/services.yaml`).

---

## Environment Variables

### Root `.env.local`
- `CONVEX_DEPLOYMENT` — Convex dev deployment target
- `CONVEX_URL` — Convex HTTP API URL
- `CONVEX_SITE_URL` — Convex site URL (used by auth)

### Convex deployment env vars
- `JWT_PRIVATE_KEY` — required by `@convex-dev/auth` password flows so the dev deployment can mint auth tokens
- `JWKS` — required by `@convex-dev/auth` alongside `JWT_PRIVATE_KEY` so login/signup verification works against the Convex deployment
- `ARTIFACT_BASE_URL` — optional override for analysis report/export artifact links. If unset, `convex/artifactResolver.ts` falls back to the local browser-executor proxy at `http://localhost:8787`.

### Worker `.dev.vars` (apps/browser-executor/.dev.vars)
- `CALLBACK_SIGNING_SECRET` — HMAC signing secret for callback tokens
- `OPENAI_API_KEY` — OpenAI API key for agent action selection

## Cloudflare Account
- Account: ybaniez (alvaroybanez@gmail.com)
- Account ID: 4706cd867d3963eb776c8a009005861b
- Plan: Free (Browser Rendering requires Paid plan upgrade)
- R2 bucket: botchestra-artifacts
- KV namespace: botchestra (ID: 9ddc76aba9974aea88d54ef14ae8ab4f)

## Package Manager
Always use `bun`, never `npm` or `npx`. Use `bunx` instead of `npx`.

## Local Dev Notes
- On 2026-03-25, `bun run dev` fell back from port 5180 to 5183 because 5180 was already occupied by an existing local Botchestra server. Before manual browser validation, check whether `http://localhost:5180` is already serving the app so you can reuse it instead of launching a second Vite instance.
- On 2026-03-25, `bunx wrangler dev --port 8787` for `apps/browser-executor` failed with `Address already in use` because an existing `workerd` process was already bound to `127.0.0.1:8787`, and `curl` requests to that listener timed out. Check `lsof -nP -iTCP:8787 -sTCP:LISTEN` before starting a new Worker instance, and do not kill the process unless you started it yourself.
- On 2026-03-31, `bun run test -- --maxWorkers 1` still fails after about 305 seconds because `apps/browser-executor/src/browserLeaseDO.test.ts` has two tests that hit the built-in 120000ms timeout (`rejects acquisitions beyond the hard concurrency cap` and `reclaims stale leases after the timeout passes`). Treat that suite failure as a known pre-existing blocker outside feature work, and use targeted test files plus `bun run typecheck` for milestone validation until those tests are fixed.

## Deployed Worker
- Worker name: `botchestra-browser-executor` (from wrangler.toml)
- After deployment, URL is typically: `https://botchestra-browser-executor.<account>.workers.dev`
- Secrets needed on Worker: CALLBACK_SIGNING_SECRET, OPENAI_API_KEY (set via `wrangler secret put`)
- Convex env var needed: BROWSER_EXECUTOR_URL (set via `bunx convex env set`)
- On 2026-03-31, `bunx wrangler deploy` failed with `No such module "node:buffer"` until `apps/browser-executor/wrangler.toml` added `compatibility_flags = ["nodejs_compat"]` for `@cloudflare/puppeteer`.

## Key Dependencies Not Yet Installed
- `@convex-dev/workflow` — needed for Milestone 4 (StudyOrchestrator)
- `@convex-dev/workpool` — needed for Milestone 4 (StudyOrchestrator)
