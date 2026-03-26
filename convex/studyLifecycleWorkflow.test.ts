import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkflowId } from "@convex-dev/workflow";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { workflow } from "./workflow";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./runProgress.ts": () => import("./runProgress"),
  "./runs.ts": () => import("./runs"),
  "./schema.ts": () => import("./schema"),
  "./studies.ts": () => import("./studies"),
  "./studyLifecycleWorkflow.ts": () => import("./studyLifecycleWorkflow"),
  "./waveDispatch.ts": () => import("./waveDispatch"),
  "./workflow.ts": () => import("./workflow"),
};

const createTest = () => {
  return convexTest(schema, modules);
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

const researchIdentity = {
  subject: "researcher-subject",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
};

describe("studyLifecycleWorkflow", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("launches the workflow from launchStudy while leaving the study queued", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "ready", runBudget: 3 });
    await seedAcceptedVariants(t, studyId, 3);
    const workflowStartSpy = vi
      .spyOn(workflow, "start")
      .mockResolvedValue("workflow_1" as never);

    const launchedStudy = await asResearcher.mutation(api.studies.launchStudy, {
      studyId,
    });
    const preCompletionReport = await asResearcher.query(
      api.studyLifecycleWorkflow.getStudyReport,
      { studyId },
    );

    expect(workflowStartSpy).toHaveBeenCalledTimes(1);
    expect(launchedStudy.status).toBe("queued");
    expect(preCompletionReport).toBeNull();
  });

  it("prepares draft studies for launch by moving them into persona review until variants are generated", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, { status: "draft", runBudget: 3 });

    const preparedStudy = await t.mutation(
      internal.studyLifecycleWorkflow.prepareStudyForLaunch,
      {
        studyId,
        launchRequestedBy: researchIdentity.tokenIdentifier,
      },
    );
    const persistedStudy = await t.run(async (ctx) => ctx.db.get(studyId));

    expect(preparedStudy).toEqual({
      studyStatus: "persona_review",
      needsVariantGeneration: true,
    });
    expect(persistedStudy?.status).toBe("persona_review");
    expect(persistedStudy?.launchRequestedBy).toBe(
      researchIdentity.tokenIdentifier,
    );
    expect(persistedStudy?.launchedAt).toBeUndefined();
  });

  it("finalizes prepared launches by advancing persona review studies to queued", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, {
      status: "persona_review",
      runBudget: 3,
    });
    await seedAcceptedVariants(t, studyId, 3);

    const finalizedStudy = await t.mutation(
      internal.studyLifecycleWorkflow.finalizePreparedStudyLaunch,
      {
        studyId,
        launchRequestedBy: researchIdentity.tokenIdentifier,
      },
    );
    const persistedStudy = await t.run(async (ctx) => ctx.db.get(studyId));

    expect(finalizedStudy).toEqual({
      studyStatus: "queued",
      needsVariantGeneration: false,
    });
    expect(persistedStudy?.status).toBe("queued");
    expect(persistedStudy?.launchRequestedBy).toBe(
      researchIdentity.tokenIdentifier,
    );
    expect(persistedStudy?.launchedAt).toBeTypeOf("number");
  });

  it("completes replay verification and exposes the report", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "replaying", runBudget: 3 });
    await seedRunCluster(t, studyId, {
      count: 2,
      status: "hard_fail",
      errorCode: "CHECKOUT_BUTTON_MISSING",
      finalUrl: "https://example.com/shop/checkout",
    });
    await seedRunCluster(t, studyId, {
      count: 1,
      status: "success",
      finalOutcome: "SUCCESS",
      finalUrl: "https://example.com/shop/confirmation",
    });
    await t.mutation(internal.studyLifecycleWorkflow.queueReplayRunsForStudy, {
      studyId,
    });
    const replayRuns = await listReplayRuns(t, studyId);

    expect(replayRuns).toHaveLength(2);

    await settleReplayRun(t, replayRuns[0]!._id, {
      status: "hard_fail",
      errorCode: "CHECKOUT_BUTTON_MISSING",
      finalUrl: "https://example.com/shop/checkout",
    });
    await settleReplayRun(t, replayRuns[1]!._id, {
      status: "success",
      finalOutcome: "SUCCESS",
      finalUrl: "https://example.com/shop/confirmation",
    });
    await t.mutation(internal.studyLifecycleWorkflow.completeStudyLifecycleAfterReplay, {
      studyId,
    });

    const completedStudy = await asResearcher.query(api.studies.getStudy, {
      studyId,
    });
    const report = await asResearcher.query(api.studyLifecycleWorkflow.getStudyReport, {
      studyId,
    });
    const promotedClusters = await listIssueClusters(t, studyId);

    expect(completedStudy?.status).toBe("completed");
    expect(completedStudy?.completedAt).toBeTypeOf("number");
    expect(report?.studyId).toBe(studyId);
    expect(report?.issueClusterIds).toHaveLength(1);
    expect(promotedClusters[0]?.replayConfidence).toBe(0.5);
    expect(report?.headlineMetrics.completionRate).toBeCloseTo(1 / 3, 5);
    expect(report?.headlineMetrics.abandonmentRate).toBe(0);
    expect(report?.limitations).toEqual(
      expect.arrayContaining([
        "Findings are synthetic and directional.",
        "Agents may miss or invent behavior relative to humans.",
        "Human follow-up is recommended for high-stakes decisions.",
      ]),
    );
  });

  it("marks a replaying study as failed when every settled run is an infra error", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "replaying", runBudget: 3 });

    await seedRunCluster(t, studyId, {
      count: 3,
      status: "infra_error",
      errorCode: "BROWSER_EXECUTOR_DOWN",
      finalUrl: "https://example.com/shop/checkout",
    });

    await t.mutation(internal.studyLifecycleWorkflow.completeStudyLifecycleAfterReplay, {
      studyId,
    });

    const failedStudy = await asResearcher.query(api.studies.getStudy, {
      studyId,
    });
    const report = await asResearcher.query(api.studyLifecycleWorkflow.getStudyReport, {
      studyId,
    });

    expect(failedStudy?.status).toBe("failed");
    expect(failedStudy?.completedAt).toBeUndefined();
    expect(report).toBeNull();
  });

  it("marks the study as failed when the workflow completion result fails", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, {
      status: "running",
      runBudget: 2,
      activeConcurrency: 2,
    });

    await t.mutation(internal.studyLifecycleWorkflow.handleStudyLifecycleComplete, {
      workflowId: "workflow_1" as WorkflowId,
      context: { studyId },
      result: {
        kind: "failed",
        error: "Browser executor unreachable",
      },
    });

    const failedStudy = await t.run(async (ctx) => ctx.db.get(studyId));
    const report = await t.run(async (ctx) => {
      for await (const studyReport of ctx.db.query("studyReports")) {
        if (studyReport.studyId === studyId) {
          return studyReport;
        }
      }

      return null;
    });

    expect(failedStudy?.status).toBe("failed");
    expect(failedStudy?.completedAt).toBeUndefined();
    expect(report).toBeNull();
  });

  it("identifies replay candidates from repeated failures and single blockers", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, { status: "running", runBudget: 5 });

    await seedRunCluster(t, studyId, {
      count: 3,
      status: "gave_up",
      errorCode: "CHECKOUT_COPY_CONFUSING",
      finalUrl: "https://example.com/shop/checkout",
    });
    await seedRunCluster(t, studyId, {
      count: 1,
      status: "soft_fail",
      errorCode: "SINGLE_NON_BLOCKER",
      finalUrl: "https://example.com/shop/cart",
    });
    await seedRunCluster(t, studyId, {
      count: 1,
      status: "hard_fail",
      errorCode: "PAYMENT_BLOCKER",
      finalUrl: "https://example.com/shop/payment",
    });

    const candidates: Array<{
      affectedRunCount: number;
      severity: string;
      signature: string;
    }> = await t.query(internal.studyLifecycleWorkflow.getReplayCandidates, {
      studyId,
    });

    expect(candidates).toHaveLength(2);
    expect(
      candidates.map((candidate) => ({
        affectedRunCount: candidate.affectedRunCount,
        severity: candidate.severity,
        signature: candidate.signature,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          affectedRunCount: 3,
          severity: "minor",
          signature: "gave_up|CHECKOUT_COPY_CONFUSING|https://example.com/shop/checkout",
        },
        {
          affectedRunCount: 1,
          severity: "blocker",
          signature: "hard_fail|PAYMENT_BLOCKER|https://example.com/shop/payment",
        },
      ]),
    );
  });

  it("dispatches exactly 2 replay runs per candidate", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, {
      status: "replaying",
      runBudget: 4,
      activeConcurrency: 4,
    });

    await seedRunCluster(t, studyId, {
      count: 2,
      status: "hard_fail",
      errorCode: "CHECKOUT_BUTTON_MISSING",
      finalUrl: "https://example.com/shop/checkout",
    });
    await seedRunCluster(t, studyId, {
      count: 1,
      status: "blocked_by_guardrail",
      errorCode: "GUARDRAIL_STOP",
      finalUrl: "https://example.com/shop/payment",
    });

    await t.mutation(internal.studyLifecycleWorkflow.queueReplayRunsForStudy, {
      studyId,
    });

    const replayRuns = await listReplayRuns(t, studyId);
    const replayRunsByRepresentative = replayRuns.reduce<Record<string, number>>(
      (accumulator, run) => {
        const key = String(run.replayOfRunId);
        accumulator[key] = (accumulator[key] ?? 0) + 1;
        return accumulator;
      },
      {},
    );

    expect(replayRuns).toHaveLength(4);
    expect(Object.values(replayRunsByRepresentative)).toEqual([2, 2]);
    expect(
      replayRuns.every((run) => run.replayOfRunId !== undefined),
    ).toBe(true);
  });

  it("computes replay confidence as reproduced failures over replay attempts", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, { status: "replaying", runBudget: 6 });

    const zeroConfidenceRepresentative = await seedRunCluster(t, studyId, {
      count: 2,
      status: "hard_fail",
      errorCode: "ZERO_CONFIDENCE",
      finalUrl: "https://example.com/shop/checkout",
    });
    const partialConfidenceRepresentative = await seedRunCluster(t, studyId, {
      count: 2,
      status: "hard_fail",
      errorCode: "PARTIAL_CONFIDENCE",
      finalUrl: "https://example.com/shop/payment",
    });
    const fullConfidenceRepresentative = await seedRunCluster(t, studyId, {
      count: 2,
      status: "hard_fail",
      errorCode: "FULL_CONFIDENCE",
      finalUrl: "https://example.com/shop/review",
    });

    await seedReplayRunsForRepresentative(t, studyId, zeroConfidenceRepresentative[0]!._id, [
      {
        status: "success",
        finalOutcome: "SUCCESS",
        finalUrl: "https://example.com/shop/confirmation",
      },
      {
        status: "success",
        finalOutcome: "SUCCESS",
        finalUrl: "https://example.com/shop/confirmation",
      },
    ]);
    await seedReplayRunsForRepresentative(
      t,
      studyId,
      partialConfidenceRepresentative[0]!._id,
      [
        {
          status: "hard_fail",
          errorCode: "PARTIAL_CONFIDENCE",
          finalUrl: "https://example.com/shop/payment",
        },
        {
          status: "success",
          finalOutcome: "SUCCESS",
          finalUrl: "https://example.com/shop/confirmation",
        },
      ],
    );
    await seedReplayRunsForRepresentative(t, studyId, fullConfidenceRepresentative[0]!._id, [
      {
        status: "hard_fail",
        errorCode: "FULL_CONFIDENCE",
        finalUrl: "https://example.com/shop/review",
      },
      {
        status: "hard_fail",
        errorCode: "FULL_CONFIDENCE",
        finalUrl: "https://example.com/shop/review",
      },
    ]);

    const candidates: Array<{
      signature: string;
      replayConfidence: number;
    }> = await t.query(internal.studyLifecycleWorkflow.getReplayCandidates, {
      studyId,
    });
    const confidenceBySignature = Object.fromEntries(
      candidates.map((candidate) => [candidate.signature, candidate.replayConfidence]),
    );

    expect(
      confidenceBySignature[
        "hard_fail|ZERO_CONFIDENCE|https://example.com/shop/checkout"
      ],
    ).toBe(0);
    expect(
      confidenceBySignature[
        "hard_fail|PARTIAL_CONFIDENCE|https://example.com/shop/payment"
      ],
    ).toBe(0.5);
    expect(
      confidenceBySignature[
        "hard_fail|FULL_CONFIDENCE|https://example.com/shop/review"
      ],
    ).toBe(1);
  });

  it("promotes only replay-backed candidates into issue clusters", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, { status: "replaying", runBudget: 8 });

    const repeatedFailure = await seedRunCluster(t, studyId, {
      count: 2,
      status: "hard_fail",
      errorCode: "REPEATED_FAILURE",
      finalUrl: "https://example.com/shop/checkout",
    });
    const singleNonBlocker = await seedRunCluster(t, studyId, {
      count: 1,
      status: "soft_fail",
      errorCode: "SINGLE_NON_BLOCKER",
      finalUrl: "https://example.com/shop/cart",
    });
    const singleBlockerPromoted = await seedRunCluster(t, studyId, {
      count: 1,
      status: "blocked_by_guardrail",
      errorCode: "BLOCKER_PROMOTED",
      finalUrl: "https://example.com/shop/payment",
    });
    const singleBlockerRejected = await seedRunCluster(t, studyId, {
      count: 1,
      status: "hard_fail",
      errorCode: "BLOCKER_REJECTED",
      finalUrl: "https://example.com/shop/review",
    });

    await seedReplayRunsForRepresentative(t, studyId, repeatedFailure[0]!._id, [
      {
        status: "hard_fail",
        errorCode: "REPEATED_FAILURE",
        finalUrl: "https://example.com/shop/checkout",
      },
      {
        status: "success",
        finalOutcome: "SUCCESS",
        finalUrl: "https://example.com/shop/confirmation",
      },
    ]);
    await seedReplayRunsForRepresentative(t, studyId, singleBlockerPromoted[0]!._id, [
      {
        status: "blocked_by_guardrail",
        errorCode: "BLOCKER_PROMOTED",
        finalUrl: "https://example.com/shop/payment",
      },
      {
        status: "success",
        finalOutcome: "SUCCESS",
        finalUrl: "https://example.com/shop/confirmation",
      },
    ]);
    await seedReplayRunsForRepresentative(t, studyId, singleBlockerRejected[0]!._id, [
      {
        status: "success",
        finalOutcome: "SUCCESS",
        finalUrl: "https://example.com/shop/confirmation",
      },
      {
        status: "success",
        finalOutcome: "SUCCESS",
        finalUrl: "https://example.com/shop/confirmation",
      },
    ]);
    void singleNonBlocker;

    await t.mutation(internal.studyLifecycleWorkflow.completeStudyLifecycleAfterReplay, {
      studyId,
    });

    const clusters = await listIssueClusters(t, studyId);
    const report = await t.run(async (ctx) => {
      for await (const studyReport of ctx.db.query("studyReports")) {
        if (studyReport.studyId === studyId) {
          return studyReport;
        }
      }

      return null;
    });

    expect(clusters).toHaveLength(2);
    expect(clusters.map((cluster) => cluster.replayConfidence)).toEqual([0.5, 0.5]);
    expect(
      clusters.map((cluster) => cluster.summary),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("REPEATED_FAILURE"),
        expect.stringContaining("BLOCKER_PROMOTED"),
      ]),
    );
    expect(report?.issueClusterIds).toHaveLength(2);
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
  overrides: Partial<Doc<"studies">> & {
    status: StudyStatus;
    runBudget?: number;
    activeConcurrency?: number;
  },
) {
  const now = Date.now();
  const packId = await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      orgId: researchIdentity.tokenIdentifier,
      name: "Checkout pack",
      description: "Pack used for lifecycle workflow tests",
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
      ...overrides,
      orgId: researchIdentity.tokenIdentifier,
      personaPackId: packId,
      name: "Checkout lifecycle study",
      taskSpec: sampleTaskSpec,
      runBudget: overrides.runBudget ?? 3,
      activeConcurrency: overrides.activeConcurrency ?? 2,
      status: overrides.status,
      createdBy: researchIdentity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    }),
  );
}

