import { beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";

vi.mock("../packages/ai/src/index", () => ({
  generateWithModel: vi.fn(),
}));

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import {
  decodeRunSummaryKey,
  encodeRunSummaryKey,
  runSummarySchema,
  type RunSummary,
} from "./analysis/runSummaries";
import { generateWithModel } from "../packages/ai/src/index";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./analysisPipeline.ts": () => import("./analysisPipeline"),
  "./analysisPipelineModel.ts": () => import("./analysisPipelineModel"),
  "./schema.ts": () => import("./schema"),
  "./studyLifecycleWorkflow.ts": () => import("./studyLifecycleWorkflow"),
  "./workflow.ts": () => import("./workflow"),
};

const createTest = () => convexTest(schema, modules);
const mockedGenerateWithModel = vi.mocked(generateWithModel);
const analysisPipelineApi = (internal as any).analysisPipeline;

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

const researchIdentity = {
  subject: "researcher-subject",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
};

describe("analysisPipeline.summarizeStudyRuns", () => {
  beforeEach(() => {
    mockedGenerateWithModel.mockReset();
  });

  it("produces structured summaries for eligible terminal runs only", async () => {
    const t = createTest();
    const studyId = await insertStudy(t);
    const successRunId = await insertTerminalRun(t, studyId, {
      status: "success",
      finalOutcome: "SUCCESS",
      finalUrl: "https://example.com/shop/confirmation",
      selfReport: {
        perceivedSuccess: true,
        confidence: 0.92,
        hardestPart: "Double-checking the shipping total.",
      },
    });
    const hardFailRunId = await insertTerminalRun(t, studyId, {
      status: "hard_fail",
      finalOutcome: "FAILED",
      errorCode: "CHECKOUT_BUTTON_MISSING",
      finalUrl: "https://example.com/shop/checkout",
      frustrationCount: 3,
      selfReport: {
        perceivedSuccess: false,
        confidence: 0.22,
        confusion: "I could not find the place to continue from checkout.",
      },
    });
    const gaveUpRunId = await insertTerminalRun(t, studyId, {
      status: "gave_up",
      finalOutcome: "ABANDONED",
      finalUrl: "https://example.com/shop/payment",
      frustrationCount: 5,
      selfReport: {
        perceivedSuccess: false,
        confidence: 0.11,
        suggestedChange: "Make the next step clearer before payment.",
      },
    });
    const infraErrorRunId = await insertTerminalRun(t, studyId, {
      status: "infra_error",
      finalOutcome: "FAILED",
      errorCode: "BROWSER_EXECUTOR_DOWN",
      finalUrl: "https://example.com/shop/checkout",
    });
    const cancelledRunId = await insertTerminalRun(t, studyId, {
      status: "cancelled",
      finalOutcome: "CANCELLED",
      finalUrl: "https://example.com/shop/cart",
    });

    mockedGenerateWithModel
      .mockImplementationOnce(async () =>
        createAiResult(
          makeSummary({
            outcomeClassification: "success",
            failureSummary: "The shopper completed checkout without friction.",
            failurePoint: "No failure observed; order confirmation rendered.",
            lastSuccessfulState: "Order confirmation page loaded.",
            blockingText: "No blocking text surfaced during the run.",
            frustrationMarkers: [],
            selfReportedConfidence: 0.92,
            representativeQuote: "Double-checking the shipping total.",
          }),
        ),
      )
      .mockImplementationOnce(async () =>
        createAiResult(
          makeSummary({
            outcomeClassification: "failure",
            failureSummary:
              "The run stalled on checkout because the primary continue control was missing.",
            failurePoint: "Checkout page after reviewing cart details.",
            lastSuccessfulState: "The cart review step completed successfully.",
            blockingText: "CHECKOUT_BUTTON_MISSING",
            frustrationMarkers: ["repeated hesitation", "checkout dead end"],
            selfReportedConfidence: 0.22,
            representativeQuote:
              "I could not find the place to continue from checkout.",
          }),
        ),
      )
      .mockImplementationOnce(async () =>
        createAiResult(
          makeSummary({
            outcomeClassification: "abandoned",
            failureSummary:
              "The shopper abandoned the payment step after repeated confusion.",
            failurePoint: "Payment page after multiple unsuccessful attempts to continue.",
            lastSuccessfulState: "Shipping details were already filled in.",
            blockingText: "The next step remained unclear on the payment page.",
            frustrationMarkers: ["repeated confusion", "gave up"],
            selfReportedConfidence: 0.11,
            representativeQuote:
              "Make the next step clearer before payment.",
          }),
        ),
      );

    const summaryResult = await t.action(analysisPipelineApi.summarizeStudyRuns, {
      studyId,
    });
    const runs = await listRunsForStudy(t, studyId);
    const runMap = new Map(runs.map((run) => [run._id, run]));

    expect(mockedGenerateWithModel).toHaveBeenCalledTimes(3);
    expect(summaryResult).toEqual({
      eligibleRunCount: 3,
      summarizedRunCount: 3,
      excludedRunCount: 2,
      skippedRunCount: 0,
    });

    const successSummary = parseSummary(runMap.get(successRunId)?.summaryKey);
    const hardFailSummary = parseSummary(runMap.get(hardFailRunId)?.summaryKey);
    const gaveUpSummary = parseSummary(runMap.get(gaveUpRunId)?.summaryKey);

    expect(successSummary.outcomeClassification).toBe("success");
    expect(successSummary.includeInClustering).toBe(true);
    expect(hardFailSummary).toEqual(
      expect.objectContaining({
        outcomeClassification: "failure",
        includeInClustering: true,
        failurePoint: "Checkout page after reviewing cart details.",
        lastSuccessfulState: "The cart review step completed successfully.",
        blockingText: "CHECKOUT_BUTTON_MISSING",
        representativeQuote:
          "I could not find the place to continue from checkout.",
      }),
    );
    expect(hardFailSummary.frustrationMarkers).toEqual(
      expect.arrayContaining(["repeated hesitation", "checkout dead end"]),
    );
    expect(gaveUpSummary.outcomeClassification).toBe("abandoned");
    expect(gaveUpSummary.frustrationMarkers).toContain("gave up");
    expect(runMap.get(infraErrorRunId)?.summaryKey).toBeUndefined();
    expect(runMap.get(cancelledRunId)?.summaryKey).toBeUndefined();
  });

  it("excludes infra_error and cancelled runs from clustering while keeping them in headline metrics", async () => {
    const t = createTest();
    const studyId = await insertStudy(t);
    const hardFailRepresentativeId = await insertTerminalRun(t, studyId, {
      status: "hard_fail",
      finalOutcome: "FAILED",
      errorCode: "CHECKOUT_BUTTON_MISSING",
      finalUrl: "https://example.com/shop/checkout",
    });
    await insertTerminalRun(t, studyId, {
      status: "hard_fail",
      finalOutcome: "FAILED",
      errorCode: "CHECKOUT_BUTTON_MISSING",
      finalUrl: "https://example.com/shop/checkout",
    });
    const infraRepresentativeId = await insertTerminalRun(t, studyId, {
      status: "infra_error",
      finalOutcome: "FAILED",
      errorCode: "BROWSER_EXECUTOR_DOWN",
      finalUrl: "https://example.com/shop/checkout",
    });
    await insertTerminalRun(t, studyId, {
      status: "infra_error",
      finalOutcome: "FAILED",
      errorCode: "BROWSER_EXECUTOR_DOWN",
      finalUrl: "https://example.com/shop/checkout",
    });
    await insertTerminalRun(t, studyId, {
      status: "cancelled",
      finalOutcome: "CANCELLED",
      finalUrl: "https://example.com/shop/cart",
    });
    await insertTerminalRun(t, studyId, {
      status: "success",
      finalOutcome: "SUCCESS",
      finalUrl: "https://example.com/shop/confirmation",
    });

    await insertReplayRun(t, studyId, hardFailRepresentativeId, {
      status: "hard_fail",
      finalOutcome: "FAILED",
      errorCode: "CHECKOUT_BUTTON_MISSING",
      finalUrl: "https://example.com/shop/checkout",
    });
    await insertReplayRun(t, studyId, hardFailRepresentativeId, {
      status: "success",
      finalOutcome: "SUCCESS",
      finalUrl: "https://example.com/shop/confirmation",
    });
    await insertReplayRun(t, studyId, infraRepresentativeId, {
      status: "infra_error",
      finalOutcome: "FAILED",
      errorCode: "BROWSER_EXECUTOR_DOWN",
      finalUrl: "https://example.com/shop/checkout",
    });
    await insertReplayRun(t, studyId, infraRepresentativeId, {
      status: "infra_error",
      finalOutcome: "FAILED",
      errorCode: "BROWSER_EXECUTOR_DOWN",
      finalUrl: "https://example.com/shop/checkout",
    });

    const report = await t.mutation(
      internal.studyLifecycleWorkflow.createStudyLifecycleReport,
      { studyId },
    );
    const clusters = await listIssueClusters(t, studyId);
    const representativeStatuses = await Promise.all(
      clusters.flatMap((cluster) =>
        cluster.representativeRunIds.map(async (runId) => {
          const run = await t.run(async (ctx) => ctx.db.get(runId));
          return run?.status;
        }),
      ),
    );

    expect(report.headlineMetrics.completionRate).toBeCloseTo(1 / 6, 5);
    expect(report.issueClusterIds).toHaveLength(1);
    expect(clusters).toHaveLength(1);
    expect(representativeStatuses).toEqual(["hard_fail", "hard_fail"]);
  });
});

