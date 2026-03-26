"use node";

import { NoOp } from "convex-helpers/server/customFunctions";
import {
  zCustomAction,
  zid,
} from "convex-helpers/server/zod";
import { z } from "zod";

import { generateWithModel } from "../packages/ai/src/index";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  type ActionCtx,
  internalAction,
} from "./_generated/server";
import {
  buildFallbackRunSummary,
  decodeRunSummaryKey,
  encodeRunSummaryKey,
  isRunEligibleForSummarization,
  normalizeRunSummary,
  type RunSummary,
  type RunSummaryContext,
  type SummarizableRunSummaryContext,
} from "./analysis/runSummaries";

const zInternalAction = zCustomAction(internalAction, NoOp);

const aiRunSummarySchema = z.object({
  outcomeClassification: z.enum(["success", "failure", "abandoned"]),
  failureSummary: z.string(),
  failurePoint: z.string(),
  lastSuccessfulState: z.string(),
  blockingText: z.string(),
  frustrationMarkers: z.array(z.string()),
  selfReportedConfidence: z.number().nullable(),
  representativeQuote: z.string(),
});

export const summarizeStudyRuns = zInternalAction({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args): Promise<SummarizeStudyRunsResult> => {
    const context: RunSummarizationContextResult = await ctx.runQuery(
      internal.analysisPipelineModel.getRunSummarizationContext,
      { studyId: args.studyId },
    );

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

async function summarizeRun(
  ctx: ActionCtx,
  run: SummarizableRunSummaryContext & {
    summaryKey?: string;
  },
): Promise<RunSummary> {
  const fallbackSummary = buildFallbackRunSummary(run);

  try {
    const result = await generateWithModel("summarization", {
      system:
        "Return only valid JSON. Summarize one synthetic usability run using concise evidence-backed language.",
      prompt: buildSummarizationPrompt(run),
    });
    const parsedSummary = aiRunSummarySchema.safeParse(JSON.parse(result.text));

    if (!parsedSummary.success) {
      return fallbackSummary;
    }

    return normalizeRunSummary(parsedSummary.data, run.status);
  } catch {
    return fallbackSummary;
  }
}

type RunSummarizationContextResult = {
  studyId: Id<"studies">;
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

function buildSummarizationPrompt(run: RunSummaryContext) {
  return [
    "You are summarizing one synthetic user run for downstream issue clustering.",
    "Return JSON with exactly these keys:",
    JSON.stringify({
      outcomeClassification: "success | failure | abandoned",
      failureSummary: "one sentence",
      failurePoint: "where the run failed or ended",
      lastSuccessfulState: "last clearly successful state before failure",
      blockingText: "blocking copy, error, or obstacle",
      frustrationMarkers: ["short marker"],
      selfReportedConfidence: 0.5,
      representativeQuote: "exact or near-exact participant wording",
    }),
    "Rules:",
    "- Use [] when there are no frustration markers.",
    "- Use null when no self-reported confidence exists.",
    "- Keep representativeQuote grounded in the provided self-report text when available.",
    `Run status: ${run.status}`,
    `Final outcome: ${run.finalOutcome ?? "not captured"}`,
    `Final URL: ${run.finalUrl ?? "not captured"}`,
    `Error code: ${run.errorCode ?? "none"}`,
    `Step count: ${run.stepCount ?? "not captured"}`,
    `Duration seconds: ${run.durationSec ?? "not captured"}`,
    `Frustration count: ${run.frustrationCount}`,
    `Self report: ${JSON.stringify(run.selfReport ?? null)}`,
    `Milestones: ${JSON.stringify(
      run.milestones.map((milestone) => ({
        stepIndex: milestone.stepIndex,
        actionType: milestone.actionType,
        title: milestone.title,
        url: milestone.url,
        note: milestone.note ?? null,
      })),
    )}`,
  ].join("\n");
}