async function seedAcceptedVariants(
  t: TestInstance,
  studyId: Id<"studies">,
  acceptedCount: number,
) {
  const study = await t.run(async (ctx) => ctx.db.get(studyId));

  if (study === null) {
    throw new Error(`Study ${studyId} not found.`);
  }

  const protoPersonaId = await t.run(async (ctx) =>
    ctx.db.insert("protoPersonas", {
      packId: study.personaPackId,
      name: "Focused shopper",
      summary: "Moves quickly and expects little friction.",
      axes: [],
      sourceType: "manual",
      sourceRefs: [],
      evidenceSnippets: [],
    }),
  );

  for (let index = 0; index < acceptedCount; index += 1) {
    await t.run(async (ctx) =>
      ctx.db.insert("personaVariants", {
        studyId,
        personaPackId: study.personaPackId,
        protoPersonaId,
        axisValues: [],
        edgeScore: 0.5,
        tensionSeed: `Tension seed ${index + 1}`,
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
  }
}

async function seedTerminalRuns(
  t: TestInstance,
  studyId: Id<"studies">,
  statuses: Array<Doc<"runs">["status"]>,
) {
  const study = await t.run(async (ctx) => ctx.db.get(studyId));

  if (study === null) {
    throw new Error(`Study ${studyId} not found.`);
  }

  const protoPersonaId = await t.run(async (ctx) =>
    ctx.db.insert("protoPersonas", {
      packId: study.personaPackId,
      name: "Focused shopper",
      summary: "Moves quickly and expects little friction.",
      axes: [],
      sourceType: "manual",
      sourceRefs: [],
      evidenceSnippets: [],
    }),
  );

  for (const [index, status] of statuses.entries()) {
    const personaVariantId = await t.run(async (ctx) =>
      ctx.db.insert("personaVariants", {
        studyId,
        personaPackId: study.personaPackId,
        protoPersonaId,
        axisValues: [],
        edgeScore: 0.5,
        tensionSeed: `Tension seed ${index + 1}`,
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

    await t.run(async (ctx) =>
      ctx.db.insert("runs", {
        studyId,
        personaVariantId,
        protoPersonaId,
        status,
        startedAt: 1_000 + index,
        endedAt: 2_000 + index,
        durationSec: 12 + index,
        stepCount: 5 + index,
        finalOutcome: status === "success" ? "SUCCESS" : "ABANDONED",
        frustrationCount: status === "gave_up" ? 3 : 0,
        milestoneKeys:
          status === "gave_up" ? [`runs/${studyId}/milestones/${index}.jpg`] : [],
      }),
    );
  }
}

async function seedRunCluster(
  t: TestInstance,
  studyId: Id<"studies">,
  options: {
    count: number;
    status: Doc<"runs">["status"];
    errorCode?: string;
    finalOutcome?: string;
    finalUrl?: string;
  },
) {
  const seededRuns: Array<Doc<"runs">> = [];

  for (let index = 0; index < options.count; index += 1) {
    seededRuns.push(
      await insertTerminalRun(t, studyId, {
        status: options.status,
        errorCode: options.errorCode,
        finalOutcome:
          options.finalOutcome ??
          (options.status === "success" ? "SUCCESS" : "FAILED"),
        finalUrl: options.finalUrl,
      }),
    );
  }

  return seededRuns;
}

async function seedReplayRunsForRepresentative(
  t: TestInstance,
  studyId: Id<"studies">,
  replayOfRunId: Id<"runs">,
  replayRuns: Array<{
    status: Doc<"runs">["status"];
    errorCode?: string;
    finalOutcome?: string;
    finalUrl?: string;
  }>,
) {
  const representativeRun = await t.run(async (ctx) => ctx.db.get(replayOfRunId));

  if (representativeRun === null) {
    throw new Error(`Representative run ${replayOfRunId} not found.`);
  }

  for (const replayRun of replayRuns) {
    await t.run(async (ctx) =>
      ctx.db.insert("runs", {
        studyId,
        personaVariantId: representativeRun.personaVariantId,
        protoPersonaId: representativeRun.protoPersonaId,
        status: replayRun.status,
        replayOfRunId,
        startedAt: Date.now(),
        endedAt: Date.now(),
        durationSec: 11,
        stepCount: 5,
        finalOutcome: replayRun.finalOutcome ?? "FAILED",
        finalUrl: replayRun.finalUrl,
        frustrationCount: replayRun.status === "success" ? 0 : 2,
        milestoneKeys:
          replayRun.errorCode !== undefined
            ? [`replays/${replayOfRunId}/${replayRun.errorCode}.png`]
            : [],
        ...(replayRun.errorCode !== undefined ? { errorCode: replayRun.errorCode } : {}),
      }),
    );
  }
}

async function settleReplayRun(
  t: TestInstance,
  runId: Id<"runs">,
  outcome: {
    status:
      | "success"
      | "hard_fail"
      | "soft_fail"
      | "gave_up"
      | "timeout"
      | "blocked_by_guardrail"
      | "infra_error";
    errorCode?: string;
    finalOutcome?: string;
    finalUrl?: string;
  },
) {
  const run = await t.run(async (ctx) => ctx.db.get(runId));

  if (run === null) {
    throw new Error(`Replay run ${runId} not found.`);
  }

  if (run.status === "queued") {
    await t.mutation(internal.runs.transitionRunState, {
      runId,
      nextStatus: "dispatching",
    });
  }

  const refreshedRun = await t.run(async (ctx) => ctx.db.get(runId));

  if (refreshedRun?.status === "dispatching") {
    await t.mutation(internal.runs.transitionRunState, {
      runId,
      nextStatus: "running",
    });
  }

  await t.mutation(internal.runs.settleRunFromCallback, {
    runId,
    nextStatus: outcome.status,
    patch: {
      endedAt: Date.now(),
      durationSec: 14,
      stepCount: 6,
      finalOutcome:
        outcome.finalOutcome ??
        (outcome.status === "success" ? "SUCCESS" : "FAILED"),
      finalUrl: outcome.finalUrl,
      frustrationCount: outcome.status === "success" ? 0 : 2,
      ...(outcome.errorCode !== undefined ? { errorCode: outcome.errorCode } : {}),
    },
  });
}

async function insertTerminalRun(
  t: TestInstance,
  studyId: Id<"studies">,
  options: {
    status: Doc<"runs">["status"];
    errorCode?: string;
    finalOutcome: string;
    finalUrl?: string;
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
      axisValues: [],
      edgeScore: 0.5,
      tensionSeed: "Replay test tension seed",
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
  const runId = await t.run(async (ctx) =>
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
      frustrationCount: options.status === "success" ? 0 : 3,
      milestoneKeys:
        options.errorCode !== undefined
          ? [`runs/${studyId}/${options.errorCode}.png`]
          : [],
      ...(options.errorCode !== undefined ? { errorCode: options.errorCode } : {}),
    }),
  );

  const insertedRun = await t.run(async (ctx) => ctx.db.get(runId));

  if (insertedRun === null) {
    throw new Error(`Run ${runId} was not inserted.`);
  }

  return insertedRun;
}

async function listReplayRuns(t: TestInstance, studyId: Id<"studies">) {
  return (await t.run(async (ctx) =>
    ctx.db
      .query("runs")
      .withIndex("by_studyId", (q) => q.eq("studyId", studyId))
      .collect(),
  )).filter((run) => run.replayOfRunId !== undefined);
}

async function listIssueClusters(t: TestInstance, studyId: Id<"studies">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("issueClusters")
      .withIndex("by_studyId", (q) => q.eq("studyId", studyId))
      .collect(),
  );
}
