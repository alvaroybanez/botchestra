import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./studies.ts": () => import("./studies"),
  "./runs.ts": () => import("./runs"),
};

const createTest = () => convexTest(schema, modules);

const researchIdentity = {
  subject: "researcher-1",
  tokenIdentifier: "researcher-1",
  name: "Researcher One",
  email: "researcher.one@example.com",
};

const otherIdentity = {
  subject: "researcher-2",
  tokenIdentifier: "researcher-2",
  name: "Researcher Two",
  email: "researcher.two@example.com",
};

const sampleTaskSpec = {
  scenario: "Complete checkout for a pair of shoes.",
  goal: "Reach order confirmation.",
  startingUrl: "https://example.com/products/shoes",
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
  postTaskQuestions: ["Did you complete the task?"],
  maxSteps: 25,
  maxDurationSec: 420,
  environmentLabel: "staging",
  locale: "en-US",
  viewport: { width: 1440, height: 900 },
};

describe("study queries", () => {
  it("getStudy returns the full study document for the owning org and null otherwise", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const asOtherResearcher = t.withIdentity(otherIdentity);
    const studyId = await insertStudy(t, {
      orgId: researchIdentity.tokenIdentifier,
      name: "Checkout baseline",
      description: "Validate the primary checkout flow.",
      status: "ready",
      runBudget: 10,
      activeConcurrency: 3,
      taskSpec: {
        ...sampleTaskSpec,
        environmentLabel: "production",
        randomSeed: "seed-123",
      },
      launchRequestedBy: researchIdentity.tokenIdentifier,
      launchedAt: 1_700_000_000_000,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_100,
    });

    const study = await asResearcher.query(api.studies.getStudy, { studyId });
    const hiddenStudy = await asOtherResearcher.query(api.studies.getStudy, {
      studyId,
    });

    expect(study).toMatchObject({
      _id: studyId,
      name: "Checkout baseline",
      description: "Validate the primary checkout flow.",
      status: "ready",
      runBudget: 10,
      activeConcurrency: 3,
      launchRequestedBy: researchIdentity.tokenIdentifier,
      launchedAt: 1_700_000_000_000,
      taskSpec: {
        environmentLabel: "production",
        randomSeed: "seed-123",
      },
    });
    expect(hiddenStudy).toBeNull();
  });

  it("listStudies returns only studies from the current org ordered by most recently updated", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const foreignStudyId = await insertStudy(t, {
      orgId: otherIdentity.tokenIdentifier,
      name: "Foreign study",
      updatedAt: 50,
    });
    const olderStudyId = await insertStudy(t, {
      orgId: researchIdentity.tokenIdentifier,
      name: "Older study",
      updatedAt: 100,
    });
    const newerStudyId = await insertStudy(t, {
      orgId: researchIdentity.tokenIdentifier,
      name: "Newer study",
      updatedAt: 200,
    });

    const studies = await asResearcher.query(api.studies.listStudies, {});

    expect(studies.map((study: Doc<"studies">) => study._id)).toEqual([
      newerStudyId,
      olderStudyId,
    ]);
    expect(
      studies.every(
        (study: Doc<"studies">) =>
          study.orgId === researchIdentity.tokenIdentifier,
      ),
    ).toBe(true);
    expect(
      studies.some((study: Doc<"studies">) => study._id === foreignStudyId),
    ).toBe(false);
  });
});

