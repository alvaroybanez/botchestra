# Convex Backend Patterns

## Data Model

15 tables in `convex/schema.ts`. All use `orgId: v.string()` for multi-tenancy and `createdAt`/`updatedAt` as `v.number()` (epoch millis). Indexes follow `by_fieldName` naming.

Key relationships:
- **personaConfigs** → syntheticUsers, transcripts (via configTranscripts), transcriptSignals, batchGenerationRuns
- **studies** → personaConfig, personaVariants, runs, issueClusters, studyReports
- **runs** → study + personaVariant + syntheticUser → runMilestones

## Dual-Validator Pattern

Every function uses both Convex validators (transport layer) and Zod schemas (business rules) — see `convex/studies.ts` for examples:

```ts
export const createStudy = mutation({
  args: { name: v.string(), ... },          // Convex validator
  handler: async (ctx, args) => {
    const parsed = CreateStudySchema.parse(args); // Zod re-parse
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    // ...
  },
});
```

Note: the codebase does NOT use `convex-helpers` `zCustomQuery`/`zCustomMutation`.

## Auth & RBAC

- Auth: `@convex-dev/auth` with custom `ConvexCredentials` provider (`convex/auth.ts`)
- Three roles: `researcher`, `reviewer`, `admin` (`convex/roles.ts`)
- RBAC helpers in `convex/rbac.ts`: `requireIdentity(ctx)`, `requireRole(ctx, allowedRoles)`
- Role groups: `ADMIN_ROLES`, `STUDY_MANAGER_ROLES`, `COMMENTER_ROLES`
- All errors use `ConvexError` (not plain `Error`)

## Workflows

Uses `@convex-dev/workflow` + `@convex-dev/workpool` (`convex/convex.config.ts`).

- Workflow instance: `convex/workflow.ts`
- Study lifecycle: `convex/studyLifecycleWorkflow.ts` — uses `step.runQuery()`, `step.runMutation()`, `step.runAction()` with `{ inline: true, name: "..." }`
- Browser pool: `@convex-dev/workpool` in `convex/waveDispatch.ts`

## State Machines

Studies and runs use explicit transition maps — see `convex/studies.ts` and `convex/runs.ts`:

```ts
const VALID_STUDY_TRANSITIONS: Record<StudyStatus, readonly StudyStatus[]> = { ... };
function assertValidRunTransition(current, next) { /* throws if invalid */ }
```

## Code Organization

- Flat file structure at `convex/` root; subdirs for `analysis/`, `personaEngine/`, `batchGeneration/`
- Pure computation in `analysis/pure.ts` and `personaEngine/pure.ts`
- Each domain file contains queries, mutations, helpers, and validators together
- Observability via `recordAuditEvent()` and `recordMetric()` helpers (`convex/observability.ts`)
- HTTP callbacks at `convex/http.ts` — single `POST /api/run-progress` route
