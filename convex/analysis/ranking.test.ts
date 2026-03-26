import { describe, expect, it } from "vitest";

import { rankIssueClusters } from "./ranking";

describe("rankIssueClusters", () => {
  it("sorts clusters by descending score", () => {
    const ranked = rankIssueClusters([
      { _id: "cluster-low", severity: "major", replayConfidence: 0.5, score: 0.2 },
      { _id: "cluster-high", severity: "major", replayConfidence: 0.5, score: 0.8 },
      { _id: "cluster-mid", severity: "major", replayConfidence: 0.5, score: 0.4 },
    ]);

    expect(ranked.map((cluster) => cluster._id)).toEqual([
      "cluster-high",
      "cluster-mid",
      "cluster-low",
    ]);
  });

  it("keeps the original order for equal scores", () => {
    const ranked = rankIssueClusters([
      { _id: "cluster-first", severity: "minor", replayConfidence: 0.5, score: 0.3 },
      { _id: "cluster-second", severity: "minor", replayConfidence: 0.5, score: 0.3 },
      { _id: "cluster-third", severity: "minor", replayConfidence: 0.5, score: 0.3 },
    ]);

    expect(ranked.map((cluster) => cluster._id)).toEqual([
      "cluster-first",
      "cluster-second",
      "cluster-third",
    ]);
  });

  it("keeps positive replay confidence ahead of zero confidence for the same severity", () => {
    const ranked = rankIssueClusters([
      { _id: "cluster-no-replay", severity: "major", replayConfidence: 0, score: 0.4 },
      { _id: "cluster-with-replay", severity: "major", replayConfidence: 0.5, score: 0.4 },
    ]);

    expect(ranked.map((cluster) => cluster._id)).toEqual([
      "cluster-with-replay",
      "cluster-no-replay",
    ]);
  });
});
