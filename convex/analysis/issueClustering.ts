import type { Doc, Id } from "../_generated/dataModel";
import { computeImpactScore, computeSegmentSpread, type AnalysisSeverity } from "./pure";
import { rankIssueClusters } from "./ranking";
import {
  buildFallbackRunSummary,
  decodeRunSummaryKey,
  isRunEligibleForSummarization,
  isRunExcludedFromClustering,
  type RunSummary,
  type SummarizableRunStatus,
} from "./runSummaries";

type ClusterableRun = Pick<
  Doc<"runs">,
  | "_id"
  | "studyId"
  | "personaVariantId"
  | "protoPersonaId"
  | "status"
  | "replayOfRunId"
  | "summaryKey"
  | "errorCode"
  | "finalOutcome"
  | "finalUrl"
  | "selfReport"
  | "frustrationCount"
  | "stepCount"
  | "durationSec"
  | "milestoneKeys"
> & {
  axisValues: Doc<"personaVariants">["axisValues"];
  milestones: Array<
    Pick<Doc<"runMilestones">, "actionType" | "title" | "url" | "note" | "stepIndex">
  >;
};

export type IssueClusterDraft = {
  studyId: Id<"studies">;
  title: string;
  summary: string;
  severity: AnalysisSeverity;
  affectedRunCount: number;
  affectedRunRate: number;
  affectedProtoPersonaIds: Id<"protoPersonas">[];
  affectedAxisRanges: Doc<"issueClusters">["affectedAxisRanges"];
  representativeRunIds: Id<"runs">[];
  replayConfidence: number;
  evidenceKeys: string[];
  recommendation: string;
  confidenceNote: string;
  score: number;
};

type ClusterMember = {
  index: number;
  signature: string;
  signalLabel: string;
  pathLabel: string;
  run: ClusterableRun;
  summary: RunSummary;
};

type ReplayStats = {
  replayAttempts: number;
  reproducedFailures: number;
  replayConfidence: number;
  reproducedEvidenceKeys: string[];
};

export function buildIssueClusters(params: {
  studyId: Id<"studies">;
  runs: ClusterableRun[];
  totalAxisCount: number;
  totalProtoPersonaCount: number;
}) {
  const primaryRuns = params.runs.filter((run) => run.replayOfRunId === undefined);
  const replayRuns = params.runs.filter(
    (run) => run.replayOfRunId !== undefined && isTerminalRunStatus(run.status),
  );
  const groupedRuns = new Map<string, ClusterMember[]>();

  primaryRuns.forEach((run, index) => {
    const summary = resolveRunSummary(run);

    if (
      summary === null ||
      summary.outcomeClassification === "success" ||
      !summary.includeInClustering ||
      isRunExcludedFromClustering(run.status)
    ) {
      return;
    }

    const signalLabel = buildSignalLabel(run, summary);
    const pathLabel = buildPathLabel(run, summary);
    const signature = buildClusterSignature(run, summary, signalLabel, pathLabel);

    groupedRuns.set(signature, [
      ...(groupedRuns.get(signature) ?? []),
      {
        index,
        signature,
        signalLabel,
        pathLabel,
        run,
        summary,
      },
    ]);
  });

  const drafts = [...groupedRuns.values()]
    .map((members) => {
      const replayStats = collectReplayStats(members, replayRuns);

      const affectedRunCount = members.length;
      const affectedRunRate = safeRatio(affectedRunCount, primaryRuns.length);
      const severity = deriveSeverity(members);
      const affectedProtoPersonaIds = uniqueIds(
        members.map((member) => member.run.protoPersonaId),
      );
      const affectedAxisRanges = collectAxisRanges(members);
      const representativeRunIds = members.slice(0, 3).map((member) => member.run._id);
      const segmentSpread = computeSegmentSpread({
        distinctProtoPersonaCount: affectedProtoPersonaIds.length,
        totalProtoPersonaCount: params.totalProtoPersonaCount,
        distinctAxisRangeCount: affectedAxisRanges.length,
        totalAxisCount: params.totalAxisCount,
      });
      const commonPath = pickMostCommon(members.map((member) => member.pathLabel));
      const commonSignal = pickMostCommon(members.map((member) => member.signalLabel));
      const title = buildClusterTitle(commonSignal, commonPath);
      const summary = buildClusterSummary({
        affectedRunCount,
        primaryRunCount: primaryRuns.length,
        pathLabel: commonPath,
        signalLabel: commonSignal,
        outcomeClassification: members[0]!.summary.outcomeClassification,
      });
      const recommendation = buildRecommendation(severity, commonSignal, commonPath);
      const confidenceNote = buildConfidenceNote(affectedRunCount, replayStats);

      return {
        studyId: params.studyId,
        title,
        summary,
        severity,
        affectedRunCount,
        affectedRunRate,
        affectedProtoPersonaIds,
        affectedAxisRanges,
        representativeRunIds,
        replayConfidence: replayStats.replayConfidence,
        evidenceKeys: uniqueStrings([
          ...members.flatMap((member) => member.run.milestoneKeys),
          ...replayStats.reproducedEvidenceKeys,
        ]),
        recommendation,
        confidenceNote,
        score: computeImpactScore(
          severity,
          affectedRunRate,
          replayStats.replayConfidence,
          segmentSpread,
        ),
      } satisfies IssueClusterDraft;
    });

  return rankIssueClusters(drafts);
}

