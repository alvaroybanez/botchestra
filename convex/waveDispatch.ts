import { Workpool, vOnCompleteValidator } from "@convex-dev/workpool";
import { v, ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import {
  zCustomAction,
  zCustomMutation,
  zCustomQuery,
  zid,
} from "convex-helpers/server/zod";
import { z } from "zod";

import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  type MutationCtx,
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  ACTIVE_CONCURRENCY_HARD_CAP,
  DEFAULT_STUDY_RUN_BUDGET,
} from "./studies";
import { recordMetric } from "./observability";
import {
  mapCompletionOutcomeToRunStatus,
  mapFailureCodeToRunStatus,
} from "./runProgress";

const zInternalQuery = zCustomQuery(internalQuery, NoOp);
const zInternalMutation = zCustomMutation(internalMutation, NoOp);
const zInternalAction = zCustomAction(internalAction, NoOp);

const dispatchPool = new Workpool(components.browserPool, {
  maxParallelism: ACTIVE_CONCURRENCY_HARD_CAP,
});

const DEFAULT_BROWSER_EXECUTOR_URL = "http://localhost:8787";
const CALLBACK_TOKEN_TTL_MS = 10 * 60 * 1000;
const RUN_DISPATCH_FAILURE_ERROR_CODE = "RUN_DISPATCH_FAILED";

const runDispatchContextValidator = v.object({
  studyId: v.id("studies"),
  runId: v.id("runs"),
});

const workerSuccessResponseSchema = z.object({
  ok: z.literal(true),
  finalOutcome: z.union([z.literal("SUCCESS"), z.literal("ABANDONED")]),
  stepCount: z.number().int().nonnegative(),
  durationSec: z.number().nonnegative(),
  frustrationCount: z.number().int().nonnegative(),
  artifactManifestKey: z.string().optional(),
});

const workerFailureResponseSchema = z.object({
  ok: z.literal(false),
  finalOutcome: z.literal("FAILED"),
  errorCode: z.union([
    z.literal("LEASE_UNAVAILABLE"),
    z.literal("MAX_STEPS_EXCEEDED"),
    z.literal("MAX_DURATION_EXCEEDED"),
    z.literal("GUARDRAIL_VIOLATION"),
    z.literal("BROWSER_ERROR"),
  ]),
  guardrailCode: z.string().optional(),
  message: z.string(),
  stepCount: z.number().int().nonnegative(),
  durationSec: z.number().nonnegative(),
  frustrationCount: z.number().int().nonnegative(),
  artifactManifestKey: z.string().optional(),
});

const workerResponseSchema = z.union([
  workerSuccessResponseSchema,
  workerFailureResponseSchema,
]);

type WorkerResponse = z.infer<typeof workerResponseSchema>;

export const dispatchStudyWave = zInternalMutation({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args) => {
    const study = await getStudyById(ctx, args.studyId);

    if (
      study.status !== "queued" &&
      study.status !== "running" &&
      study.status !== "replaying"
    ) {
      return {
        studyId: args.studyId,
        activeConcurrency: resolveDispatchConcurrency(study.activeConcurrency),
        createdRunCount: 0,
        dispatchedRunCount: 0,
        workIds: [] as string[],
      };
    }

    const createdRunCount = await ensureStudyRuns(ctx, study);
    const workIds = await dispatchAvailableRuns(ctx, study._id);

    return {
      studyId: args.studyId,
      activeConcurrency: resolveDispatchConcurrency(study.activeConcurrency),
      createdRunCount,
      dispatchedRunCount: workIds.length,
      workIds,
    };
  },
});

export const dispatchQueuedRunsForStudy = zInternalMutation({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args) => {
    const study = await getStudyById(ctx, args.studyId);
    const workIds = await dispatchAvailableRuns(ctx, args.studyId);

    return {
      studyId: args.studyId,
      activeConcurrency: resolveDispatchConcurrency(study.activeConcurrency),
      dispatchedRunCount: workIds.length,
      workIds,
    };
  },
});

export const getRunDispatchPayload = zInternalQuery({
  args: {
    runId: zid("runs"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);

    if (run === null) {
      throw new ConvexError("Run not found.");
    }

    const [study, personaVariant] = await Promise.all([
      ctx.db.get(run.studyId),
      ctx.db.get(run.personaVariantId),
    ]);

    if (study === null) {
      throw new ConvexError("Study not found.");
    }

    if (personaVariant === null) {
      throw new ConvexError("Persona variant not found.");
    }

    return {
      runId: run._id,
      runStatus: run.status,
      studyId: study._id,
      studyStatus: study.status,
      taskSpec: study.taskSpec,
      personaVariant: {
        id: personaVariant._id,
        personaPackId: personaVariant.personaPackId,
        protoPersonaId: personaVariant.protoPersonaId,
        axisValues: Object.fromEntries(
          personaVariant.axisValues.map((axisValue) => [
            axisValue.key,
            axisValue.value,
          ]),
        ),
        edgeScore: personaVariant.edgeScore,
        tensionSeed: personaVariant.tensionSeed,
        firstPersonBio: personaVariant.firstPersonBio,
        behaviorRules: personaVariant.behaviorRules,
        coherenceScore: personaVariant.coherenceScore,
        distinctnessScore: personaVariant.distinctnessScore,
        accepted: personaVariant.accepted,
      },
    };
  },
});

