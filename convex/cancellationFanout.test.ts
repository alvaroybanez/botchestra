import { convexTest } from "convex-test";
import { beforeEach, describe, expect, it } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./auditEvents.ts": () => import("./auditEvents"),
  "./auth.ts": () => import("./auth"),
  "./costControls.ts": () => import("./costControls"),
  "./http.ts": () => import("./http"),
  "./runProgress.ts": () => import("./runProgress"),
  "./runs.ts": () => import("./runs"),
  "./schema.ts": () => import("./schema"),
  "./studies.ts": () => import("./studies"),
};

const CALLBACK_SECRET = "test-callback-secret";

const researchIdentity = {
  subject: "researcher-subject",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
};

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

const createTest = () => convexTest(schema, modules);

beforeEach(() => {
  process.env.CALLBACK_SIGNING_SECRET = CALLBACK_SECRET;
});

describe("studies.cancelStudy", () => {
  it("cancels queued runs immediately and records an audit event", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "running" });
    const runningRunId = await insertRun(t, studyId, { status: "running", startedAt: 1_000 });
    const queuedRunId = await insertRun(t, studyId, { status: "queued" });

    const cancelledStudy = await asResearcher.mutation(api.studies.cancelStudy, {
      studyId,
      reason: "Researcher stopped the study after spotting a blocker.",
    });

    const queuedRun = await getRunDoc(t, queuedRunId);
    const runningRun = await getRunDoc(t, runningRunId);
    const auditEvents = await listAuditEvents(t, studyId);

    expect(cancelledStudy.status).toBe("running");
    expect(queuedRun?.status).toBe("cancelled");
    expect(queuedRun?.endedAt).toBeTypeOf("number");
    expect(runningRun?.status).toBe("running");
    expect(
      (runningRun as Doc<"runs"> & { cancellationRequestedAt?: number })?.cancellationRequestedAt,
    ).toBeTypeOf("number");
    expect(auditEvents).toEqual([
      expect.objectContaining({
        actorId: researchIdentity.tokenIdentifier,
        eventType: "study.cancelled",
        reason: "Researcher stopped the study after spotting a blocker.",
        studyId,
      }),
    ]);
  });

  it("returns shouldStop=true in the next heartbeat ack for cancelled running runs", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "running" });
    const runId = await insertRun(t, studyId, { status: "running", startedAt: 1_000 });
    const callbackToken = await createCallbackToken(String(runId), CALLBACK_SECRET);

    await asResearcher.mutation(api.studies.cancelStudy, {
      studyId,
      reason: "Cancel for safety review.",
    });

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
    await expect(response.json()).resolves.toEqual({
      ok: true,
      shouldStop: true,
    });
  });

  it("transitions the study to cancelled after the fan-out finishes", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "running" });
    const runId = await insertRun(t, studyId, { status: "running", startedAt: 1_000 });
    await insertRun(t, studyId, { status: "queued" });

    await asResearcher.mutation(api.studies.cancelStudy, {
      studyId,
      reason: "Stop after enough evidence was gathered.",
    });

    await t.mutation(internal.runs.settleRunFromCallback, {
      runId,
      nextStatus: "success",
      patch: {
        endedAt: 6_000,
        durationSec: 5,
        stepCount: 8,
        finalOutcome: "SUCCESS",
        frustrationCount: 1,
      },
    });

    const study = await getStudyDoc(t, studyId);

    expect(study?.status).toBe("cancelled");
    expect(study?.cancellationReason).toBe(
      "Stop after enough evidence was gathered.",
    );
  });

  it("rejects cancellation on terminal studies", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);

    for (const status of ["completed", "failed", "cancelled"] as const) {
      const studyId = await insertStudy(t, { status });

      await expect(
        asResearcher.mutation(api.studies.cancelStudy, {
          studyId,
          reason: "This should fail.",
        }),
      ).rejects.toThrow(/cannot cancel/i);
    }
  });

  it("cancels persona_review studies without fan-out", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "persona_review" });

    const cancelledStudy = await asResearcher.mutation(api.studies.cancelStudy, {
      studyId,
      reason: "Reviewer rejected the persona set.",
    });

    const runs = await listRuns(t, studyId);

    expect(cancelledStudy.status).toBe("cancelled");
    expect(cancelledStudy.cancellationReason).toBe(
      "Reviewer rejected the persona set.",
    );
    expect(runs).toHaveLength(0);
  });

  it("cancels queued replay runs and transitions replaying studies to cancelled", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "replaying" });
    const originalRunId = await insertRun(t, studyId, {
      status: "hard_fail",
      startedAt: 1_000,
      endedAt: 2_000,
      durationSec: 1,
      finalOutcome: "FAILED",
      errorCode: "PRIMARY_FAILURE",
    });
    const firstReplayRunId = await insertRun(t, studyId, {
      status: "queued",
      replayOfRunId: originalRunId,
    });
    const secondReplayRunId = await insertRun(t, studyId, {
      status: "queued",
      replayOfRunId: originalRunId,
    });

    const cancelledStudy = await asResearcher.mutation(api.studies.cancelStudy, {
      studyId,
      reason: "Replay verification no longer needed.",
    });

    const replayRuns = await Promise.all([
      getRunDoc(t, firstReplayRunId),
      getRunDoc(t, secondReplayRunId),
    ]);

    expect(cancelledStudy.status).toBe("cancelled");
    expect(replayRuns.map((run) => run?.status)).toEqual(["cancelled", "cancelled"]);
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

