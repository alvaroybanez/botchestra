import { zInternalMutation } from "./zodHelpers";
import { z } from "zod";

import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

export const STALE_HEARTBEAT_THRESHOLD_MS = 60_000;
export const HEARTBEAT_MONITOR_INTERVAL_SECONDS = 15;
export const STALE_HEARTBEAT_ERROR_CODE = "HEARTBEAT_STALE";

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
          errorCode: STALE_HEARTBEAT_ERROR_CODE,
        },
      });

      staleRunCount += 1;
      affectedStudyIds.add(run.studyId);
    }

    let dispatchedRunCount = 0;
    for (const studyId of affectedStudyIds) {
      const dispatchSummary = await ctx.runMutation(
        internal.waveDispatch.dispatchStudyWave,
        { studyId },
      );
      dispatchedRunCount += dispatchSummary.dispatchedRunCount;
    }

    return {
      checkedAt: now,
      staleRunCount,
      dispatchedRunCount,
    };
  },
});
