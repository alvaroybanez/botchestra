import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./reportExports.ts": () => import("./reportExports"),
  "./schema.ts": () => import("./schema"),
};

const createTest = () => convexTest(schema, modules);
const reportExportsApi = (api as any).reportExports;

const owningIdentity = {
  subject: "reviewer-1",
  tokenIdentifier: "org_1",
  name: "Reviewer One",
  email: "reviewer.one@example.com",
};

const otherIdentity = {
  subject: "reviewer-2",
  tokenIdentifier: "org_2",
  name: "Reviewer Two",
  email: "reviewer.two@example.com",
};

const BASE_TIME = new Date("2026-03-26T12:00:00.000Z");
const ARTIFACT_BASE_URL = "https://artifacts.example.com";
const ARTIFACT_SIGNING_SECRET = "artifact-signing-secret";

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

describe("report exports", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(BASE_TIME);
    process.env.ARTIFACT_BASE_URL = ARTIFACT_BASE_URL;
    process.env.CALLBACK_SIGNING_SECRET = ARTIFACT_SIGNING_SECRET;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete process.env.ARTIFACT_BASE_URL;
    delete process.env.CALLBACK_SIGNING_SECRET;
  });

  it("exports the full report JSON with issue clusters in report order", async () => {
    const t = createTest();
    const asOwner = t.withIdentity(owningIdentity);
    const fixtures = await seedReportFixtures(t, owningIdentity.tokenIdentifier);

    const exported = await asOwner.action(reportExportsApi.exportJson, {
      studyId: fixtures.studyId,
    });
    const parsed = JSON.parse(exported.content);

    expect(exported).toMatchObject({
      studyId: fixtures.studyId,
      artifactKey: `study-reports/${fixtures.studyId}/report.json`,
      contentType: "application/json",
      fileName: `study-report-${fixtures.studyId}.json`,
    });
    expect(parsed).toMatchObject({
      studyId: fixtures.studyId,
      headlineMetrics: {
        completionRate: 0.5,
        abandonmentRate: 0.25,
        medianSteps: 6,
        medianDurationSec: 180,
      },
      issueClusterIds: [fixtures.secondaryClusterId, fixtures.primaryClusterId],
      htmlReportKey: `study-reports/${fixtures.studyId}/report.html`,
      jsonReportKey: `study-reports/${fixtures.studyId}/report.json`,
      limitations: [
        "Findings are synthetic and directional.",
        "Agents may miss or invent behavior relative to humans.",
        "Human follow-up is recommended for high-stakes decisions.",
      ],
    });
    expect(parsed.issueClusters).toHaveLength(2);
    expect(parsed.issueClusters[0]).toMatchObject({
      _id: fixtures.secondaryClusterId,
      title: "Payment totals shift late in checkout",
      severity: "minor",
      evidenceKeys: ["runs/run-secondary/milestones/3.jpg"],
    });
    expect(parsed.issueClusters[1]).toMatchObject({
      _id: fixtures.primaryClusterId,
      title: "Checkout continue button hidden on address step",
      severity: "blocker",
      evidenceKeys: ["runs/run-primary/milestones/2.jpg"],
    });
  });

  it("exports self-contained HTML without external assets", async () => {
    const t = createTest();
    const asOwner = t.withIdentity(owningIdentity);
    const fixtures = await seedReportFixtures(t, owningIdentity.tokenIdentifier);

    const exported = await asOwner.action(reportExportsApi.exportHtml, {
      studyId: fixtures.studyId,
    });

    expect(exported).toMatchObject({
      studyId: fixtures.studyId,
      artifactKey: `study-reports/${fixtures.studyId}/report.html`,
      contentType: "text/html; charset=utf-8",
      fileName: `study-report-${fixtures.studyId}.html`,
    });
    expect(exported.content).toContain("<!DOCTYPE html>");
    expect(exported.content).toContain("Study Report");
    expect(exported.content).toContain("This HTML report is self-contained");
    expect(exported.content).toContain("Checkout continue button hidden on address step");
    expect(exported.content).toContain("Payment totals shift late in checkout");
    expect(exported.content).toContain("Findings are synthetic and directional.");
    expect(exported.content).toContain(
      `${ARTIFACT_BASE_URL}/artifacts/${encodeURIComponent(
        "runs/run-primary/milestones/2.jpg",
      )}?expires=${BASE_TIME.getTime() + 14_400_000}&amp;signature=`,
    );
    expect(exported.content).not.toContain("<script src=");
    expect(exported.content).not.toContain('<link rel="stylesheet"');
  });

  it("rejects export requests for studies outside the caller org", async () => {
    const t = createTest();
    const asOtherOrg = t.withIdentity(otherIdentity);
    const fixtures = await seedReportFixtures(t, owningIdentity.tokenIdentifier);

    await expect(
      asOtherOrg.action(reportExportsApi.exportJson, {
        studyId: fixtures.studyId,
      }),
    ).rejects.toThrowError("Study not found.");
  });
});

type TestInstance = ReturnType<typeof createTest>;

