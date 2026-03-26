import { z } from "zod";

import type { Doc } from "../_generated/dataModel";

export const RUN_SUMMARY_KEY_PREFIX = "run-summaries/inline/v1/";

export const runSummarySchema = z.object({
  summaryVersion: z.literal(1),
  sourceRunStatus: z.enum(["success", "hard_fail", "soft_fail", "gave_up", "timeout", "blocked_by_guardrail"]),
  outcomeClassification: z.enum(["success", "failure", "abandoned"]),
  failureSummary: z.string(),
  failurePoint: z.string(),
  lastSuccessfulState: z.string(),
  blockingText: z.string(),
  frustrationMarkers: z.array(z.string()),
  selfReportedConfidence: z.number().min(0).max(1).nullable(),
  representativeQuote: z.string(),
  includeInClustering: z.boolean(),
});

export type RunSummary = z.infer<typeof runSummarySchema>;
export type SummarizableRunStatus = RunSummary["sourceRunStatus"];

export type RunSummaryContext = Pick<
  Doc<"runs">,
  | "_id"
  | "status"
  | "errorCode"
  | "finalOutcome"
  | "finalUrl"
  | "selfReport"
  | "frustrationCount"
  | "stepCount"
  | "durationSec"
> & {
  milestones: Array<
    Pick<Doc<"runMilestones">, "actionType" | "title" | "url" | "note" | "stepIndex">
  >;
};

export type SummarizableRunSummaryContext = Omit<RunSummaryContext, "status"> & {
  status: SummarizableRunStatus;
};

const CLUSTERING_EXCLUDED_STATUSES = new Set<
  Doc<"runs">["status"]
>(["infra_error", "cancelled"]);

export function isRunExcludedFromClustering(status: Doc<"runs">["status"]) {
  return CLUSTERING_EXCLUDED_STATUSES.has(status);
}

export function isRunEligibleForSummarization(status: Doc<"runs">["status"]) {
  return isTerminalRunStatus(status) && !isRunExcludedFromClustering(status);
}

export function encodeRunSummaryKey(summary: RunSummary) {
  return `${RUN_SUMMARY_KEY_PREFIX}${encodeURIComponent(JSON.stringify(summary))}`;
}

export function decodeRunSummaryKey(summaryKey: string | undefined) {
  if (
    summaryKey === undefined ||
    !summaryKey.startsWith(RUN_SUMMARY_KEY_PREFIX)
  ) {
    return null;
  }

  try {
    return runSummarySchema.parse(
      JSON.parse(decodeURIComponent(summaryKey.slice(RUN_SUMMARY_KEY_PREFIX.length))),
    );
  } catch {
    return null;
  }
}

export function normalizeRunSummary(
  summary: Omit<RunSummary, "summaryVersion" | "sourceRunStatus" | "includeInClustering">,
  status: RunSummary["sourceRunStatus"],
): RunSummary {
  return {
    summaryVersion: 1,
    sourceRunStatus: status,
    outcomeClassification: summary.outcomeClassification,
    failureSummary: normalizeText(summary.failureSummary, describeFailureSummary(status)),
    failurePoint: normalizeText(summary.failurePoint, describeFailurePoint(status)),
    lastSuccessfulState: normalizeText(
      summary.lastSuccessfulState,
      "The last successful state was not captured.",
    ),
    blockingText: normalizeText(summary.blockingText, "No blocking text captured."),
    frustrationMarkers: uniqueStrings(
      summary.frustrationMarkers
        .map((marker) => marker.trim())
        .filter((marker) => marker.length > 0),
    ),
    selfReportedConfidence: normalizeConfidence(summary.selfReportedConfidence),
    representativeQuote: normalizeText(
      summary.representativeQuote,
      "No direct quote captured.",
    ),
    includeInClustering: !isRunExcludedFromClustering(status),
  };
}

