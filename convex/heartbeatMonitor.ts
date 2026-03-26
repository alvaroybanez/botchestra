import { NoOp } from "convex-helpers/server/customFunctions";
import { zCustomMutation } from "convex-helpers/server/zod";
import { z } from "zod";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";

export const STALE_HEARTBEAT_THRESHOLD_MS = 60_000;
export const HEARTBEAT_MONITOR_INTERVAL_SECONDS = 15;
export const STALE_HEARTBEAT_ERROR_CODE = "HEARTBEAT_STALE";

const zInternalMutation = zCustomMutation(internalMutation, NoOp);

export const monitorStaleRuns = zInternalMutation({
  args: {
    now: z.number().optional(),
  },
  handler: async (ctx, args) => {
    const now = args.now ?? Date.now();
    const affectedStudyIds = new Set<Id<"studies">>();
    let staleRunCount = 0;

    for await (const run of ctx.db
      .query("runs")
      .withIndex("by_status", (q) => q.eq("status", "running"))) {
      const lastSeenAt = run.lastHeartbeatAt ?? run.startedAt;

      if (lastSeenAt === undefined || now - lastSeenAt <= STALE_HEARTBEAT_THRESHOLD_MS) {
        continue;
      }

      await ctx.db.patch(run._id, {
        status: "infra_error",
        endedAt: now,
        ...(run.startedAt !== undefined
          ? {
              durationSec: Math.max(0, Math.round((now - run.startedAt) / 1000)),
            }
          : {}),
        finalOutcome: "FAILED",
        errorCode: STALE_HEARTBEAT_ERROR_CODE,
      });

      staleRunCount += 1;
      affectedStudyIds.add(run.studyId);
    }

    let dispatchedRunCount = 0;
    for (const studyId of affectedStudyIds) {
      dispatchedRunCount += await dispatchQueuedRunsForStudy(ctx, studyId);
    }

    return {
      checkedAt: now,
      staleRunCount,
      dispatchedRunCount,
    };
  },
});

async function dispatchQueuedRunsForStudy(ctx: MutationCtx, studyId: Id<"studies">) {
  const study = await ctx.db.get(studyId);

  if (study === null || (study.status !== "queued" && study.status !== "running")) {
    return 0;
  }

  const [runningCount, dispatchingCount] = await Promise.all([
    countRunsByStatus(ctx, studyId, "running"),
    countRunsByStatus(ctx, studyId, "dispatching"),
  ]);
  const availableSlots = Math.max(0, study.activeConcurrency - runningCount - dispatchingCount);

  if (availableSlots === 0) {
    return 0;
  }

  const queuedRuns = await ctx.db
    .query("runs")
    .withIndex("by_studyId_status", (q) => q.eq("studyId", studyId).eq("status", "queued"))
    .take(availableSlots);

  for (const queuedRun of queuedRuns) {
    await ctx.db.patch(queuedRun._id, {
      status: "dispatching",
    });
  }

  return queuedRuns.length;
}

async function countRunsByStatus(
  ctx: MutationCtx,
  studyId: Id<"studies">,
  status: "dispatching" | "running",
) {
  let count = 0;

  for await (const _run of ctx.db
    .query("runs")
    .withIndex("by_studyId_status", (q) => q.eq("studyId", studyId).eq("status", status))) {
    count += 1;
  }

  return count;
}