function collectReplayStats(
  members: ClusterMember[],
  replayRuns: ClusterableRun[],
): ReplayStats {
  const primaryRunIds = new Set(members.map((member) => member.run._id));
  const matchingReplays = replayRuns.filter((run) =>
    run.replayOfRunId !== undefined && primaryRunIds.has(run.replayOfRunId),
  );
  const reproducedFailures = matchingReplays.filter((run) => {
    const summary = resolveRunSummary(run);

    if (
      summary === null ||
      summary.outcomeClassification === "success" ||
      !summary.includeInClustering
    ) {
      return false;
    }

    const signature = buildClusterSignature(
      run,
      summary,
      buildSignalLabel(run, summary),
      buildPathLabel(run, summary),
    );

    return signature === members[0]!.signature;
  });

  return {
    replayAttempts: matchingReplays.length,
    reproducedFailures: reproducedFailures.length,
    replayConfidence: safeRatio(reproducedFailures.length, matchingReplays.length),
    reproducedEvidenceKeys: reproducedFailures.flatMap((run) => run.milestoneKeys),
  };
}

function resolveRunSummary(run: ClusterableRun) {
  const decodedSummary = decodeRunSummaryKey(run.summaryKey);

  if (decodedSummary !== null) {
    return decodedSummary;
  }

  if (!isRunEligibleForSummarization(run.status)) {
    return null;
  }

  return buildFallbackRunSummary({
    _id: run._id,
    status: run.status as SummarizableRunStatus,
    errorCode: run.errorCode,
    finalOutcome: run.finalOutcome,
    finalUrl: run.finalUrl,
    selfReport: run.selfReport,
    frustrationCount: run.frustrationCount,
    stepCount: run.stepCount,
    durationSec: run.durationSec,
    milestones: run.milestones,
  });
}

function deriveSeverity(members: ClusterMember[]): AnalysisSeverity {
  const severities = members.map((member) => severityFromRunStatus(member.run.status));

  if (severities.includes("blocker")) {
    return "blocker";
  }

  if (severities.includes("major")) {
    return "major";
  }

  if (severities.includes("minor")) {
    return "minor";
  }

  return "cosmetic";
}

function severityFromRunStatus(status: ClusterableRun["status"]): AnalysisSeverity {
  switch (status) {
    case "hard_fail":
    case "blocked_by_guardrail":
      return "blocker";
    case "timeout":
      return "major";
    case "soft_fail":
    case "gave_up":
      return "minor";
    default:
      return "cosmetic";
  }
}

function collectAxisRanges(members: ClusterMember[]) {
  const axisRanges = new Map<string, { min: number; max: number }>();

  for (const member of members) {
    for (const axisValue of member.run.axisValues) {
      const existingRange = axisRanges.get(axisValue.key);

      if (existingRange === undefined) {
        axisRanges.set(axisValue.key, {
          min: axisValue.value,
          max: axisValue.value,
        });
        continue;
      }

      existingRange.min = Math.min(existingRange.min, axisValue.value);
      existingRange.max = Math.max(existingRange.max, axisValue.value);
    }
  }

  return [...axisRanges.entries()]
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, range]) => ({
      key,
      min: range.min,
      max: range.max,
    }));
}

function buildSignalLabel(run: ClusterableRun, summary: RunSummary) {
  const source = run.errorCode ?? summary.blockingText ?? summary.failureSummary;
  const normalized = normalizeSignal(source);

  if (normalized.length > 0) {
    return normalized;
  }

  return normalizeSignal(summary.failurePoint);
}

