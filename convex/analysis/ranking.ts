import type { AnalysisSeverity } from "./pure";

type RankableIssueCluster = {
  score: number;
  severity: AnalysisSeverity;
  replayConfidence: number;
};

export function rankIssueClusters<T extends RankableIssueCluster>(
  clusters: readonly T[],
): T[] {
  return clusters
    .map((cluster, index) => ({ cluster, index }))
    .sort((left, right) => {
      const scoreDelta = normalizeScore(right.cluster.score) - normalizeScore(left.cluster.score);

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      if (left.cluster.severity === right.cluster.severity) {
        const leftHasReplayConfidence = left.cluster.replayConfidence > 0;
        const rightHasReplayConfidence = right.cluster.replayConfidence > 0;

        if (leftHasReplayConfidence !== rightHasReplayConfidence) {
          return leftHasReplayConfidence ? -1 : 1;
        }
      }

      return left.index - right.index;
    })
    .map((entry) => entry.cluster);
}

function normalizeScore(score: number) {
  if (!Number.isFinite(score)) {
    return 0;
  }

  return score;
}
