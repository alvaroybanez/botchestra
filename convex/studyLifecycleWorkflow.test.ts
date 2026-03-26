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

  it("advances a settled running study to completed and exposes the report", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, { status: "running", runBudget: 3 });
    await seedTerminalRuns(t, studyId, ["success", "gave_up", "success"]);
    await t.mutation(internal.studyLifecycleWorkflow.advanceStudyLifecycleAfterInitialCohort, {
      studyId,
    });

    const completedStudy = await asResearcher.query(api.studies.getStudy, {
      studyId,
    });
    const report = await asResearcher.query(api.studyLifecycleWorkflow.getStudyReport, {
      studyId,
    });

    expect(completedStudy?.status).toBe("completed");
    expect(completedStudy?.completedAt).toBeTypeOf("number");
    expect(report?.studyId).toBe(studyId);
    expect(report?.issueClusterIds).toHaveLength(1);
    expect(report?.headlineMetrics.completionRate).toBeCloseTo(2 / 3, 5);
    expect(report?.headlineMetrics.abandonmentRate).toBeCloseTo(1 / 3, 5);
    expect(report?.limitations).toEqual(
      expect.arrayContaining([
        "Findings are synthetic and directional.",
        "Agents may miss or invent behavior relative to humans.",
        "Human follow-up is recommended for high-stakes decisions.",
      ]),
    );
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
