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

## Key Dependencies Not Yet Installed
- `@convex-dev/workflow` — needed for Milestone 4 (StudyOrchestrator)
- `@convex-dev/workpool` — needed for Milestone 4 (StudyOrchestrator)
