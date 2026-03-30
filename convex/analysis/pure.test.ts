import { describe, expect, it } from "vitest";

import {
  buildLimitationsSection,
  computeHeadlineMetrics,
  computeImpactScore,
  computeSegmentSpread,
} from "./pure";

describe("computeImpactScore", () => {
  it.each([
    ["blocker", 0.5, 0.8, 1.25, 0.5],
    ["major", 0.75, 0.9, 1.5, 0.6075],
    ["minor", 0.4, 0.5, 1.1, 0.066],
    ["cosmetic", 0.2, 0.3, 1.4, 0.0084],
  ] as const)(
    "matches the deterministic score fixture for %s severity",
    (severity, affectedRunRate, replayConfidence, segmentSpread, expectedScore) => {
      expect(
        computeImpactScore(
          severity,
          affectedRunRate,
          replayConfidence,
          segmentSpread,
        ),
      ).toBeCloseTo(expectedScore, 6);
    },
  );

  it("bounds the score contribution from segment spread to the supported range", () => {
    expect(computeImpactScore("major", 1, 1, 0.2)).toBeCloseTo(0.6, 6);
    expect(computeImpactScore("major", 1, 1, 4)).toBeCloseTo(0.9, 6);
  });
});

describe("computeSegmentSpread", () => {
  it("floors segment spread at 1 when no segments are affected", () => {
    expect(
      computeSegmentSpread({
        distinctSyntheticUserCount: 0,
        totalSyntheticUserCount: 0,
        distinctAxisRangeCount: 0,
        totalAxisCount: 0,
      }),
    ).toBe(1);
  });

  it("applies the proportional synthetic user and axis-range boosts", () => {
    expect(
      computeSegmentSpread({
        distinctSyntheticUserCount: 2,
        totalSyntheticUserCount: 4,
        distinctAxisRangeCount: 1,
        totalAxisCount: 2,
      }),
    ).toBeCloseTo(1.25, 6);
  });

  it("caps segment spread at 1.5 when the affected segments exceed the totals", () => {
    expect(
      computeSegmentSpread({
        distinctSyntheticUserCount: 10,
        totalSyntheticUserCount: 4,
        distinctAxisRangeCount: 12,
        totalAxisCount: 3,
      }),
    ).toBe(1.5);
  });
});

describe("computeHeadlineMetrics", () => {
  it("computes rates across runs and medians from completed runs", () => {
    expect(
      computeHeadlineMetrics([
        { status: "success", stepCount: 10, durationSec: 100 },
        { status: "gave_up", stepCount: 7, durationSec: 80 },
        { status: "success", stepCount: 12, durationSec: 120 },
        { status: "hard_fail", stepCount: 5, durationSec: 60 },
        { status: "infra_error" },
      ]),
    ).toEqual({
      completionRate: 0.4,
      abandonmentRate: 0.2,
      medianSteps: 11,
      medianDurationSec: 110,
    });
  });

  it("returns zeroed metrics when there are no completed runs", () => {
    expect(
      computeHeadlineMetrics([
        { status: "hard_fail", stepCount: 6, durationSec: 40 },
        { status: "infra_error" },
        { status: "cancelled" },
      ]),
    ).toEqual({
      completionRate: 0,
      abandonmentRate: 0,
      medianSteps: 0,
      medianDurationSec: 0,
    });
  });
});

describe("buildLimitationsSection", () => {
  it("returns at least three report limitations including the required keywords", () => {
    const limitations = buildLimitationsSection();

    expect(limitations).toHaveLength(3);
    expect(limitations.join(" ").toLowerCase()).toContain("synthetic");
    expect(limitations.join(" ").toLowerCase()).toContain("directional");
  });
});