describe("analysisPipeline clustering", () => {
  beforeEach(() => {
    mockedGenerateWithModel.mockReset();
  });

  it("materializes issue clusters with required fields, affected segments, and evidence keys", async () => {
    const t = createTest();
    const studyId = await insertStudy(t);
    const checkoutRunA = await insertTerminalRun(t, studyId, {
      status: "hard_fail",
      finalOutcome: "FAILED",
      errorCode: "CHECKOUT_BUTTON_MISSING",
      finalUrl: "https://example.com/shop/checkout",
      axisValues: [
        { key: "digital_confidence", value: -0.8 },
        { key: "risk_tolerance", value: 0.2 },
      ],
      milestoneKeys: ["runs/checkout-run-a.png"],
    });
    const checkoutRunB = await insertTerminalRun(t, studyId, {
      status: "hard_fail",
      finalOutcome: "FAILED",
      errorCode: "CHECKOUT_BUTTON_MISSING",
      finalUrl: "https://example.com/shop/checkout",
      axisValues: [
        { key: "digital_confidence", value: -0.3 },
        { key: "risk_tolerance", value: 0.6 },
      ],
      milestoneKeys: ["runs/checkout-run-b.png"],
    });
    const paymentRun = await insertTerminalRun(t, studyId, {
      status: "gave_up",
      finalOutcome: "ABANDONED",
      finalUrl: "https://example.com/shop/payment",
      axisValues: [{ key: "digital_confidence", value: 0.7 }],
      milestoneKeys: ["runs/payment-run.png"],
    });
    await insertTerminalRun(t, studyId, {
      status: "success",
      finalOutcome: "SUCCESS",
      finalUrl: "https://example.com/shop/confirmation",
      axisValues: [{ key: "digital_confidence", value: 0.1 }],
    });

    await attachSummaryToRun(
      t,
      checkoutRunA,
      makeSummary({
        sourceRunStatus: "hard_fail",
        outcomeClassification: "failure",
        failureSummary:
          "The checkout page hid the primary action and the shopper could not continue.",
        failurePoint: "Checkout page at /shop/checkout",
        lastSuccessfulState: "Cart review completed.",
        blockingText: "CHECKOUT_BUTTON_MISSING",
        frustrationMarkers: ["missing primary action"],
        representativeQuote: "I cannot see how to continue from checkout.",
      }),
    );
    await attachSummaryToRun(
      t,
      checkoutRunB,
      makeSummary({
        sourceRunStatus: "hard_fail",
        outcomeClassification: "failure",
        failureSummary:
          "The checkout page hid the primary action and the shopper could not continue.",
        failurePoint: "Checkout page at /shop/checkout",
        lastSuccessfulState: "Cart review completed.",
        blockingText: "CHECKOUT_BUTTON_MISSING",
        frustrationMarkers: ["missing primary action", "hesitation"],
        representativeQuote: "The next step vanished on checkout.",
      }),
    );
    await attachSummaryToRun(
      t,
      paymentRun,
      makeSummary({
        sourceRunStatus: "gave_up",
        outcomeClassification: "abandoned",
        failureSummary:
          "The shopper abandoned on payment after confusing inline validation.",
        failurePoint: "Payment page at /shop/payment",
        lastSuccessfulState: "Address details were entered.",
        blockingText: "Inline validation was vague.",
        frustrationMarkers: ["gave up", "validation confusion"],
        representativeQuote: "I gave up because the payment errors made no sense.",
      }),
    );

    await insertReplayRun(t, studyId, checkoutRunA, {
      status: "hard_fail",
      finalOutcome: "FAILED",
      errorCode: "CHECKOUT_BUTTON_MISSING",
      finalUrl: "https://example.com/shop/checkout",
    });
    await insertReplayRun(t, studyId, checkoutRunA, {
      status: "success",
      finalOutcome: "SUCCESS",
      finalUrl: "https://example.com/shop/confirmation",
    });
    await insertReplayRun(t, studyId, paymentRun, {
      status: "gave_up",
      finalOutcome: "ABANDONED",
      finalUrl: "https://example.com/shop/payment",
    });
    await insertReplayRun(t, studyId, paymentRun, {
      status: "success",
      finalOutcome: "SUCCESS",
      finalUrl: "https://example.com/shop/confirmation",
    });

    const report = await t.mutation(
      internal.studyLifecycleWorkflow.createStudyLifecycleReport,
      { studyId },
    );
    const clusters = await listIssueClusters(t, studyId);
    const checkoutCluster = clusters.find((cluster) =>
      cluster.representativeRunIds.includes(checkoutRunA),
    );
    const paymentCluster = clusters.find((cluster) =>
      cluster.representativeRunIds.includes(paymentRun),
    );

    expect(report.issueClusterIds).toHaveLength(2);
    expect(clusters).toHaveLength(2);
    expect(checkoutCluster).toBeDefined();
    expect(paymentCluster).toBeDefined();

    for (const cluster of clusters) {
      const requiredFields = [
        "title",
        "summary",
        "severity",
        "affectedRunCount",
        "affectedRunRate",
        "affectedProtoPersonaIds",
        "affectedAxisRanges",
        "representativeRunIds",
        "replayConfidence",
        "evidenceKeys",
        "recommendation",
        "confidenceNote",
        "score",
      ] as const;

      for (const field of requiredFields) {
        expect(cluster).toHaveProperty(field);
        expect(cluster[field]).not.toBeNull();
        expect(cluster[field]).not.toBeUndefined();
      }

      expect(cluster.title).not.toHaveLength(0);
      expect(cluster.summary).not.toHaveLength(0);
      expect(cluster.recommendation).not.toHaveLength(0);
      expect(cluster.confidenceNote).not.toHaveLength(0);
      expect(cluster.affectedRunCount).toBeGreaterThan(0);
      expect(cluster.affectedRunRate).toBeGreaterThan(0);
      expect(cluster.representativeRunIds.length).toBeGreaterThan(0);
      expect(cluster.score).toBeTypeOf("number");
      expect(Number.isFinite(cluster.score)).toBe(true);
      expect(cluster.replayConfidence).toBeGreaterThanOrEqual(0);
      expect(cluster.replayConfidence).toBeLessThanOrEqual(1);
      expect(cluster.evidenceKeys.every((key) => typeof key === "string")).toBe(true);
    }

    expect(checkoutCluster).toMatchObject({
      severity: "blocker",
      affectedRunCount: 2,
      affectedRunRate: 0.5,
      affectedProtoPersonaIds: expect.any(Array),
      representativeRunIds: expect.arrayContaining([checkoutRunA, checkoutRunB]),
      replayConfidence: 0.5,
      evidenceKeys: expect.arrayContaining([
        "runs/checkout-run-a.png",
        "runs/checkout-run-b.png",
        `replays/${checkoutRunA}/CHECKOUT_BUTTON_MISSING.png`,
      ]),
    });
    expect(checkoutCluster!.affectedProtoPersonaIds).toHaveLength(2);
    expect(checkoutCluster!.affectedAxisRanges).toEqual(
      expect.arrayContaining([
        { key: "digital_confidence", min: -0.8, max: -0.3 },
        { key: "risk_tolerance", min: 0.2, max: 0.6 },
      ]),
    );
    expect(paymentCluster).toMatchObject({
      severity: "minor",
      affectedRunCount: 1,
      affectedRunRate: 0.25,
      replayConfidence: 0.5,
      evidenceKeys: expect.arrayContaining(["runs/payment-run.png"]),
    });
  });

  it("keeps clusters without replay coverage and records zero replay confidence", async () => {
    const t = createTest();
    const studyId = await insertStudy(t);
    const replayedFailureRun = await insertTerminalRun(t, studyId, {
      status: "soft_fail",
      finalOutcome: "FAILED",
      errorCode: "CHECKOUT_COPY_CONFUSION",
      finalUrl: "https://example.com/shop/checkout",
    });
    const unreplayedFailureRun = await insertTerminalRun(t, studyId, {
      status: "soft_fail",
      finalOutcome: "FAILED",
      errorCode: "PAYMENT_LABEL_CONFUSION",
      finalUrl: "https://example.com/shop/payment",
    });

    await attachSummaryToRun(
      t,
      replayedFailureRun,
      makeSummary({
        sourceRunStatus: "soft_fail",
        outcomeClassification: "failure",
        failureSummary: "Checkout copy confused the shopper.",
        failurePoint: "Checkout page at /shop/checkout",
        lastSuccessfulState: "Cart review completed.",
        blockingText: "CHECKOUT_COPY_CONFUSION",
        representativeQuote: "I wasn't sure what the checkout button meant.",
      }),
    );
    await attachSummaryToRun(
      t,
      unreplayedFailureRun,
      makeSummary({
        sourceRunStatus: "soft_fail",
        outcomeClassification: "failure",
        failureSummary: "Payment labels confused the shopper.",
        failurePoint: "Payment page at /shop/payment",
        lastSuccessfulState: "Checkout form completed.",
        blockingText: "PAYMENT_LABEL_CONFUSION",
        representativeQuote: "The payment labels didn't match what I expected.",
      }),
    );

    await insertReplayRun(t, studyId, replayedFailureRun, {
      status: "soft_fail",
      finalOutcome: "FAILED",
      errorCode: "CHECKOUT_COPY_CONFUSION",
      finalUrl: "https://example.com/shop/checkout",
    });
    await insertReplayRun(t, studyId, replayedFailureRun, {
      status: "success",
      finalOutcome: "SUCCESS",
      finalUrl: "https://example.com/shop/confirmation",
    });

    const report = await t.mutation(
      internal.studyLifecycleWorkflow.createStudyLifecycleReport,
      { studyId },
    );
    const clusters = await listIssueClusters(t, studyId);
    const replayedCluster = clusters.find((cluster) =>
      cluster.representativeRunIds.includes(replayedFailureRun),
    );
    const unreplayedCluster = clusters.find((cluster) =>
      cluster.representativeRunIds.includes(unreplayedFailureRun),
    );

    expect(report.issueClusterIds).toHaveLength(2);
    expect(clusters).toHaveLength(2);
    expect(replayedCluster?.replayConfidence).toBe(0.5);
    expect(unreplayedCluster?.replayConfidence).toBe(0);
    expect(unreplayedCluster?.representativeRunIds).toContain(unreplayedFailureRun);
  });

  it("orders study report issueClusterIds by descending score with a stable tie-break", async () => {
    const t = createTest();
    const studyId = await insertStudy(t);
    const firstClusterRun = await insertTerminalRun(t, studyId, {
      status: "soft_fail",
      finalOutcome: "FAILED",
      errorCode: "ADDRESS_COPY_CONFUSION",
      finalUrl: "https://example.com/shop/address",
    });
    const secondClusterRun = await insertTerminalRun(t, studyId, {
      status: "soft_fail",
      finalOutcome: "FAILED",
      errorCode: "PAYMENT_COPY_CONFUSION",
      finalUrl: "https://example.com/shop/payment",
    });

    await attachSummaryToRun(
      t,
      firstClusterRun,
      makeSummary({
        sourceRunStatus: "soft_fail",
        outcomeClassification: "failure",
        failureSummary: "Address copy caused the user to stop.",
        failurePoint: "Address page at /shop/address",
        lastSuccessfulState: "Cart review completed.",
        blockingText: "ADDRESS_COPY_CONFUSION",
        representativeQuote: "The address instructions were unclear.",
      }),
    );
    await attachSummaryToRun(
      t,
      secondClusterRun,
      makeSummary({
        sourceRunStatus: "soft_fail",
        outcomeClassification: "failure",
        failureSummary: "Payment copy caused the user to stop.",
        failurePoint: "Payment page at /shop/payment",
        lastSuccessfulState: "Address form completed.",
        blockingText: "PAYMENT_COPY_CONFUSION",
        representativeQuote: "The payment instructions were unclear.",
      }),
    );

    await insertReplayRun(t, studyId, firstClusterRun, {
      status: "soft_fail",
      finalOutcome: "FAILED",
      errorCode: "ADDRESS_COPY_CONFUSION",
      finalUrl: "https://example.com/shop/address",
    });
    await insertReplayRun(t, studyId, firstClusterRun, {
      status: "success",
      finalOutcome: "SUCCESS",
      finalUrl: "https://example.com/shop/confirmation",
    });
    await insertReplayRun(t, studyId, secondClusterRun, {
      status: "soft_fail",
      finalOutcome: "FAILED",
      errorCode: "PAYMENT_COPY_CONFUSION",
      finalUrl: "https://example.com/shop/payment",
    });
    await insertReplayRun(t, studyId, secondClusterRun, {
      status: "success",
      finalOutcome: "SUCCESS",
      finalUrl: "https://example.com/shop/confirmation",
    });

    const report = await t.mutation(
      internal.studyLifecycleWorkflow.createStudyLifecycleReport,
      { studyId },
    );
    const clusters = await listIssueClusters(t, studyId);
    const clustersById = new Map(clusters.map((cluster) => [cluster._id, cluster]));
    const orderedTitles = report.issueClusterIds.map(
      (clusterId) => clustersById.get(clusterId)?.title,
    );

    expect(report.issueClusterIds).toHaveLength(2);
    expect(clustersById.get(report.issueClusterIds[0]!)?.score).toBeCloseTo(
      clustersById.get(report.issueClusterIds[1]!)?.score ?? -1,
      6,
    );
    expect(
      clustersById.get(report.issueClusterIds[0]!)?.score,
    ).toBeGreaterThanOrEqual(clustersById.get(report.issueClusterIds[1]!)?.score ?? -1);
    expect(orderedTitles).toEqual([
      clusters.find((cluster) => cluster.representativeRunIds.includes(firstClusterRun))
        ?.title,
      clusters.find((cluster) => cluster.representativeRunIds.includes(secondClusterRun))
        ?.title,
    ]);
  });
});

