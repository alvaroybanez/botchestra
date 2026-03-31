import { register as registerWorkpool } from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { ExecuteRunRequestSchema } from "@botchestra/shared";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { validateCallbackToken as validateWorkerCallbackToken } from "../apps/browser-executor/src/guardrails";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./auth.ts": () => import("./auth"),
  "./costControls.ts": () => import("./costControls"),
  "./heartbeatMonitor.ts": () => import("./heartbeatMonitor"),
  "./http.ts": () => import("./http"),
  "./observability.ts": () => import("./observability"),
  "./runProgress.ts": () => import("./runProgress"),
  "./runs.ts": () => import("./runs"),
  "./schema.ts": () => import("./schema"),
  "./settings.ts": () => import("./settings"),
  "./studies.ts": () => import("./studies"),
  "./waveDispatch.ts": () => import("./waveDispatch"),
};

const CALLBACK_SECRET = "test-callback-secret";
const CALLBACK_BASE_URL = "https://tame-lark-825.eu-west-1.convex.site";
const BROWSER_EXECUTOR_URL = "https://botchestra-browser-executor.example.workers.dev";

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

const createTest = () => {
  const t = convexTest(schema, modules);
  registerWorkpool(t, "browserPool");
  return t;
};

beforeEach(() => {
  process.env.CALLBACK_SIGNING_SECRET = CALLBACK_SECRET;
  process.env.CONVEX_SITE_URL = CALLBACK_BASE_URL;
  process.env.BROWSER_EXECUTOR_URL = BROWSER_EXECUTOR_URL;
});