export function buildFallbackRunSummary(
  context: SummarizableRunSummaryContext,
): RunSummary {
  const quote =
    context.selfReport?.hardestPart ??
    context.selfReport?.confusion ??
    context.selfReport?.suggestedChange ??
    firstStringAnswer(context.selfReport?.answers) ??
    (context.errorCode !== undefined
      ? `The run ended with ${context.errorCode}.`
      : "No direct quote captured.");
  const latestMilestone =
    context.milestones.length > 0
      ? context.milestones[context.milestones.length - 1]
      : undefined;
  const previousMilestone =
    context.milestones.length > 1
      ? context.milestones[context.milestones.length - 2]
      : undefined;
  const failurePoint = latestMilestone
    ? `${latestMilestone.title} (${latestMilestone.url})`
    : context.finalUrl ?? describeFailurePoint(context.status);
  const lastSuccessfulState =
    context.status === "success"
      ? context.finalUrl ?? "The run reached its intended destination."
      : previousMilestone !== undefined
        ? `${previousMilestone.title ?? "Earlier progress was observed."} (${previousMilestone.url ?? context.finalUrl ?? "unknown location"})`
        : "The last successful state was not captured.";

  return normalizeRunSummary(
    {
      outcomeClassification: classifyOutcome(context.status),
      failureSummary: describeFailureSummary(
        context.status,
        context.errorCode,
        context.finalOutcome,
      ),
      failurePoint,
      lastSuccessfulState,
      blockingText:
        context.errorCode ??
        context.selfReport?.confusion ??
        context.selfReport?.hardestPart ??
        "No blocking text captured.",
      frustrationMarkers: inferFrustrationMarkers(context),
      selfReportedConfidence: normalizeConfidence(context.selfReport?.confidence),
      representativeQuote: quote,
    },
    context.status,
  );
}

function isTerminalRunStatus(status: Doc<"runs">["status"]) {
  return !["queued", "dispatching", "running"].includes(status);
}

function classifyOutcome(status: RunSummary["sourceRunStatus"]): RunSummary["outcomeClassification"] {
  if (status === "success") {
    return "success";
  }

  if (status === "gave_up" || status === "timeout") {
    return "abandoned";
  }

  return "failure";
}

function inferFrustrationMarkers(context: RunSummaryContext) {
  const markers: string[] = [];

  if ((context.frustrationCount ?? 0) > 0) {
    markers.push(`frustration_count_${context.frustrationCount}`);
  }

  if (context.status === "gave_up") {
    markers.push("gave up");
  }

  if (context.status === "timeout") {
    markers.push("timed out");
  }

  if (context.status === "blocked_by_guardrail") {
    markers.push("guardrail blocked progress");
  }

  if (context.selfReport?.confusion) {
    markers.push("self-reported confusion");
  }

  return uniqueStrings(markers);
}

function describeFailureSummary(
  status: RunSummary["sourceRunStatus"],
  errorCode?: string,
  finalOutcome?: string,
) {
  switch (status) {
    case "success":
      return "The run completed successfully and reached its intended goal.";
    case "hard_fail":
      return errorCode !== undefined
        ? `The run hard-failed with ${errorCode}.`
        : "The run ended in a hard failure.";
    case "soft_fail":
      return errorCode !== undefined
        ? `The run soft-failed with ${errorCode}.`
        : "The run ended in a soft failure.";
    case "gave_up":
      return "The run was abandoned after mounting friction and confusion.";
    case "timeout":
      return "The run timed out before the goal was completed.";
    case "blocked_by_guardrail":
      return "The run was stopped by a configured guardrail before completion.";
    default:
      return finalOutcome !== undefined
        ? `The run ended with final outcome ${finalOutcome}.`
        : "The run ended without a usable summary.";
  }
}

function describeFailurePoint(status: RunSummary["sourceRunStatus"]) {
  switch (status) {
    case "success":
      return "No failure point was observed.";
    case "gave_up":
      return "The run stalled before the final task step.";
    case "timeout":
      return "The run exceeded the time budget before reaching the goal.";
    case "blocked_by_guardrail":
      return "The run was blocked by a guardrail during task execution.";
    default:
      return "The exact failure point was not captured.";
  }
}

function firstStringAnswer(
  answers:
    | Record<string, string | number | boolean>
    | undefined,
) {
  if (answers === undefined) {
    return null;
  }

  for (const value of Object.values(answers)) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function normalizeConfidence(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.min(1, Math.max(0, value));
}

function normalizeText(value: string, fallback: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}