export const executeRun = zInternalAction({
  args: {
    runId: zid("runs"),
  },
  handler: async (ctx, args) => {
    const payload = await ctx.runQuery(internal.waveDispatch.getRunDispatchPayload, {
      runId: args.runId,
    });

    if (isClosedRunStatus(payload.runStatus)) {
      return { ok: true, skipped: true as const };
    }

    if (payload.runStatus === "queued") {
      await ctx.runMutation(internal.runs.transitionRunState, {
        runId: args.runId,
        nextStatus: "dispatching",
      });
      await ctx.runMutation(internal.runs.transitionRunState, {
        runId: args.runId,
        nextStatus: "running",
      });
    } else if (payload.runStatus === "dispatching") {
      await ctx.runMutation(internal.runs.transitionRunState, {
        runId: args.runId,
        nextStatus: "running",
      });
    }

    const response = await fetch(`${getBrowserExecutorUrl()}/execute-run`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        runId: payload.runId,
        studyId: payload.studyId,
        personaVariant: payload.personaVariant,
        taskSpec: payload.taskSpec,
        callbackToken: await createCallbackToken(String(payload.runId)),
        callbackBaseUrl: getCallbackBaseUrl(),
      }),
    });

    const responseBody = workerResponseSchema.parse(await response.json());

    await settleRunFromWorkerResponse(ctx, args.runId, responseBody);

    return responseBody;
  },
});

export const handleRunDispatchComplete = internalMutation({
  args: vOnCompleteValidator(runDispatchContextValidator),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.context.runId);

    if (run !== null && !isClosedRunStatus(run.status)) {
      await markRunAsInfraError(ctx, run);
    }

    await dispatchAvailableRuns(ctx, args.context.studyId);

    return null;
  },
});

async function dispatchAvailableRuns(
  ctx: DispatchMutationCtx,
  studyId: Id<"studies">,
) {
  await ctx.runMutation(internal.costControls.evaluateStudyCostControls, {
    studyId,
  });

  const study = await getStudyById(ctx, studyId);

  if (
    !canDispatchQueuedRuns(study.status) ||
    study.cancellationRequestedAt !== undefined
  ) {
    return [] as string[];
  }

  const activeConcurrency = resolveDispatchConcurrency(study.activeConcurrency);
  const activeRunCount = await countActiveRuns(ctx, studyId);
  const availableSlots = Math.max(0, activeConcurrency - activeRunCount);

  if (availableSlots === 0) {
    if (study.status === "queued" && activeRunCount > 0) {
      await ctx.db.patch(study._id, {
        status: "running",
        updatedAt: Date.now(),
      });
    }

    return [] as string[];
  }

  const queuedRuns = await ctx.db
    .query("runs")
    .withIndex("by_studyId_status", (q) =>
      q.eq("studyId", studyId).eq("status", "queued"),
    )
    .take(availableSlots);

  const workIds: string[] = [];
  for (const queuedRun of queuedRuns) {
    await ctx.db.patch(queuedRun._id, {
      status: "dispatching",
    });

    const workId = await dispatchPool.enqueueAction(
      ctx,
      internal.waveDispatch.executeRun,
      { runId: queuedRun._id },
      {
        onComplete: internal.waveDispatch.handleRunDispatchComplete,
        context: {
          studyId,
          runId: queuedRun._id,
        },
      },
    );

    workIds.push(workId);
  }

  if (study.status === "queued" && (activeRunCount > 0 || workIds.length > 0)) {
    await ctx.db.patch(study._id, {
      status: "running",
      updatedAt: Date.now(),
    });
  }

  if (workIds.length > 0) {
    await recordMetric(ctx, {
      studyId,
      metricType: "wave.dispatched_runs",
      value: workIds.length,
      unit: "count",
    });
  }

  return workIds;
}

async function ensureStudyRuns(
  ctx: DispatchMutationCtx,
  study: Doc<"studies">,
) {
  const runBudget = study.runBudget ?? DEFAULT_STUDY_RUN_BUDGET;
  const existingRuns = await ctx.db
    .query("runs")
    .withIndex("by_studyId", (q) => q.eq("studyId", study._id))
    .take(200);

  if (existingRuns.length > 0) {
    return 0;
  }

  const acceptedVariants: Array<Doc<"personaVariants">> = [];
  for await (const personaVariant of ctx.db
    .query("personaVariants")
    .withIndex("by_studyId", (q) => q.eq("studyId", study._id))) {
    if (!personaVariant.accepted) {
      continue;
    }

    acceptedVariants.push(personaVariant);

    if (acceptedVariants.length >= runBudget) {
      break;
    }
  }

  if (acceptedVariants.length < runBudget) {
    throw new ConvexError(
      "Study does not have enough accepted persona variants for dispatch.",
    );
  }

  let createdRunCount = 0;
  for (const personaVariant of acceptedVariants) {
    await ctx.db.insert("runs", {
      studyId: study._id,
      personaVariantId: personaVariant._id,
      protoPersonaId: personaVariant.protoPersonaId,
      status: "queued",
      frustrationCount: 0,
      milestoneKeys: [],
    });
    createdRunCount += 1;
  }

  return createdRunCount;
}

