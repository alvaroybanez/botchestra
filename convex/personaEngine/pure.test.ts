import { describe, expect, it } from "vitest";

import {
  allocateVariants,
  detectNearDuplicateVariants,
  normalizeAxisValue,
} from "./pure";

const axis = (key: string) => ({
  key,
  label: key,
  description: key,
  lowAnchor: "low",
  midAnchor: "mid",
  highAnchor: "high",
  weight: 1,
});

describe("allocateVariants", () => {
  it("splits the budget evenly when it is divisible by the proto-persona count", () => {
    const allocations = allocateVariants(
      [
        { id: "alpha", axes: [axis("a")], evidenceSnippets: [] },
        { id: "beta", axes: [axis("b")], evidenceSnippets: [] },
        { id: "gamma", axes: [axis("c")], evidenceSnippets: [] },
        { id: "delta", axes: [axis("d")], evidenceSnippets: [] },
      ],
      64,
    );

    expect(allocations).toEqual([
      { protoPersonaId: "alpha", variantCount: 16 },
      { protoPersonaId: "beta", variantCount: 16 },
      { protoPersonaId: "gamma", variantCount: 16 },
      { protoPersonaId: "delta", variantCount: 16 },
    ]);
  });

  it("distributes remainder variants to proto-personas with more axis overrides first", () => {
    const allocations = allocateVariants(
      [
        { id: "simple", axes: [axis("a")], evidenceSnippets: ["one", "two"] },
        {
          id: "complex-a",
          axes: [axis("a"), axis("b"), axis("c"), axis("d")],
          evidenceSnippets: ["one"],
        },
        {
          id: "complex-b",
          axes: [axis("a"), axis("b"), axis("c")],
          evidenceSnippets: ["one", "two", "three"],
        },
        { id: "medium", axes: [axis("a"), axis("b")], evidenceSnippets: [] },
      ],
      66,
    );

    expect(allocations).toEqual([
      { protoPersonaId: "simple", variantCount: 16 },
      { protoPersonaId: "complex-a", variantCount: 17 },
      { protoPersonaId: "complex-b", variantCount: 17 },
      { protoPersonaId: "medium", variantCount: 16 },
    ]);
  });

  it("breaks complexity ties by evidence snippet count", () => {
    const allocations = allocateVariants(
      [
        {
          id: "more-evidence",
          axes: [axis("a"), axis("b")],
          evidenceSnippets: ["one", "two"],
        },
        {
          id: "less-evidence",
          axes: [axis("a"), axis("b")],
          evidenceSnippets: ["one"],
        },
        { id: "baseline", axes: [axis("a")], evidenceSnippets: [] },
      ],
      10,
    );

    expect(allocations).toEqual([
      { protoPersonaId: "more-evidence", variantCount: 4 },
      { protoPersonaId: "less-evidence", variantCount: 3 },
      { protoPersonaId: "baseline", variantCount: 3 },
    ]);
  });

  it("allocates the entire budget to a single proto-persona", () => {
    expect(
      allocateVariants(
        [{ id: "solo", axes: [axis("a")], evidenceSnippets: ["one"] }],
        64,
      ),
    ).toEqual([{ protoPersonaId: "solo", variantCount: 64 }]);
  });

  it("maintains minimum representation for ten proto-personas at the minimum budget", () => {
    const allocations = allocateVariants(
      Array.from({ length: 10 }, (_, index) => ({
        id: `proto-${index + 1}`,
        axes: [axis(`axis-${index + 1}`)],
        evidenceSnippets: [],
      })),
      50,
    );

    expect(allocations).toHaveLength(10);
    expect(allocations.every((allocation) => allocation.variantCount === 5)).toBe(
      true,
    );
  });

  it("rejects allocation requests without any proto-personas", () => {
    expect(() => allocateVariants([], 64)).toThrowError(
      "At least one proto-persona is required.",
    );
  });

  it("rejects negative budgets", () => {
    expect(() =>
      allocateVariants(
        [{ id: "solo", axes: [axis("a")], evidenceSnippets: [] }],
        -1,
      ),
    ).toThrowError("Variant budget must be a non-negative integer.");
  });
});

describe("normalizeAxisValue", () => {
  it("keeps values already inside the normalized range", () => {
    expect(normalizeAxisValue(-1)).toBe(-1);
    expect(normalizeAxisValue(0)).toBe(0);
    expect(normalizeAxisValue(0.42)).toBe(0.42);
    expect(normalizeAxisValue(1)).toBe(1);
  });

  it("clamps values below -1 and above 1", () => {
    expect(normalizeAxisValue(-1.75)).toBe(-1);
    expect(normalizeAxisValue(1.2)).toBe(1);
    expect(normalizeAxisValue(Number.NEGATIVE_INFINITY)).toBe(-1);
    expect(normalizeAxisValue(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("maps NaN to a safe midpoint value", () => {
    expect(normalizeAxisValue(Number.NaN)).toBe(0);
  });
});

describe("detectNearDuplicateVariants", () => {
  it("flags variant pairs whose Euclidean distance is below the threshold", () => {
    const duplicates = detectNearDuplicateVariants(
      [
        { id: "alpha", axisValues: { patience: 0, confidence: 0 } },
        { id: "beta", axisValues: { patience: 0.3, confidence: 0.4 } },
        { id: "gamma", axisValues: { patience: 1, confidence: 1 } },
      ],
      0.6,
    );

    expect(duplicates).toEqual([
      {
        leftId: "alpha",
        rightId: "beta",
        distance: 0.5,
      },
    ]);
  });

  it("does not flag pairs at or above the threshold", () => {
    expect(
      detectNearDuplicateVariants(
        [
          { id: "alpha", axisValues: { patience: 0, confidence: 0 } },
          { id: "beta", axisValues: { patience: 0.3, confidence: 0.4 } },
          { id: "gamma", axisValues: { patience: 0.8, confidence: 0.6 } },
        ],
        0.5,
      ),
    ).toEqual([]);
  });

  it("treats differently ordered axis keys as the same point in space", () => {
    expect(
      detectNearDuplicateVariants(
        [
          { id: "alpha", axisValues: { patience: 0.25, confidence: -0.5 } },
          { id: "beta", axisValues: { confidence: -0.5, patience: 0.25 } },
        ],
        0.1,
      ),
    ).toEqual([
      {
        leftId: "alpha",
        rightId: "beta",
        distance: 0,
      },
    ]);
  });

  it("rejects negative minimum distance thresholds", () => {
    expect(() =>
      detectNearDuplicateVariants(
        [{ id: "alpha", axisValues: { patience: 0, confidence: 0 } }],
        -0.01,
      ),
    ).toThrowError("Minimum distance threshold must be non-negative.");
  });
});