describe("run queries", () => {
  it("getRunSummary returns accurate counts for mixed terminal and active outcomes", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const { studyId } = await buildRunFixtures(t, researchIdentity.tokenIdentifier);

    await insertRun(t, studyId, "success", { finalUrl: "https://example.com/confirmation/1" });
    await insertRun(t, studyId, "success", { finalUrl: "https://example.com/confirmation/2" });
    await insertRun(t, studyId, "success", { finalUrl: "https://example.com/confirmation/3" });
    await insertRun(t, studyId, "hard_fail", { finalUrl: "https://example.com/error/address" });
    await insertRun(t, studyId, "hard_fail", { finalUrl: "https://example.com/error/payment" });
    await insertRun(t, studyId, "soft_fail", { finalUrl: "https://example.com/review" });
    await insertRun(t, studyId, "gave_up", { finalUrl: "https://example.com/cart" });
    await insertRun(t, studyId, "queued");
    await insertRun(t, studyId, "running");
    await insertRun(t, studyId, "cancelled");

    const summary = await asResearcher.query(api.runs.getRunSummary, { studyId });

    expect(summary).toEqual({
      studyId,
      totalRuns: 10,
      queuedCount: 1,
      runningCount: 1,
      terminalCount: 8,
      outcomeCounts: {
        success: 3,
        hard_fail: 2,
        soft_fail: 1,
        gave_up: 1,
        timeout: 0,
        blocked_by_guardrail: 0,
        infra_error: 0,
        cancelled: 1,
      },
    });
  });

  it("getRun returns the full run with milestones, persona variant, and proto-persona details", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const { studyId, protoPersonaId, personaVariantId } = await buildRunFixtures(
      t,
      researchIdentity.tokenIdentifier,
    );
    const runId = await insertRun(t, studyId, "success", {
      personaVariantId,
      protoPersonaId,
      finalUrl: "https://example.com/confirmation",
      finalOutcome: "order_confirmed",
      selfReport: {
        perceivedSuccess: true,
        hardestPart: "Reviewing shipping costs",
        confusion: "Tax updated at the last step",
        confidence: 0.9,
        suggestedChange: "Surface taxes earlier",
      },
    });
    await insertMilestone(t, runId, studyId, {
      stepIndex: 2,
      url: "https://example.com/checkout/payment",
      title: "Payment",
      actionType: "click",
      rationaleShort: "Continued to payment",
    });
    await insertMilestone(t, runId, studyId, {
      stepIndex: 1,
      url: "https://example.com/checkout/address",
      title: "Address",
      actionType: "type",
      rationaleShort: "Filled out the shipping form",
      screenshotKey: "runs/run-1/milestones/1.jpg",
    });

    const run = await asResearcher.query(api.runs.getRun, { runId });

    expect(run).not.toBeNull();
    expect(run?.run).toMatchObject({
      _id: runId,
      studyId,
      status: "success",
      finalUrl: "https://example.com/confirmation",
      finalOutcome: "order_confirmed",
      selfReport: {
        perceivedSuccess: true,
        hardestPart: "Reviewing shipping costs",
      },
    });
    expect(run?.protoPersona).toMatchObject({
      _id: protoPersonaId,
      name: "Careful shopper",
    });
    expect(run?.personaVariant).toMatchObject({
      _id: personaVariantId,
      firstPersonBio: expect.stringContaining("Careful online shopper"),
      axisValues: [{ key: "digital_confidence", value: -0.35 }],
    });
    expect(
      run?.milestones.map((milestone: Doc<"runMilestones">) => milestone.stepIndex),
    ).toEqual([1, 2]);
    expect(run?.milestones[0]).toMatchObject({
      actionType: "type",
      screenshotKey: "runs/run-1/milestones/1.jpg",
    });
  });

  it("listRuns filters by outcome", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const { studyId } = await buildRunFixtures(t, researchIdentity.tokenIdentifier);
    const hardFailRunId = await insertRun(t, studyId, "hard_fail", {
      finalUrl: "https://example.com/error/address",
    });
    await insertRun(t, studyId, "success", {
      finalUrl: "https://example.com/confirmation",
    });

    const runs = await asResearcher.query(api.runs.listRuns, {
      studyId,
      outcome: "hard_fail",
    });

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      _id: hardFailRunId,
      status: "hard_fail",
    });
  });

  it("listRuns filters by proto-persona", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const { studyId, protoPersonaId } = await buildRunFixtures(
      t,
      researchIdentity.tokenIdentifier,
    );
    const otherFixture = await buildRunFixtures(t, researchIdentity.tokenIdentifier, {
      existingStudyId: studyId,
    });
    await insertRun(t, studyId, "success", {
      protoPersonaId,
      finalUrl: "https://example.com/confirmation/a",
    });
    await insertRun(t, studyId, "success", {
      protoPersonaId: otherFixture.protoPersonaId,
      personaVariantId: otherFixture.personaVariantId,
      finalUrl: "https://example.com/confirmation/b",
    });

    const runs = await asResearcher.query(api.runs.listRuns, {
      studyId,
      protoPersonaId,
    });

    expect(runs).toHaveLength(1);
    expect(runs[0]?.protoPersonaId).toBe(protoPersonaId);
    expect(runs[0]?.protoPersonaName).toBe("Careful shopper");
  });

  it("listRuns filters by URL substring", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const { studyId } = await buildRunFixtures(t, researchIdentity.tokenIdentifier);
    const matchingRunId = await insertRun(t, studyId, "soft_fail", {
      finalUrl: "https://example.com/checkout/address",
    });
    await insertRun(t, studyId, "soft_fail", {
      finalUrl: "https://example.com/cart",
    });

    const runs = await asResearcher.query(api.runs.listRuns, {
      studyId,
      finalUrlContains: "checkout/address",
    });

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      _id: matchingRunId,
      finalUrl: "https://example.com/checkout/address",
    });
  });
});

type TestInstance = ReturnType<typeof createTest>;
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

