export type AnalysisSeverity = "blocker" | "major" | "minor" | "cosmetic";

export type SegmentSpreadInput = {
  distinctSyntheticUserCount: number;
  totalSyntheticUserCount: number;
  distinctAxisRangeCount: number;
  totalAxisCount: number;
};

export type HeadlineMetricRun = {
  status: string;
  stepCount?: number | null;
  durationSec?: number | null;
};

export type HeadlineMetrics = {
  completionRate: number;
  abandonmentRate: number;
  medianSteps: number;
  medianDurationSec: number;
};

export const ANALYSIS_SEVERITY_WEIGHTS: Record<AnalysisSeverity, number> = {
  blocker: 1,
  major: 0.6,
  minor: 0.3,
  cosmetic: 0.1,
};

const REPORT_LIMITATIONS = [
  "Findings are synthetic and directional.",
  "Agents may miss or invent behavior relative to humans.",
  "Human follow-up is recommended for high-stakes decisions.",
] as const;

export function computeImpactScore(
  severity: AnalysisSeverity,
  affectedRunRate: number,
  replayConfidence: number,
  segmentSpread: number,
): number {
  return (
    ANALYSIS_SEVERITY_WEIGHTS[severity] *
    clamp(affectedRunRate, 0, 1) *
    clamp(replayConfidence, 0, 1) *
    clamp(segmentSpread, 1, 1.5)
  );
}

export function computeSegmentSpread({
  distinctSyntheticUserCount,
  totalSyntheticUserCount,
  distinctAxisRangeCount,
  totalAxisCount,
}: SegmentSpreadInput): number {
  return clamp(
    1 +
      0.25 *
        safeRatio(distinctSyntheticUserCount, totalSyntheticUserCount, {
          clampToOne: true,
        }) +
      0.25 *
        safeRatio(distinctAxisRangeCount, totalAxisCount, {
          clampToOne: true,
        }),
    1,
    1.5,
  );
}

export function computeHeadlineMetrics(
  runs: readonly HeadlineMetricRun[],
): HeadlineMetrics {
  const completedRuns = runs.filter((run) => run.status === "success");

  return {
    completionRate: safeRatio(completedRuns.length, runs.length),
    abandonmentRate: safeRatio(
      runs.filter((run) => run.status === "gave_up").length,
      runs.length,
    ),
    medianSteps: median(completedRuns.map((run) => normalizeMetric(run.stepCount))),
    medianDurationSec: median(
      completedRuns.map((run) => normalizeMetric(run.durationSec)),
    ),
  };
}

export function buildLimitationsSection(): string[] {
  return [...REPORT_LIMITATIONS];
}

function median(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sortedValues = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 0) {
    return (sortedValues[midpoint - 1]! + sortedValues[midpoint]!) / 2;
  }

  return sortedValues[midpoint]!;
}

function normalizeMetric(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

function safeRatio(
  numerator: number,
  denominator: number,
  options?: { clampToOne?: boolean },
) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }

  const ratio = Math.max(0, numerator) / denominator;

  if (options?.clampToOne === true) {
    return clamp(ratio, 0, 1);
  }

  return ratio;
}

function clamp(value: number, minimum: number, maximum: number) {
  if (!Number.isFinite(value)) {
    return minimum;
  }

  return Math.min(maximum, Math.max(minimum, value));
}
