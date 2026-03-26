import { describe, expect, it } from "vitest";
import { convexTest } from "convex-test";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./schema.ts": () => import("./schema"),
  "./runs.ts": () => import("./runs"),
};

const createTest = () => convexTest(schema, modules);

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

describe("runs.transitionRunState", () => {
  it("allows every valid run state transition", async () => {
    const t = createTest();

    const validTransitions: Array<[RunStatus, RunStatus]> = [
      ["queued", "dispatching"],
      ["dispatching", "running"],
      ["running", "success"],
      ["running", "hard_fail"],
      ["running", "soft_fail"],
      ["running", "gave_up"],
      ["running", "timeout"],
      ["running", "blocked_by_guardrail"],
      ["running", "infra_error"],
      ["running", "cancelled"],
      ["dispatching", "infra_error"],
      ["queued", "cancelled"],
    ];

    for (const [currentStatus, nextStatus] of validTransitions) {
      const runId = await insertRun(t, { status: currentStatus });

      const transitionedRun = await t.mutation(internal.runs.transitionRunState, {
        runId,
        nextStatus,
      });

      expect(transitionedRun.status).toBe(nextStatus);

      if (nextStatus === "running") {
        expect(transitionedRun.startedAt).toBeTypeOf("number");
      }

      if (isTerminalStatus(nextStatus)) {
        expect(transitionedRun.endedAt).toBeTypeOf("number");
      }
    }
  });

  it("rejects invalid run state transitions", async () => {
    const t = createTest();

    const invalidTransitions: Array<[RunStatus, RunStatus]> = [
      ["success", "running"],
      ["cancelled", "queued"],
      ["hard_fail", "running"],
      ["queued", "success"],
      ["infra_error", "running"],
      ["dispatching", "success"],
    ];

    for (const [currentStatus, nextStatus] of invalidTransitions) {
      const runId = await insertRun(t, { status: currentStatus });

      await expect(
        t.mutation(internal.runs.transitionRunState, {
          runId,
          nextStatus,
        }),
      ).rejects.toThrow(/invalid/i);
    }
  });

  it("requires dispatching before running", async () => {
    const t = createTest();
    const runId = await insertRun(t, { status: "queued" });

    await expect(
      t.mutation(internal.runs.transitionRunState, {
        runId,
        nextStatus: "running",
      }),
    ).rejects.toThrow(/invalid/i);

    const dispatchingRun = await t.mutation(internal.runs.transitionRunState, {
      runId,
      nextStatus: "dispatching",
    });

    expect(dispatchingRun.status).toBe("dispatching");

    const runningRun = await t.mutation(internal.runs.transitionRunState, {
      runId,
      nextStatus: "running",
    });

    expect(runningRun.status).toBe("running");
    expect(runningRun.startedAt).toBeTypeOf("number");
  });
});

describe("runs.settleRunFromCallback", () => {
  it("treats duplicate completion callbacks as idempotent", async () => {
    const t = createTest();
    const runId = await insertRun(t, {
      status: "running",
      startedAt: 1_000,
      workerSessionId: "worker-session-1",
    });

    const firstCompletion = await t.mutation(internal.runs.settleRunFromCallback, {
      runId,
      nextStatus: "success",
      patch: {
        endedAt: 2_000,
        durationSec: 120,
        stepCount: 8,
        finalUrl: "https://example.com/confirmation",
        finalOutcome: "order_confirmed",
        frustrationCount: 1,
        selfReport: {
          perceivedSuccess: true,
          hardestPart: "Choosing a size",
          confusion: "Tax total changed late in the flow",
          confidence: 0.9,
          suggestedChange: "Show shipping costs earlier",
        },
        milestoneKeys: ["runs/run-1/milestones/01.jpg"],
        artifactManifestKey: "runs/run-1/manifest.json",
        summaryKey: "runs/run-1/summary.json",
        workerSessionId: "worker-session-1",
      },
    });

    const duplicateCompletion = await t.mutation(
      internal.runs.settleRunFromCallback,
      {
        runId,
        nextStatus: "soft_fail",
        patch: {
          endedAt: 5_000,
          durationSec: 999,
          stepCount: 99,
          finalUrl: "https://example.com/changed",
          finalOutcome: "different_outcome",
          frustrationCount: 4,
          milestoneKeys: ["runs/run-1/milestones/changed.jpg"],
          artifactManifestKey: "runs/run-1/changed-manifest.json",
          summaryKey: "runs/run-1/changed-summary.json",
          errorCode: "SHOULD_NOT_APPLY",
        },
      },
    );

    expect(duplicateCompletion).toEqual(firstCompletion);

    const persistedRun = await getRunDoc(t, runId);
    expect(persistedRun).toEqual(firstCompletion);
  });

  it("ignores late callbacks on cancelled runs", async () => {
    const t = createTest();
    const runId = await insertRun(t, {
      status: "cancelled",
      milestoneKeys: ["runs/run-2/milestones/original.jpg"],
      frustrationCount: 2,
    });
    const beforeLateCallback = await getRunDoc(t, runId);

    const lateCallbackResult = await t.mutation(
      internal.runs.settleRunFromCallback,
      {
        runId,
        nextStatus: "success",
        patch: {
          endedAt: 8_000,
          durationSec: 90,
          stepCount: 12,
          finalUrl: "https://example.com/confirmation",
          finalOutcome: "order_confirmed",
          frustrationCount: 0,
          milestoneKeys: [
            "runs/run-2/milestones/original.jpg",
            "runs/run-2/milestones/new.jpg",
          ],
          artifactManifestKey: "runs/run-2/manifest.json",
        },
      },
    );

    expect(lateCallbackResult).toEqual(beforeLateCallback);
    expect(await getRunDoc(t, runId)).toEqual(beforeLateCallback);
  });
});

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

type TestInstance = ReturnType<typeof createTest>;

async function insertRun(
  t: TestInstance,
  overrides: Partial<Doc<"runs">> = {},
) {
  const now = Date.now();
  const packId = await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      orgId: "org_1",
      name: "Checkout pack",
      description: "Pack used for run lifecycle tests",
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

  const studyId = await t.run(async (ctx) =>
    ctx.db.insert("studies", {
      orgId: "org_1",
      personaPackId: packId,
      name: "Checkout study",
      taskSpec: sampleTaskSpec,
      runBudget: 10,
      activeConcurrency: 3,
      status: "running",
      createdBy: "user_1",
      createdAt: now,
      updatedAt: now,
    }),
  );

  const protoPersonaId = await t.run(async (ctx) =>
    ctx.db.insert("protoPersonas", {
      packId,
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
      personaPackId: packId,
      protoPersonaId,
      axisValues: [],
      edgeScore: 0.5,
      tensionSeed: "Moves quickly through checkout",
      firstPersonBio: "A decisive shopper who expects a smooth purchase flow.",
      behaviorRules: [
        "Moves quickly when the next step is obvious.",
        "Pauses when totals change unexpectedly.",
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
      protoPersonaId,
      status: "queued",
      frustrationCount: 0,
      milestoneKeys: [],
      ...overrides,
    }),
  );
}

async function getRunDoc(
  t: TestInstance,
  runId: Id<"runs">,
): Promise<Doc<"runs"> | null> {
  return await t.run(async (ctx) => (await ctx.db.get(runId)) as Doc<"runs"> | null);
}

function isTerminalStatus(status: RunStatus) {
  return !["queued", "dispatching", "running"].includes(status);
}
