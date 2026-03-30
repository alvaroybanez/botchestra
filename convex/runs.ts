import { ConvexError, v } from "convex/values";
import { z } from "zod";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";
import {
  normalizeInfraErrorCode,
  recordMetric,
} from "./observability";
import { resolveArtifactUrlsForStudy } from "./artifactResolver";

const runStatusSchema = z.enum([
  "queued",
  "dispatching",
  "running",
  "success",
  "hard_fail",
  "soft_fail",
  "gave_up",
  "timeout",
  "blocked_by_guardrail",
  "infra_error",
  "cancelled",
]);

const callbackTerminalStatusSchema = z.enum([
  "success",
  "hard_fail",
  "soft_fail",
  "gave_up",
  "timeout",
  "blocked_by_guardrail",
  "infra_error",
]);

const runSelfReportSchema = z.object({
  perceivedSuccess: z.boolean(),
  hardestPart: z.string().optional(),
  confusion: z.string().optional(),
  confidence: z.number().optional(),
  suggestedChange: z.string().optional(),
  answers: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const callbackPatchSchema = z.object({
  endedAt: z.number().optional(),
  durationSec: z.number().optional(),
  stepCount: z.number().optional(),
  finalUrl: z.string().optional(),
  finalOutcome: z.string().optional(),
  selfReport: runSelfReportSchema.optional(),
  frustrationCount: z.number().optional(),
  milestoneKeys: z.array(z.string()).optional(),
  artifactManifestKey: z.string().optional(),
  summaryKey: z.string().optional(),
  workerSessionId: z.string().optional(),
  errorCode: z.string().optional(),
  guardrailCode: z.string().optional(),
  errorMessage: z.string().optional(),
});

const listRunsArgsSchema = z.object({
  studyId: z.string(),
  outcome: runStatusSchema.optional(),
  syntheticUserId: z.string().optional(),
  finalUrlContains: z.string().trim().min(1).optional(),
});

const runStatusValidator = v.union(
  v.literal("queued"),
  v.literal("dispatching"),
  v.literal("running"),
  v.literal("success"),
  v.literal("hard_fail"),
  v.literal("soft_fail"),
  v.literal("gave_up"),
  v.literal("timeout"),
  v.literal("blocked_by_guardrail"),
  v.literal("infra_error"),
  v.literal("cancelled"),
);

const callbackTerminalStatusValidator = v.union(
  v.literal("success"),
  v.literal("hard_fail"),
  v.literal("soft_fail"),
  v.literal("gave_up"),
  v.literal("timeout"),
  v.literal("blocked_by_guardrail"),
  v.literal("infra_error"),
);

const runSelfReportValidator = v.object({
  perceivedSuccess: v.boolean(),
  hardestPart: v.optional(v.string()),
  confusion: v.optional(v.string()),
  confidence: v.optional(v.number()),
  suggestedChange: v.optional(v.string()),
  answers: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
});

const callbackPatchValidator = v.object({
  endedAt: v.optional(v.number()),
  durationSec: v.optional(v.number()),
  stepCount: v.optional(v.number()),
  finalUrl: v.optional(v.string()),
  finalOutcome: v.optional(v.string()),
  selfReport: v.optional(runSelfReportValidator),
  frustrationCount: v.optional(v.number()),
  milestoneKeys: v.optional(v.array(v.string())),
  artifactManifestKey: v.optional(v.string()),
  summaryKey: v.optional(v.string()),
  workerSessionId: v.optional(v.string()),
  errorCode: v.optional(v.string()),
  guardrailCode: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
});

const listRunsArgsValidator = {
  studyId: v.id("studies"),
  outcome: v.optional(runStatusValidator),
  syntheticUserId: v.optional(v.id("syntheticUsers")),
  finalUrlContains: v.optional(v.string()),
};

const VALID_RUN_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["dispatching", "cancelled"],
  dispatching: ["running", "infra_error"],
  running: [
    "success",
    "hard_fail",
    "soft_fail",
    "gave_up",
    "timeout",
    "blocked_by_guardrail",
    "infra_error",
    "cancelled",
  ],
  success: [],
  hard_fail: [],
  soft_fail: [],
  gave_up: [],
  timeout: [],
  blocked_by_guardrail: [],
  infra_error: [],
  cancelled: [],
};

export const transitionRunState = internalMutation({
  args: {
    runId: v.id("runs"),
    nextStatus: runStatusValidator,
  },
  handler: async (ctx, args) => {
    const run = await getRunById(ctx, args.runId);
    assertValidRunTransition(run.status, args.nextStatus);

    await ctx.db.patch(args.runId, buildTransitionPatch(run, args.nextStatus));
    const updatedRun = await getRunById(ctx, args.runId);

    if (isTerminalRunStatus(updatedRun.status)) {
      await ctx.runMutation(internal.studies.finalizeCancelledStudyIfComplete, {
        studyId: updatedRun.studyId,
      });
    }

    return updatedRun;
  },
});

export const settleRunFromCallback = internalMutation({
  args: {
    runId: v.id("runs"),
    nextStatus: callbackTerminalStatusValidator,
    patch: v.optional(callbackPatchValidator),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        runId: z.string(),
        nextStatus: callbackTerminalStatusSchema,
        patch: callbackPatchSchema.optional(),
      })
      .parse(args);
    const runId = parsedArgs.runId as Id<"runs">;
    const run = await getRunById(ctx, args.runId);

    if (run.status === "cancelled" || isTerminalRunStatus(run.status)) {
      return run;
    }

    assertValidRunTransition(run.status, parsedArgs.nextStatus);

    const endedAt = parsedArgs.patch?.endedAt ?? Date.now();
    const normalizedErrorCode =
      parsedArgs.nextStatus === "infra_error"
        ? normalizeInfraErrorCode(
            parsedArgs.patch?.errorCode,
            parsedArgs.patch?.errorMessage,
          )
        : parsedArgs.patch?.errorCode;

    await ctx.db.patch(runId, {
      status: parsedArgs.nextStatus,
      endedAt,
      ...(parsedArgs.patch?.durationSec !== undefined
        ? { durationSec: parsedArgs.patch.durationSec }
        : run.startedAt !== undefined
          ? { durationSec: Math.max(0, Math.round((endedAt - run.startedAt) / 1000)) }
          : {}),
      ...(parsedArgs.patch?.stepCount !== undefined
        ? { stepCount: parsedArgs.patch.stepCount }
        : {}),
      ...(parsedArgs.patch?.finalUrl !== undefined
        ? { finalUrl: parsedArgs.patch.finalUrl }
        : {}),
      ...(parsedArgs.patch?.finalOutcome !== undefined
        ? { finalOutcome: parsedArgs.patch.finalOutcome }
        : {}),
      ...(parsedArgs.patch?.selfReport !== undefined
        ? { selfReport: parsedArgs.patch.selfReport }
        : {}),
      ...(parsedArgs.patch?.frustrationCount !== undefined
        ? { frustrationCount: parsedArgs.patch.frustrationCount }
        : {}),
      ...(parsedArgs.patch?.milestoneKeys !== undefined
        ? { milestoneKeys: parsedArgs.patch.milestoneKeys }
        : {}),
      ...(parsedArgs.patch?.artifactManifestKey !== undefined
        ? { artifactManifestKey: parsedArgs.patch.artifactManifestKey }
        : {}),
      ...(parsedArgs.patch?.summaryKey !== undefined
        ? { summaryKey: parsedArgs.patch.summaryKey }
        : {}),
      ...(parsedArgs.patch?.workerSessionId !== undefined
        ? { workerSessionId: parsedArgs.patch.workerSessionId }
        : {}),
      ...(normalizedErrorCode !== undefined
        ? { errorCode: normalizedErrorCode }
        : {}),
      ...(parsedArgs.patch?.guardrailCode !== undefined
        ? { guardrailCode: parsedArgs.patch.guardrailCode }
        : {}),
    });

    const updatedRun = await getRunById(ctx, runId);

    if (isTerminalRunStatus(updatedRun.status)) {
      await recordMetric(ctx, {
        studyId: updatedRun.studyId,
        runId: updatedRun._id,
        metricType: "run.completed",
        value: 1,
        unit: "count",
        status: updatedRun.status,
        ...(updatedRun.status === "infra_error" &&
        updatedRun.errorCode !== undefined
          ? { errorCode: updatedRun.errorCode }
          : {}),
        recordedAt: endedAt,
      });
    }
    await ctx.runMutation(internal.costControls.evaluateStudyCostControls, {
      studyId: updatedRun.studyId,
      ...(endedAt !== undefined ? { observedAt: endedAt } : {}),
    });

    await ctx.runMutation(internal.studies.finalizeCancelledStudyIfComplete, {
      studyId: updatedRun.studyId,
    });

    return updatedRun;
  },
});

