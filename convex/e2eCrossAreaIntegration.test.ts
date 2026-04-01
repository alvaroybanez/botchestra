import { register as registerWorkpool } from "@convex-dev/workpool/test";
import { convexTest } from "convex-test";
import { ExecuteRunRequestSchema } from "@botchestra/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../packages/ai/src/index", () => ({
  generateWithModel: vi.fn(),
}));

import { generateWithModel } from "../packages/ai/src/index";
import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./analysisPipeline.ts": () => import("./analysisPipeline"),
  "./analysisPipelineModel.ts": () => import("./analysisPipelineModel"),
  "./costControls.ts": () => import("./costControls"),
  "./http.ts": () => import("./http"),
  "./observability.ts": () => import("./observability"),
  "./runProgress.ts": () => import("./runProgress"),
  "./runs.ts": () => import("./runs"),
  "./schema.ts": () => import("./schema"),
  "./settings.ts": () => import("./settings"),
  "./studies.ts": () => import("./studies"),
  "./studyLifecycleWorkflow.ts": () => import("./studyLifecycleWorkflow"),
  "./userManagement.ts": () => import("./userManagement"),
  "./waveDispatch.ts": () => import("./waveDispatch"),
  "./workflow.ts": () => import("./workflow"),
};

const CALLBACK_SECRET = "test-callback-secret";
const CALLBACK_BASE_URL = "https://tame-lark-825.eu-west-1.convex.site";
const BROWSER_EXECUTOR_URL = "https://botchestra-browser-executor.example.workers.dev";

const mockedGenerateWithModel = vi.mocked(generateWithModel);

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
  postTaskQuestions: ["Did you think you completed the task?"],
  maxSteps: 25,
  maxDurationSec: 420,
  environmentLabel: "staging",
  locale: "en-US",
  viewport: { width: 1440, height: 900 },
};

const researchIdentity = {
  subject: "researcher-subject",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  email: "researcher@example.com",
};

const createTest = () => {
  const t = convexTest(schema, modules);
  registerWorkpool(t, "browserPool");
  return t;
};

