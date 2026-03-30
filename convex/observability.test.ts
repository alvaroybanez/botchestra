import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { api, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";
import { workflow } from "./workflow";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./credentials.ts": () => import("./credentials"),
  "./costControls.ts": () => import("./costControls"),
  "./heartbeatMonitor.ts": () => import("./heartbeatMonitor"),
  "./observability.ts": () => import("./observability"),
  "./runProgress.ts": () => import("./runProgress"),
  "./runs.ts": () => import("./runs"),
  "./schema.ts": () => import("./schema"),
  "./settings.ts": () => import("./settings"),
  "./studies.ts": () => import("./studies"),
  "./studyLifecycleWorkflow.ts": () => import("./studyLifecycleWorkflow"),
  "./waveDispatch.ts": () => import("./waveDispatch"),
  "./workflow.ts": () => import("./workflow"),
};

const createTest = () => {
  return convexTest(schema, modules);
};

const adminIdentity = {
  subject: "admin-subject",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Admin One",
  email: "admin.one@example.com",
  role: "admin",
};

const researcherIdentity = {
  subject: "researcher-subject",
  tokenIdentifier: "org_1",
  issuer: "https://factory.test",
  name: "Researcher One",
  email: "researcher.one@example.com",
  role: "researcher",
};

const otherAdminIdentity = {
  subject: "admin-subject-2",
  tokenIdentifier: "org_2",
  issuer: "https://factory.test",
  name: "Admin Two",
  email: "admin.two@example.com",
  role: "admin",
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

beforeEach(() => {
  process.env.CREDENTIAL_ENCRYPTION_SECRET = "observability-test-secret";
  process.env.CALLBACK_SIGNING_SECRET = "observability-callback-secret";
  process.env.CONVEX_SITE_URL = "https://botchestra.example.com";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          finalOutcome: "SUCCESS",
          stepCount: 4,
          durationSec: 12,
          frustrationCount: 0,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    ),
  );
});

