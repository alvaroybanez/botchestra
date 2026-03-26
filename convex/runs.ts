import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import { zCustomMutation, zid } from "convex-helpers/server/zod";
import { z } from "zod";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";

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

type RunStatus = z.infer<typeof runStatusSchema>;
type RunDoc = Awaited<ReturnType<typeof getRunById>>;
