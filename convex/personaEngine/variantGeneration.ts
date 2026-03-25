import {
  allocateVariants,
  calculateAxisDistance,
  normalizeAxisValue,
  sampleEdgeHeavy,
  sampleInterior,
  type ProtoPersonaAllocationInput,
  type VariantAxisValues,
} from "./pure";

export type GeneratedVariantCandidate = {
  firstPersonBio: string;
  behaviorRules: string[];
  tensionSeed: string;
  coherenceScore: number;
};

export type CandidateValidationResult = {
  accepted: boolean;
  reasons: string[];
  wordCount: number;
  coherenceScore: number;
};

export type DistinctnessEvaluation = {
  distinctnessScore: number;
  nearestDistance: number | null;
  isNearDuplicate: boolean;
};

export type ProtoPersonaForAllocation = ProtoPersonaAllocationInput & {
  axisKeys: readonly string[];
};

export type VariantPlan = {
  protoPersonaId: string;
  axisValues: VariantAxisValues;
  sampleType: "edge" | "interior";
  edgeScore: number;
};

export const DEFAULT_RUN_BUDGET = 64;
export const MIN_RUN_BUDGET = 50;
export const MAX_RUN_BUDGET = 100;
export const MAX_RETRIES_PER_VARIANT = 3;
export const MINIMUM_DISTANCE_THRESHOLD = 0.001;
export const MINIMUM_COHERENCE_SCORE = 0.65;
export const MINIMUM_DISTINCTNESS_SCORE = 0.5;
const MAX_ATTEMPTS_PER_PLAN_SLOT = 512;

export function resolveRunBudget(runBudget?: number): number {
  const budget = runBudget ?? DEFAULT_RUN_BUDGET;

  if (!Number.isInteger(budget) || budget < MIN_RUN_BUDGET || budget > MAX_RUN_BUDGET) {
    throw new RangeError(
      `Run budget must be an integer between ${MIN_RUN_BUDGET} and ${MAX_RUN_BUDGET}.`,
    );
  }

  return budget;
}

export function planVariants(
  protoPersonas: readonly ProtoPersonaForAllocation[],
  budget: number,
  minimumDistanceThreshold = MINIMUM_DISTANCE_THRESHOLD,
): VariantPlan[] {
  const allocations = allocateVariants(protoPersonas, budget);
  const plans: VariantPlan[] = [];

  allocations.forEach((allocation, protoIndex) => {
    const protoPersona = protoPersonas.find(
      (candidate) => candidate.id === allocation.protoPersonaId,
    );

    if (!protoPersona) {
      throw new RangeError(`Proto-persona ${allocation.protoPersonaId} not found.`);
    }

    const edgeSlots = Math.round(allocation.variantCount * 0.7);
    let sequenceIndex = protoIndex * 10_000;

    for (let slotIndex = 0; slotIndex < allocation.variantCount; slotIndex += 1) {
      const sampleType = slotIndex < edgeSlots ? "edge" : "interior";
      let plannedAxisValues: VariantAxisValues | null = null;

      for (
        let attemptIndex = 0;
        attemptIndex < MAX_ATTEMPTS_PER_PLAN_SLOT;
        attemptIndex += 1
      ) {
        const candidate =
          sampleType === "edge"
            ? sampleEdgeHeavy(protoPersona.axisKeys, sequenceIndex)
            : sampleInterior(protoPersona.axisKeys, sequenceIndex);

        sequenceIndex += 1;

        if (
          plans.every(
            (existingPlan) =>
              calculateAxisDistance(existingPlan.axisValues, candidate) >=
              minimumDistanceThreshold,
          )
        ) {
          plannedAxisValues = candidate;
          break;
        }
      }

      if (plannedAxisValues === null) {
        throw new RangeError(
          `Unable to generate a ${sampleType} plan for proto-persona ${protoPersona.id}.`,
        );
      }

      plans.push({
        protoPersonaId: protoPersona.id,
        axisValues: plannedAxisValues,
        sampleType,
        edgeScore: calculateEdgeScore(plannedAxisValues),
      });
    }
  });

  return plans;
}

export function validateGeneratedVariantCandidate(
  candidate: GeneratedVariantCandidate,
): CandidateValidationResult {
  const reasons: string[] = [];
  const wordCount = countWords(candidate.firstPersonBio);

  if (wordCount < 80 || wordCount > 150) {
    reasons.push("Bio must contain between 80 and 150 words.");
  }

  if (candidate.behaviorRules.length < 5 || candidate.behaviorRules.length > 8) {
    reasons.push("Behavior rules must contain between 5 and 8 items.");
  }

  if (
    candidate.behaviorRules.some((rule) => rule.trim().length === 0)
  ) {
    reasons.push("Behavior rules cannot be empty.");
  }

  if (candidate.tensionSeed.trim().length === 0) {
    reasons.push("Tension seed is required.");
  }

  if (
    !Number.isFinite(candidate.coherenceScore) ||
    candidate.coherenceScore < 0 ||
    candidate.coherenceScore > 1
  ) {
    reasons.push("Coherence score must be between 0 and 1.");
  } else if (candidate.coherenceScore < MINIMUM_COHERENCE_SCORE) {
    reasons.push("Coherence score is below the acceptance threshold.");
  }

  return {
    accepted: reasons.length === 0,
    reasons,
    wordCount,
    coherenceScore: clampScore(candidate.coherenceScore),
  };
}

export function evaluateDistinctness(
  axisValues: VariantAxisValues,
  acceptedAxisValues: readonly VariantAxisValues[],
  minimumDistanceThreshold = MINIMUM_DISTANCE_THRESHOLD,
): DistinctnessEvaluation {
  if (acceptedAxisValues.length === 0) {
    return {
      distinctnessScore: 1,
      nearestDistance: null,
      isNearDuplicate: false,
    };
  }

  const nearestDistance = acceptedAxisValues.reduce((currentMinimum, existing) => {
    const distance = calculateAxisDistance(existing, axisValues);
    return Math.min(currentMinimum, distance);
  }, Number.POSITIVE_INFINITY);

  return {
    distinctnessScore: clampScore(nearestDistance / (minimumDistanceThreshold * 2)),
    nearestDistance,
    isNearDuplicate: nearestDistance < minimumDistanceThreshold,
  };
}

export function isDistinctEnough(
  evaluation: DistinctnessEvaluation,
  minimumDistinctnessScore = MINIMUM_DISTINCTNESS_SCORE,
): boolean {
  return (
    !evaluation.isNearDuplicate &&
    evaluation.distinctnessScore >= minimumDistinctnessScore
  );
}

export function axisValuesToArray(axisValues: VariantAxisValues) {
  return Object.entries(axisValues).map(([key, value]) => ({
    key,
    value: normalizeAxisValue(value),
  }));
}

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

export function calculateEdgeScore(axisValues: VariantAxisValues): number {
  const values = Object.values(axisValues);

  if (values.length === 0) {
    return 0;
  }

  return clampScore(
    values.reduce((sum, value) => sum + Math.abs(normalizeAxisValue(value)), 0) /
      values.length,
  );
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