async function seedReportFixtures(t: TestInstance, orgId: string) {
  const packId = await insertPack(t, orgId);
  const studyId = await insertStudy(t, orgId, packId);
  const protoPersonaAlphaId = await insertProtoPersona(
    t,
    packId,
    "Cautious shopper",
  );
  const protoPersonaBetaId = await insertProtoPersona(t, packId, "Busy parent");
  const primaryVariantId = await insertPersonaVariant(
    t,
    studyId,
    packId,
    protoPersonaAlphaId,
  );
  const secondaryVariantId = await insertPersonaVariant(
    t,
    studyId,
    packId,
    protoPersonaBetaId,
  );
  const primaryRunId = await insertRun(t, {
    studyId,
    protoPersonaId: protoPersonaAlphaId,
    personaVariantId: primaryVariantId,
    status: "hard_fail",
    finalUrl: "https://example.com/checkout/address",
    milestoneKeys: ["runs/run-primary/milestones/2.jpg"],
  });
  const secondaryRunId = await insertRun(t, {
    studyId,
    protoPersonaId: protoPersonaBetaId,
    personaVariantId: secondaryVariantId,
    status: "soft_fail",
    finalUrl: "https://example.com/checkout/payment",
    milestoneKeys: ["runs/run-secondary/milestones/3.jpg"],
  });

  const primaryClusterId = await insertIssueCluster(t, {
    studyId,
    title: "Checkout continue button hidden on address step",
    summary: "A blocker cluster where the primary continue action was not visible.",
    severity: "blocker",
    affectedRunCount: 3,
    affectedRunRate: 0.5,
    affectedProtoPersonaIds: [protoPersonaAlphaId],
    affectedAxisRanges: [
      { key: "digital_confidence", min: -0.9, max: -0.3 },
    ],
    representativeRunIds: [primaryRunId],
    replayConfidence: 0.8,
    evidenceKeys: ["runs/run-primary/milestones/2.jpg"],
    recommendation: "Restore the primary call to action on the address step.",
    confidenceNote: "Replay reproduced the hidden-button failure twice.",
    score: 0.92,
  });
  const secondaryClusterId = await insertIssueCluster(t, {
    studyId,
    title: "Payment totals shift late in checkout",
    summary: "A minor cluster where late total changes caused hesitation.",
    severity: "minor",
    affectedRunCount: 2,
    affectedRunRate: 0.33,
    affectedProtoPersonaIds: [protoPersonaBetaId],
    affectedAxisRanges: [{ key: "digital_confidence", min: 0.2, max: 0.8 }],
    representativeRunIds: [secondaryRunId],
    replayConfidence: 0.4,
    evidenceKeys: ["runs/run-secondary/milestones/3.jpg"],
    recommendation: "Explain tax and shipping changes earlier in checkout.",
    confidenceNote: "Observed in one replay and one primary run.",
    score: 0.27,
  });

  await insertReport(t, studyId, [secondaryClusterId, primaryClusterId]);

  return {
    studyId,
    primaryClusterId,
    secondaryClusterId,
  };
}

async function insertPack(t: TestInstance, orgId: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      orgId,
      name: `Pack for ${orgId}`,
      description: "Pack for report export tests",
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
  orgId: string,
  personaPackId: Id<"personaPacks">,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId,
      personaPackId,
      name: "Report export fixture study",
      description: "Fixture study for report export tests",
      taskSpec: sampleTaskSpec,
      runBudget: 8,
      activeConcurrency: 2,
      status: "completed",
      createdBy: orgId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
  );
}

async function insertProtoPersona(
  t: TestInstance,
  packId: Id<"personaPacks">,
  name: string,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("protoPersonas", {
      packId,
      name,
      summary: `${name} summary`,
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
      evidenceSnippets: [],
    }),
  );
}

async function insertPersonaVariant(
  t: TestInstance,
  studyId: Id<"studies">,
  personaPackId: Id<"personaPacks">,
  protoPersonaId: Id<"protoPersonas">,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("personaVariants", {
      studyId,
      personaPackId,
      protoPersonaId,
      axisValues: [{ key: "digital_confidence", value: 0.1 }],
      edgeScore: 0.5,
      tensionSeed: "Wants reassurance before payment.",
      firstPersonBio: "Fixture persona bio",
      behaviorRules: [
        "Checks totals carefully.",
        "Moves quickly on familiar pages.",
        "Pauses when labels feel unclear.",
        "Backtracks if totals change unexpectedly.",
        "Looks for reassurance before submitting.",
      ],
      coherenceScore: 0.8,
      distinctnessScore: 0.7,
      accepted: true,
    }),
  );
}

async function insertRun(
  t: TestInstance,
  run: Pick<
    Doc<"runs">,
    | "studyId"
    | "protoPersonaId"
    | "personaVariantId"
    | "status"
    | "finalUrl"
    | "milestoneKeys"
  >,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("runs", {
      studyId: run.studyId,
      protoPersonaId: run.protoPersonaId,
      personaVariantId: run.personaVariantId,
      status: run.status,
      finalUrl: run.finalUrl,
      finalOutcome: run.status === "hard_fail" ? "FAILED" : "PARTIAL_SUCCESS",
      frustrationCount: 0,
      milestoneKeys: run.milestoneKeys,
    }),
  );
}

async function insertIssueCluster(
  t: TestInstance,
  cluster: Omit<Doc<"issueClusters">, "_id" | "_creationTime">,
) {
  return await t.run(async (ctx) => ctx.db.insert("issueClusters", cluster));
}

async function insertReport(
  t: TestInstance,
  studyId: Id<"studies">,
  issueClusterIds: Id<"issueClusters">[],
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("studyReports", {
      studyId,
      headlineMetrics: {
        completionRate: 0.5,
        abandonmentRate: 0.25,
        medianSteps: 6,
        medianDurationSec: 180,
      },
      issueClusterIds,
      segmentBreakdownKey: `study-reports/${studyId}/segment-breakdown.json`,
      limitations: [
        "Findings are synthetic and directional.",
        "Agents may miss or invent behavior relative to humans.",
        "Human follow-up is recommended for high-stakes decisions.",
      ],
      htmlReportKey: `study-reports/${studyId}/report.html`,
      jsonReportKey: `study-reports/${studyId}/report.json`,
      createdAt: 1_700_000_000_000,
    }),
  );
}
