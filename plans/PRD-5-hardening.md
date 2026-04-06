# PRD-5: Hardening — GuardrailEnforcer, ArtifactStore, Observability, RBAC, and Export

**Project:** Botchestra — Synthetic Persona Validation Platform
**Phase:** 5 of 5
**Status:** Draft
**Depends on:** PRD-0 through PRD-4

---

## Problem Statement

Without deliberate hardening, Botchestra carries several categories of risk that would make it unfit for production use inside a real organization.

**Safety risk.** The browser executor can navigate to arbitrary domains, attempt forbidden actions, or leak credential values into screenshots and logs.

**Access risk.** Without RBAC, any authenticated user can launch studies, modify settings, manage credentials, or publish reports regardless of role.

**Operational risk.** Without observability, failures are invisible until user-reported. No cost tracking, no audit trail.

**Storage risk.** Without a defined ArtifactStore boundary, the frontend couples directly to R2 key structure and URLs expire unpredictably.

**Usability risk.** Without export/share, reviewers cannot distribute findings outside the tool.

---

## Solution

The hardening phase delivers:

1. **GuardrailEnforcer** — pure, auditable module enforcing domain allowlists, forbidden actions, environment policy, production acknowledgment gates, and credential masking.
2. **ArtifactStore polish** — clean cross-boundary interface hiding R2 key structure, signed URL expiry, content-type decisions, and retention policies.
3. **Observability** — metrics collection, admin diagnostics page, standardized infra error codes, audit trail.
4. **Role-Based Access Control** — Convex Auth with JWT custom claims enforcing three roles (Researcher, Reviewer, Admin).
5. **Settings Management** — admin settings page for domain allowlists, concurrency, models, budgets, credentials.
6. **Cost Controls** — analytics blocking, media blocking, JPEG defaults, milestone-only capture, guardrail-breach cancellation.
7. **Export and Share** — JSON export, HTML export, internal share link.

---

## User Stories

### Admin — Settings and Credentials

1. As an Admin, I can navigate to `/settings` and see all org-level configuration grouped by category.
2. As an Admin, I can manage the domain allowlist.
3. As an Admin, I can set default and hard-cap concurrency limits.
4. As an Admin, I can configure which AI model is used for each task category.
5. As an Admin, I can set per-study token and browser time budgets.
6. As an Admin, I can configure whether third-party analytics are blocked in browser sessions.
7. As an Admin, I can configure whether heavy media assets are blocked.
8. As an Admin, I can configure default screenshot format and capture mode.
9. As an Admin, I can create, rotate, and delete test fixture credentials.
10. As an Admin, I can see which studies have used each credential.
11. As an Admin, I can see which domains are in the allowlist and which studies reference domains outside it.
12. As an Admin, I can view model usage and cost totals by study.

### Admin — Observability

13. As an Admin, I can see live and historical study metrics on a diagnostics page.
14. As an Admin, I can see per-study model token and browser time usage.
15. As an Admin, I can see standardized infra error codes on failed runs.
16. As an Admin, I can access an audit trail of launches, cancellations, and report publications.
17. As an Admin, I can filter the audit trail by actor, study, event type, and date range.

### Researcher — Guardrails

18. As a Researcher, I see a clear pass/fail pre-launch validation with human-readable failure reasons.
19. As a Researcher, if domains aren't on the allowlist, the check names the offending hostname.
20. As a Researcher, if forbidden actions are in the task spec, the check names the action.
21. As a Researcher, production-like environments require explicit acknowledgment before launch.
22. As a Researcher, I can see whether a run was terminated by a guardrail violation and which rule.
23. As a Researcher, credentials never appear in screenshots or logs.
24. As a Researcher, cumulative failures above a threshold auto-cancel remaining runs with a clear reason.
25. As a Researcher, I can complete the full workflow without Admin involvement.
26. As a Researcher, I cannot access domain allowlists, model config, or credential store.

### Reviewer — Export and Share

27. As a Reviewer, I can export the report as self-contained HTML.
28. As a Reviewer, I can export the report as structured JSON.
29. As a Reviewer, I can copy an internal share link to the report.
30. As a Reviewer, I can view everything in read-only mode.
31. As a Reviewer, I cannot launch, cancel, create packs, or publish reports.
32. As a Reviewer, I can add comments on issue clusters.
33. As a Reviewer, artifact URLs work without R2 credentials.
34. As a Reviewer, signed URLs remain valid long enough for a review session.

---

## Implementation Decisions

### GuardrailEnforcer

Two separate modules sharing a common policy:

**Worker-side (`apps/browser-executor/src/guardrails.ts`):**
- `isActionAllowed(action, taskSpec): boolean` — no network calls
- `maskSecrets(text, credentialRefs): string` — replaces values with `[REDACTED]`

**Convex-side (`convex/model/guardrails.ts`):**
- `validateStudyLaunch(study): { pass: boolean; reasons: string[] }` — checks domain allowlist, forbidden action conflicts, production acknowledgment gate

