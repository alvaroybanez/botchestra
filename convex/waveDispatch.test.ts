import { register as registerWorkpool } from "@convex-dev/workpool/test";
import type { WorkId } from "@convex-dev/workpool";
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./costControls.ts": () => import("./costControls"),
  "./observability.ts": () => import("./observability"),
  "./schema.ts": () => import("./schema"),
  "./runProgress.ts": () => import("./runProgress"),
  "./runs.ts": () => import("./runs"),
  "./studies.ts": () => import("./studies"),
  "./userManagement.ts": () => import("./userManagement"),
  "./waveDispatch.ts": () => import("./waveDispatch"),
};

const createTest = () => {
  const t = convexTest(schema, modules);
  registerWorkpool(t, "browserPool");
  return t;
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

describe("waveDispatch.dispatchStudyWave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispatches only up to activeConcurrency in the initial wave", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, {
      runBudget: 50,
      activeConcurrency: 3,
      status: "queued",
    });
    await seedAcceptedVariants(t, studyId, 50);

    const result = await t.mutation(internal.waveDispatch.dispatchStudyWave, {
      studyId,
    });
    const study = await getStudyDoc(t, studyId);
    const runs = await listRuns(t, studyId);
    const metrics = await t.run(async (ctx) =>
      ctx.db
        .query("metrics")
        .withIndex("by_studyId_and_recordedAt", (q) => q.eq("studyId", studyId))
        .collect(),
    );

    expect(result.createdRunCount).toBe(50);
    expect(result.dispatchedRunCount).toBe(3);
    expect(result.workIds).toHaveLength(3);
    expect(study?.status).toBe("running");
    expect(countRunsWithStatuses(runs, ["dispatching", "running"])).toBe(3);
    expect(countRunsWithStatuses(runs, ["queued"])).toBe(47);
    expect(metrics).toEqual([
      expect.objectContaining({
        studyId,
        metricType: "wave.dispatched_runs",
        value: 3,
        unit: "count",
      }),
    ]);
  });

  it("eventually dispatches every run without exceeding the concurrency limit", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, {
      runBudget: 50,
      activeConcurrency: 3,
      status: "queued",
    });
    await seedAcceptedVariants(t, studyId, 50);

    await t.mutation(internal.waveDispatch.dispatchStudyWave, { studyId });

    while (true) {
      const runs = await listRuns(t, studyId);
      const activeRuns = runs.filter((run) =>
        ["dispatching", "running"].includes(run.status),
      );
      const queuedRuns = runs.filter((run) => run.status === "queued");
      const terminalRuns = runs.filter(isTerminalRun);

      expect(activeRuns.length).toBeLessThanOrEqual(3);

      if (terminalRuns.length === 50) {
        expect(queuedRuns).toHaveLength(0);
        break;
      }

      const nextRun = activeRuns[0];

      if (!nextRun) {
        throw new Error("Expected at least one active run before the study completed.");
      }

      if (nextRun.status === "dispatching") {
        await t.mutation(internal.runs.transitionRunState, {
          runId: nextRun._id,
          nextStatus: "running",
        });
      }

      await t.mutation(internal.runs.settleRunFromCallback, {
        runId: nextRun._id,
        nextStatus: "success",
        patch: {
          endedAt: Date.now(),
          durationSec: 12,
          stepCount: 6,
          finalOutcome: "SUCCESS",
          frustrationCount: 0,
        },
      });

      await t.mutation(internal.waveDispatch.handleRunDispatchComplete, {
        workId: `work-${nextRun._id}` as WorkId,
        context: {
          studyId,
          runId: nextRun._id,
        },
        result: {
          kind: "success",
          returnValue: {
            ok: true,
            finalOutcome: "SUCCESS",
            stepCount: 6,
            durationSec: 12,
            frustrationCount: 0,
          },
        },
      });
    }

    const finalRuns = await listRuns(t, studyId);
    expect(finalRuns).toHaveLength(50);
    expect(finalRuns.every((run) => run.status === "success")).toBe(true);
  });

  it("enforces the platform hard cap of 30 even when study concurrency is higher", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, {
      runBudget: 50,
      activeConcurrency: 40,
      status: "queued",
    });
    await seedAcceptedVariants(t, studyId, 50);

    const result = await t.mutation(internal.waveDispatch.dispatchStudyWave, {
      studyId,
    });
    const runs = await listRuns(t, studyId);

    expect(result.createdRunCount).toBe(50);
    expect(result.dispatchedRunCount).toBe(30);
    expect(result.workIds).toHaveLength(30);
    expect(countRunsWithStatuses(runs, ["dispatching", "running"])).toBe(30);
    expect(countRunsWithStatuses(runs, ["queued"])).toBe(20);
  });

  it("dispatches queued replay runs while the study is replaying", async () => {
    const t = createTest();
    const studyId = await insertStudy(t, {
      runBudget: 50,
      activeConcurrency: 2,
      status: "replaying",
    });
    await seedAcceptedVariants(t, studyId, 50);
    await seedQueuedRuns(t, studyId, 50);

    const result = await t.mutation(internal.waveDispatch.dispatchStudyWave, {
      studyId,
    });
    const runs = await listRuns(t, studyId);

    expect(result.createdRunCount).toBe(0);
    expect(result.dispatchedRunCount).toBe(2);
    expect(countRunsWithStatuses(runs, ["dispatching", "running"])).toBe(2);
    expect(countRunsWithStatuses(runs, ["queued"])).toBe(48);
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
    runBudget: number;
    activeConcurrency: number;
    status: StudyStatus;
  },
) {
  const now = Date.now();
  const configId = await t.run(async (ctx) =>
    ctx.db.insert("personaConfigs", {
      orgId: "org_1",
      name: "Checkout config",
      description: "Config used for wave dispatch tests",
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

  return await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId: "org_1",
      personaConfigId: configId,
      name: "Checkout study",
      taskSpec: sampleTaskSpec,
      runBudget: overrides.runBudget,
      activeConcurrency: overrides.activeConcurrency,
      status: overrides.status,
      createdBy: "user_1",
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
  const study = await getStudyDoc(t, studyId);

  if (!study) {
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

async function seedQueuedRuns(
  t: TestInstance,
  studyId: Id<"studies">,
  count: number,
) {
  const study = await getStudyDoc(t, studyId);

  if (!study) {
    throw new Error(`Study ${studyId} not found.`);
  }

  const syntheticUser = await t.run(async (ctx) =>
    ctx.db
      .query("syntheticUsers")
      .withIndex("by_configId", (q) => q.eq("configId", study.personaConfigId))
      .unique(),
  );
  const variants = await t.run(async (ctx) =>
    ctx.db
      .query("personaVariants")
      .withIndex("by_studyId", (q) => q.eq("studyId", studyId))
      .take(count),
  );

  if (syntheticUser === null || variants.length < count) {
    throw new Error("Missing synthetic user or accepted variants for queued runs.");
  }

  const originalRunId = await t.run(async (ctx) =>
    ctx.db.insert("runs", {
      studyId,
      personaVariantId: variants[0]!._id,
      syntheticUserId: syntheticUser._id,
      status: "success",
      replayOfRunId: undefined,
      frustrationCount: 0,
      milestoneKeys: [],
    }),
  );

  for (const variant of variants) {
    await t.run(async (ctx) =>
      ctx.db.insert("runs", {
        studyId,
        personaVariantId: variant._id,
        syntheticUserId: syntheticUser._id,
        status: "queued",
        replayOfRunId: originalRunId,
        frustrationCount: 0,
        milestoneKeys: [],
      }),
    );
  }
}

async function listRuns(t: TestInstance, studyId: Id<"studies">) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("runs")
      .withIndex("by_studyId", (q) => q.eq("studyId", studyId))
      .collect(),
  );
}

async function getStudyDoc(
  t: TestInstance,
  studyId: Id<"studies">,
): Promise<Doc<"studies"> | null> {
  return await t.run(async (ctx) => (await ctx.db.get(studyId)) as Doc<"studies"> | null);
}

function countRunsWithStatuses(
  runs: Array<Doc<"runs">>,
  statuses: Array<Doc<"runs">["status"]>,
) {
  return runs.filter((run) => statuses.includes(run.status)).length;
}

function isTerminalRun(run: Doc<"runs">) {
  return !["queued", "dispatching", "running"].includes(run.status);
}