export const getRunSummary = query({
  args: {
    studyId: v.id("studies"),
  },
  handler: async (ctx, args) => {
    await getStudyForOrg(ctx, args.studyId);

    const summary = {
      studyId: args.studyId,
      totalRuns: 0,
      queuedCount: 0,
      runningCount: 0,
      terminalCount: 0,
      outcomeCounts: {
        success: 0,
        hard_fail: 0,
        soft_fail: 0,
        gave_up: 0,
        timeout: 0,
        blocked_by_guardrail: 0,
        infra_error: 0,
        cancelled: 0,
      },
    };

    for await (const run of ctx.db
      .query("runs")
      .withIndex("by_studyId", (q) => q.eq("studyId", args.studyId))) {
      summary.totalRuns += 1;

      if (run.status === "queued" || run.status === "dispatching") {
        summary.queuedCount += 1;
        continue;
      }

      if (run.status === "running") {
        summary.runningCount += 1;
        continue;
      }

      summary.terminalCount += 1;
      summary.outcomeCounts[run.status] += 1;
    }

    return summary;
  },
});

export const getRun = query({
  args: {
    runId: v.id("runs"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);

    if (run === null) {
      return null;
    }

    await getStudyForOrg(ctx, run.studyId);

    const [personaVariant, syntheticUser, milestones] = await Promise.all([
      ctx.db.get(run.personaVariantId),
      ctx.db.get(run.syntheticUserId),
      ctx.db
        .query("runMilestones")
        .withIndex("by_runId_and_stepIndex", (q) => q.eq("runId", run._id))
        .collect(),
    ]);

    if (personaVariant === null || syntheticUser === null) {
      throw new ConvexError("Run is missing required persona records.");
    }

    const artifactUrls = await resolveArtifactUrlsForStudy(ctx, {
      studyId: run.studyId,
      keys: [
        ...milestones
          .map((milestone) => milestone.screenshotKey)
          .filter((key): key is string => key !== undefined),
        ...[run.artifactManifestKey, run.summaryKey].filter(
          (key): key is string => key !== undefined,
        ),
      ],
    });

    return {
      run: {
        ...run,
        artifactManifestUrl:
          run.artifactManifestKey !== undefined
            ? artifactUrls[run.artifactManifestKey] ?? null
            : null,
        summaryUrl:
          run.summaryKey !== undefined
            ? artifactUrls[run.summaryKey] ?? null
            : null,
      },
      personaVariant,
      syntheticUser,
      milestones: milestones.map((milestone) => ({
        ...milestone,
        screenshotUrl:
          milestone.screenshotKey !== undefined
            ? artifactUrls[milestone.screenshotKey] ?? null
            : null,
      })),
    };
  },
});