type TestInstance = ReturnType<typeof createTest>;

async function insertStudy(
  t: TestInstance,
  overrides: {
    status: StudyStatus;
  },
) {
  const now = Date.now();
  const packId = await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      orgId: researchIdentity.tokenIdentifier,
      name: "Checkout pack",
      description: "Pack used for cancellation tests",
      context: "Checkout flows",
      sharedAxes: [],
      version: 1,
      status: "published",
      createdBy: researchIdentity.tokenIdentifier,
      updatedBy: researchIdentity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    }),
  );

  return await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId: researchIdentity.tokenIdentifier,
      personaPackId: packId,
      name: "Checkout cancellation study",
      taskSpec: sampleTaskSpec,
      runBudget: 3,
      activeConcurrency: 2,
      status: overrides.status,
      createdBy: researchIdentity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function insertRun(
  t: TestInstance,
  studyId: Id<"studies">,
  overrides: Partial<Doc<"runs">> = {},
) {
  const study = await getStudyDoc(t, studyId);

  if (study === null) {
    throw new Error(`Study ${studyId} not found.`);
  }

  const syntheticUserId = await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      packId: study.personaPackId,
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
      personaPackId: study.personaPackId,
      syntheticUserId,
      axisValues: [],
      edgeScore: 0.5,
      tensionSeed: "Moves quickly through checkout",
      firstPersonBio:
        "A decisive shopper who expects a smooth purchase flow with clear totals, stable payment affordances, and immediate feedback at each step of checkout.",
      behaviorRules: [
        "Moves quickly when the path is obvious.",
        "Pauses on unclear payment states.",
        "Looks for reassurance before submitting.",
        "Trusts familiar storefront patterns.",
        "Backtracks if totals feel surprising.",
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
      status: "queued",
      frustrationCount: 0,
      milestoneKeys: [],
      ...overrides,
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

async function listRuns(t: TestInstance, studyId: Id<"studies">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("runs")
      .withIndex("by_studyId", (query) => query.eq("studyId", studyId))
      .collect(),
  );
}

async function listAuditEvents(t: TestInstance, studyId: Id<"studies">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("auditEvents")
      .withIndex("by_studyId_and_createdAt", (query) => query.eq("studyId", studyId))
      .collect(),
  );
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
