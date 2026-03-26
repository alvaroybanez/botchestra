# User Testing

Testing surface, required tools, and resource cost classification.

**What belongs here:** How to validate the application through its user surface, tools needed, concurrency limits.

---

## Validation Surface

**Primary surface:** Browser (web app at http://localhost:5180)
**Tool:** agent-browser skill
**Setup:** `bun run dev` starts Vite (port 5180) + Convex dev concurrently

### Surfaces by Milestone
| Milestone | Surface | Tool | Notes |
|-----------|---------|------|-------|
| 1: skeleton-completion | Browser (routes, sidebar, auth) | agent-browser | Auth flows, navigation |
| 2: persona-engine | Browser (pack CRUD, variant grid) | agent-browser | Form interactions, data display |
| 3: browser-executor | Browser Executor HTTP API (`http://localhost:8787`) | `curl` | Real surface is the Worker's HTTP API. `/health` and request-validation paths are testable directly; successful `/execute-run` still needs a reachable callback receiver at `/api/run-progress`. |
| 4: study-orchestrator | Browser (study pages, monitoring) | agent-browser | Complex state transitions |
| 5: analysis-pipeline | Browser (findings, reports) | agent-browser | Filtering, export |
| 6: hardening | Browser (settings, diagnostics) | agent-browser | RBAC enforcement |

### Auth for Testing
- Convex Auth with password provider
- Create test accounts via signup form at /signup
- No seed data needed — tests create their own data

## Validation Concurrency

**Machine specs:** 36GB RAM, 12 cores (macOS)
**Baseline usage:** ~14.5GB RAM used, ~8.7GB available
**70% headroom:** 6.1GB

**agent-browser instances:**
- Each instance: ~300MB RAM
- Dev server overhead: ~400MB (shared)
- **Max concurrent validators: 5**
- Rationale: 5 × 300MB = 1.5GB + 400MB dev server = 1.9GB, well within 6.1GB budget. Conservative limit to account for system pressure from other processes.

**browser-executor API validators:**
- Shared service: one `wrangler dev` process on port 8787 with local Browser/KV/R2/DO bindings
- Shared mutable state: local Durable Object leases, R2 artifacts, callback delivery expectations
- **Max concurrent validators: 1**
- Rationale: the surface is a single local Worker instance with shared state and no isolated callback receiver per validator, so serial execution avoids cross-test interference.

## Known Limitations
- Browser executor (Milestone 3) has no end-user web UI; user testing happens against the Worker HTTP API rather than a browser page
- Successful `/execute-run` validation still depends on a callback receiver answering `POST /api/run-progress`; that receiver is part of a later orchestration milestone, so full end-to-end success may remain blocked even when the Worker boots correctly
- Convex Workflow/Workpool (Milestone 4): cannot be tested end-to-end without deployed Worker
- Browser Rendering not available (Free plan) — all agent loop tests use MockBrowserPage

## Flow Validator Guidance: Browser

- Validate against `http://localhost:5180` only.
- Reuse an already-healthy dev server on port 5180 when present; do not start parallel web servers on other ports.
- Use a dedicated test account per subagent so auth/session state and empty-state expectations do not interfere across runs.
- Stay within browser-visible behavior: verify pages, links, redirects, loading states, and error messages through the UI rather than code inspection.
- Prefer visible navigation over manual URL entry unless an assertion explicitly requires deep-link or direct-entry behavior.
- Save screenshots and any other user-surface evidence under the subagent's assigned evidence directory only.

## Flow Validator Guidance: Browser Executor API

- Validate against `http://localhost:8787` only, reusing the single manifest-backed `browser-executor` service.
- Use `curl` (or equivalent direct HTTP requests) against the real Worker routes; do not replace the Worker with a mock server.
- Treat `/health` and request-validation responses as the primary user-visible surface for this milestone.
- For `/execute-run`, generate request payloads from the shared schema and keep each run isolated with a unique `runId`.
- Do not rely on ports outside mission boundaries for callback capture; if `/execute-run` cannot complete because no real callback receiver is available at `/api/run-progress`, record that as a blocker rather than inventing extra infrastructure.
- Save request/response transcripts and any service logs under the assigned evidence directory only.

## Persona-engine rerun notes (2026-03-25)

- `/persona-packs` now exposes an **Import Pack** dialog on the real browser surface; importing a valid payload redirects to a pack detail page whose proto-persona cards visibly show `Source: json_import`.
- Pack detail audit trails now visibly include **Last modified by** in addition to **Created by**.
- `VAL-PERSONA-057` remains blocked for fresh authenticated orgs: imported/test packs show **No studies linked to this pack**, and visible study navigation still only reaches the demo personas route with 3 accepted variants.
