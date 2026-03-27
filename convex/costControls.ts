import { ConvexError, v } from "convex/values";
import { z } from "zod";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { recordAuditEvent } from "./observability";
import { loadEffectiveSettingsForOrg } from "./settings";

export const DEFAULT_CUMULATIVE_FAILURE_THRESHOLD = 3;
export const SYSTEM_COST_CONTROL_ACTOR = "system:cost-controls";

export const evaluateStudyCostControls = internalMutation({
  args: {
    studyId: v.id("studies"),
    observedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        studyId: z.string(),
        observedAt: z.number().optional(),
      })
      .parse(args);
    const study = await getStudyById(
      ctx,
      parsedArgs.studyId as Id<"studies">,
    );
    const snapshot = await buildStudyCostSnapshot(
      ctx,
      parsedArgs.studyId as Id<"studies">,
      parsedArgs.observedAt,
    );

    if (
      isTerminalStudyStatus(study.status) ||
      study.cancellationRequestedAt !== undefined
    ) {
      return {
        cancelled: false,
        reason: null,
        ...snapshot,
      };
    }

    const settings = await loadEffectiveSettingsForOrg(ctx, study.orgId);
    const cancellationReason = getCostControlCancellationReason(snapshot, {
      maxTokensPerStudy: settings.budgetLimits.maxTokensPerStudy,
      maxBrowserSecPerStudy: settings.budgetLimits.maxBrowserSecPerStudy,
    });

    if (cancellationReason === null) {
      return {
        cancelled: false,
        reason: null,
        ...snapshot,
      };
    }

    const cancelledAt = parsedArgs.observedAt ?? Date.now();
    const cancellationSummary = await requestStudyCancellation(ctx, {
      study,
      cancelledAt,
      cancellationReason,
    });

    return {
      cancelled: true,
      reason: cancellationReason,
      ...snapshot,
      ...cancellationSummary,
    };
  },
});

async function buildStudyCostSnapshot(
  ctx: MutationCtx,
  studyId: Id<"studies">,
  observedAt: number | undefined,
) {
  let browserSecondsUsed = 0;
  let failedRunCount = 0;

  for await (const run of ctx.db
    .query("runs")
    .withIndex("by_studyId", (query) => query.eq("studyId", studyId))) {
    browserSecondsUsed += resolveRunBrowserSeconds(run, observedAt);

    if (isFailedRunStatus(run.status)) {
      failedRunCount += 1;
    }
  }

  let tokenUsage = 0;
  for await (const metric of ctx.db
    .query("metrics")
    .withIndex("by_studyId_and_recordedAt", (query) => query.eq("studyId", studyId))) {
    if (isTokenMetric(metric)) {
      tokenUsage += metric.value;
    }
  }

  return {
    browserSecondsUsed,
    tokenUsage,
    failedRunCount,
  };
}

function getCostControlCancellationReason(
  snapshot: {
    browserSecondsUsed: number;
    tokenUsage: number;
    failedRunCount: number;
  },
  limits: {
    maxTokensPerStudy?: number;
    maxBrowserSecPerStudy?: number;
  },
) {
  const budgetReasons: string[] = [];

  if (
    limits.maxTokensPerStudy !== undefined &&
    snapshot.tokenUsage >= limits.maxTokensPerStudy
  ) {
    budgetReasons.push(
      `token budget (${snapshot.tokenUsage}/${limits.maxTokensPerStudy} tokens)`,
    );
  }

  if (
    limits.maxBrowserSecPerStudy !== undefined &&
    snapshot.browserSecondsUsed >= limits.maxBrowserSecPerStudy
  ) {
    budgetReasons.push(
      `browser time budget (${snapshot.browserSecondsUsed}/${limits.maxBrowserSecPerStudy} seconds)`,
    );
  }

  if (budgetReasons.length > 0) {
    return `Auto-cancelled after reaching the study ${budgetReasons.join(" and ")}.`;
  }

  if (snapshot.failedRunCount > DEFAULT_CUMULATIVE_FAILURE_THRESHOLD) {
    return `Auto-cancelled after cumulative failures exceeded the threshold of ${DEFAULT_CUMULATIVE_FAILURE_THRESHOLD} runs (${snapshot.failedRunCount} failed runs).`;
  }

  return null;
}

async function requestStudyCancellation(
  ctx: MutationCtx,
  {
    study,
    cancelledAt,
    cancellationReason,
  }: {
    study: Doc<"studies">;
    cancelledAt: number;
    cancellationReason: string;
  },
) {
  let queuedRunsCancelled = 0;
  let activeRunsCancellationRequested = 0;

  for await (const run of ctx.db
    .query("runs")
    .withIndex("by_studyId", (query) => query.eq("studyId", study._id))) {
    if (run.status === "queued") {
      await ctx.db.patch(run._id, {
        status: "cancelled",
        endedAt: cancelledAt,
        cancellationRequestedAt: cancelledAt,
        cancellationReason,
      });
      queuedRunsCancelled += 1;
      continue;
    }

    if (run.status === "dispatching" || run.status === "running") {
      await ctx.db.patch(run._id, {
        cancellationRequestedAt: cancelledAt,
        cancellationReason,
      });
      activeRunsCancellationRequested += 1;
    }
  }

  await ctx.db.patch(study._id, {
    cancellationRequestedAt: cancelledAt,
    cancellationReason,
    updatedAt: cancelledAt,
  });
  await recordAuditEvent(ctx, {
    actorId: SYSTEM_COST_CONTROL_ACTOR,
    eventType: "study.cancelled",
    studyId: study._id,
    resourceType: "study",
    resourceId: String(study._id),
    reason: cancellationReason,
    createdAt: cancelledAt,
  });

  const updatedStudy: Doc<"studies"> = await ctx.runMutation(
    internal.studies.finalizeCancelledStudyIfComplete,
    {
      studyId: study._id,
    },
  );

  return {
    queuedRunsCancelled,
    activeRunsCancellationRequested,
    studyStatus: updatedStudy.status,
  };
}

function resolveRunBrowserSeconds(
  run: Doc<"runs">,
  observedAt: number | undefined,
) {
  if (run.durationSec !== undefined) {
    return run.durationSec;
  }

  if (
    (run.status === "dispatching" || run.status === "running") &&
    run.startedAt !== undefined
  ) {
    const endTimestamp = observedAt ?? Date.now();
    return Math.max(0, Math.round((endTimestamp - run.startedAt) / 1000));
  }

  return 0;
}

function isFailedRunStatus(status: Doc<"runs">["status"]) {
  return (
    status === "hard_fail" ||
    status === "soft_fail" ||
    status === "gave_up" ||
    status === "timeout" ||
    status === "blocked_by_guardrail" ||
    status === "infra_error"
  );
}

function isTerminalStudyStatus(status: Doc<"studies">["status"]) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function isTokenMetric(metric: Pick<Doc<"metrics">, "metricType" | "unit">) {
  const metricType = metric.metricType.toLowerCase();
  const unit = metric.unit.toLowerCase();

  return unit === "token" || unit === "tokens" || metricType.includes("token");
}

async function getStudyById(ctx: MutationCtx, studyId: Id<"studies">) {
  const study = await ctx.db.get(studyId);

  if (study === null) {
    throw new ConvexError("Study not found.");
  }

  return study;
}