afterEach(() => {
  delete process.env.CALLBACK_SIGNING_SECRET;
  delete process.env.CONVEX_SITE_URL;
  delete process.env.BROWSER_EXECUTOR_URL;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("e2e callback dispatch verification", () => {
  it("dispatches queued runs through the workpool when dispatchStudyWave is called", async () => {
    vi.useFakeTimers();

    const t = createTest();
    const { runId, studyId } = await insertRunFixture(t, {
      status: "queued",
      startedAt: undefined,
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe(`${BROWSER_EXECUTOR_URL}/execute-run`);
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/json",
      });

      const request = ExecuteRunRequestSchema.parse(JSON.parse(String(init?.body)));

      expect(request).toMatchObject({
        runId,
        studyId,
        callbackBaseUrl: CALLBACK_BASE_URL,
        taskSpec: sampleTaskSpec,
        personaVariant: expect.objectContaining({
          id: expect.any(String),
          axisValues: { checkoutConfidence: 0.6 },
          firstPersonBio: "I want checkout to feel clear and trustworthy.",
        }),
      });

      await expect(
        validateWorkerCallbackToken(request.callbackToken, CALLBACK_SECRET, {
          expectedRunId: request.runId,
        }),
      ).resolves.toMatchObject({
        ok: true,
        payload: expect.objectContaining({
          runId: request.runId,
        }),
      });

      return Response.json({
        ok: true,
        finalOutcome: "SUCCESS",
        stepCount: 5,
        durationSec: 45,
        frustrationCount: 0,
        artifactManifestKey: `runs/${request.runId}/manifest.json`,
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const dispatchResult = await t.mutation(internal.waveDispatch.dispatchStudyWave, {
      studyId,
    });
    const runAfterDispatch = await getRunDoc(t, runId);

    expect(dispatchResult).toMatchObject({
      studyId,
      createdRunCount: 0,
      dispatchedRunCount: 1,
      workIds: [expect.any(String)],
    });
    expect(runAfterDispatch?.status).toBe("dispatching");
    expect(fetchMock).not.toHaveBeenCalled();

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const settledRun = await getRunDoc(t, runId);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(settledRun).toMatchObject({
      status: "success",
      finalOutcome: "SUCCESS",
      stepCount: 5,
      durationSec: 45,
      frustrationCount: 0,
      artifactManifestKey: `runs/${runId}/manifest.json`,
    });
  });

  it("dispatches a schema-valid execute-run request and accepts heartbeat, milestone, and completion callbacks end to end", async () => {
    const t = createTest();
    const { runId } = await insertRunFixture(t, {
      status: "queued",
      startedAt: undefined,
    });

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe(`${BROWSER_EXECUTOR_URL}/execute-run`);
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/json",
      });

      const request = ExecuteRunRequestSchema.parse(JSON.parse(String(init?.body)));

      expect(request).toMatchObject({
        runId,
        studyId: expect.any(String),
        callbackBaseUrl: CALLBACK_BASE_URL,
        taskSpec: sampleTaskSpec,
        personaVariant: expect.objectContaining({
          id: expect.any(String),
          axisValues: { checkoutConfidence: 0.6 },
          firstPersonBio: "I want checkout to feel clear and trustworthy.",
        }),
      });

      await expect(
        validateWorkerCallbackToken(request.callbackToken, CALLBACK_SECRET, {
          expectedRunId: request.runId,
        }),
      ).resolves.toMatchObject({
        ok: true,
        payload: expect.objectContaining({
          runId: request.runId,
        }),
      });

      const heartbeatResponse = await t.fetch("/api/run-progress", {
        method: "POST",
        headers: {
          authorization: `Bearer ${request.callbackToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          runId: request.runId,
          eventType: "heartbeat",
          payload: { timestamp: 5_000 },
        }),
      });
      expect(heartbeatResponse.status).toBe(200);
      await expect(heartbeatResponse.json()).resolves.toEqual({
        ok: true,
        shouldStop: false,
      });

      const milestoneResponse = await t.fetch("/api/run-progress", {
        method: "POST",
        headers: {
          authorization: `Bearer ${request.callbackToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          runId: request.runId,
          eventType: "milestone",
          payload: {
            stepIndex: 3,
            url: "https://example.com/checkout",
            title: "Checkout",
            actionType: "click",
            rationaleShort: "Opened checkout from the cart",
            screenshotKey: "runs/run-1/milestones/3_click.jpg",
          },
        }),
      });
      expect(milestoneResponse.status).toBe(200);

      const completionResponse = await t.fetch("/api/run-progress", {
        method: "POST",
        headers: {
          authorization: `Bearer ${request.callbackToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          runId: request.runId,
          eventType: "completion",
          payload: {
            finalOutcome: "SUCCESS",
            stepCount: 8,
            durationSec: 120,
            frustrationCount: 1,
            artifactManifestKey: "runs/run-1/manifest.json",
            selfReport: {
              perceivedSuccess: true,
              hardestPart: "Choosing shipping speed",
              confidence: 0.92,
            },
          },
        }),
      });
      expect(completionResponse.status).toBe(200);

      return Response.json({
        ok: true,
        finalOutcome: "SUCCESS",
        stepCount: 8,
        durationSec: 120,
        frustrationCount: 1,
        artifactManifestKey: "runs/run-1/manifest.json",
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await t.action(internal.waveDispatch.executeRun, { runId });
    const run = await getRunDoc(t, runId);
    const milestones = await listMilestonesForRun(t, runId);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
      stepCount: 8,
      durationSec: 120,
      frustrationCount: 1,
      artifactManifestKey: "runs/run-1/manifest.json",
    });
    expect(run).toMatchObject({
      status: "success",
      finalOutcome: "SUCCESS",
      stepCount: 8,
      durationSec: 120,
      frustrationCount: 1,
      lastHeartbeatAt: 5_000,
      artifactManifestKey: "runs/run-1/manifest.json",
      milestoneKeys: ["runs/run-1/milestones/3_click.jpg"],
    });
    expect(milestones).toEqual([
      expect.objectContaining({
        runId,
        stepIndex: 3,
        url: "https://example.com/checkout",
        actionType: "click",
        screenshotKey: "runs/run-1/milestones/3_click.jpg",
      }),
    ]);
  });

  it("maps abandoned completion callbacks to gave_up", async () => {
    const t = createTest();
    const { runId } = await insertRunFixture(t, { status: "running", startedAt: 1_000 });
    const callbackToken = await createCallbackToken(String(runId), CALLBACK_SECRET);

    const response = await t.fetch("/api/run-progress", {
      method: "POST",
      headers: {
        authorization: `Bearer ${callbackToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        runId,
        eventType: "completion",
        payload: {
          finalOutcome: "ABANDONED",
          stepCount: 4,
          durationSec: 54,
          frustrationCount: 3,
        },
      }),
    });

    const run = await getRunDoc(t, runId);

    expect(response.status).toBe(200);
    expect(run).toMatchObject({
      status: "gave_up",
      finalOutcome: "ABANDONED",
      stepCount: 4,
      durationSec: 54,
      frustrationCount: 3,
    });
  });

  it.each([
    {
      errorCode: "MAX_STEPS_EXCEEDED",
      expectedStatus: "timeout",
      expectedStoredErrorCode: "MAX_STEPS_EXCEEDED",
    },
    {
      errorCode: "MAX_DURATION_EXCEEDED",
      expectedStatus: "timeout",
      expectedStoredErrorCode: "MAX_DURATION_EXCEEDED",
    },
    {
      errorCode: "GUARDRAIL_VIOLATION",
      expectedStatus: "blocked_by_guardrail",
      expectedStoredErrorCode: "GUARDRAIL_VIOLATION",
      guardrailCode: "DOMAIN_BLOCKED",
    },
    {
      errorCode: "LEASE_UNAVAILABLE",
      expectedStatus: "infra_error",
      expectedStoredErrorCode: "BROWSER_LEASE_TIMEOUT",
    },
    {
      errorCode: "BROWSER_ERROR",
      expectedStatus: "infra_error",
      expectedStoredErrorCode: "WORKER_INTERNAL_ERROR",
    },
  ])(
    "maps %s failure callbacks to the expected run status",
    async ({
      errorCode,
      expectedStatus,
      expectedStoredErrorCode,
      guardrailCode,
    }) => {
      const t = createTest();
      const { runId } = await insertRunFixture(t, { status: "running", startedAt: 1_000 });
      const callbackToken = await createCallbackToken(String(runId), CALLBACK_SECRET);

      const response = await t.fetch("/api/run-progress", {
        method: "POST",
        headers: {
          authorization: `Bearer ${callbackToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          runId,
          eventType: "failure",
          payload: {
            errorCode,
            ...(guardrailCode ? { guardrailCode } : {}),
            message: `${errorCode} occurred`,
          },
        }),
      });

      const run = await getRunDoc(t, runId);

      expect(response.status).toBe(200);
      expect(run?.status).toBe(expectedStatus);
      expect(run?.errorCode).toBe(expectedStoredErrorCode);
      expect(run?.errorMessage).toBe(`${errorCode} occurred`);
      if (guardrailCode) {
        expect(run?.guardrailCode).toBe(guardrailCode);
      }
    },
  );

  it("registers the heartbeat monitor cron and transitions stale runs to infra_error", async () => {
    const cronsSource = readFileSync(new URL("./crons.ts", import.meta.url), "utf8");

    expect(cronsSource).toContain("monitor stale run heartbeats");
    expect(cronsSource).toContain("HEARTBEAT_MONITOR_INTERVAL_SECONDS");
    expect(cronsSource).toContain("internal.heartbeatMonitor.monitorStaleRuns");

    const t = createTest();
    const now = 180_000;
    const { runId } = await insertRunFixture(t, {
      status: "running",
      startedAt: now - 120_000,
      lastHeartbeatAt: now - 90_000,
    });

    const result = await t.mutation(internal.heartbeatMonitor.monitorStaleRuns, { now });
    const run = await getRunDoc(t, runId);

    expect(result).toMatchObject({
      checkedAt: now,
      staleRunCount: 1,
    });
    expect(run).toMatchObject({
      status: "infra_error",
      errorCode: "CALLBACK_REJECTED",
    });
  });
});

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

async function insertRunFixture(
  t: TestInstance,
  overrides: Partial<Doc<"runs">> = {},
) {
  const now = Date.now();
  const configId = await t.run(async (ctx) =>
    ctx.db.insert("personaConfigs", {
      orgId: "org_1",
      name: "Checkout config",
      description: "Config used for end-to-end callback verification tests",
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

  const studyId = await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId: "org_1",
      personaConfigId: configId,
      name: "Checkout study",
      taskSpec: sampleTaskSpec,
      runBudget: 10,
      activeConcurrency: 3,
      status: "running",
      createdBy: "user_1",
      createdAt: now,
      updatedAt: now,
    }),
  );

  const syntheticUserId = await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      configId,
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
      personaConfigId: configId,
      syntheticUserId,
      axisValues: [{ key: "checkoutConfidence", value: 0.6 }],
      edgeScore: 0.5,
      tensionSeed: "I want to finish checkout quickly.",
      firstPersonBio: "I want checkout to feel clear and trustworthy.",
      behaviorRules: [
        "Moves quickly when the next step is obvious.",
        "Pauses when totals change unexpectedly.",
      ],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    }),
  );

  const runId = await t.run(async (ctx) =>
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

  return { runId, studyId, personaVariantId, syntheticUserId };
}

async function getRunDoc(
  t: TestInstance,
  runId: Id<"runs">,
): Promise<Doc<"runs"> | null> {
  return await t.run(async (ctx) => (await ctx.db.get(runId)) as Doc<"runs"> | null);
}

async function listMilestonesForRun(t: TestInstance, runId: Id<"runs">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("runMilestones")
      .withIndex("by_runId_and_stepIndex", (query) => query.eq("runId", runId))
      .collect(),
  );
}

async function createCallbackToken(
  runId: string,
  secret: string,
  exp = Date.now() + 60_000,
) {
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