export const listRuns = query({
  args: listRunsArgsValidator,
  handler: async (ctx, args) => {
    const parsedArgs = listRunsArgsSchema.parse(args);
    const studyId = parsedArgs.studyId as Id<"studies">;
    const outcome = parsedArgs.outcome;
    const syntheticUserId =
      parsedArgs.syntheticUserId as Id<"syntheticUsers"> | undefined;
    const study = await getStudyForOrg(ctx, studyId);

    const baseRuns =
      outcome !== undefined
        ? await ctx.db
            .query("runs")
            .withIndex("by_studyId_status", (q) =>
              q.eq("studyId", studyId).eq("status", outcome),
            )
            .order("desc")
            .take(200)
        : syntheticUserId !== undefined
          ? await ctx.db
              .query("runs")
              .withIndex("by_studyId_and_syntheticUserId", (q) =>
                q
                  .eq("studyId", studyId)
                  .eq("syntheticUserId", syntheticUserId),
              )
              .order("desc")
              .take(200)
          : await ctx.db
              .query("runs")
              .withIndex("by_studyId", (q) => q.eq("studyId", studyId))
              .order("desc")
              .take(200);

    const filteredRuns = baseRuns.filter((run) => {
      if (syntheticUserId !== undefined && run.syntheticUserId !== syntheticUserId) {
        return false;
      }

      if (
        parsedArgs.finalUrlContains !== undefined &&
        !(run.finalUrl?.includes(parsedArgs.finalUrlContains) ?? false)
      ) {
        return false;
      }

      return true;
    });

    const syntheticUserIds = [...new Set(filteredRuns.map((run) => run.syntheticUserId))];
    const personaVariantIds = [...new Set(filteredRuns.map((run) => run.personaVariantId))];
    const [syntheticUsers, personaVariants] = await Promise.all([
      Promise.all(syntheticUserIds.map((syntheticUserId) => ctx.db.get(syntheticUserId))),
      Promise.all(personaVariantIds.map((personaVariantId) => ctx.db.get(personaVariantId))),
    ]);
    const syntheticUserMap = new Map(
      syntheticUsers
        .filter((syntheticUser): syntheticUser is Doc<"syntheticUsers"> => syntheticUser !== null)
        .map((syntheticUser) => [syntheticUser._id, syntheticUser]),
    );
    const personaVariantMap = new Map(
      personaVariants
        .filter(
          (personaVariant): personaVariant is Doc<"personaVariants"> =>
            personaVariant !== null,
        )
        .map((personaVariant) => [personaVariant._id, personaVariant]),
    );

    return filteredRuns.map((run) => {
      const syntheticUser = syntheticUserMap.get(run.syntheticUserId);
      const personaVariant = personaVariantMap.get(run.personaVariantId);

      if (syntheticUser === undefined || personaVariant === undefined) {
        throw new ConvexError("Run list contains missing persona records.");
      }

      if (personaVariant.studyId !== study._id) {
        throw new ConvexError("Run list contains a persona variant from another study.");
      }

      return {
        ...run,
        syntheticUserName: syntheticUser.name,
        syntheticUserSummary: syntheticUser.summary,
        firstPersonBio: personaVariant.firstPersonBio,
        axisValues: personaVariant.axisValues,
      };
    });
  },
});

