export type ProtoPersonaAllocationInput = {
  id: string;
  axes: readonly unknown[];
  evidenceSnippets: readonly unknown[];
  manualComplexity?: number;
};

export type VariantAllocation = {
  protoPersonaId: string;
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

export function allocateVariants(
  protoPersonas: readonly ProtoPersonaAllocationInput[],
  budget: number,
): VariantAllocation[] {
  if (!Number.isInteger(budget) || budget < 0) {
    throw new RangeError("Variant budget must be a non-negative integer.");
  }

  if (protoPersonas.length === 0) {
    throw new RangeError("At least one proto-persona is required.");
  }

  const baseAllocation = Math.floor(budget / protoPersonas.length);
  const remainder = budget % protoPersonas.length;

  const allocations = protoPersonas.map((protoPersona) => ({
    protoPersonaId: protoPersona.id,
    variantCount: baseAllocation,
  }));

  const rankedByComplexity = protoPersonas
    .map((protoPersona, index) => ({
      index,
      axisOverrideCount: protoPersona.axes.length,
      evidenceSnippetCount: protoPersona.evidenceSnippets.length,
      manualComplexity: protoPersona.manualComplexity ?? 0,
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