describe("e2e cross-area integration", () => {
  afterEach(() => {
    delete process.env.CALLBACK_SIGNING_SECRET;
    delete process.env.CONVEX_SITE_URL;
    delete process.env.BROWSER_EXECUTOR_URL;
    mockedGenerateWithModel.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("runs the full study pipeline, records persona-driven differences, and completes the study lifecycle", async () => {
    vi.useFakeTimers();
    process.env.CALLBACK_SIGNING_SECRET = CALLBACK_SECRET;
    process.env.CONVEX_SITE_URL = CALLBACK_BASE_URL;
    process.env.BROWSER_EXECUTOR_URL = BROWSER_EXECUTOR_URL;

    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const configId = await insertPublishedConfig(t);
    const createdStudy = await asResearcher.mutation(api.studies.createStudy, {
      study: {
        personaConfigId: configId,
        name: "Cross-area checkout study",
        description: "Exercises the full browser execution pipeline.",
        taskSpec: sampleTaskSpec,
        runBudget: 50,
        activeConcurrency: 2,
      },
    });

    for (let index = 0; index < 25; index += 1) {
      await seedAcceptedVariant(t, createdStudy._id, configId, {
        syntheticUserName: `Careful shopper ${index + 1}`,
        firstPersonBio: "I double-check every total before I continue.",
        tensionSeed: "Unexpected fees make me slow down.",
        axisValues: [{ key: "techSavviness", value: 0.1 }],
        behaviorRules: [
          "Pause to verify every total.",
          "Read helper copy before submitting.",
        ],
      });
      await seedAcceptedVariant(t, createdStudy._id, configId, {
        syntheticUserName: `Fast shopper ${index + 1}`,
        firstPersonBio: "I move quickly when the next step is obvious.",
        tensionSeed: "I get impatient when the path is unclear.",
        axisValues: [{ key: "techSavviness", value: 0.9 }],
        behaviorRules: [
          "Prefer the shortest path.",
          "Skip optional explanations when possible.",
        ],
      });
    }

    const preparedStudy = await t.mutation(
      internal.studyLifecycleWorkflow.prepareStudyForLaunch,
      {
        studyId: createdStudy._id,
        launchRequestedBy: researchIdentity.tokenIdentifier,
      },
    );

    expect(preparedStudy).toEqual({
      studyStatus: "queued",
      needsVariantGeneration: false,
    });

    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const request = ExecuteRunRequestSchema.parse(JSON.parse(String(init?.body)));
      const techSavviness = Number(request.personaVariant.axisValues.techSavviness ?? 0);
      const isFastPersona = techSavviness >= 0.5;
      const timestamp = isFastPersona ? 11_000 : 12_000;
      const stepCount = isFastPersona ? 4 : 7;
      const durationSec = isFastPersona ? 48 : 95;
      const frustrationCount = isFastPersona ? 0 : 2;
      const suffix = isFastPersona ? "fast" : "careful";

      await t.fetch("/api/run-progress", {
        method: "POST",
        headers: {
          authorization: `Bearer ${request.callbackToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          runId: request.runId,
          eventType: "heartbeat",
          payload: { timestamp },
        }),
      });

      await t.fetch("/api/run-progress", {
        method: "POST",
        headers: {
          authorization: `Bearer ${request.callbackToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          runId: request.runId,
          eventType: "milestone",
          payload: {
            stepIndex: 0,
            url: "https://example.com/shop/checkout",
            title: "Checkout",
            actionType: isFastPersona ? "click" : "type",
            rationaleShort: isFastPersona
              ? "Fast persona jumped directly to the primary CTA."
              : "Careful persona slowed down to review the form.",
            screenshotKey: `runs/${request.runId}/milestones/0_${suffix}.jpg`,
          },
        }),
      });

      await t.fetch("/api/run-progress", {
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
            stepCount,
            durationSec,
            frustrationCount,
            artifactManifestKey: `runs/${request.runId}/${suffix}-manifest.json`,
            selfReport: {
              perceivedSuccess: true,
              hardestPart: isFastPersona
                ? "Nothing felt difficult."
                : "Comparing shipping totals before I continued.",
              confidence: isFastPersona ? 0.97 : 0.66,
              answers: {
                "Did you think you completed the task?": true,
              },
            },
          },
        }),
      });

      return Response.json({
        ok: true,
        finalOutcome: "SUCCESS",
        stepCount,
        durationSec,
        frustrationCount,
        artifactManifestKey: `runs/${request.runId}/${suffix}-manifest.json`,
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const dispatchResult = await t.mutation(internal.waveDispatch.dispatchStudyWave, {
      studyId: createdStudy._id,
    });
    const runningStudy = await getStudyDoc(t, createdStudy._id);
    const dispatchedRuns = await listRunsDirect(t, createdStudy._id);

    expect(dispatchResult).toMatchObject({
      studyId: createdStudy._id,
      createdRunCount: 50,
      dispatchedRunCount: 2,
    });
    expect(runningStudy?.status).toBe("running");
    const initialDispatchedRuns = dispatchedRuns.filter(
      (run) => run.status === "dispatching",
    );
    expect(initialDispatchedRuns).toHaveLength(2);
    expect(dispatchedRuns.filter((run) => run.status === "queued")).toHaveLength(48);

    for (const run of initialDispatchedRuns) {
      await t.action(internal.waveDispatch.executeRun, { runId: run._id });
    }

    await t.run(async (ctx) => {
      const remainingRuns = await ctx.db
        .query("runs")
        .withIndex("by_studyId", (q) => q.eq("studyId", createdStudy._id))
        .collect();

      for (const run of remainingRuns) {
        if (["success", "hard_fail", "soft_fail", "gave_up", "timeout", "blocked_by_guardrail", "infra_error", "cancelled"].includes(run.status)) {
          continue;
        }

        await ctx.db.patch(run._id, {
          status: "success",
          startedAt: 1_000,
          endedAt: 2_000,
          durationSec: 60,
          stepCount: 5,
          finalOutcome: "SUCCESS",
          frustrationCount: 0,
        });
      }
    });

    const settledRuns = await asResearcher.query(api.runs.listRuns, {
      studyId: createdStudy._id,
    });
    const summary = await asResearcher.query(api.runs.getRunSummary, {
      studyId: createdStudy._id,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({
      totalRuns: 50,
      queuedCount: 0,
      runningCount: 0,
      terminalCount: 50,
      outcomeCounts: expect.objectContaining({
        success: 50,
      }),
    });

    const carefulRun = settledRuns.find(
      (run: {
        axisValues: Array<{ key: string; value: number }>;
        selfReport?: unknown;
      }) =>
        run.selfReport !== undefined &&
        run.axisValues.some(
          (axisValue: { key: string; value: number }) =>
            axisValue.key === "techSavviness" && axisValue.value === 0.1,
        ),
    );
    const fastRun = settledRuns.find(
      (run: {
        axisValues: Array<{ key: string; value: number }>;
        selfReport?: unknown;
      }) =>
        run.selfReport !== undefined &&
        run.axisValues.some(
          (axisValue: { key: string; value: number }) =>
            axisValue.key === "techSavviness" && axisValue.value === 0.9,
        ),
    );

    expect(carefulRun).toEqual(
      expect.objectContaining({
        status: "success",
        stepCount: 7,
        frustrationCount: 2,
        artifactManifestKey: expect.stringContaining("careful-manifest.json"),
        selfReport: expect.objectContaining({
          perceivedSuccess: true,
          confidence: 0.66,
        }),
      }),
    );
    expect(fastRun).toEqual(
      expect.objectContaining({
        status: "success",
        stepCount: 4,
        frustrationCount: 0,
        artifactManifestKey: expect.stringContaining("fast-manifest.json"),
        selfReport: expect.objectContaining({
          perceivedSuccess: true,
          confidence: 0.97,
        }),
      }),
    );
    expect(carefulRun?.stepCount).toBeGreaterThan(fastRun?.stepCount ?? 0);
    expect(carefulRun?.frustrationCount).toBeGreaterThan(
      fastRun?.frustrationCount ?? 0,
    );

    mockSummariesFromPrompt();
    const replayingStudy = await t.mutation(
      internal.studyLifecycleWorkflow.advanceStudyLifecycleAfterInitialCohort,
      { studyId: createdStudy._id },
    );
    const analyzingStudy = await t.mutation(
      internal.studyLifecycleWorkflow.completeStudyLifecycleAfterReplay,
      { studyId: createdStudy._id },
    );
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const completedStudy = await asResearcher.query(api.studies.getStudy, {
      studyId: createdStudy._id,
    });

    expect(replayingStudy.status).toBe("replaying");
    expect(analyzingStudy.status).toBe("analyzing");
    expect(completedStudy?.status).toBe("completed");
    expect(completedStudy?.completedAt).toBeTypeOf("number");
  });

  it("evaluates cost controls on heartbeat for the correct study and requests stop when the budget is exceeded", async () => {
    const t = createTest();
    await upsertSettings(t, {
      budgetLimits: { maxBrowserSecPerStudy: 1 },
    });

    const first = await insertRunFixture(t, {
      studyStatus: "running",
      runStatus: "running",
      startedAt: 0,
    });
    const second = await insertRunFixture(t, {
      studyStatus: "running",
      runStatus: "running",
      startedAt: 0,
    });

    const result = await t.mutation(internal.runProgress.recordRunHeartbeat, {
      runId: first.runId,
      timestamp: 2_000,
    });
    const firstRun = await getRunDoc(t, first.runId);
    const secondRun = await getRunDoc(t, second.runId);
    const firstStudy = await getStudyDoc(t, first.studyId);
    const secondStudy = await getStudyDoc(t, second.studyId);

    expect(result.shouldStop).toBe(true);
    expect(firstRun?.lastHeartbeatAt).toBe(2_000);
    expect(firstRun?.cancellationRequestedAt).toBeTypeOf("number");
    expect(firstStudy?.cancellationRequestedAt).toBeTypeOf("number");
    expect(secondRun?.cancellationRequestedAt).toBeUndefined();
    expect(secondStudy?.cancellationRequestedAt).toBeUndefined();
  });

  it("returns shouldStop when cancellation has already been requested on the run", async () => {
    const t = createTest();
    const fixture = await insertRunFixture(t, {
      studyStatus: "running",
      runStatus: "running",
      startedAt: 1_000,
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(fixture.runId, {
        cancellationRequestedAt: 1_500,
        cancellationReason: "User cancelled the run.",
      });
    });

    const result = await t.mutation(internal.runProgress.recordRunHeartbeat, {
      runId: fixture.runId,
      timestamp: 2_000,
    });
    const updatedRun = await getRunDoc(t, fixture.runId);

    expect(result.shouldStop).toBe(true);
    expect(updatedRun?.lastHeartbeatAt).toBe(2_000);
    expect(updatedRun?.status).toBe("running");
  });
});

type TestInstance = ReturnType<typeof createTest>;

async function insertPublishedConfig(t: TestInstance, orgId = "org_1") {
  const now = Date.now();
  return await t.run(async (ctx) =>
    ctx.db.insert("personaConfigs", {
      orgId,
      name: "Checkout config",
      description: "Config used for cross-area integration tests",
      context: "Checkout flows",
      sharedAxes: [],
      version: 1,
      status: "published",
      createdBy: orgId,
      updatedBy: orgId,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function seedAcceptedVariant(
  t: TestInstance,
  studyId: Id<"studies">,
  personaConfigId: Id<"personaConfigs">,
  options: {
    syntheticUserName: string;
    firstPersonBio: string;
    tensionSeed: string;
    behaviorRules: string[];
    axisValues: Array<{ key: string; value: number }>;
  },
) {
  const syntheticUserId = await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      configId: personaConfigId,
      name: options.syntheticUserName,
      summary: `${options.syntheticUserName} summary`,
      axes: [],
      sourceType: "manual",
      sourceRefs: [],
      evidenceSnippets: [],
    }),
  );

  return await t.run(async (ctx) =>
    ctx.db.insert("personaVariants", {
      studyId,
      personaConfigId,
      syntheticUserId,
      axisValues: options.axisValues,
      edgeScore: 0.5,
      tensionSeed: options.tensionSeed,
      firstPersonBio: options.firstPersonBio,
      behaviorRules: options.behaviorRules,
      coherenceScore: 0.92,
      distinctnessScore: 0.81,
      accepted: true,
    }),
  );
}

async function insertRunFixture(
  t: TestInstance,
  overrides: {
    studyStatus: Doc<"studies">["status"];
    runStatus: Doc<"runs">["status"];
    startedAt?: number;
  },
) {
  const configId = await insertPublishedConfig(t);
  const studyId = await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId: "org_1",
      personaConfigId: configId,
      name: "Heartbeat control study",
      description: "Used for heartbeat/cost-control verification.",
      taskSpec: sampleTaskSpec,
      runBudget: 50,
      activeConcurrency: 1,
      status: overrides.studyStatus,
      createdBy: "org_1",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );

  const syntheticUserId = await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      configId,
      name: "Heartbeat shopper",
      summary: "Used for heartbeat tests.",
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
      axisValues: [{ key: "techSavviness", value: 0.5 }],
      edgeScore: 0.5,
      tensionSeed: "I want to finish quickly.",
      firstPersonBio: "I want to finish quickly.",
      behaviorRules: ["Stay on task."],
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
      status: overrides.runStatus,
      startedAt: overrides.startedAt,
      frustrationCount: 0,
      milestoneKeys: [],
    }),
  );

  return { studyId, runId };
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

async function listRunsDirect(t: TestInstance, studyId: Id<"studies">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("runs")
      .withIndex("by_studyId", (q) => q.eq("studyId", studyId))
      .collect(),
  );
}

