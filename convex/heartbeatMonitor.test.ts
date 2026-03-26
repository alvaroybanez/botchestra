import { register as registerWorkpool } from "@convex-dev/workpool/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import schema from "./schema";

const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./runProgress.ts": () => import("./runProgress"),
  "./costControls.ts": () => import("./costControls"),
  "./runs.ts": () => import("./runs"),
  "./heartbeatMonitor.ts": () => import("./heartbeatMonitor"),
  "./schema.ts": () => import("./schema"),
  "./studies.ts": () => import("./studies"),
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

describe("heartbeatMonitor.monitorStaleRuns", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("marks stale running runs as infra_error", async () => {
    const t = createTest();
    const now = Date.now();
    const runId = await insertRun(t, {
      status: "running",
      startedAt: now - 180_000,
      lastHeartbeatAt: now - 120_000,
    });

    const result = await t.mutation(internal.heartbeatMonitor.monitorStaleRuns, {});
    const run = await getRunDoc(t, runId);

    expect(result.staleRunCount).toBe(1);
    expect(run?.status).toBe("infra_error");
    expect(run?.errorCode).toBe("CALLBACK_REJECTED");
    expect(run?.endedAt).toBeTypeOf("number");
  });

  it("leaves recent heartbeat runs unchanged", async () => {
    const t = createTest();
    const now = Date.now();
    const runningRunId = await insertRun(t, {
      status: "running",
      startedAt: now - 180_000,
      lastHeartbeatAt: now - 10_000,
    });
    const queuedRunId = await insertRun(t, { studyId: (await getRunDoc(t, runningRunId))!.studyId });

    const result = await t.mutation(internal.heartbeatMonitor.monitorStaleRuns, {});
    const runningRun = await getRunDoc(t, runningRunId);
    const queuedRun = await getRunDoc(t, queuedRunId);

    expect(result.staleRunCount).toBe(0);
    expect(runningRun?.status).toBe("running");
    expect(queuedRun?.status).toBe("queued");
  });

  it("frees a slot by dispatching the next queued run after a stale run is failed", async () => {
    const t = createTest();
    const now = Date.now();
    const staleRunId = await insertRun(t, {
      status: "running",
      startedAt: now - 180_000,
      lastHeartbeatAt: now - 120_000,
    });
    const staleRun = await getRunDoc(t, staleRunId);
    const queuedRunId = await insertRun(t, { studyId: staleRun!.studyId });

    const result = await t.mutation(internal.heartbeatMonitor.monitorStaleRuns, {});
    const nextQueuedRun = await getRunDoc(t, queuedRunId);

    expect(result.staleRunCount).toBe(1);
    expect(result.dispatchedRunCount).toBe(1);
    expect(nextQueuedRun?.status).toBe("dispatching");
  });

  it("dispatches queued replay runs after stale replay recovery", async () => {
    const t = createTest();
    const now = Date.now();
    const originalRunId = await insertRun(t, {
      studyStatus: "replaying",
      status: "success",
    });
    const originalRun = await getRunDoc(t, originalRunId);
    const staleRunId = await insertRun(t, {
      studyId: originalRun!.studyId,
      status: "running",
      replayOfRunId: originalRunId,
      startedAt: now - 180_000,
      lastHeartbeatAt: now - 120_000,
    });
    const staleRun = await getRunDoc(t, staleRunId);
    const queuedReplayRunId = await insertRun(t, {
      studyId: staleRun!.studyId,
      replayOfRunId: staleRunId,
    });

    const result = await t.mutation(internal.heartbeatMonitor.monitorStaleRuns, {});
    const queuedReplayRun = await getRunDoc(t, queuedReplayRunId);

    expect(result.staleRunCount).toBe(1);
    expect(result.dispatchedRunCount).toBe(1);
    expect(queuedReplayRun?.status).toBe("dispatching");
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
  overrides: Partial<Doc<"runs">> & {
    studyStatus?: Doc<"studies">["status"];
  } = {},
) {
  const now = Date.now();
  const { studyStatus, ...runOverrides } = overrides;

  if (overrides.studyId !== undefined) {
    const study = await t.run(async (ctx) => ctx.db.get(overrides.studyId!));

    if (study === null) {
      throw new Error("Study not found.");
    }

    const protoPersonaId = await t.run(async (ctx) =>
      ctx.db
        .query("protoPersonas")
        .withIndex("by_packId", (q) => q.eq("packId", study.personaPackId))
        .unique(),
    );

    if (protoPersonaId === null) {
      throw new Error("Proto persona not found.");
    }

    const personaVariantId = await t.run(async (ctx) =>
      ctx.db
        .query("personaVariants")
        .withIndex("by_studyId", (q) => q.eq("studyId", study._id))
        .unique(),
    );

    if (personaVariantId === null) {
      throw new Error("Persona variant not found.");
    }

    return await t.run(async (ctx) =>
      ctx.db.insert("runs", {
        studyId: study._id,
        personaVariantId: personaVariantId._id,
        protoPersonaId: protoPersonaId._id,
        status: "queued",
        frustrationCount: 0,
        milestoneKeys: [],
        ...overrides,
      }),
    );
  }

  const packId = await t.run(async (ctx) =>
    ctx.db.insert("personaPacks", {
      orgId: "org_1",
      name: "Checkout pack",
      description: "Pack used for heartbeat monitor tests",
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
      runBudget: 2,
      activeConcurrency: 1,
      status: studyStatus ?? "running",
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
      ...runOverrides,
    }),
  );
}

async function getRunDoc(
  t: TestInstance,
  runId: Id<"runs">,
): Promise<Doc<"runs"> | null> {
  return await t.run(async (ctx) => (await ctx.db.get(runId)) as Doc<"runs"> | null);
}
