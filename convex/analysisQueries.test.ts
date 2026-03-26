import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { api } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  encodeRunSummaryKey,
  type RunSummary,
} from "./analysis/runSummaries";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./analysisQueries.ts": () => import("./analysisQueries"),
  "./schema.ts": () => import("./schema"),
};

const createTest = () => convexTest(schema, modules);
const analysisApi = (api as any).analysisQueries;

const researchIdentity = {
  subject: "researcher-1",
  tokenIdentifier: "org_1",
  name: "Researcher One",
  email: "researcher.one@example.com",
};

const otherIdentity = {
  subject: "researcher-2",
  tokenIdentifier: "org_2",
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

describe("analysis queries", () => {
  it("getReport returns the full study report for the owning org and null when absent", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const studyId = await insertStudy(t, researchIdentity.tokenIdentifier);
    const reportId = await insertReport(t, studyId, []);

    const report = await asResearcher.query(analysisApi.getReport, { studyId });

    expect(report).toMatchObject({
      _id: reportId,
      studyId,
      issueClusterIds: [],
      headlineMetrics: {
        completionRate: 0.5,
        abandonmentRate: 0.25,
        medianSteps: 6,
        medianDurationSec: 180,
      },
      htmlReportKey: `study-reports/${studyId}/report.html`,
      jsonReportKey: `study-reports/${studyId}/report.json`,
    });

    const emptyStudyId = await insertStudy(t, researchIdentity.tokenIdentifier);
    const missingReport = await asResearcher.query(analysisApi.getReport, {
      studyId: emptyStudyId,
    });

    expect(missingReport).toBeNull();
  });

  it("listFindings returns report-ordered findings with evidence links, notes, and representative run context", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const fixtures = await seedAnalysisFixtures(t, researchIdentity.tokenIdentifier);

    const findings = await asResearcher.query(analysisApi.listFindings, {
      studyId: fixtures.studyId,
    });

    expect(findings.map((finding: any) => finding._id)).toEqual([
      fixtures.clusterSecondaryId,
      fixtures.clusterPrimaryId,
    ]);
    expect(findings[0]).toMatchObject({
      _id: fixtures.clusterSecondaryId,
      severity: "minor",
      evidenceKeys: ["runs/run-secondary/milestones/3.jpg"],
      evidence: [
        {
          key: "runs/run-secondary/milestones/3.jpg",
          thumbnailKey: "runs/run-secondary/milestones/3.jpg",
          fullResolutionKey: "runs/run-secondary/milestones/3.jpg",
        },
      ],
      affectedProtoPersonas: [
        {
          _id: fixtures.protoPersonaBetaId,
          name: "Busy parent",
        },
      ],
    });
    expect(findings[1]).toMatchObject({
      _id: fixtures.clusterPrimaryId,
      severity: "blocker",
      notes: [
        {
          note: "Screenshot shows the hidden continue button.",
          authorId: "analyst-a",
        },
        {
          note: "Confirmed again during replay review.",
          authorId: "analyst-b",
        },
      ],
      representativeRuns: [
        expect.objectContaining({
          _id: fixtures.primaryRunId,
          status: "hard_fail",
          finalUrl: "https://example.com/checkout/address",
          protoPersonaName: "Cautious shopper",
          representativeQuote:
            "I could not figure out how to continue from the address step.",
        }),
      ],
    });
  });

  it("listFindings supports severity, proto-persona, axis range, outcome, URL prefix, and filter combinations", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const fixtures = await seedAnalysisFixtures(t, researchIdentity.tokenIdentifier);

    const blockerFindings = await asResearcher.query(analysisApi.listFindings, {
      studyId: fixtures.studyId,
      severity: "blocker",
    });
    expect(blockerFindings.map((finding: any) => finding._id)).toEqual([
      fixtures.clusterPrimaryId,
    ]);

    const protoPersonaFindings = await asResearcher.query(analysisApi.listFindings, {
      studyId: fixtures.studyId,
      protoPersonaId: fixtures.protoPersonaBetaId,
    });
    expect(protoPersonaFindings.map((finding: any) => finding._id)).toEqual([
      fixtures.clusterSecondaryId,
    ]);

    const axisRangeFindings = await asResearcher.query(analysisApi.listFindings, {
      studyId: fixtures.studyId,
      axisRange: {
        key: "digital_confidence",
        min: -0.7,
        max: -0.2,
      },
    });
    expect(axisRangeFindings.map((finding: any) => finding._id)).toEqual([
      fixtures.clusterPrimaryId,
    ]);

    const outcomeFindings = await asResearcher.query(analysisApi.listFindings, {
      studyId: fixtures.studyId,
      outcome: "soft_fail",
    });
    expect(outcomeFindings.map((finding: any) => finding._id)).toEqual([
      fixtures.clusterSecondaryId,
    ]);

    const urlPrefixFindings = await asResearcher.query(analysisApi.listFindings, {
      studyId: fixtures.studyId,
      urlPrefix: "https://example.com/checkout/address",
    });
    expect(urlPrefixFindings.map((finding: any) => finding._id)).toEqual([
      fixtures.clusterPrimaryId,
    ]);

    const combinedFilters = await asResearcher.query(analysisApi.listFindings, {
      studyId: fixtures.studyId,
      severity: "blocker",
      protoPersonaId: fixtures.protoPersonaAlphaId,
      axisRange: {
        key: "digital_confidence",
        min: -0.8,
        max: -0.25,
      },
      outcome: "hard_fail",
      urlPrefix: "https://example.com/checkout/address",
    });
    expect(combinedFilters.map((finding: any) => finding._id)).toEqual([
      fixtures.clusterPrimaryId,
    ]);

    const noMatches = await asResearcher.query(analysisApi.listFindings, {
      studyId: fixtures.studyId,
      severity: "major",
      protoPersonaId: fixtures.protoPersonaAlphaId,
      outcome: "soft_fail",
    });
    expect(noMatches).toEqual([]);
  });

  it("getIssueCluster returns the enriched cluster for the owning org and rejects access from another org", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researchIdentity);
    const asOtherResearcher = t.withIdentity(otherIdentity);
    const fixtures = await seedAnalysisFixtures(t, researchIdentity.tokenIdentifier);

    const cluster = await asResearcher.query(analysisApi.getIssueCluster, {
      issueId: fixtures.clusterPrimaryId,
    });

    expect(cluster).toMatchObject({
      _id: fixtures.clusterPrimaryId,
      title: "Checkout continue button hidden on address step",
      evidenceKeys: ["runs/run-primary/milestones/2.jpg"],
      evidence: [
        {
          key: "runs/run-primary/milestones/2.jpg",
          thumbnailKey: "runs/run-primary/milestones/2.jpg",
          fullResolutionKey: "runs/run-primary/milestones/2.jpg",
        },
      ],
      notes: [
        { note: "Screenshot shows the hidden continue button." },
        { note: "Confirmed again during replay review." },
      ],
    });

    await expect(
      asOtherResearcher.query(analysisApi.getIssueCluster, {
        issueId: fixtures.clusterPrimaryId,
      }),
    ).rejects.toThrowError("Study not found.");
  });
});

