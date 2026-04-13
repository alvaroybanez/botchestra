"use node";
import { z } from "zod";
import { v } from "convex/values";

import { generateWithModel } from "../packages/ai/src/index";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  internalAction,
} from "./_generated/server";
import {
  decodeRunSummaryKey,
  encodeRunSummaryKey,
  isRunEligibleForSummarization,
  normalizeRunSummary,
  type RunSummary,
  type RunSummaryContext,
  type SummarizableRunSummaryContext,
} from "./analysis/runSummaries";
import {
  buildSummarizationPrompt,
  SUMMARIZATION_SYSTEM_PROMPT,
} from "./analysis/summarizationPrompt";

const aiRunSummarySchema = z.object({
  outcomeClassification: z.enum(["success", "failure", "abandoned"]),
  failureSummary: z.string().nullable(),
  failurePoint: z.string().nullable(),
  lastSuccessfulState: z.string().nullable(),
  blockingText: z.string().nullable(),
  frustrationMarkers: z.array(z.string()),
  selfReportedConfidence: z.number().nullable(),
  representativeQuote: z.string().nullable(),
});

export const summarizeStudyRuns = internalAction({
  args: {
    studyId: v.id("studies"),
  },
  handler: async (ctx, args): Promise<SummarizeStudyRunsResult> => {
    const context: RunSummarizationContextResult = await ctx.runQuery(
      internal.analysisPipelineModel.getRunSummarizationContext,
      { studyId: args.studyId },
    );
    const settings = await ctx.runQuery(internal.settings.getEffectiveSettingsForOrg, {
      orgId: context.orgId,
    });

    if (context.hasNonTerminalRuns) {
      throw new Error("Cannot summarize study runs before every run is terminal.");
    }

    let summarizedRunCount = 0;
    let skippedRunCount = 0;

    for (const run of context.runs) {
      if (!isRunEligibleForSummarization(run.status)) {
        continue;
      }

      if (decodeRunSummaryKey(run.summaryKey) !== null) {
        skippedRunCount += 1;
        continue;
      }

      const summary = await summarizeRun(
        ctx,
        run as SummarizableRunSummaryContext & { summaryKey?: string },
        settings.modelConfig.find(
          (entry: { taskCategory: string; modelId: string }) =>
            entry.taskCategory === "summarization",
        )?.modelId,
      );
      await ctx.runMutation(internal.analysisPipelineModel.persistRunSummary, {
        runId: run._id,
        summaryKey: encodeRunSummaryKey(summary),
      });
      summarizedRunCount += 1;
    }

    return {
      eligibleRunCount: context.runs.filter((run: RunSummaryContext) =>
        isRunEligibleForSummarization(run.status),
      ).length,
      summarizedRunCount,
      excludedRunCount: context.runs.filter(
        (run: RunSummaryContext) => !isRunEligibleForSummarization(run.status),
      ).length,
      skippedRunCount,
    };
  },
});

export const analyzeStudy = internalAction({
  args: {
    studyId: v.id("studies"),
  },
  handler: async (ctx, args): Promise<AnalyzeStudyResult> => {
    const analysisSnapshot: StudyAnalysisSnapshot = await ctx.runQuery(
      internal.analysisPipelineModel.getStudyAnalysisSnapshot,
      { studyId: args.studyId },
    );

    if (analysisSnapshot.status !== "analyzing") {
      return {
        studyStatus: analysisSnapshot.status,
        failureReason: analysisSnapshot.failureReason,
        summaryResult: null,
        issueClusterCount: analysisSnapshot.reportIssueClusterCount,
        reportId: null,
      };
    }

    try {
      const summaryResult = await ctx.runAction(
        internal.analysisPipeline.summarizeStudyRuns,
        { studyId: args.studyId },
      );
      const report = await ctx.runAction(
        internal.studyLifecycleWorkflow.createStudyLifecycleReport,
        { studyId: args.studyId },
      );
      await ctx.runMutation(internal.studies.transitionStudyState, {
        studyId: args.studyId,
        nextStatus: "completed",
      });

      return {
        studyStatus: "completed",
        failureReason: null,
        summaryResult,
        issueClusterCount: report.issueClusterIds.length,
        reportId: report._id,
      };
    } catch (error) {
      const failureReason = `Analysis pipeline failed: ${toErrorMessage(error)}`;

      await ctx.runMutation(internal.studies.transitionStudyState, {
        studyId: args.studyId,
        nextStatus: "failed",
        failureReason,
      });

      return {
        studyStatus: "failed",
        failureReason,
        summaryResult: null,
        issueClusterCount: 0,
        reportId: null,
      };
    }
  },
});

async function summarizeRun(
  ctx: ActionCtx,
  run: SummarizableRunSummaryContext & {
    summaryKey?: string;
  },
  modelOverride?: string,
): Promise<RunSummary> {
  try {
    const result = await generateWithModel("summarization", {
      modelOverride,
      system: SUMMARIZATION_SYSTEM_PROMPT,
      prompt: buildSummarizationPrompt(run),
    });
    const parsedJson = JSON.parse(result.text);
    const parsedSummary = aiRunSummarySchema.safeParse(parsedJson);

    if (!parsedSummary.success) {
      throw new Error(parsedSummary.error.issues[0]?.message ?? "Invalid AI summary.");
    }

    return normalizeRunSummary(parsedSummary.data, run.status);
  } catch (error) {
    throw new Error(
      `Failed to summarize run ${run._id}: ${toErrorMessage(error)}`,
    );
  }
}

type RunSummarizationContextResult = {
  studyId: Id<"studies">;
  orgId: string;
  hasNonTerminalRuns: boolean;
  runs: Array<
    RunSummaryContext & {
      summaryKey?: string;
    }
  >;
};

type SummarizeStudyRunsResult = {
  eligibleRunCount: number;
  summarizedRunCount: number;
  excludedRunCount: number;
  skippedRunCount: number;
};

type StudyAnalysisSnapshot = {
  studyId: Id<"studies">;
  status:
    | "draft"
    | "persona_review"
    | "ready"
    | "queued"
    | "running"
    | "replaying"
    | "analyzing"
    | "completed"
    | "failed"
    | "cancelled";
  failureReason: string | null;
  hasReport: boolean;
  reportIssueClusterCount: number;
};

type AnalyzeStudyResult = {
  studyStatus: StudyAnalysisSnapshot["status"];
  failureReason: string | null;
  summaryResult: SummarizeStudyRunsResult | null;
  issueClusterCount: number;
  reportId: Id<"studyReports"> | null;
};

function toErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