afterEach(() => {
  delete process.env.CREDENTIAL_ENCRYPTION_SECRET;
  delete process.env.CALLBACK_SIGNING_SECRET;
  delete process.env.CONVEX_SITE_URL;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("observability audit trail", () => {
  it("records launches, cancellations, report publications, settings changes, and credential operations", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);
    const asResearcher = t.withIdentity(researcherIdentity);

    const launchStudyId = await insertStudy(t, {
      orgId: adminIdentity.tokenIdentifier,
      status: "ready",
      launchRequestedBy: undefined,
    });
    await seedAcceptedVariants(t, launchStudyId, 3);

    const workflowStartSpy = vi
      .spyOn(workflow, "start")
      .mockResolvedValue("workflow_1" as never);

    await asResearcher.mutation(api.studies.launchStudy, {
      studyId: launchStudyId,
    });
    await asResearcher.mutation(api.studies.cancelStudy, {
      studyId: launchStudyId,
      reason: "Stop after reproducing the blocker.",
    });

    const reportStudyId = await insertStudy(t, {
      orgId: adminIdentity.tokenIdentifier,
      status: "completed",
      launchRequestedBy: researcherIdentity.tokenIdentifier,
      launchedAt: Date.now() - 5_000,
      completedAt: Date.now() - 1_000,
    });
    const htmlReportStorageId = await t.action(async (ctx) => {
      return await ctx.storage.store(
        new Blob(["<html><body>report</body></html>"], {
          type: "text/html; charset=utf-8",
        }),
      );
    });
    const jsonReportStorageId = await t.action(async (ctx) => {
      return await ctx.storage.store(
        new Blob([JSON.stringify({ ok: true })], {
          type: "application/json",
        }),
      );
    });
    await t.mutation(internal.studyLifecycleWorkflow.insertStudyLifecycleReport, {
      report: buildReportRecord(reportStudyId),
      htmlReportStorageId,
      jsonReportStorageId,
    });

    await asAdmin.mutation((api as any).settings.updateSettings, {
      patch: {
        maxConcurrency: 6,
        domainAllowlist: ["example.com"],
      },
    });

    const credential = await asAdmin.mutation((api as any).credentials.createCredential, {
      credential: {
        ref: "cred_checkout",
        label: "Checkout credential",
        description: "Shared staging account",
        payload: [
          { key: "email", value: "shopper@example.com" },
          { key: "password", value: "swordfish" },
        ],
      },
    });

    await asAdmin.mutation((api as any).credentials.updateCredential, {
      credentialId: credential._id,
      patch: {
        label: "Checkout credential (rotated)",
        payload: [
          { key: "email", value: "shopper+2@example.com" },
          { key: "password", value: "hunter2" },
        ],
      },
    });

    await asAdmin.mutation((api as any).credentials.deleteCredential, {
      credentialId: credential._id,
    });

    const auditEvents = await asAdmin.query((api as any).observability.listAuditEvents, {
      limit: 20,
    });

    expect(workflowStartSpy).toHaveBeenCalledTimes(1);
    expect(auditEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorId: researcherIdentity.tokenIdentifier,
          eventType: "study.launched",
          studyId: launchStudyId,
        }),
        expect.objectContaining({
          actorId: researcherIdentity.tokenIdentifier,
          eventType: "study.cancelled",
          studyId: launchStudyId,
          reason: "Stop after reproducing the blocker.",
        }),
        expect.objectContaining({
          actorId: researcherIdentity.tokenIdentifier,
          eventType: "report.published",
          studyId: reportStudyId,
        }),
        expect.objectContaining({
          actorId: adminIdentity.tokenIdentifier,
          eventType: "settings.updated",
          resourceType: "settings",
          resourceId: adminIdentity.tokenIdentifier,
        }),
        expect.objectContaining({
          actorId: adminIdentity.tokenIdentifier,
          eventType: "credential.created",
          resourceType: "credential",
          resourceId: "cred_checkout",
        }),
        expect.objectContaining({
          actorId: adminIdentity.tokenIdentifier,
          eventType: "credential.updated",
          resourceType: "credential",
          resourceId: "cred_checkout",
        }),
        expect.objectContaining({
          actorId: adminIdentity.tokenIdentifier,
          eventType: "credential.deleted",
          resourceType: "credential",
          resourceId: "cred_checkout",
        }),
      ]),
    );
  });

  it("filters the audit trail by actor, study, event type, and date range", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);
    const studyId = await insertStudy(t, {
      orgId: adminIdentity.tokenIdentifier,
      status: "completed",
    });
    const otherStudyId = await insertStudy(t, {
      orgId: adminIdentity.tokenIdentifier,
      status: "completed",
    });
    const now = Date.now();

    await t.run(async (ctx) => {
      await ctx.db.insert("auditEvents", {
        orgId: adminIdentity.tokenIdentifier,
        actorId: adminIdentity.tokenIdentifier,
        eventType: "settings.updated",
        resourceType: "settings",
        resourceId: adminIdentity.tokenIdentifier,
        createdAt: now - 4_000,
      });
      await ctx.db.insert("auditEvents", {
        orgId: adminIdentity.tokenIdentifier,
        actorId: researcherIdentity.tokenIdentifier,
        eventType: "study.launched",
        studyId,
        resourceType: "study",
        resourceId: String(studyId),
        createdAt: now - 3_000,
      });
      await ctx.db.insert("auditEvents", {
        orgId: adminIdentity.tokenIdentifier,
        actorId: researcherIdentity.tokenIdentifier,
        eventType: "study.cancelled",
        studyId,
        resourceType: "study",
        resourceId: String(studyId),
        createdAt: now - 2_000,
      });
      await ctx.db.insert("auditEvents", {
        orgId: adminIdentity.tokenIdentifier,
        actorId: researcherIdentity.tokenIdentifier,
        eventType: "study.launched",
        studyId: otherStudyId,
        resourceType: "study",
        resourceId: String(otherStudyId),
        createdAt: now - 1_000,
      });
      await ctx.db.insert("auditEvents", {
        orgId: otherAdminIdentity.tokenIdentifier,
        actorId: otherAdminIdentity.tokenIdentifier,
        eventType: "settings.updated",
        resourceType: "settings",
        resourceId: otherAdminIdentity.tokenIdentifier,
        createdAt: now - 500,
      });
    });

    const filtered = await asAdmin.query((api as any).observability.listAuditEvents, {
      actorId: researcherIdentity.tokenIdentifier,
      studyId,
      eventType: "study.cancelled",
      startAt: now - 2_500,
      endAt: now - 1_500,
      limit: 10,
    });

    expect(filtered).toEqual([
      expect.objectContaining({
        actorId: researcherIdentity.tokenIdentifier,
        studyId,
        eventType: "study.cancelled",
      }),
    ]);
  });
});

