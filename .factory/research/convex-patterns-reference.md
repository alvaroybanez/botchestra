# Convex Patterns Reference — Botchestra

> Last updated: 2026-03-24
> Sources: npm READMEs, GitHub repos, official Convex docs

---

## Table of Contents

1. [Project Status: Installed Packages](#1-project-status-installed-packages)
2. [@convex-dev/workflow — Durable Workflows](#2-convex-devworkflow--durable-workflows)
3. [@convex-dev/workpool — Bounded Concurrency](#3-convex-devworkpool--bounded-concurrency)
4. [convex-test — Testing Library](#4-convex-test--testing-library)
5. [convex-helpers — Zod Validation & Custom Functions](#5-convex-helpers--zod-validation--custom-functions)
6. [Botchestra-Specific Testing Patterns](#6-botchestra-specific-testing-patterns)
7. [Convex Components System (convex.config.ts)](#7-convex-components-system-convexconfigts)

---

## 1. Project Status: Installed Packages

### Root `package.json`
```json
{
  "dependencies": {
    "@auth/core": "^0.37.0",
    "@convex-dev/auth": "^0.0.91",
    "convex": "^1.34.0",
    "convex-test": "^0.0.43"
  }
}
```

### NOT yet installed (needed for orchestration)
- `@convex-dev/workflow` — durable workflow execution
- `@convex-dev/workpool` — bounded concurrency pools
- `convex-helpers` — zCustomQuery/zCustomMutation with Zod

### Node modules present
- `convex` ✓
- `convex-test` ✓
- `@convex-dev/auth` ✓

### No `convex/convex.config.ts` exists yet
Components like workflow and workpool require this file.

---

## 2. @convex-dev/workflow — Durable Workflows

**Current version:** 0.3.7 (published 2026-03-20)
**npm:** `@convex-dev/workflow`
**GitHub:** https://github.com/get-convex/workflow

### Installation

```bash
bun add @convex-dev/workflow
```

### Setup (3 files)

#### File 1: `convex/convex.config.ts`
```typescript
import { defineApp } from "convex/server";
import workflow from "@convex-dev/workflow/convex.config.js";

const app = defineApp();
app.use(workflow);
export default app;
```

#### File 2: Create the WorkflowManager (e.g. `convex/workflow.ts`)
```typescript
import { WorkflowManager } from "@convex-dev/workflow";
import { components } from "./_generated/api";

export const workflow = new WorkflowManager(components.workflow);
```

#### File 3: Define a workflow
```typescript
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { workflow } from "./workflow";

export const myWorkflow = workflow.define({
  args: { userId: v.id("users") },
  returns: v.string(),
  // IMPORTANT: Always annotate return type to avoid circular deps
  handler: async (step, args): Promise<string> => {
    // Steps can be queries, mutations, or actions
    const user = await step.runQuery(internal.users.get, { id: args.userId });

    // Actions can have retry behavior
    const result = await step.runAction(
      internal.ai.generateContent,
      { prompt: user.name },
      { retry: true } // uses default retry policy
    );

    // Mutations can run inline (same transaction)
    await step.runMutation(
      internal.users.update,
      { id: args.userId, content: result },
      { inline: true }
    );

    return result;
  },
});
```

### Key APIs

| API | Description |
|-----|-------------|
| `workflow.define({ args, returns?, handler })` | Define a workflow. Handler receives `(step, args)`. |
| `workflow.start(ctx, ref, args, opts?)` | Start a workflow from mutation/action. Returns `WorkflowId`. |
| `workflow.status(ctx, workflowId)` | Get workflow status (reactive query). |
| `workflow.cancel(ctx, workflowId)` | Cancel a running workflow. |
| `workflow.restart(ctx, workflowId, opts?)` | Restart from a specific step. |
| `workflow.cleanup(ctx, workflowId)` | Delete workflow storage after completion. |
| `workflow.list(ctx, opts?)` | Paginated list of all workflows. |
| `workflow.listSteps(ctx, workflowId)` | List steps in a workflow. |
| `workflow.sendEvent(ctx, { name, workflowId, value? })` | Send event to a waiting workflow. |

### Step APIs (inside handler)

| API | Description |
|-----|-------------|
| `step.runQuery(ref, args, opts?)` | Run a query step. |
| `step.runMutation(ref, args, opts?)` | Run a mutation step. `{ inline: true }` for same transaction. |
| `step.runAction(ref, args, opts?)` | Run an action step. `{ retry: true/config }`. |
| `step.runWorkflow(ref, args, opts?)` | Run a nested workflow as a single step. |
| `step.awaitEvent({ name, validator? })` | Pause until an external event fires. |

### Starting a workflow
```typescript
export const launchStudy = mutation({
  args: { studyId: v.id("studies") },
  handler: async (ctx, args) => {
    const workflowId = await workflow.start(
      ctx,
      internal.orchestrator.studyWorkflow,
      { studyId: args.studyId },
      {
        onComplete: internal.orchestrator.handleStudyComplete,
        context: { studyId: args.studyId },
      },
    );
    return workflowId;
  },
});
```

### onComplete handler
```typescript
import { vWorkflowId } from "@convex-dev/workflow";
import { vResultValidator } from "@convex-dev/workpool";

export const handleStudyComplete = mutation({
  args: {
    workflowId: vWorkflowId,
    result: vResultValidator,
    context: v.any(),
  },
  handler: async (ctx, { workflowId, result, context }) => {
    if (result.kind === "success") {
      // result.returnValue has the workflow return
    } else if (result.kind === "failed") {
      // result.error has the error message
    } else if (result.kind === "canceled") {
      // workflow was canceled
    }
  },
});
```

### Parallel steps
```typescript
const [a, b] = await Promise.all([
  step.runAction(internal.ai.task1, args),
  step.runAction(internal.ai.task2, args),
]);
```

### Waiting for events (human-in-the-loop)
```typescript
// In workflow:
const approval = await step.awaitEvent({
  name: "userApproval",
  validator: v.object({ approved: v.boolean() }),
});

// From external mutation:
await workflow.sendEvent(ctx, {
  name: "userApproval",
  workflowId,
  value: { approved: true },
});
```

### Retry configuration
```typescript
const workflow = new WorkflowManager(components.workflow, {
  workpoolOptions: {
    maxParallelism: 10,
    retryActionsByDefault: true,
    defaultRetryBehavior: {
      maxAttempts: 3,
      initialBackoffMs: 1000,
      base: 2,
    },
  },
});
```

### Gotchas & Anti-patterns
- **Always annotate handler return type** to break TypeScript circular deps
- Handler must be **deterministic** — no `fetch`, `crypto`, env vars in the handler body (use step actions for those)
- `Math.random()` is seeded per workflow (deterministic PRNG)
- Steps can only pass **< 1 MB** of data in total within a single workflow
- If workflow code changes (steps added/removed/reordered), in-flight workflows will fail with determinism violation
- Completed workflows are NOT auto-cleaned — call `workflow.cleanup()` or use a cron
- Uses Workpool under the hood — the `maxParallelism` is for steps across ALL workflows, not per-workflow

---

## 3. @convex-dev/workpool — Bounded Concurrency

**Current version:** 0.4.3 (published 2026-03-20)
**npm:** `@convex-dev/workpool`
**GitHub:** https://github.com/get-convex/workpool

### Installation

```bash
bun add @convex-dev/workpool
```

### Setup

#### `convex/convex.config.ts`
```typescript
import { defineApp } from "convex/server";
import workpool from "@convex-dev/workpool/convex.config.js";

const app = defineApp();
// Can install multiple pools with different names
app.use(workpool, { name: "emailWorkpool" });
app.use(workpool, { name: "browserWorkpool" });
export default app;
```

#### Create pool instances
```typescript
import { Workpool } from "@convex-dev/workpool";
import { components } from "./_generated/api";

export const browserPool = new Workpool(components.browserWorkpool, {
  maxParallelism: 10,
  retryActionsByDefault: true,
  defaultRetryBehavior: { maxAttempts: 3, initialBackoffMs: 1000, base: 2 },
});
```

### Key APIs

| API | Description |
|-----|-------------|
| `pool.enqueueAction(ctx, ref, args, opts?)` | Enqueue an action with bounded concurrency. |
| `pool.enqueueMutation(ctx, ref, args, opts?)` | Enqueue a mutation. |
| `pool.enqueueActionBatch(ctx, ref, argsBatch)` | Enqueue a batch of actions at once (more efficient). |
| `pool.status(ctx, workId)` | Get status of a specific work item. |
| `pool.cancel(ctx, workId)` | Cancel pending work. |
| `pool.cancelAll(ctx)` | Cancel all pending work. |

### Enqueue options
```typescript
await pool.enqueueAction(ctx, internal.browser.executeRun, { runId }, {
  retry: true,                           // or { maxAttempts: 5, ... }
  onComplete: internal.runs.handleDone,  // always called (success/fail/cancel)
  context: { runId },                    // passed to onComplete
  runAt: Date.now() + 5000,             // schedule for later
  runAfter: 5000,                        // alternative: delay in ms
});
```

### onComplete handler with type safety
```typescript
import { vOnCompleteValidator } from "@convex-dev/workpool";

export const handleDone = internalMutation({
  args: vOnCompleteValidator(v.object({ runId: v.id("runs") })),
  handler: async (ctx, { workId, context, result }) => {
    if (result.kind === "success") {
      await ctx.db.patch(context.runId, { status: "success" });
    } else if (result.kind === "failed") {
      await ctx.db.patch(context.runId, { status: "hard_fail", errorCode: result.error });
    } else if (result.kind === "canceled") {
      await ctx.db.patch(context.runId, { status: "cancelled" });
    }
  },
});

// Alternative: use the helper
export const handleDone = browserPool.defineOnComplete<DataModel>({
  context: v.object({ runId: v.id("runs") }),
  handler: async (ctx, { workId, context, result }) => { /* ... */ },
});
```

### Batching (for high-throughput)
```typescript
await pool.enqueueActionBatch(ctx, internal.browser.executeRun, [
  { runId: run1Id },
  { runId: run2Id },
  { runId: run3Id },
]);
```

### Reactive status
```typescript
import { vWorkIdValidator } from "@convex-dev/workpool";

export const getRunStatus = query({
  args: { workId: vWorkIdValidator },
  handler: async (ctx, args) => {
    return await browserPool.status(ctx, args.workId);
    // Returns: { kind: "pending" | "running" | "finished", previousAttempts? }
  },
});
```

### Gotchas & Anti-patterns
- **maxParallelism**: Avoid >100 on Pro, >20 on free plan across ALL pools + workflows
- Each pool has coordination overhead — don't create too many separate pools
- `cancel()` prevents starting/retrying but won't stop in-progress actions
- Status kept for 1 day by default (`statusTtl` option to change)
- For OCC error reduction, use `maxParallelism: 1` for mutations touching same data

---

## 4. convex-test — Testing Library

**Current version:** 0.0.43 (installed in project)
**npm:** `convex-test`
**Docs:** https://docs.convex.dev/testing/convex-test

### Installation (already done)
```bash
bun add -d convex-test vitest @edge-runtime/vm
```

### Vitest config for Convex tests
The project uses `convex/vitest.config.ts`:
```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    name: "convex",
    include: ["**/*.test.ts"],
    // Should ideally set: environment: "edge-runtime"
  },
});
```

### Key APIs

#### Initialize
```typescript
import { convexTest } from "convex-test";
import schema from "./schema";

const t = convexTest(schema, modules);
// OR for the Botchestra pattern (no import.meta.glob):
const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
};
const t = convexTest(schema, modules);
```

#### Call functions
```typescript
// Public functions
const result = await t.query(api.myModule.myQuery, { arg: "value" });
const id = await t.mutation(api.myModule.myMutation, { arg: "value" });
const data = await t.action(api.myModule.myAction, { arg: "value" });

// Internal functions
const result = await t.query(internal.myModule.internalQuery, { arg: "value" });
const id = await t.mutation(internal.myModule.internalMutation, { arg: "value" });
```

#### Direct DB access with t.run()
```typescript
// Insert test data directly
const id = await t.run(async (ctx) => {
  return await ctx.db.insert("tableName", { field: "value" });
});

// Read back
const doc = await t.run(async (ctx) => ctx.db.get(id));
```

#### Inline functions (v0.0.42+)
```typescript
// Test helper functions that take ctx
const result = await t.mutation(async (ctx) => {
  return await myHelperFunction(ctx, someArgs);
});
```

#### Authentication
```typescript
const asSarah = t.withIdentity({ name: "Sarah", email: "sarah@test.com" });
await asSarah.mutation(api.tasks.create, { text: "Add tests" });

const asAnon = t; // no identity
await expect(asAnon.mutation(api.tasks.create, { text: "fail" }))
  .rejects.toThrowError("Not authenticated");
```

#### Scheduled functions
```typescript
import { vi } from "vitest";

vi.useFakeTimers();
const t = convexTest(schema, modules);

await t.mutation(api.scheduler.schedule, { delayMs: 10000 });
vi.advanceTimersByTime(11000);
await t.finishInProgressScheduledFunctions();

// For chains of scheduled functions:
await t.finishAllScheduledFunctions(vi.runAllTimers);

vi.useRealTimers();
```

#### HTTP actions
```typescript
const response = await t.fetch("/api/webhook", {
  method: "POST",
  body: JSON.stringify({ data: "test" }),
});
expect(response.status).toBe(200);
```

#### Mocking fetch
```typescript
vi.stubGlobal("fetch", vi.fn(async () =>
  ({ text: async () => "mocked response" }) as Response
));
// ... run your action that uses fetch ...
vi.unstubAllGlobals();
```

### Asserting errors
```typescript
await expect(async () => {
  await t.mutation(api.messages.send, { body: "" });
}).rejects.toThrowError("Empty message body is not allowed");
```

### Limitations
- Mock only — doesn't enforce Convex runtime limits
- No cron support — trigger manually
- Simplified text/vector search semantics
- ID format differs from real backend
- Edge runtime mock may differ from actual Convex runtime

---

## 5. convex-helpers — Zod Validation & Custom Functions

**Current version:** 0.1.108
**npm:** `convex-helpers`
**GitHub:** https://github.com/get-convex/convex-helpers
**NOT YET INSTALLED** in Botchestra

### Installation
```bash
bun add convex-helpers
```

### Zod Integration: zCustomQuery / zCustomMutation / zCustomAction

Import from `convex-helpers/server/zod`:

```typescript
// convex/functions.ts
import {
  zCustomQuery,
  zCustomMutation,
  zCustomAction,
} from "convex-helpers/server/zod";
import { query, mutation, action } from "./_generated/server";
import { z } from "zod";
```

#### Basic setup — create builders
```typescript
// convex/functions.ts — define once, reuse everywhere
import { zCustomQuery, zCustomMutation, zCustomAction } from "convex-helpers/server/zod";
import { query, mutation, action, internalQuery, internalMutation, internalAction } from "./_generated/server";
import { NoOp } from "convex-helpers/server/customFunctions";

// Public
export const zQuery = zCustomQuery(query, NoOp);
export const zMutation = zCustomMutation(mutation, NoOp);
export const zAction = zCustomAction(action, NoOp);

// Internal
export const zInternalQuery = zCustomQuery(internalQuery, NoOp);
export const zInternalMutation = zCustomMutation(internalMutation, NoOp);
export const zInternalAction = zCustomAction(internalAction, NoOp);
```

#### Use in functions
```typescript
// convex/studies.ts
import { zMutation, zQuery } from "./functions";
import { z } from "zod";

export const create = zMutation({
  args: {
    name: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    runBudget: z.number().int().min(1).max(1000),
  },
  handler: async (ctx, args) => {
    // args are validated AND typed by Zod
    return await ctx.db.insert("studies", {
      ...args,
      status: "draft",
      createdAt: Date.now(),
    });
  },
});

export const list = zQuery({
  args: {
    orgId: z.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("studies")
      .withIndex("by_orgId", (q) => q.eq("orgId", args.orgId))
      .take(50);
  },
});
```

### Custom Functions (without Zod): customQuery / customMutation / customAction

These let you add middleware-like behavior (auth checks, data loading, ctx modification):

```typescript
// convex/functions.ts
import { customQuery, customMutation, customAction } from "convex-helpers/server/customFunctions";
import { query, mutation, action } from "./_generated/server";

// Add auth check to all queries
export const authedQuery = customQuery(query, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return {
      ctx: { ...ctx, identity },
      args: {},
    };
  },
});

// Usage
export const myProtectedQuery = authedQuery({
  args: { studyId: v.id("studies") },
  handler: async (ctx, args) => {
    // ctx.identity is guaranteed to exist here
    return await ctx.db.get(args.studyId);
  },
});
```

### Combining Zod + Custom Functions (middleware)
```typescript
import { zCustomMutation } from "convex-helpers/server/zod";
import { mutation } from "./_generated/server";

export const authedZMutation = zCustomMutation(mutation, {
  args: {},
  input: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    return {
      ctx: { ...ctx, identity },
      args: {},
    };
  },
});
```

### Other useful convex-helpers utilities

| Import Path | Utility | Description |
|-------------|---------|-------------|
| `convex-helpers/validators` | `literals()`, `nullable()`, `partial()`, `brandedString()` | Extended validators |
| `convex-helpers/server/rowLevelSecurity` | `wrapDatabaseReader()`, `wrapDatabaseWriter()` | Row-level access control |
| `convex-helpers/server/triggers` | `Triggers` | Database change hooks |
| `convex-helpers/server/rateLimit` | `rateLimit()` | Rate limiting |
| `convex-helpers/server/stream` | `stream()`, `mergedStream()` | Composable queries |
| `convex-helpers/server/pagination` | Manual pagination | Beyond built-in paginate() |

### Gotchas
- Zod 3 uses `convex-helpers/server/zod` (aliased to zod3). Zod 4 support is tracked in [issue #558](https://github.com/get-convex/convex-helpers/issues/558)
- The project currently has `zod: ^3.25.76` in `packages/shared` — this is actually Zod 3.x (the version naming is confusing but 3.25.x is Zod 3)
- `NoOp` from `convex-helpers/server/customFunctions` is used when you don't need middleware but want Zod validation
- zCustomQuery/zCustomMutation replaces BOTH the args validator AND gives you Zod types

---

## 6. Botchestra-Specific Testing Patterns

The project already has a working test pattern in `convex/schema.test.ts`.

### Pattern: Explicit modules map (no import.meta.glob)

The project avoids `import.meta.glob` and instead uses an explicit module map:

```typescript
const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
};
```

**Why:** Works with both `bunx vitest` and `bun test`. Since tests only use `t.run()` (direct DB access), no module needs to be loaded. If you add tests that call `t.query(api.foo)` or `t.mutation(api.foo)`, you'll need to add that module to the map.

### Pattern: Comprehensive fixture setup

Each test builds its own fixture data via `t.run()`:
```typescript
it("inserts and reads back", async () => {
  const t = convexTest(schema, modules);
  const now = Date.now();

  // Build parent records first
  const packId = await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", { /* ... */ })
  );

  // Then dependent records
  const studyId = await t.run(async (ctx) =>
    ctx.db.insert("studies", { personaPackId: packId, /* ... */ })
  );

  // Assert
  const doc = await t.run(async (ctx) => ctx.db.get(studyId));
  expect(doc).not.toBeNull();
  expect(doc!.name).toBe("...");
});
```

### Testing actual Convex functions (future pattern)

When you add actual query/mutation/action functions, add them to the modules map:

```typescript
const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  // Add your function files:
  "./studies.ts": () => import("./studies"),
  "./runs.ts": () => import("./runs"),
};

// Then test with t.mutation/t.query:
it("creates a study", async () => {
  const t = convexTest(schema, modules);
  const as = t.withIdentity({ name: "TestUser", email: "test@example.com" });

  const id = await as.mutation(api.studies.create, {
    name: "Test Study",
    // ...
  });

  const study = await t.query(api.studies.get, { id });
  expect(study.name).toBe("Test Study");
});
```

---

## 7. Convex Components System (convex.config.ts)

Both `@convex-dev/workflow` and `@convex-dev/workpool` are **Convex Components**. They require `convex/convex.config.ts`.

### Combined config for Botchestra
```typescript
// convex/convex.config.ts
import { defineApp } from "convex/server";
import workflow from "@convex-dev/workflow/convex.config.js";
import workpool from "@convex-dev/workpool/convex.config.js";

const app = defineApp();

// Workflow uses a workpool internally
app.use(workflow);

// Additional standalone workpool for browser execution
app.use(workpool, { name: "browserPool" });

export default app;
```

### Note on workflow + workpool
`@convex-dev/workflow` uses `@convex-dev/workpool` internally (it's a dependency). You don't need to separately install workpool for workflow. But if you need a SEPARATE pool (e.g., for browser dispatch independent of workflow steps), install workpool and add a separate `app.use()`.

---

## Quick Reference: Installation Commands

```bash
# From project root
bun add @convex-dev/workflow        # includes workpool as dependency
bun add @convex-dev/workpool        # only if you need standalone pools too
bun add convex-helpers              # Zod validation, custom functions, etc.
```

## Quick Reference: Import Patterns

```typescript
// Workflow
import { WorkflowManager } from "@convex-dev/workflow";
import { vWorkflowId, defineEvent } from "@convex-dev/workflow";
import workflow from "@convex-dev/workflow/convex.config.js"; // for convex.config.ts

// Workpool
import { Workpool } from "@convex-dev/workpool";
import { vWorkIdValidator, vOnCompleteValidator, vResultValidator } from "@convex-dev/workpool";
import workpool from "@convex-dev/workpool/convex.config.js"; // for convex.config.ts

// convex-helpers (Zod)
import { zCustomQuery, zCustomMutation, zCustomAction } from "convex-helpers/server/zod";
import { customQuery, customMutation, customAction, NoOp } from "convex-helpers/server/customFunctions";

// convex-test
import { convexTest } from "convex-test";
```