type TestInstance = ReturnType<typeof createTest>;

async function insertStudy(t: TestInstance) {
  const now = Date.now();
  const packId = await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      orgId: researchIdentity.tokenIdentifier,
      name: "Checkout pack",
      description: "Pack used for analysis pipeline tests",
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
      name: "Checkout analysis study",
      taskSpec: sampleTaskSpec,
      runBudget: 6,
      activeConcurrency: 2,
      status: "analyzing",
      createdBy: researchIdentity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function insertTerminalRun(
  t: TestInstance,
  studyId: Id<"studies">,
  options: {
    status: Doc<"runs">["status"];
    finalOutcome: string;
    errorCode?: string;
    finalUrl?: string;
    frustrationCount?: number;
    selfReport?: Doc<"runs">["selfReport"];
    axisValues?: Doc<"personaVariants">["axisValues"];
    milestoneKeys?: string[];
  },
) {
  const study = await t.run(async (ctx) => ctx.db.get(studyId));

  if (study === null) {
    throw new Error(`Study ${studyId} not found.`);
  }

  const protoPersonaId = await t.run(async (ctx) =>
    ctx.db.insert("protoPersonas", {
      packId: study.personaPackId,
      name: `Proto ${Math.random()}`,
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
      protoPersonaId,
      axisValues: options.axisValues ?? [],
      edgeScore: 0.5,
      tensionSeed: "Analysis test tension seed",
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

  const now = Date.now();
  return await t.run(async (ctx) =>
    ctx.db.insert("runs", {
      studyId,
      personaVariantId,
      protoPersonaId,
      status: options.status,
      startedAt: now - 5_000,
      endedAt: now,
      durationSec: 18,
      stepCount: 7,
      finalOutcome: options.finalOutcome,
      finalUrl: options.finalUrl,
      frustrationCount: options.frustrationCount ?? (options.status === "success" ? 0 : 2),
      milestoneKeys:
        options.milestoneKeys ??
        (options.errorCode !== undefined
          ? [`runs/${studyId}/${options.errorCode}.png`]
          : []),
      ...(options.errorCode !== undefined ? { errorCode: options.errorCode } : {}),
      ...(options.selfReport !== undefined ? { selfReport: options.selfReport } : {}),
    }),
  );
}

async function insertReplayRun(
  t: TestInstance,
  studyId: Id<"studies">,
  replayOfRunId: Id<"runs">,
  options: {
    status: Doc<"runs">["status"];
    finalOutcome: string;
    errorCode?: string;
    finalUrl?: string;
  },
) {
  const representativeRun = await t.run(async (ctx) => ctx.db.get(replayOfRunId));

  if (representativeRun === null) {
    throw new Error(`Run ${replayOfRunId} not found.`);
  }

  return await t.run(async (ctx) =>
    ctx.db.insert("runs", {
      studyId,
      personaVariantId: representativeRun.personaVariantId,
      protoPersonaId: representativeRun.protoPersonaId,
      status: options.status,
      replayOfRunId,
      startedAt: Date.now() - 5_000,
      endedAt: Date.now(),
      durationSec: 12,
      stepCount: 5,
      finalOutcome: options.finalOutcome,
      finalUrl: options.finalUrl,
      frustrationCount: options.status === "success" ? 0 : 2,
      milestoneKeys:
        options.errorCode !== undefined
          ? [`replays/${replayOfRunId}/${options.errorCode}.png`]
          : [],
      ...(options.errorCode !== undefined ? { errorCode: options.errorCode } : {}),
    }),
  );
}

async function listRunsForStudy(t: TestInstance, studyId: Id<"studies">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("runs")
      .withIndex("by_studyId", (query) => query.eq("studyId", studyId))
      .collect(),
  );
}

async function listIssueClusters(t: TestInstance, studyId: Id<"studies">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("issueClusters")
      .withIndex("by_studyId", (query) => query.eq("studyId", studyId))
      .collect(),
  );
}

function makeSummary(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    summaryVersion: 1,
    sourceRunStatus: "hard_fail",
    outcomeClassification: "failure",
    failureSummary: "The run did not reach the intended goal.",
    failurePoint: "Checkout flow",
    lastSuccessfulState: "Cart review",
    blockingText: "No blocking text captured.",
    frustrationMarkers: [],
    selfReportedConfidence: null,
    representativeQuote: "No direct quote captured.",
    includeInClustering: true,
    ...overrides,
  };
}

function createAiResult(summary: RunSummary) {
  return {
    text: JSON.stringify(summary),
  } as unknown as Awaited<ReturnType<typeof generateWithModel>>;
}

function parseSummary(summaryKey: string | undefined) {
  const summary = decodeRunSummaryKey(summaryKey);
  return runSummarySchema.parse(summary);
}

async function attachSummaryToRun(
  t: TestInstance,
  runId: Id<"runs">,
  summary: RunSummary,
) {
  await t.run(async (ctx) =>
    ctx.db.patch(runId, {
      summaryKey: encodeRunSummaryKey(summary),
    }),
  );
}