export function isValidRunTransition(
  currentStatus: RunStatus,
  nextStatus: RunStatus,
) {
  return VALID_RUN_TRANSITIONS[currentStatus].includes(nextStatus);
}

function assertValidRunTransition(currentStatus: RunStatus, nextStatus: RunStatus) {
  if (!isValidRunTransition(currentStatus, nextStatus)) {
    throw new ConvexError(
      `Invalid run state transition: ${currentStatus} -> ${nextStatus}.`,
    );
  }
}

function isTerminalRunStatus(status: RunStatus) {
  return VALID_RUN_TRANSITIONS[status].length === 0;
}

function buildTransitionPatch(run: RunDoc, nextStatus: RunStatus) {
  const transitionTimestamp = Date.now();

  return {
    status: nextStatus,
    ...(nextStatus === "running" && run.startedAt === undefined
      ? { startedAt: transitionTimestamp }
      : {}),
    ...(isTerminalRunStatus(nextStatus) && run.endedAt === undefined
      ? { endedAt: transitionTimestamp }
      : {}),
    ...(nextStatus === "cancelled" && run.startedAt !== undefined && run.endedAt === undefined
      ? {
          durationSec: Math.max(
            0,
            Math.round((transitionTimestamp - run.startedAt) / 1000),
          ),
        }
      : {}),
  };
}

async function getRunById(ctx: MutationCtx, runId: Id<"runs">) {
  const run = await ctx.db.get(runId);

  if (run === null) {
    throw new ConvexError("Run not found.");
  }

  return run;
}

async function getStudyForOrg(ctx: QueryCtx, studyId: Id<"studies">) {
  const identity = await requireIdentity(ctx);
  const study = await ctx.db.get(studyId);

  if (study === null || study.orgId !== identity.tokenIdentifier) {
    throw new ConvexError("Study not found.");
  }

  return study;
}

async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (identity === null) {
    throw new ConvexError("Not authenticated.");
  }

  return identity;
}

type RunStatus = z.infer<typeof runStatusSchema>;
type RunDoc = Awaited<ReturnType<typeof getRunById>>;
