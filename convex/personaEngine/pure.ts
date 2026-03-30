export type SyntheticUserAllocationInput = {
  id: string;
  axes: readonly unknown[];
  evidenceSnippets: readonly unknown[];
  manualComplexity?: number;
};

export type VariantAllocation = {
  syntheticUserId: string;
  variantCount: number;
};

export type VariantAxisValues = Record<string, number>;

export type VariantDistanceInput = {
  id: string;
  axisValues: VariantAxisValues;
};

export type NearDuplicateVariantPair = {
  leftId: string;
  rightId: string;
  distance: number;
};

export type CoverageSamplerOptions = {
  axisKeys: readonly string[];
  count: number;
  minimumDistanceThreshold: number;
  edgeRatio?: number;
  edgeBandStart?: number;
  interiorBandLimit?: number;
  maxAttemptsPerSample?: number;
};

const DEFAULT_EDGE_RATIO = 0.7;
const DEFAULT_EDGE_BAND_START = 0.65;
const DEFAULT_INTERIOR_BAND_LIMIT = 0.35;
const DEFAULT_MAX_ATTEMPTS_PER_SAMPLE = 512;
const HALTON_PRIMES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53,
] as const;

export function allocateVariants(
  syntheticUsers: readonly SyntheticUserAllocationInput[],
  budget: number,
): VariantAllocation[] {
  if (!Number.isInteger(budget) || budget < 0) {
    throw new RangeError("Variant budget must be a non-negative integer.");
  }

  if (syntheticUsers.length === 0) {
    throw new RangeError("At least one synthetic user is required.");
  }

  const baseAllocation = Math.floor(budget / syntheticUsers.length);
  const remainder = budget % syntheticUsers.length;

  const allocations = syntheticUsers.map((syntheticUser) => ({
    syntheticUserId: syntheticUser.id,
    variantCount: baseAllocation,
  }));

  const rankedByComplexity = syntheticUsers
    .map((syntheticUser, index) => ({
      index,
      axisOverrideCount: syntheticUser.axes.length,
      evidenceSnippetCount: syntheticUser.evidenceSnippets.length,
      manualComplexity: syntheticUser.manualComplexity ?? 0,
    }))
    .sort((left, right) => {
      if (right.axisOverrideCount !== left.axisOverrideCount) {
        return right.axisOverrideCount - left.axisOverrideCount;
      }

      if (right.evidenceSnippetCount !== left.evidenceSnippetCount) {
        return right.evidenceSnippetCount - left.evidenceSnippetCount;
      }

      if (right.manualComplexity !== left.manualComplexity) {
        return right.manualComplexity - left.manualComplexity;
      }

      return left.index - right.index;
    });

  for (const { index } of rankedByComplexity.slice(0, remainder)) {
    allocations[index]!.variantCount += 1;
  }

  return allocations;
}

export function normalizeAxisValue(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(-1, value));
}

export function sampleEdgeHeavy(
  axisKeys: readonly string[],
  sequenceIndex: number,
  edgeBandStart = DEFAULT_EDGE_BAND_START,
): VariantAxisValues {
  assertAxisKeys(axisKeys);
  assertBandThreshold(edgeBandStart, "Edge band start");

  const normalizedSequenceIndex = BigInt(Math.max(0, Math.trunc(sequenceIndex)));
  const signPatternCount = 1n << BigInt(axisKeys.length);
  const signPatternIndex = normalizedSequenceIndex % signPatternCount;
  const withinPatternIndex = Number(normalizedSequenceIndex / signPatternCount);

  return Object.fromEntries(
    axisKeys.map((axisKey, axisIndex) => {
      const direction =
        ((signPatternIndex >> BigInt(axisIndex)) & 1n) === 0n ? -1 : 1;
      const distanceWithinBand =
        (1 - edgeBandStart) *
        halton(
          withinPatternIndex + axisIndex * 37 + 19,
          primeForIndex(axisIndex + 1),
        );
      const magnitude = normalizeAxisValue(1 - distanceWithinBand);
      const value = direction * magnitude;

      return [axisKey, value];
    }),
  );
}

export function sampleInterior(
  axisKeys: readonly string[],
  sequenceIndex: number,
  interiorBandLimit = DEFAULT_INTERIOR_BAND_LIMIT,
): VariantAxisValues {
  assertAxisKeys(axisKeys);
  assertBandThreshold(interiorBandLimit, "Interior band limit");

  return Object.fromEntries(
    axisKeys.map((axisKey, axisIndex) => {
      const midpointOffset =
        halton(sequenceIndex + axisIndex * 37 + 11, primeForIndex(axisIndex + 2)) *
          2 -
        1;

      return [axisKey, normalizeAxisValue(midpointOffset * interiorBandLimit)];
    }),
  );
}

export function isEdgeHeavySample(
  axisValues: VariantAxisValues,
  edgeBandStart = DEFAULT_EDGE_BAND_START,
): boolean {
  assertBandThreshold(edgeBandStart, "Edge band start");

  return Object.values(axisValues).some(
    (value) => Math.abs(normalizeAxisValue(value)) >= edgeBandStart,
  );
}