async function countActiveRuns(
  ctx: DispatchMutationCtx,
  studyId: Id<"studies">,
) {
  let count = 0;

  for (const status of ["dispatching", "running"] as const) {
    for await (const _run of ctx.db
      .query("runs")
      .withIndex("by_studyId_status", (q) =>
        q.eq("studyId", studyId).eq("status", status),
      )) {
      count += 1;
    }
  }

  return count;
}

async function settleRunFromWorkerResponse(
  ctx: DispatchActionCtx,
  runId: Id<"runs">,
  response: WorkerResponse,
) {
  if (response.ok) {
    await ctx.runMutation(internal.runs.settleRunFromCallback, {
      runId,
      nextStatus: mapCompletionOutcomeToRunStatus(response.finalOutcome),
      patch: {
        endedAt: Date.now(),
        durationSec: response.durationSec,
        stepCount: response.stepCount,
        finalOutcome: response.finalOutcome,
        frustrationCount: response.frustrationCount,
        ...(response.artifactManifestKey !== undefined
          ? { artifactManifestKey: response.artifactManifestKey }
          : {}),
      },
    });
    return;
  }

  await ctx.runMutation(internal.runs.settleRunFromCallback, {
    runId,
    nextStatus: mapFailureCodeToRunStatus(response.errorCode),
    patch: {
      endedAt: Date.now(),
      durationSec: response.durationSec,
      stepCount: response.stepCount,
      finalOutcome: response.finalOutcome,
      frustrationCount: response.frustrationCount,
      errorCode: response.errorCode,
      ...(response.guardrailCode !== undefined
        ? { guardrailCode: response.guardrailCode }
        : {}),
      errorMessage: response.message,
      ...(response.artifactManifestKey !== undefined
        ? { artifactManifestKey: response.artifactManifestKey }
        : {}),
    },
  });
}

async function markRunAsInfraError(
  ctx: DispatchMutationCtx,
  run: Doc<"runs">,
) {
  if (run.status !== "dispatching" && run.status !== "running") {
    return;
  }

  const now = Date.now();
  await ctx.runMutation(internal.runs.settleRunFromCallback, {
    runId: run._id,
    nextStatus: "infra_error",
    patch: {
      endedAt: now,
      ...(run.startedAt !== undefined
        ? {
            durationSec: Math.max(0, Math.round((now - run.startedAt) / 1000)),
          }
        : {}),
      finalOutcome: "FAILED",
      errorCode: RUN_DISPATCH_FAILURE_ERROR_CODE,
      errorMessage: "Worker dispatch could not create the browser execution context.",
    },
  });
}

async function createCallbackToken(runId: string) {
  const secret = process.env.CALLBACK_SIGNING_SECRET;

  if (!secret) {
    throw new ConvexError("CALLBACK_SIGNING_SECRET is not configured.");
  }

  const payload = JSON.stringify({
    runId,
    exp: Date.now() + CALLBACK_TOKEN_TTL_MS,
  });
  const encodedPayload = encodeBase64Url(new TextEncoder().encode(payload));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(encodedPayload),
  );

  return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function getBrowserExecutorUrl() {
  return process.env.BROWSER_EXECUTOR_URL ?? DEFAULT_BROWSER_EXECUTOR_URL;
}

function getCallbackBaseUrl() {
  const callbackBaseUrl = process.env.CONVEX_SITE_URL;

  if (!callbackBaseUrl) {
    throw new ConvexError("CONVEX_SITE_URL is not configured.");
  }

  return callbackBaseUrl;
}

function resolveDispatchConcurrency(activeConcurrency: number) {
  return Math.min(activeConcurrency, ACTIVE_CONCURRENCY_HARD_CAP);
}

function isClosedRunStatus(status: Doc<"runs">["status"]) {
  return !["queued", "dispatching", "running"].includes(status);
}

function canDispatchQueuedRuns(status: Doc<"studies">["status"]) {
  return status === "queued" || status === "running" || status === "replaying";
}

async function getStudyById(
  ctx: DispatchMutationCtx,
  studyId: Id<"studies">,
) {
  const study = await ctx.db.get(studyId);

  if (study === null) {
    throw new ConvexError("Study not found.");
  }

  return study;
}

type DispatchMutationCtx = MutationCtx;
type DispatchActionCtx = ActionCtx;