async function getRunDoc(
  t: TestInstance,
  runId: Id<"runs">,
): Promise<Doc<"runs"> | null> {
  return await t.run(async (ctx) => (await ctx.db.get(runId)) as Doc<"runs"> | null);
}

async function getStudyDoc(
  t: TestInstance,
  studyId: Id<"studies">,
): Promise<Doc<"studies"> | null> {
  return await t.run(async (ctx) => (await ctx.db.get(studyId)) as Doc<"studies"> | null);
}

function createAiResult(summary: Record<string, unknown>) {
  return {
    text: JSON.stringify(summary),
  } as unknown as Awaited<ReturnType<typeof generateWithModel>>;
}

function mockSummariesFromPrompt() {
  mockedGenerateWithModel.mockImplementation(async (_task, request) => {
    const prompt = typeof request.prompt === "string" ? request.prompt : "";
    const status = matchPromptField(prompt, "Run status") ?? "hard_fail";
    const errorCode = matchPromptField(prompt, "Error code");
    const finalUrl = matchPromptField(prompt, "Final URL") ?? "https://example.com";

    if (status === "success") {
      return createAiResult({
        summaryVersion: 1,
        sourceRunStatus: "success",
        outcomeClassification: "success",
        failureSummary: "The run completed successfully.",
        failurePoint: "No failure observed.",
        lastSuccessfulState: "The intended goal was completed.",
        blockingText: "No blocking text captured.",
        frustrationMarkers: [],
        selfReportedConfidence: null,
        representativeQuote: "The run completed.",
        includeInClustering: false,
      });
    }

    return createAiResult({
      summaryVersion: 1,
      sourceRunStatus: status,
      outcomeClassification: status === "gave_up" ? "abandoned" : "failure",
      failureSummary: `Observed ${status} at ${finalUrl}.`,
      failurePoint: finalUrl,
      lastSuccessfulState: "The preceding step completed.",
      blockingText:
        errorCode !== undefined && errorCode !== "none"
          ? errorCode
          : "No blocking text captured.",
      frustrationMarkers: status === "gave_up" ? ["gave up"] : [],
      selfReportedConfidence: null,
      representativeQuote: `Observed ${status} during analysis.`,
      includeInClustering: true,
    });
  });
}

function matchPromptField(prompt: string, label: string) {
  const matched = prompt.match(new RegExp(`${label}: (.+)`));
  return matched?.[1];
}
