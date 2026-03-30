import { describe, expect, it } from "vitest";

import {
  estimateBatchCost,
  generateGridAnchors,
  type GridAxis,
  validateGenerationConfig,
} from "./gridAnchors";

const axis = (
  name: string,
  lowAnchor: string,
  midAnchor: string,
  highAnchor: string,
): GridAxis => ({
  name,
  lowAnchor,
  midAnchor,
  highAnchor,
});

const baseAxes = [
  axis("confidence", "hesitant", "balanced", "bold"),
  axis("patience", "impatient", "steady", "patient"),
  axis("expertise", "novice", "practitioner", "expert"),
] as const;

function uniqueSortedAxisValues(
  anchors: ReturnType<typeof generateGridAnchors>,
  axisName: string,
) {
  return [...new Set(anchors.map((anchor) => anchor.axisValues[axisName]!))].sort(
    (left, right) => left - right,
  );
}

function expectValuesCloseTo(actual: number[], expected: number[]) {
  expect(actual).toHaveLength(expected.length);
  actual.forEach((value, index) => {
    expect(value).toBeCloseTo(expected[index]!, 10);
  });
}

describe("generateGridAnchors", () => {
  it("generates low, mid, and high anchors for a single axis with three levels", () => {
    expect(generateGridAnchors([baseAxes[0]], 3)).toEqual([
      {
        axisValues: { confidence: -1 },
        semanticLabels: { confidence: "hesitant" },
      },
      {
        axisValues: { confidence: 0 },
        semanticLabels: { confidence: "balanced" },
      },
      {
        axisValues: { confidence: 1 },
        semanticLabels: { confidence: "bold" },
      },
    ]);
  });

  it("returns 27 deterministic anchors for three axes with three levels each", () => {
    const anchors = generateGridAnchors(baseAxes, 3);

    expect(anchors).toHaveLength(27);
    expect(anchors[0]).toEqual({
      axisValues: {
        confidence: -1,
        patience: -1,
        expertise: -1,
      },
      semanticLabels: {
        confidence: "hesitant",
        patience: "impatient",
        expertise: "novice",
      },
    });
    expect(anchors.at(-1)).toEqual({
      axisValues: {
        confidence: 1,
        patience: 1,
        expertise: 1,
      },
      semanticLabels: {
        confidence: "bold",
        patience: "patient",
        expertise: "expert",
      },
    });
    expect(uniqueSortedAxisValues(anchors, "confidence")).toEqual([-1, 0, 1]);
    expect(uniqueSortedAxisValues(anchors, "patience")).toEqual([-1, 0, 1]);
    expect(uniqueSortedAxisValues(anchors, "expertise")).toEqual([-1, 0, 1]);
  });

  it("returns 243 anchors for five axes with three levels each", () => {
    const anchors = generateGridAnchors(
      [
        ...baseAxes,
        axis("budget", "frugal", "balanced", "generous"),
        axis("riskTolerance", "cautious", "measured", "adventurous"),
      ],
      3,
    );

    expect(anchors).toHaveLength(243);
  });

  it("interpolates evenly across five levels", () => {
    const anchors = generateGridAnchors(baseAxes, 5);

    expect(anchors).toHaveLength(125);
    expect(uniqueSortedAxisValues(anchors, "confidence")).toEqual([
      -1,
      -0.5,
      0,
      0.5,
      1,
    ]);
    expect(anchors[1]?.semanticLabels.expertise).toContain("novice");
    expect(anchors[1]?.semanticLabels.expertise).toContain("practitioner");
    expect(anchors[3]?.semanticLabels.expertise).toContain("practitioner");
    expect(anchors[3]?.semanticLabels.expertise).toContain("expert");
  });

  it("interpolates evenly across seven levels", () => {
    const anchors = generateGridAnchors(baseAxes, 7);

    expect(anchors).toHaveLength(343);
    expectValuesCloseTo(uniqueSortedAxisValues(anchors, "confidence"), [
      -1,
      -2 / 3,
      -1 / 3,
      0,
      1 / 3,
      2 / 3,
      1,
    ]);

    const lowToMidLabels = anchors
      .filter(
        (anchor) =>
          Math.abs(anchor.axisValues.confidence - -2 / 3) < 1e-9 ||
          Math.abs(anchor.axisValues.confidence - -1 / 3) < 1e-9,
      )
      .map((anchor) => anchor.semanticLabels.confidence);

    expect(lowToMidLabels.every((label) => label.includes("hesitant"))).toBe(true);
    expect(lowToMidLabels.every((label) => label.includes("balanced"))).toBe(true);
    expect(new Set(lowToMidLabels).size).toBe(2);
  });

  it("supports mixed granularity per axis", () => {
    const anchors = generateGridAnchors(baseAxes, {
      confidence: 3,
      patience: 5,
      expertise: 7,
    });

    expect(anchors).toHaveLength(105);
    expect(uniqueSortedAxisValues(anchors, "confidence")).toEqual([-1, 0, 1]);
    expect(uniqueSortedAxisValues(anchors, "patience")).toEqual([
      -1,
      -0.5,
      0,
      0.5,
      1,
    ]);
    expectValuesCloseTo(uniqueSortedAxisValues(anchors, "expertise"), [
      -1,
      -2 / 3,
      -1 / 3,
      0,
      1 / 3,
      2 / 3,
      1,
    ]);
  });
});

describe("estimateBatchCost", () => {
  it("uses the default token estimate and pricing", () => {
    expect(estimateBatchCost(27)).toEqual({
      totalUsers: 27,
      estimatedTokens: 21_600,
      estimatedCostUsd: 0.216,
    });
  });

  it("supports custom token estimates per synthetic user", () => {
    expect(estimateBatchCost(10, 1_250)).toEqual({
      totalUsers: 10,
      estimatedTokens: 12_500,
      estimatedCostUsd: 0.125,
    });
  });
});

describe("validateGenerationConfig", () => {
  it("rejects configs without any axes", () => {
    expect(validateGenerationConfig([], 3)).toEqual({
      valid: false,
      totalUsers: 0,
      error: "At least one axis required",
    });
  });

  it("returns the computed total for a valid configuration", () => {
    expect(validateGenerationConfig(baseAxes, 3)).toEqual({
      valid: true,
      totalUsers: 27,
    });
  });

  it("supports mixed granularity validation", () => {
    expect(
      validateGenerationConfig(baseAxes, {
        confidence: 3,
        patience: 5,
        expertise: 7,
      }),
    ).toEqual({
      valid: true,
      totalUsers: 105,
    });
  });

  it("allows totals exactly at the configured cap", () => {
    expect(validateGenerationConfig(baseAxes, 5, 125)).toEqual({
      valid: true,
      totalUsers: 125,
    });
  });

  it("rejects totals that exceed the configured cap", () => {
    const validation = validateGenerationConfig(
      Array.from({ length: 7 }, (_, index) =>
        axis(`axis-${index + 1}`, "low", "mid", "high"),
      ),
      7,
    );

    expect(validation.valid).toBe(false);
    expect(validation.totalUsers).toBe(823_543);
    expect(validation.error).toContain("exceeds cap");
  });
});