type TestInstance = ReturnType<typeof createTest>;

async function seedAnalysisFixtures(t: TestInstance, orgId: string) {
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
    [{ key: "digital_confidence", value: -0.55 }],
  );
  const secondaryVariantId = await insertPersonaVariant(
    t,
    studyId,
    packId,
    protoPersonaBetaId,
    [{ key: "digital_confidence", value: 0.45 }],
  );
  const primaryRunId = await insertRun(t, {
    studyId,
    protoPersonaId: protoPersonaAlphaId,
    personaVariantId: primaryVariantId,
    status: "hard_fail",
    finalUrl: "https://example.com/checkout/address",
    milestoneKeys: ["runs/run-primary/milestones/2.jpg"],
    summaryKey: encodeRunSummaryKey(
      makeRunSummary("hard_fail", {
        outcomeClassification: "failure",
        failureSummary: "The shopper got stuck because the continue button never appeared.",
        failurePoint: "Shipping address step",
        lastSuccessfulState: "Cart review completed successfully.",
        blockingText: "Continue button missing from the address step.",
        representativeQuote:
          "I could not figure out how to continue from the address step.",
      }),
    ),
  });
  const secondaryRunId = await insertRun(t, {
    studyId,
    protoPersonaId: protoPersonaBetaId,
    personaVariantId: secondaryVariantId,
    status: "soft_fail",
    finalUrl: "https://example.com/checkout/payment",
    milestoneKeys: ["runs/run-secondary/milestones/3.jpg"],
    summaryKey: encodeRunSummaryKey(
      makeRunSummary("soft_fail", {
        outcomeClassification: "failure",
        failureSummary: "The shopper hesitated on payment because total cost information was unclear.",
        failurePoint: "Payment step",
        lastSuccessfulState: "Address information was saved.",
        blockingText: "Tax and shipping changed late in the flow.",
        representativeQuote: "I was not sure why the total changed on payment.",
      }),
    ),
  });
  const clusterPrimaryId = await insertIssueCluster(t, {
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
  const clusterSecondaryId = await insertIssueCluster(t, {
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

  await insertReport(t, studyId, [clusterSecondaryId, clusterPrimaryId]);
  await insertNote(
    t,
    clusterPrimaryId,
    "Screenshot shows the hidden continue button.",
    "analyst-a",
    1_700_000_000_000,
  );
  await insertNote(
    t,
    clusterPrimaryId,
    "Confirmed again during replay review.",
    "analyst-b",
    1_700_000_000_100,
  );

  return {
    studyId,
    protoPersonaAlphaId,
    protoPersonaBetaId,
    primaryRunId,
    clusterPrimaryId,
    clusterSecondaryId,
  };
}

function makeRunSummary(
  status: RunSummary["sourceRunStatus"],
  overrides: Partial<RunSummary> = {},
): RunSummary {
  return {
    summaryVersion: 1,
    sourceRunStatus: status,
    outcomeClassification: "failure",
    failureSummary: "The run hit friction.",
    failurePoint: "Checkout step",
    lastSuccessfulState: "Cart review completed.",
    blockingText: "The next step was unclear.",
    frustrationMarkers: ["friction"],
    selfReportedConfidence: 0.3,
    representativeQuote: "Something felt confusing.",
    includeInClustering: true,
    ...overrides,
  };
}

async function insertPack(t: TestInstance, orgId: string) {
  return await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      orgId,
      name: `Pack for ${orgId}`,
      description: "Pack for analysis query tests",
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
  personaPackId?: Id<"personaPacks">,
) {
  const packId = personaPackId ?? (await insertPack(t, orgId));

  return await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId,
      personaPackId: packId,
      name: "Analysis query fixture study",
      description: "Fixture study for analysis queries",
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
  axisValues: Array<{ key: string; value: number }>,
) {
  return await t.run(async (ctx) =>
    ctx.db.insert("personaVariants", {
      studyId,
      personaPackId,
      protoPersonaId,
      axisValues,
      edgeScore: 0.5,
      tensionSeed: "Wants reassurance before payment.",
      firstPersonBio: "Fixture persona bio",
      behaviorRules: ["Checks totals carefully."],
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
    | "summaryKey"
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
      summaryKey: run.summaryKey,
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

async function insertNote(
  t: TestInstance,
  issueClusterId: Id<"issueClusters">,
  note: string,
  authorId: string,
  createdAt: number,
) {
  await t.run(async (ctx) =>
    ctx.db.insert("issueClusterNotes", {
      issueClusterId,
      note,
      authorId,
      createdAt,
    }),
  );
}
