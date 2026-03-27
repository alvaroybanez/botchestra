import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import {
  zCustomMutation,
  zCustomQuery,
  zid,
} from "convex-helpers/server/zod";
import { z } from "zod";

import { type Doc, type Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import { buildIssueClusters } from "./analysis/issueClustering";
import { rankIssueClusters } from "./analysis/ranking";

const zInternalMutation = zCustomMutation(internalMutation, NoOp);
const zInternalQuery = zCustomQuery(internalQuery, NoOp);
type RunMilestoneContext = Pick<
  Doc<"runMilestones">,
  "actionType" | "title" | "url" | "note" | "stepIndex"
>;

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
      .collect();

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
      orgId: study.orgId,
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

export const getStudyAnalysisSnapshot = zInternalQuery({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args) => {
    const study = await ctx.db.get(args.studyId);

    if (study === null) {
      throw new ConvexError("Study not found.");
    }

    let hasReport = false;
    let reportIssueClusterCount = 0;
    for await (const report of ctx.db.query("studyReports")) {
      if (report.studyId === args.studyId) {
        hasReport = true;
        reportIssueClusterCount = report.issueClusterIds.length;
        break;
      }
    }

    return {
      studyId: study._id,
      status: study.status,
      failureReason: study.failureReason ?? null,
      hasReport,
      reportIssueClusterCount,
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

export const replaceIssueClustersForStudy = zInternalMutation({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args): Promise<Id<"issueClusters">[]> => {
    const study = await ctx.db.get(args.studyId);

    if (study === null) {
      throw new ConvexError("Study not found.");
    }

    const pack = await ctx.db.get(study.personaPackId);

    if (pack === null) {
      throw new ConvexError("Persona pack not found.");
    }

    const runs = await ctx.db
      .query("runs")
      .withIndex("by_studyId", (query) => query.eq("studyId", args.studyId))
      .collect();

    if (
      runs.some(
        (run) =>
          run.status === "queued" ||
          run.status === "dispatching" ||
          run.status === "running",
      )
    ) {
      throw new ConvexError("Cannot cluster study issues before all runs are terminal.");
    }

    const personaVariants = await ctx.db
      .query("personaVariants")
      .withIndex("by_studyId", (query) => query.eq("studyId", args.studyId))
      .collect();
    const axisValuesByVariantId = new Map(
      personaVariants.map((variant) => [variant._id, variant.axisValues]),
    );
    const milestonesByRunId = new Map<Id<"runs">, RunMilestoneContext[]>(
      await Promise.all(
        runs.map(async (run) => {
          const milestones = await ctx.db
            .query("runMilestones")
            .withIndex("by_runId_and_stepIndex", (query) => query.eq("runId", run._id))
            .take(25);

          return [
            run._id,
            milestones.map((milestone) => ({
              actionType: milestone.actionType,
              title: milestone.title,
              url: milestone.url,
              note: milestone.note,
              stepIndex: milestone.stepIndex,
            })),
          ] as const;
        }),
      ),
    );
    const totalProtoPersonaCount = new Set(
      runs
        .filter((run) => run.replayOfRunId === undefined)
        .map((run) => run.protoPersonaId),
    ).size;
    const fallbackAxisCount = new Set(
      personaVariants.flatMap((variant) => variant.axisValues.map((axis) => axis.key)),
    ).size;
    const issueClusters = buildIssueClusters({
      studyId: args.studyId,
      runs: runs.map((run) => ({
        ...run,
        axisValues: axisValuesByVariantId.get(run.personaVariantId) ?? [],
        milestones: milestonesByRunId.get(run._id) ?? [],
      })),
      totalAxisCount: pack.sharedAxes.length > 0 ? pack.sharedAxes.length : fallbackAxisCount,
      totalProtoPersonaCount,
    });

    const existingClusters = await ctx.db
      .query("issueClusters")
      .withIndex("by_studyId", (query) => query.eq("studyId", args.studyId))
      .collect();

    for (const existingCluster of existingClusters) {
      await ctx.db.delete(existingCluster._id);
    }

    const insertedClusterIds: Id<"issueClusters">[] = [];
    for (const issueCluster of issueClusters) {
      const clusterId = await ctx.db.insert("issueClusters", issueCluster);
      insertedClusterIds.push(clusterId);
    }

    return insertedClusterIds;
  },
});

export const listRankedIssueClusterIds = zInternalQuery({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args): Promise<Id<"issueClusters">[]> => {
    const issueClusters = await ctx.db
      .query("issueClusters")
      .withIndex("by_studyId", (query) => query.eq("studyId", args.studyId))
      .collect();

    return rankIssueClusters(issueClusters).map((cluster) => cluster._id);
  },
});