Production acknowledgment enforced at the mutation level. All outcomes produce audit events in a `guardrailEvents` table.

### ArtifactStore

**Worker-side:** `uploadArtifact(runId, type, data): Promise<string>` — returns R2 key. v1 preserves the existing `runs/{runId}/...` prefix established by BrowserExecutor so this PRD hardens artifact access without forcing a key migration. Retention class is encoded in R2 metadata.

**Convex-side:** `getArtifactUrl(key): Promise<string>` — Convex action generating signed R2 URL (default 4-hour expiry). `getManifest(runId)` resolves the manifest from `runs.artifactManifestKey` and related report records; no separate manifest table is required in v1.

Frontend never constructs R2 keys directly.

### RBAC

Convex Auth with JWT custom claims: `role: "researcher" | "reviewer" | "admin"`.

Every mutating Convex function begins with `requireRole(ctx, allowedRoles)`. Read-only queries require only authentication (except admin settings). Frontend reads role from auth context for conditional UI rendering.

### Observability

`metrics` table: `studyId`, `metricType`, `value`, `unit`, `recordedAt`. Writes at natural lifecycle events (study completion, run completion, wave dispatch).

`auditEvents` table: `eventType`, `actorId`, `studyId`, `runId?`, `payload`, `timestamp`. Indexed on `(studyId, timestamp)` and `(actorId, timestamp)`.

Admin diagnostics at `/admin/diagnostics`, admin-only route.

Standardized infra error codes: `BROWSER_LEASE_TIMEOUT`, `CONTEXT_CREATION_FAILED`, `NAVIGATION_TIMEOUT`, `CALLBACK_REJECTED`, `R2_UPLOAD_FAILED`, `WORKER_INTERNAL_ERROR`.

### Settings Schema

One document per org. This PRD extends the initial `settings` shape from PRD-0 rather than replacing it:
- `domainAllowlist: string[]`
- `maxConcurrency` plus optional `hardConcurrencyCap` override metadata when infra allows more than the default ceiling
- `modelConfig: Record<TaskCategory, { provider, modelId, maxTokens }>` or an equivalent normalized encoding compatible with the Convex schema
- `runBudgetCap` plus optional `budgetLimits: { maxTokensPerStudy, maxBrowserSecPerStudy }`
- optional `browserPolicy: { blockAnalytics, blockHeavyMedia, screenshotFormat, screenshotMode }`
- `signedUrlExpirySeconds` (default 14400)

Separate `credentials` table with encrypted payloads never returned to frontend.

### Export and Share

- JSON export: Convex action returning full report with inline clusters. Browser file download.
- HTML export: self-contained HTML with embedded evidence links. Includes generation timestamp and URL expiry note.
- Internal share link: `/studies/:studyId/report?shared=1` — minimal header, authenticated only. No public share in v1.

---

## Testing Decisions

### GuardrailEnforcer — Pure Function Tests

- `validateStudyLaunch`: domain not in allowlist, forbidden action mismatch, production without acknowledgment, all-clear pass.
- `isActionAllowed`: every `ForbiddenAction` enum value blocked/allowed.
- `maskSecrets`: single/multiple secrets, no secrets (passthrough), secret in URL.

### RBAC — Role Enforcement Tests

- Each mutating function with insufficient role → `ConvexError` with `FORBIDDEN`.
- Admin-only settings mutations rejected for researcher/reviewer.
- Reviewer mutations (add comment) accepted for all three roles.

### ArtifactStore — Integration Tests

- `uploadArtifact` key naming scheme.
- `getArtifactUrl` returns signed URL with signature parameter.
- `getManifest` returns matching entries.

### Observability Tests

- Run completion writes expected metric documents.
- `guardrailEvents` receives entry on validation failure.
- `auditEvents` receives entries for launch, cancellation, report publication.

### Settings Tests

- `hardConcurrencyCap > 30` rejected without override flag.
- Unrecognized `TaskCategory` rejected by Zod.
- Encrypted credential payload stripped from `settings.get` responses.

---

## Out of Scope

- New research features (study types, persona strategies, analysis algorithms)
- Changing core module behavior — only adds validation hooks and observability
- Unauthenticated public report sharing
- Cross-study benchmarks (v1.1)
- Credential rotation automation
- Video capture or full DOM tracing
- External API or webhooks
- SSO or identity provider management

---

## Further Notes

- **Dependencies**: Requires all prior PRDs functionally complete. May add support tables such as `auditEvents`, `metrics`, and `guardrailEvents`, but should preserve the core product entities and artifact contracts established in earlier PRDs.
- **Launch readiness gate**: Platform should not be used outside engineering until RBAC, guardrails, and audit logging are in place.
- **Acceptance criterion 9**: "Guardrails block non-whitelisted domains and forbidden actions" is introduced functionally in BrowserExecutor and formalized, audited, and administrator-configurable in this PRD.