describe("observability metrics", () => {
  it("writes metrics for run completion and study completion", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);

    const runningStudyId = await insertStudy(t, {
      orgId: adminIdentity.tokenIdentifier,
      status: "running",
    });
    const runningRunId = await insertRun(t, runningStudyId, {
      status: "running",
      startedAt: Date.now() - 12_000,
    });

    const analyzingStudyId = await insertStudy(t, {
      orgId: adminIdentity.tokenIdentifier,
      status: "analyzing",
    });

    await t.mutation(internal.runs.settleRunFromCallback, {
      runId: runningRunId,
      nextStatus: "success",
      patch: {
        endedAt: Date.now(),
        durationSec: 12,
        stepCount: 6,
        finalOutcome: "SUCCESS",
        frustrationCount: 1,
      },
    });
    await t.mutation(internal.studies.transitionStudyState, {
      studyId: analyzingStudyId,
      nextStatus: "completed",
    });

    const metrics = await asAdmin.query((api as any).observability.listMetrics, {
      limit: 20,
    });

    expect(metrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studyId: runningStudyId,
          runId: runningRunId,
          metricType: "run.completed",
          value: 1,
          unit: "count",
          status: "success",
        }),
        expect.objectContaining({
          studyId: analyzingStudyId,
          metricType: "study.completed",
          value: 1,
          unit: "count",
          status: "completed",
        }),
      ]),
    );
  });
});

