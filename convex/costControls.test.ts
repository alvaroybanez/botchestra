import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./auth.ts": () => import("./auth"),
  "./costControls.ts": () => import("./costControls"),
  "./http.ts": () => import("./http"),
  "./observability.ts": () => import("./observability"),
  "./runProgress.ts": () => import("./runProgress"),
  "./runs.ts": () => import("./runs"),
  "./schema.ts": () => import("./schema"),
  "./settings.ts": () => import("./settings"),
  "./studies.ts": () => import("./studies"),
};

const CALLBACK_SECRET = "test-callback-secret";
const createTest = () => convexTest(schema, modules);

const sampleTaskSpec = {
  scenario: "A shopper wants to complete checkout.",
  goal: "Submit the order successfully.",
  startingUrl: "https://example.com/shop",
  allowedDomains: ["example.com"],
  allowedActions: ["goto", "click", "type", "finish"] as (
    | "goto"
    | "click"
    | "type"
    | "select"
    | "scroll"
    | "wait"
    | "back"
    | "finish"
    | "abort"
  )[],
  forbiddenActions: ["payment_submission"] as (
    | "external_download"
    | "payment_submission"
    | "email_send"
    | "sms_send"
    | "captcha_bypass"
    | "account_creation_without_fixture"
    | "cross_domain_escape"
    | "file_upload_unless_allowed"
  )[],
  successCriteria: ["Order confirmation is visible"],
  stopConditions: ["The user leaves the allowed domain"],
  postTaskQuestions: ["Do you think you completed the task?"],
  maxSteps: 25,
  maxDurationSec: 420,
  environmentLabel: "staging",
  locale: "en-US",
  viewport: { width: 1440, height: 900 },
};

beforeEach(() => {
  process.env.CALLBACK_SIGNING_SECRET = CALLBACK_SECRET;
});