function buildClusterSignature(
  run: ClusterableRun,
  summary: RunSummary,
  signalLabel: string,
  pathLabel: string,
) {
  if (run.errorCode !== undefined && run.errorCode.trim().length > 0) {
    return [summary.outcomeClassification, signalLabel, pathLabel].join("|");
  }

  return [summary.outcomeClassification, pathLabel].join("|");
}

function buildPathLabel(run: ClusterableRun, summary: RunSummary) {
  const rawPath = run.finalUrl ?? extractPath(summary.failurePoint) ?? summary.failurePoint;
  const parsedPath = extractPath(rawPath);

  if (parsedPath !== null) {
    return parsedPath;
  }

  const normalized = normalizeSignal(rawPath);
  return normalized.length > 0 ? normalized : "unknown-location";
}

function buildClusterTitle(signalLabel: string, pathLabel: string) {
  const signal = humanizeLabel(signalLabel);

  if (pathLabel === "unknown-location") {
    return signal;
  }

  return `${signal} at ${pathLabel}`;
}

function buildClusterSummary(params: {
  affectedRunCount: number;
  primaryRunCount: number;
  pathLabel: string;
  signalLabel: string;
  outcomeClassification: RunSummary["outcomeClassification"];
}) {
  const pathText =
    params.pathLabel === "unknown-location" ? "the observed journey" : params.pathLabel;
  const signalEvidence = formatSignalEvidence(params.signalLabel);

  return `${params.affectedRunCount} of ${params.primaryRunCount} primary run(s) shared a ${params.outcomeClassification} pattern near ${pathText} linked to ${signalEvidence}.`;
}

function buildRecommendation(
  severity: AnalysisSeverity,
  signalLabel: string,
  pathLabel: string,
) {
  const urgency =
    severity === "blocker" ? "Immediately" : severity === "major" ? "Prioritize" : "Review";
  const location =
    pathLabel === "unknown-location" ? "the impacted journey step" : pathLabel;

  return `${urgency} address ${humanizeLabel(signalLabel)} around ${location} and rerun the affected scenario.`;
}

function buildConfidenceNote(affectedRunCount: number, replayStats: ReplayStats) {
  if (replayStats.replayAttempts === 0) {
    return `Observed in ${affectedRunCount} summarized primary run(s); no replay attempts were recorded yet.`;
  }

  return `Replay reproduced ${replayStats.reproducedFailures}/${replayStats.replayAttempts} terminal attempt(s).`;
}

function extractPath(value: string | undefined) {
  if (value === undefined) {
    return null;
  }

  try {
    const url = new URL(value);
    return normalizePath(url.pathname);
  } catch {
    const matchedPath = value.match(/\/[A-Za-z0-9/_-]+/);
    return matchedPath === null ? null : normalizePath(matchedPath[0]);
  }
}

function normalizePath(pathname: string) {
  const trimmed = pathname.trim();

  if (trimmed.length === 0 || trimmed === "/") {
    return "/";
  }

  return trimmed.replace(/\/+/g, "/").replace(/\/$/, "");
}

function normalizeSignal(value: string | undefined) {
  if (value === undefined) {
    return "";
  }

  return value
    .trim()
    .toLowerCase()
    .replace(/https?:\/\/[^/\s]+/g, "")
    .replace(/[^a-z0-9/_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
}

function humanizeLabel(value: string) {
  const normalized = value
    .replace(/^failure_/, "")
    .replace(/[_/]+/g, " ")
    .trim();

  if (normalized.length === 0) {
    return "Observed issue";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatSignalEvidence(value: string) {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9/_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (normalized.length === 0) {
    return "OBSERVED_ISSUE";
  }

  return normalized.toUpperCase();
}

function pickMostCommon(values: string[]) {
  const counts = new Map<string, number>();

  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  let selectedValue = values[0] ?? "";
  let selectedCount = -1;
  for (const value of values) {
    const count = counts.get(value) ?? 0;

    if (count > selectedCount) {
      selectedValue = value;
      selectedCount = count;
    }
  }

  return selectedValue;
}

function safeRatio(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  return numerator / denominator;
}

function uniqueStrings(values: string[]) {
  return [...new Set(values)];
}

function uniqueIds<TableName extends "protoPersonas" | "runs">(values: Array<Id<TableName>>) {
  return [...new Set(values)];
}

function isTerminalRunStatus(status: ClusterableRun["status"]) {
  return !["queued", "dispatching", "running"].includes(status);
}