describe("admin diagnostics overview", () => {
  it("aggregates live metrics, per-study usage, and infra error codes for admins", async () => {
    const t = createTest();
    const asAdmin = t.withIdentity(adminIdentity);
    const now = Date.now();

    const runningStudyId = await insertStudy(t, {
      orgId: adminIdentity.tokenIdentifier,
      status: "running",
    });
    const completedStudyId = await insertStudy(t, {
      orgId: adminIdentity.tokenIdentifier,
      status: "completed",
      completedAt: now - 500,
    });

    await insertRun(t, runningStudyId, {
      status: "success",
      durationSec: 45,
    });
    await insertRun(t, runningStudyId, {
      status: "infra_error",
      durationSec: 30,
      errorCode: "NAVIGATION_TIMEOUT",
    });
    await insertRun(t, completedStudyId, {
      status: "hard_fail",
      durationSec: 20,
    });

    await t.run(async (ctx) => {
      await ctx.db.insert("metrics", {
        orgId: adminIdentity.tokenIdentifier,
        studyId: runningStudyId,
        metricType: "wave.dispatched_runs",
        value: 2,
        unit: "count",
        recordedAt: now - 2_000,
      });
      await ctx.db.insert("metrics", {
        orgId: adminIdentity.tokenIdentifier,
        studyId: runningStudyId,
        metricType: "ai.tokens.input",
        value: 1_200,
        unit: "tokens",
        recordedAt: now - 1_800,
      });
      await ctx.db.insert("metrics", {
        orgId: adminIdentity.tokenIdentifier,
        studyId: runningStudyId,
        metricType: "ai.tokens.output",
        value: 300,
        unit: "tokens",
        recordedAt: now - 1_600,
      });
      await ctx.db.insert("metrics", {
        orgId: adminIdentity.tokenIdentifier,
        studyId: runningStudyId,
        metricType: "run.completed",
        value: 1,
        unit: "count",
        status: "infra_error",
        errorCode: "NAVIGATION_TIMEOUT",
        recordedAt: now - 1_400,
      });
      await ctx.db.insert("metrics", {
        orgId: adminIdentity.tokenIdentifier,
        studyId: completedStudyId,
        metricType: "study.completed",
        value: 1,
        unit: "count",
        status: "completed",
        recordedAt: now - 1_200,
      });
      await ctx.db.insert("metrics", {
        orgId: adminIdentity.tokenIdentifier,
        studyId: completedStudyId,
        metricType: "run.completed",
        value: 1,
        unit: "count",
        status: "hard_fail",
        recordedAt: now - 1_000,
      });
      await ctx.db.insert("metrics", {
        orgId: otherAdminIdentity.tokenIdentifier,
        studyId: completedStudyId,
        metricType: "ai.tokens.input",
        value: 9_999,
        unit: "tokens",
        recordedAt: now - 900,
      });
    });

    const overview = await asAdmin.query((api as any).observability.getAdminDiagnosticsOverview, {});

    expect(overview.liveStudyCounts).toMatchObject({
      running: 1,
      completed: 1,
    });
    expect(overview.historicalMetrics).toMatchObject({
      dispatchedRuns: 2,
      completedRuns: 2,
      completedStudies: 1,
      totalTokenUsage: 1_500,
      totalBrowserSeconds: 95,
      recentInfraErrors: 1,
    });
    expect(overview.infraErrorCodes).toEqual([
      {
        code: "NAVIGATION_TIMEOUT",
        count: 1,
      },
    ]);
    expect(overview.studyUsage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studyId: runningStudyId,
          studyName: "Observability fixture study",
          status: "running",
          tokenUsage: 1_500,
          browserSecondsUsed: 75,
          completedRunCount: 2,
          infraErrorCount: 1,
          latestInfraErrorCode: "NAVIGATION_TIMEOUT",
        }),
        expect.objectContaining({
          studyId: completedStudyId,
          status: "completed",
          tokenUsage: 0,
          browserSecondsUsed: 20,
          completedRunCount: 1,
          infraErrorCount: 0,
        }),
      ]),
    );
    expect(overview.recentMetrics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          studyId: runningStudyId,
          studyName: "Observability fixture study",
          metricType: "run.completed",
          errorCode: "NAVIGATION_TIMEOUT",
        }),
      ]),
    );
  });

  it("blocks researchers from querying the admin diagnostics overview", async () => {
    const t = createTest();
    const asResearcher = t.withIdentity(researcherIdentity);

    await expect(
      asResearcher.query((api as any).observability.getAdminDiagnosticsOverview, {}),
    ).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("observability error normalization", () => {
  it("stores standardized infra error codes for worker, dispatch, and stale-heartbeat failures", async () => {
    const t = createTest();

    const navigationStudyId = await insertStudy(t, {
      orgId: adminIdentity.tokenIdentifier,
      status: "running",
    });
    const navigationRunId = await insertRun(t, navigationStudyId, {
      status: "running",
      startedAt: Date.now() - 5_000,
    });

    await t.mutation(internal.runs.settleRunFromCallback, {
      runId: navigationRunId,
      nextStatus: "infra_error",
      patch: {
        endedAt: Date.now(),
        finalOutcome: "FAILED",
        errorCode: "BROWSER_ERROR",
        errorMessage: "Navigation timeout while waiting for checkout",
      },
    });

    const dispatchStudyId = await insertStudy(t, {
      orgId: adminIdentity.tokenIdentifier,
      status: "running",
    });
    const dispatchRunId = await insertRun(t, dispatchStudyId, {
      status: "dispatching",
    });

    await t.mutation(internal.waveDispatch.handleRunDispatchComplete, {
      workId: "work_dispatch" as never,
      context: {
        studyId: dispatchStudyId,
        runId: dispatchRunId,
      },
      result: {
        kind: "failed",
        error: "Worker never started",
      },
    });

    const staleStudyId = await insertStudy(t, {
      orgId: adminIdentity.tokenIdentifier,
      status: "running",
    });
    const staleRunId = await insertRun(t, staleStudyId, {
      status: "running",
      startedAt: 1_000,
      lastHeartbeatAt: 2_000,
    });

    await t.mutation(internal.heartbeatMonitor.monitorStaleRuns, {
      now: 70_000,
    });

    const infraRuns = await t.run(async (ctx) =>
      ctx.db
        .query("runs")
        .withIndex("by_status", (query) => query.eq("status", "infra_error"))
        .collect(),
    );

    expect(infraRuns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          _id: navigationRunId,
          errorCode: "NAVIGATION_TIMEOUT",
        }),
        expect.objectContaining({
          _id: dispatchRunId,
          errorCode: "CONTEXT_CREATION_FAILED",
        }),
        expect.objectContaining({
          _id: staleRunId,
          errorCode: "CALLBACK_REJECTED",
        }),
      ]),
    );
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
    orgId: string;
    status: StudyStatus;
    runBudget?: number;
    activeConcurrency?: number;
    launchRequestedBy?: string | undefined;
    launchedAt?: number | undefined;
    completedAt?: number | undefined;
  },
) {
  const now = Date.now();
  const configId = await t.run(async (ctx) =>
    ctx.db.insert("personaConfigs", {
      orgId: overrides.orgId,
      name: `Config for ${overrides.orgId}`,
      description: "Config used for observability tests",
      context: "Checkout flows",
      sharedAxes: [],
      version: 2,
      status: "published",
      createdBy: overrides.orgId,
      updatedBy: overrides.orgId,
      createdAt: now,
      updatedAt: now,
    }),
  );

  return await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId: overrides.orgId,
      personaConfigId: configId,
      name: "Observability fixture study",
      taskSpec: sampleTaskSpec,
      runBudget: overrides.runBudget ?? 3,
      activeConcurrency: overrides.activeConcurrency ?? 2,
      status: overrides.status,
      ...(overrides.launchRequestedBy !== undefined
        ? { launchRequestedBy: overrides.launchRequestedBy }
        : {}),
      ...(overrides.launchedAt !== undefined ? { launchedAt: overrides.launchedAt } : {}),
      ...(overrides.completedAt !== undefined
        ? { completedAt: overrides.completedAt }
        : {}),
      createdBy: overrides.orgId,
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

  const syntheticUserId = await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      configId: study.personaConfigId,
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
        personaConfigId: study.personaConfigId,
        syntheticUserId,
        axisValues: [],
        edgeScore: 0.6,
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

async function insertRun(
  t: TestInstance,
  studyId: Id<"studies">,
  overrides: Partial<Doc<"runs">>,
) {
  const study = await t.run(async (ctx) => ctx.db.get(studyId));

  if (study === null) {
    throw new Error(`Study ${studyId} not found.`);
  }

  const syntheticUserId = await t.run(async (ctx) =>
    ctx.db.insert("syntheticUsers", {
      configId: study.personaConfigId,
      name: `Proto ${Date.now()}`,
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
      personaConfigId: study.personaConfigId,
      syntheticUserId,
      axisValues: [],
      edgeScore: 0.5,
      tensionSeed: "Observability test tension seed",
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

function buildReportRecord(studyId: Id<"studies">) {
  return {
    studyId,
    headlineMetrics: {
      completionRate: 0.75,
      abandonmentRate: 0.1,
      medianSteps: 6,
      medianDurationSec: 180,
    },
    issueClusterIds: [] as Id<"issueClusters">[],
    segmentBreakdownKey: `study-reports/${studyId}/segment-breakdown.json`,
    limitations: [
      "Findings are synthetic and directional.",
      "Agents may miss or invent behavior relative to humans.",
      "Human follow-up is recommended for high-stakes decisions.",
    ],
    htmlReportKey: `study-reports/${studyId}/report.html`,
    jsonReportKey: `study-reports/${studyId}/report.json`,
    createdAt: Date.now(),
  };
}