describe("cost controls", () => {
  it("auto-cancels queued runs when browser time usage reaches the study budget", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, { status: "running" });
    const runningRunId = await insertRun(t, studyId, {
      status: "running",
      startedAt: 1_000,
    });
    const queuedRunId = await insertRun(t, studyId, { status: "queued" });
    await upsertSettings(t, {
      budgetLimits: {
        maxBrowserSecPerStudy: 10,
      },
    });
    const callbackToken = await createCallbackToken(String(runningRunId), CALLBACK_SECRET);

    const response = await t.fetch("/api/run-progress", {
      method: "POST",
      headers: {
        authorization: `Bearer ${callbackToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        runId: runningRunId,
        eventType: "heartbeat",
        payload: { timestamp: 12_000 },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      shouldStop: true,
    });

    const study = await getStudyDoc(t, studyId);
    const queuedRun = await getRunDoc(t, queuedRunId);
    const runningRun = await getRunDoc(t, runningRunId);

    expect(study?.cancellationReason).toMatch(/browser time budget/i);
    expect(queuedRun?.status).toBe("cancelled");
    expect(runningRun?.cancellationRequestedAt).toBeTypeOf("number");
  });

  it("auto-cancels the study once token usage reaches the configured budget", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, { status: "running" });
    const runningRunId = await insertRun(t, studyId, {
      status: "running",
      startedAt: 1_000,
    });
    const queuedRunId = await insertRun(t, studyId, { status: "queued" });
    await upsertSettings(t, {
      budgetLimits: {
        maxTokensPerStudy: 100,
      },
    });
    await insertMetric(t, studyId, {
      metricType: "model.tokens.prompt",
      value: 120,
      unit: "tokens",
      recordedAt: 5_000,
    });

    await t.mutation(internal.runs.settleRunFromCallback, {
      runId: runningRunId,
      nextStatus: "success",
      patch: {
        endedAt: 6_000,
        durationSec: 5,
        stepCount: 7,
        finalOutcome: "SUCCESS",
        frustrationCount: 0,
      },
    });

    const study = await getStudyDoc(t, studyId);
    const queuedRun = await getRunDoc(t, queuedRunId);

    expect(study?.status).toBe("cancelled");
    expect(study?.cancellationReason).toMatch(/token budget/i);
    expect(study?.cancellationReason).toMatch(/120/);
    expect(queuedRun?.status).toBe("cancelled");
  });

  it("auto-cancels remaining queued runs when cumulative failures exceed the threshold", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, { status: "running" });
    await insertRun(t, studyId, {
      status: "hard_fail",
      startedAt: 1_000,
      endedAt: 2_000,
      durationSec: 1,
      finalOutcome: "FAILED",
      errorCode: "PRIMARY_FAILURE",
    });
    await insertRun(t, studyId, {
      status: "timeout",
      startedAt: 1_000,
      endedAt: 4_000,
      durationSec: 3,
      finalOutcome: "FAILED",
      errorCode: "MAX_DURATION_EXCEEDED",
    });
    await insertRun(t, studyId, {
      status: "infra_error",
      startedAt: 1_000,
      endedAt: 5_000,
      durationSec: 4,
      finalOutcome: "FAILED",
      errorCode: "WORKER_INTERNAL_ERROR",
    });
    const runningRunId = await insertRun(t, studyId, {
      status: "running",
      startedAt: 6_000,
    });
    const queuedRunId = await insertRun(t, studyId, { status: "queued" });

    await t.mutation(internal.runs.settleRunFromCallback, {
      runId: runningRunId,
      nextStatus: "hard_fail",
      patch: {
        endedAt: 8_000,
        durationSec: 2,
        stepCount: 6,
        finalOutcome: "FAILED",
        frustrationCount: 1,
        errorCode: "ASSERTED_FAILURE",
        errorMessage: "The checkout button stayed disabled.",
      },
    });

    const study = await getStudyDoc(t, studyId);
    const queuedRun = await getRunDoc(t, queuedRunId);

    expect(study?.status).toBe("cancelled");
    expect(study?.cancellationReason).toMatch(/cumulative failures/i);
    expect(study?.cancellationReason).toMatch(/threshold/i);
    expect(queuedRun?.status).toBe("cancelled");
  });
});

type StudyStatus =
  | "draft"
  | "persona_review"
  | "ready"
  | "queued"
  | "running"
  | "replaying"
  | "analyzing"
  | "completed"
  | "failed"
  | "cancelled";

type RunStatus =
  | "queued"
  | "dispatching"
  | "running"
  | "success"
  | "hard_fail"
  | "soft_fail"
  | "gave_up"
  | "timeout"
  | "blocked_by_guardrail"
  | "infra_error"
  | "cancelled";

type TestInstance = ReturnType<typeof createTest>;

async function insertStudy(
  t: TestInstance,
  overrides: {
    status: StudyStatus;
  },
) {
  const now = Date.now();
  const configId = await t.run(async (ctx) =>
    ctx.db.insert("personaConfigs", {
      orgId: "org_1",
      name: "Checkout config",
      description: "Config used for cost control tests",
      context: "Checkout flows",
      sharedAxes: [],
      version: 1,
      status: "published",
      createdBy: "user_1",
      updatedBy: "user_1",
      createdAt: now,
      updatedAt: now,
    }),
  );

  return await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId: "org_1",
      personaConfigId: configId,
      name: "Checkout study",
      taskSpec: sampleTaskSpec,
      runBudget: 10,
      activeConcurrency: 3,
      createdBy: "user_1",
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }),
  );
}

async function insertRun(
  t: TestInstance,
  studyId: Id<"studies">,
  overrides: Partial<Doc<"runs">> = {},
) {
  const now = Date.now();
  const study = await getStudyDoc(t, studyId);
  if (study === null) {
    throw new Error("Study not found.");
  }

  const syntheticUserId = await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      configId: study.personaConfigId,
      name: "Focused shopper",
      summary: "Moves quickly and expects little friction.",
      axes: [],
      sourceType: "manual",
      sourceRefs: [],
      evidenceSnippets: [],
    }),
  );

  const personaVariantId = await t.run(async (ctx) =>
    ctx.db.insert("personaVariants", {
      studyId,
      personaConfigId: study.personaConfigId,
      syntheticUserId,
      axisValues: [],
      edgeScore: 0.5,
      tensionSeed: "Moves quickly through checkout",
      firstPersonBio: "A decisive shopper who expects a smooth purchase flow.",
      behaviorRules: [
        "Moves quickly when the next step is obvious.",
        "Pauses when totals change unexpectedly.",
      ],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    }),
  );

  return await t.run(async (ctx) =>
    ctx.db.insert("runs", {
      studyId,
      personaVariantId,
      syntheticUserId,
      status: "queued" satisfies RunStatus,
      frustrationCount: 0,
      milestoneKeys: [],
      ...overrides,
    }),
  );
}

async function upsertSettings(
  t: TestInstance,
  overrides: Partial<Omit<Doc<"settings">, "_id" | "_creationTime" | "orgId">>,
) {
  const existing = await t.run(async (ctx) =>
    ctx.db
      .query("settings")
      .withIndex("by_orgId", (q) => q.eq("orgId", "org_1"))
      .unique(),
  );
  const record = {
    orgId: "org_1",
    domainAllowlist: ["example.com"],
    maxConcurrency: 30,
    modelConfig: [],
    runBudgetCap: 100,
    updatedBy: "admin_1",
    updatedAt: Date.now(),
    ...overrides,
  } satisfies Omit<Doc<"settings">, "_id" | "_creationTime">;

  await t.run(async (ctx) => {
    if (existing === null) {
      await ctx.db.insert("settings", record);
      return;
    }

    await ctx.db.replace(existing._id, record);
  });
}

async function insertMetric(
  t: TestInstance,
  studyId: Id<"studies">,
  metric: Omit<Doc<"metrics">, "_id" | "_creationTime" | "orgId" | "studyId">,
) {
  await t.run(async (ctx) =>
    ctx.db.insert("metrics", {
      orgId: "org_1",
      studyId,
      ...metric,
    }),
  );
}

async function getStudyDoc(
  t: TestInstance,
  studyId: Id<"studies">,
): Promise<Doc<"studies"> | null> {
  return await t.run(async (ctx) => (await ctx.db.get(studyId)) as Doc<"studies"> | null);
}

async function getRunDoc(
  t: TestInstance,
  runId: Id<"runs">,
): Promise<Doc<"runs"> | null> {
  return await t.run(async (ctx) => (await ctx.db.get(runId)) as Doc<"runs"> | null);
}

async function createCallbackToken(runId: string, secret: string, exp = Date.now() + 60_000) {
  const payload = JSON.stringify({ runId, exp });
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload),
  );

  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

function encodeBase64Url(bytes: Uint8Array) {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}
