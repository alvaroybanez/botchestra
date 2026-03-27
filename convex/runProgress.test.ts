import { beforeEach, describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./auth.ts": () => import("./auth"),
  "./costControls.ts": () => import("./costControls"),
  "./http.ts": () => import("./http"),
  "./runProgress.ts": () => import("./runProgress"),
  "./runs.ts": () => import("./runs"),
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

describe("POST /api/run-progress", () => {
  it("rejects invalid callback tokens with 401 and leaves the run unchanged", async () => {
    const t = createTest();
    const runId = await insertRun(t, { status: "running", startedAt: 1_000 });

    const response = await t.fetch("/api/run-progress", {
      method: "POST",
      headers: {
        authorization: "Bearer not-a-valid-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        runId,
        eventType: "heartbeat",
        payload: { timestamp: 5_000 },
      }),
    });

    expect(response.status).toBe(401);

    const run = await getRunDoc(t, runId);
    expect(run?.status).toBe("running");
    expect((run as Doc<"runs"> & { lastHeartbeatAt?: number })?.lastHeartbeatAt).toBeUndefined();
  });

  it("updates lastHeartbeatAt without changing status for heartbeat callbacks", async () => {
    const t = createTest();
    const runId = await insertRun(t, { status: "running", startedAt: 1_000 });
    const callbackToken = await createCallbackToken(runId, CALLBACK_SECRET);

    const response = await t.fetch("/api/run-progress", {
      method: "POST",
      headers: {
        authorization: `Bearer ${callbackToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        runId,
        eventType: "heartbeat",
        payload: { timestamp: 5_000 },
      }),
    });

    expect(response.status).toBe(200);

    const run = await getRunDoc(t, runId);
    expect(run?.status).toBe("running");
    expect((run as Doc<"runs"> & { lastHeartbeatAt?: number })?.lastHeartbeatAt).toBe(5_000);
  });

  it("creates a runMilestones document for milestone callbacks", async () => {
    const t = createTest();
    const runId = await insertRun(t, { status: "running", startedAt: 1_000 });
    const callbackToken = await createCallbackToken(runId, CALLBACK_SECRET);

    const response = await t.fetch("/api/run-progress", {
      method: "POST",
      headers: {
        authorization: `Bearer ${callbackToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        runId,
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

    expect(response.status).toBe(200);

    const milestones = await t.run(async (ctx) =>
      ctx.db
        .query("runMilestones")
        .withIndex("by_runId_and_stepIndex", (q) => q.eq("runId", runId))
        .collect(),
    );

    expect(milestones).toHaveLength(1);
    expect(milestones[0]).toMatchObject({
      runId,
      stepIndex: 3,
      url: "https://example.com/checkout",
      title: "Checkout",
      actionType: "click",
      rationaleShort: "Opened checkout from the cart",
      screenshotKey: "runs/run-1/milestones/3_click.jpg",
    });
  });

  it("finalizes successful completion callbacks with all outcome fields", async () => {
    const t = createTest();
    const runId = await insertRun(t, { status: "running", startedAt: 1_000 });
    const callbackToken = await createCallbackToken(runId, CALLBACK_SECRET);

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
          finalOutcome: "SUCCESS",
          stepCount: 8,
          durationSec: 120,
          frustrationCount: 1,
          artifactManifestKey: "runs/run-1/manifest.json",
          selfReport: {
            perceivedSuccess: true,
            hardestPart: "Choosing shipping speed",
            confusion: "The address form looked optional",
            confidence: 0.9,
            suggestedChange: "Explain shipping options sooner",
            answers: {
              "Did you think you completed the task?": true,
            },
          },
        },
      }),
    });

    expect(response.status).toBe(200);

    const run = await getRunDoc(t, runId);
    expect(run?.status).toBe("success");
    expect(run?.finalOutcome).toBe("SUCCESS");
    expect(run?.stepCount).toBe(8);
    expect(run?.durationSec).toBe(120);
    expect(run?.frustrationCount).toBe(1);
    expect(run?.artifactManifestKey).toBe("runs/run-1/manifest.json");
    expect((run?.selfReport as Doc<"runs">["selfReport"] & { answers?: Record<string, unknown> })?.answers).toEqual({
      "Did you think you completed the task?": true,
    });
  });

  it("maps failure callbacks to an error status and persists the error code", async () => {
    const t = createTest();
    const runId = await insertRun(t, { status: "running", startedAt: 1_000 });
    const callbackToken = await createCallbackToken(runId, CALLBACK_SECRET);

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
          errorCode: "BROWSER_ERROR",
          message: "Browser crashed during checkout",
        },
      }),
    });

    expect(response.status).toBe(200);

    const run = await getRunDoc(t, runId);
    expect(run?.status).toBe("infra_error");
    expect(run?.errorCode).toBe("WORKER_INTERNAL_ERROR");
  });

  it("persists a specific guardrail code for blocked runs", async () => {
    const t = createTest();
    const runId = await insertRun(t, { status: "running", startedAt: 1_000 });
    const callbackToken = await createCallbackToken(runId, CALLBACK_SECRET);

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
          errorCode: "GUARDRAIL_VIOLATION",
          guardrailCode: "DOMAIN_BLOCKED",
          message: "Navigation left the allowed domains",
        },
      }),
    });

    expect(response.status).toBe(200);

    const run = await getRunDoc(t, runId);
    expect(run?.status).toBe("blocked_by_guardrail");
    expect(run?.errorCode).toBe("GUARDRAIL_VIOLATION");
    expect(run?.guardrailCode).toBe("DOMAIN_BLOCKED");
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

async function insertRun(
  t: TestInstance,
  overrides: Partial<Doc<"runs">> = {},
) {
  const now = Date.now();
  const packId = await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      orgId: "org_1",
      name: "Checkout pack",
      description: "Pack used for run progress tests",
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
      personaPackId: packId,
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

  const protoPersonaId = await t.run(async (ctx) =>
    ctx.db.insert("protoPersonas", {
      packId,
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
      personaPackId: packId,
      protoPersonaId,
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
      protoPersonaId,
      status: "queued",
      frustrationCount: 0,
      milestoneKeys: [],
      ...overrides,
    }),
  );
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
