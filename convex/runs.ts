import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import {
  zCustomMutation,
  zCustomQuery,
  zid,
} from "convex-helpers/server/zod";
import { z } from "zod";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internalMutation, query } from "./_generated/server";

const zQuery = zCustomQuery(query, NoOp);
const zInternalMutation = zCustomMutation(internalMutation, NoOp);

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
});

const listRunsArgsSchema = z.object({
  studyId: zid("studies"),
  outcome: runStatusSchema.optional(),
  protoPersonaId: zid("protoPersonas").optional(),
  finalUrlContains: z.string().trim().min(1).optional(),
});

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

export const transitionRunState = zInternalMutation({
  args: {
    runId: zid("runs"),
    nextStatus: runStatusSchema,
  },
  handler: async (ctx, args) => {
    const run = await getRunById(ctx, args.runId);
    assertValidRunTransition(run.status, args.nextStatus);

    await ctx.db.patch(args.runId, buildTransitionPatch(run, args.nextStatus));
    return await getRunById(ctx, args.runId);
  },
});

export const settleRunFromCallback = zInternalMutation({
  args: {
    runId: zid("runs"),
    nextStatus: callbackTerminalStatusSchema,
    patch: callbackPatchSchema.optional(),
  },
  handler: async (ctx, args) => {
    const run = await getRunById(ctx, args.runId);

    if (run.status === "cancelled" || isTerminalRunStatus(run.status)) {
      return run;
    }

    assertValidRunTransition(run.status, args.nextStatus);

    const endedAt = args.patch?.endedAt ?? Date.now();

    await ctx.db.patch(args.runId, {
      status: args.nextStatus,
      endedAt,
      ...(args.patch?.durationSec !== undefined
        ? { durationSec: args.patch.durationSec }
        : run.startedAt !== undefined
          ? { durationSec: Math.max(0, Math.round((endedAt - run.startedAt) / 1000)) }
          : {}),
      ...(args.patch?.stepCount !== undefined
        ? { stepCount: args.patch.stepCount }
        : {}),
      ...(args.patch?.finalUrl !== undefined ? { finalUrl: args.patch.finalUrl } : {}),
      ...(args.patch?.finalOutcome !== undefined
        ? { finalOutcome: args.patch.finalOutcome }
        : {}),
      ...(args.patch?.selfReport !== undefined
        ? { selfReport: args.patch.selfReport }
        : {}),
      ...(args.patch?.frustrationCount !== undefined
        ? { frustrationCount: args.patch.frustrationCount }
        : {}),
      ...(args.patch?.milestoneKeys !== undefined
        ? { milestoneKeys: args.patch.milestoneKeys }
        : {}),
      ...(args.patch?.artifactManifestKey !== undefined
        ? { artifactManifestKey: args.patch.artifactManifestKey }
        : {}),
      ...(args.patch?.summaryKey !== undefined
        ? { summaryKey: args.patch.summaryKey }
        : {}),
      ...(args.patch?.workerSessionId !== undefined
        ? { workerSessionId: args.patch.workerSessionId }
        : {}),
      ...(args.patch?.errorCode !== undefined
        ? { errorCode: args.patch.errorCode }
        : {}),
    });

    return await getRunById(ctx, args.runId);
  },
});

export const getRunSummary = zQuery({
  args: {
    studyId: zid("studies"),
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

export const getRun = zQuery({
  args: {
    runId: zid("runs"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);

    if (run === null) {
      return null;
    }

    await getStudyForOrg(ctx, run.studyId);

    const [personaVariant, protoPersona, milestones] = await Promise.all([
      ctx.db.get(run.personaVariantId),
      ctx.db.get(run.protoPersonaId),
      ctx.db
        .query("runMilestones")
        .withIndex("by_runId_and_stepIndex", (q) => q.eq("runId", run._id))
        .collect(),
    ]);

    if (personaVariant === null || protoPersona === null) {
      throw new ConvexError("Run is missing required persona records.");
    }

    return {
      run,
      personaVariant,
      protoPersona,
      milestones,
    };
  },
});

export const listRuns = zQuery({
  args: listRunsArgsSchema.shape,
  handler: async (ctx, args) => {
    const study = await getStudyForOrg(ctx, args.studyId);

    const baseRuns =
      args.outcome !== undefined
        ? await ctx.db
            .query("runs")
            .withIndex("by_studyId_status", (q) =>
              q.eq("studyId", args.studyId).eq("status", args.outcome!),
            )
            .order("desc")
            .take(200)
        : args.protoPersonaId !== undefined
          ? await ctx.db
              .query("runs")
              .withIndex("by_studyId_and_protoPersonaId", (q) =>
                q
                  .eq("studyId", args.studyId)
                  .eq("protoPersonaId", args.protoPersonaId!),
              )
              .order("desc")
              .take(200)
          : await ctx.db
              .query("runs")
              .withIndex("by_studyId", (q) => q.eq("studyId", args.studyId))
              .order("desc")
              .take(200);

    const filteredRuns = baseRuns.filter((run) => {
      if (args.protoPersonaId !== undefined && run.protoPersonaId !== args.protoPersonaId) {
        return false;
      }

      if (
        args.finalUrlContains !== undefined &&
        !(run.finalUrl?.includes(args.finalUrlContains) ?? false)
      ) {
        return false;
      }

      return true;
    });

    const protoPersonaIds = [...new Set(filteredRuns.map((run) => run.protoPersonaId))];
    const personaVariantIds = [...new Set(filteredRuns.map((run) => run.personaVariantId))];
    const [protoPersonas, personaVariants] = await Promise.all([
      Promise.all(protoPersonaIds.map((protoPersonaId) => ctx.db.get(protoPersonaId))),
      Promise.all(personaVariantIds.map((personaVariantId) => ctx.db.get(personaVariantId))),
    ]);
    const protoPersonaMap = new Map(
      protoPersonas
        .filter((protoPersona): protoPersona is Doc<"protoPersonas"> => protoPersona !== null)
        .map((protoPersona) => [protoPersona._id, protoPersona]),
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
      const protoPersona = protoPersonaMap.get(run.protoPersonaId);
      const personaVariant = personaVariantMap.get(run.personaVariantId);

      if (protoPersona === undefined || personaVariant === undefined) {
        throw new ConvexError("Run list contains missing persona records.");
      }

      if (personaVariant.studyId !== study._id) {
        throw new ConvexError("Run list contains a persona variant from another study.");
      }

      return {
        ...run,
        protoPersonaName: protoPersona.name,
        protoPersonaSummary: protoPersona.summary,
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