async function insertPack(
  t: TestInstance,
  orgId: string,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      orgId,
      name: `Pack for ${orgId}`,
      description: "Pack for study query tests",
      context: "Checkout",
      sharedAxes: [
        {
          key: "digital_confidence",
          label: "Digital confidence",
          description: "Comfort level with online checkout",
          lowAnchor: "Hesitant",
          midAnchor: "Comfortable",
          highAnchor: "Power user",
          weight: 1,
        },
      ],
      version: 1,
      status: "published",
      createdBy: orgId,
      updatedBy: orgId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function insertStudy(
  t: TestInstance,
  overrides: Partial<Doc<"studies">> & { orgId: string },
) {
  const { orgId, personaPackId, ...rest } = overrides;
  const packId = personaPackId ?? (await insertPack(t, orgId));

  return await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId,
      personaPackId: packId,
      name: "Study query fixture",
      description: "Fixture study",
      taskSpec: sampleTaskSpec,
      runBudget: 8,
      activeConcurrency: 2,
      status: "draft",
      createdBy: orgId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...rest,
    }),
  );
}

async function buildRunFixtures(
  t: TestInstance,
  orgId: string,
  options: {
    existingStudyId?: Id<"studies">;
  } = {},
) {
  const studyId =
    options.existingStudyId ??
    (await insertStudy(t, {
      orgId,
      status: "running",
      runBudget: 10,
      activeConcurrency: 3,
    }));
  const study = await t.run(async (ctx) => await ctx.db.get(studyId));

  if (study === null) {
    throw new Error("Study fixture missing.");
  }

  const protoPersonaId = await t.run(async (ctx) =>
    ctx.db.insert("protoPersonas", {
      packId: study.personaPackId,
      name: "Careful shopper",
      summary: "Double-checks every step before continuing.",
      axes: [
        {
          key: "digital_confidence",
          label: "Digital confidence",
          description: "Comfort level with online checkout",
          lowAnchor: "Hesitant",
          midAnchor: "Comfortable",
          highAnchor: "Power user",
          weight: 1,
        },
      ],
      sourceType: "manual",
      sourceRefs: [],
      evidenceSnippets: ["Reviews totals before submitting"],
    }),
  );

  const personaVariantId = await t.run(async (ctx) =>
    ctx.db.insert("personaVariants", {
      studyId,
      personaPackId: study.personaPackId,
      protoPersonaId,
      axisValues: [{ key: "digital_confidence", value: -0.35 }],
      edgeScore: 0.72,
      tensionSeed: "Worries about submitting payment too early.",
      firstPersonBio:
        "Careful online shopper who slows down when fees, totals, or payment steps feel unclear and wants confirmation before committing.",
      behaviorRules: [
        "Checks totals carefully.",
        "Looks for reassurance before submitting.",
        "Reads labels before continuing.",
        "Backtracks when information is missing.",
        "Pauses when anything feels risky.",
      ],
      coherenceScore: 0.88,
      distinctnessScore: 0.79,
      accepted: true,
    }),
  );

  return { studyId, protoPersonaId, personaVariantId };
}

async function insertRun(
  t: TestInstance,
  studyId: Id<"studies">,
  status: RunStatus,
  overrides: Partial<Doc<"runs">> = {},
) {
  const study = await t.run(async (ctx) => await ctx.db.get(studyId));

  if (study === null) {
    throw new Error("Study fixture missing.");
  }

  const protoPersonaId =
    overrides.protoPersonaId ??
    (await t.run(async (ctx) =>
      ctx.db.insert("protoPersonas", {
        packId: study.personaPackId,
        name: "Fallback persona",
        summary: "Fallback proto-persona",
        axes: [],
        sourceType: "manual",
        sourceRefs: [],
        evidenceSnippets: [],
      }),
    ));

  const personaVariantId =
    overrides.personaVariantId ??
    (await t.run(async (ctx) =>
      ctx.db.insert("personaVariants", {
        studyId,
        personaPackId: study.personaPackId,
        protoPersonaId,
        axisValues: [],
        edgeScore: 0.4,
        tensionSeed: "Fallback tension seed",
        firstPersonBio: "Fallback bio",
        behaviorRules: [],
        coherenceScore: 0.6,
        distinctnessScore: 0.6,
        accepted: true,
      }),
    ));

  return await t.run(async (ctx) =>
    ctx.db.insert("runs", {
      studyId,
      personaVariantId,
      protoPersonaId,
      status,
      frustrationCount: 0,
      milestoneKeys: [],
      ...overrides,
    }),
  );
}

async function insertMilestone(
  t: TestInstance,
  runId: Id<"runs">,
  studyId: Id<"studies">,
  overrides: Partial<Doc<"runMilestones">>,
) {
  await t.run(async (ctx) =>
    ctx.db.insert("runMilestones", {
      runId,
      studyId,
      stepIndex: 1,
      timestamp: Date.now(),
      url: "https://example.com/checkout",
      title: "Checkout",
      actionType: "goto",
      rationaleShort: "Opened checkout",
      ...overrides,
    }),
  );
}
