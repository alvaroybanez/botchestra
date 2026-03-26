import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import {
  zCustomMutation,
  zCustomQuery,
  zid,
} from "convex-helpers/server/zod";
import { z } from "zod";

import { internalMutation, internalQuery } from "./_generated/server";

const zInternalMutation = zCustomMutation(internalMutation, NoOp);
const zInternalQuery = zCustomQuery(internalQuery, NoOp);

export const getRunSummarizationContext = zInternalQuery({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args) => {
    const study = await ctx.db.get(args.studyId);

    if (study === null) {
      throw new ConvexError("Study not found.");
    }

    const runs = await ctx.db
      .query("runs")
      .withIndex("by_studyId", (query) => query.eq("studyId", args.studyId))
      .take(200);

    const runContexts = await Promise.all(
      runs.map(async (run) => ({
        ...run,
        milestones: await ctx.db
          .query("runMilestones")
          .withIndex("by_runId_and_stepIndex", (query) => query.eq("runId", run._id))
          .take(25),
      })),
    );

    return {
      studyId: study._id,
      hasNonTerminalRuns: runContexts.some(
        (run) =>
          run.status === "queued" ||
          run.status === "dispatching" ||
          run.status === "running",
      ),
      runs: runContexts,
    };
  },
});

export const persistRunSummary = zInternalMutation({
  args: {
    runId: zid("runs"),
    summaryKey: z.string().min(1),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);

    if (run === null) {
      throw new ConvexError("Run not found.");
    }

    await ctx.db.patch(args.runId, {
      summaryKey: args.summaryKey,
    });

    return {
      runId: args.runId,
      summaryKey: args.summaryKey,
    };
  },
});