export function isInteriorSample(
  axisValues: VariantAxisValues,
  interiorBandLimit = DEFAULT_INTERIOR_BAND_LIMIT,
): boolean {
  assertBandThreshold(interiorBandLimit, "Interior band limit");

  return Object.values(axisValues).every(
    (value) => Math.abs(normalizeAxisValue(value)) <= interiorBandLimit,
  );
}

export function calculateAxisDistance(
  leftAxisValues: VariantAxisValues,
  rightAxisValues: VariantAxisValues,
): number {
  const axisKeys = new Set([
    ...Object.keys(leftAxisValues),
    ...Object.keys(rightAxisValues),
  ]);

  let squaredDistance = 0;

  for (const key of axisKeys) {
    const leftValue = normalizeAxisValue(leftAxisValues[key] ?? 0);
    const rightValue = normalizeAxisValue(rightAxisValues[key] ?? 0);
    squaredDistance += (leftValue - rightValue) ** 2;
  }

  return Math.sqrt(squaredDistance);
}

export function generateCoverageSamples({
  axisKeys,
  count,
  minimumDistanceThreshold,
  edgeRatio = DEFAULT_EDGE_RATIO,
  edgeBandStart = DEFAULT_EDGE_BAND_START,
  interiorBandLimit = DEFAULT_INTERIOR_BAND_LIMIT,
  maxAttemptsPerSample = DEFAULT_MAX_ATTEMPTS_PER_SAMPLE,
}: CoverageSamplerOptions): VariantAxisValues[] {
  assertAxisKeys(axisKeys);

  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("Coverage sample count must be a non-negative integer.");
  }

  if (minimumDistanceThreshold < 0) {
    throw new RangeError("Minimum distance threshold must be non-negative.");
  }

  if (edgeRatio < 0 || edgeRatio > 1) {
    throw new RangeError("Edge ratio must be between 0 and 1.");
  }

  if (!Number.isInteger(maxAttemptsPerSample) || maxAttemptsPerSample <= 0) {
    throw new RangeError("Max attempts per sample must be a positive integer.");
  }

  assertBandThreshold(edgeBandStart, "Edge band start");
  assertBandThreshold(interiorBandLimit, "Interior band limit");

  const acceptedSamples: VariantAxisValues[] = [];
  const edgeCount = Math.round(count * edgeRatio);
  const coveragePlan = [
    ...Array.from({ length: edgeCount }, () => "edge" as const),
    ...Array.from({ length: count - edgeCount }, () => "interior" as const),
  ];

  let candidateSequenceIndex = 0;

  for (const sampleType of coveragePlan) {
    let acceptedSample: VariantAxisValues | null = null;

    for (
      let attemptIndex = 0;
      attemptIndex < maxAttemptsPerSample;
      attemptIndex += 1
    ) {
      const candidate =
        sampleType === "edge"
          ? sampleEdgeHeavy(axisKeys, candidateSequenceIndex, edgeBandStart)
          : sampleInterior(axisKeys, candidateSequenceIndex, interiorBandLimit);

      candidateSequenceIndex += 1;

      if (
        acceptedSamples.every(
          (existingSample) =>
            calculateAxisDistance(existingSample, candidate) >=
            minimumDistanceThreshold,
        )
      ) {
        acceptedSample = candidate;
        break;
      }
    }

    if (acceptedSample === null) {
      throw new RangeError(
        `Unable to generate a ${sampleType} sample with minimum distance ${minimumDistanceThreshold}.`,
      );
    }

    acceptedSamples.push(acceptedSample);
  }

  return acceptedSamples;
}

export function detectNearDuplicateVariants(
  variants: readonly VariantDistanceInput[],
  minimumDistanceThreshold: number,
): NearDuplicateVariantPair[] {
  if (minimumDistanceThreshold < 0) {
    throw new RangeError("Minimum distance threshold must be non-negative.");
  }

  const duplicatePairs: NearDuplicateVariantPair[] = [];

  for (let leftIndex = 0; leftIndex < variants.length; leftIndex += 1) {
    const leftVariant = variants[leftIndex]!;

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < variants.length;
      rightIndex += 1
    ) {
      const rightVariant = variants[rightIndex]!;
      const distance = calculateAxisDistance(
        leftVariant.axisValues,
        rightVariant.axisValues,
      );

      if (distance < minimumDistanceThreshold) {
        duplicatePairs.push({
          leftId: leftVariant.id,
          rightId: rightVariant.id,
          distance,
        });
      }
    }
  }

  return duplicatePairs;
}

function assertAxisKeys(axisKeys: readonly string[]): void {
  if (axisKeys.length === 0) {
    throw new RangeError("At least one axis key is required.");
  }
}

function assertBandThreshold(value: number, label: string): void {
  if (value < 0 || value > 1) {
    throw new RangeError(`${label} must be between 0 and 1.`);
  }
}

function primeForIndex(index: number): number {
  return HALTON_PRIMES[index % HALTON_PRIMES.length]!;
}

function halton(index: number, base: number): number {
  let remaining = Math.max(1, Math.trunc(index) + 1);
  let fraction = 1 / base;
  let result = 0;

  while (remaining > 0) {
    result += fraction * (remaining % base);
    remaining = Math.floor(remaining / base);
    fraction /= base;
  }

  return result;
}
