# User Testing

Testing surface, required tools, and resource cost classification.

## Validation Surface

- **Primary surface:** Web browser at `http://localhost:5180`
- **Tool:** `agent-browser` for all UI validation flows
- **Auth:** Convex Auth password provider. Login via `/login` page. Create test users via `/signup` if needed.
- **Pages to test:**
  - `/axis-library` — Axis Library (browse, create, edit, delete axes)
  - `/transcripts` — Transcript Store (upload, browse, view, manage transcripts)
  - `/transcripts/:id` — Transcript detail (viewer, metadata, pack links)
  - `/persona-configs/:configId` — Enhanced config detail (suggest axes, browse library, extract from transcripts, batch generation)
  - `/persona-configs` — Persona configurations list (renamed from persona-packs)
  - `/studies` — Study list with status badges
  - `/studies/new` — Study creation wizard
  - `/studies/:id/overview` — Study overview with live progress
  - `/studies/:id/runs` — Runs list with status badges, expandable milestone timelines
  - `/studies/:id/findings` — Findings with issue clusters

## Validation Concurrency

- **Max concurrent validators:** 4
- **Rationale:** Dev server is lightweight (~55 MB RSS). Machine has 36 GB RAM, 12 CPU cores. Each agent-browser instance uses ~300 MB. For this mission, wrangler dev and Convex dev also run simultaneously, adding ~500 MB overhead. 4 instances = ~1.2 GB + services = ~1.7 GB total. Well within 70% of ~12 GB headroom = 8.4 GB budget.
- **Max concurrent validators (test-cli):** 1
- **Rationale (test-cli):** `bunx convex dev --once` and similar CLI validators already exercise workspace typecheck plus Convex preparation against the shared repo and deployment. Keep them serialized to avoid overlapping generated-file refreshes, duplicate workspace builds, and noisy contention without any throughput benefit.

## Testing Notes

- The dev server is usually already running on port 5180. Check before starting a new one.
- LLM-powered features (axis generation, transcript extraction) require OPENAI_API_KEY set in Convex env. init.sh handles this.
- For transcript extraction testing, use small test transcripts (< 1000 chars each) to minimize LLM cost during validation.
- Cross-area flows (VAL-CROSS-*) test the full pipeline and should be validated last, after all individual area flows pass.
- Axis Library reloads can briefly show the app-level `Loading...` fallback before the route-level `Loading axis library...` skeleton. Wait for the latter text if you need direct evidence for VAL-AXLIB-019.
- Axis Library's filter summary now spells out both active criteria (for example `matching tag "support" and search "insight"`), which is useful evidence for VAL-AXLIB-011's AND behavior.
- Transcript extraction progress does not stay visibly mounted after same-tab navigation away and back; future validators should expect VAL-TEXTR-006 to fail unless that UI is fixed.
- Auto-discover extraction currently surfaces proposed axis keys in camelCase (for example `automationReliance`), which makes `Apply to pack` fail after researchers edit the shared-axis keys to snake_case because the archetype axis-value keys are not updated to match.
- Guided extraction currently provides a reliable path for validating transcript-derived persona creation, evidence deep links, and publish-time transcript reference persistence.
- The current `Re-run extraction` affordance does not start a fresh extraction flow after results exist; it reopens an empty/previous results shell instead.
- For generation-ui validation, a small `.txt` transcript uploaded through `/transcripts`, then attached on `/persona-configs/:configId` and processed via `Extract from Transcripts` → `Guided` → `Continue to cost estimate` → `Confirm & Extract`, reliably produced a transcript-derived synthetic user that could coexist with generated and manual rows.
- The row-level `Regenerating...` loading label is extremely brief on a healthy connection; when visual confirmation is required, temporarily toggling the browser session offline immediately after clicking `Regenerate` keeps the pending label visible long enough to capture evidence.
- Task-spawned flow validators were blocked in this run because the Task tool inherited an invalid custom model alias (`custom:GPT-5.4-(xHigh)-16`); if that persists, complete user testing in the main worker session or correct the inherited model before retrying subagent spawning.

## Setup Tips

- New users created through `/signup` default to the `researcher` role.
- Promote an existing user after signup with:
  - `bun run user:set-role -- '{"email":"<email>","role":"reviewer"}'`
  - `bun run user:set-role -- '{"email":"<email>","role":"admin"}'`
- Org isolation in the current app is effectively per authenticated identity/token identifier, so use separate accounts to validate org-scoped reads and writes.
- For authenticated API probes from the browser session, the Convex auth JWT is available in localStorage under a key that starts with `__convexAuthJWT_`.
- Minimal direct mutation probe shape for Convex HTTP API:
  - `POST ${CONVEX_URL}/api/mutation`
  - Headers: `Content-Type: application/json`, `Authorization: Bearer <jwt>`
  - Body: `{"path":"module:function","format":"convex_encoded_json","args":[{...}]}`.
- Observed during axis-library validation: data visible immediately after creation in one authenticated session was not reliably visible after logging out and back into the same account later. Treat cross-session persistence checks cautiously and avoid depending on re-login within the same flow unless the assertion explicitly requires it.

## Flow Validator Guidance: web

- Use one dedicated browser session and one dedicated account per flow group unless the assignment explicitly requires cross-account comparison.
- Prefix all created data with the assigned group slug (for example `ut-axlib-crud-*`) to avoid collisions and to make cleanup/evidence review easier.
- Keep all mutations for `usageCount` validation within the same assigned account so repeated publishes hit the same org-scoped axis definitions.
- For org isolation checks, compare two separate accounts in separate browser sessions; do not reuse seeded data across accounts.
- If you need to switch accounts inside one session, sign out completely before logging into the next account.
- Capture evidence for every assertion directly from the live web UI; if an assertion also requires backend rejection evidence (for example reviewer FORBIDDEN on mutation), use the smallest direct API/CLI call needed after confirming the UI state.

## Flow Validator Guidance: test-cli

- Run targeted validation commands from the repo root at `/Users/alvaro.ybanez/workspace/github.com/alvaroybanez/botchestra`.
- Prefer the narrowest Vitest command that covers the assigned assertions. For axis-generation contract assertions `VAL-AXGEN-013` through `VAL-AXGEN-015`, use `bun run test -- convex/axisGeneration.test.ts`.
- Treat CLI validation as read-only with respect to app data; do not seed or mutate shared browser state from this surface.
- Save the exact command, exit code, and the relevant passing test names in the flow report so the synthesis can map the output back to the contract assertions.
