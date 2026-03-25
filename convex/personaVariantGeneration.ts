"use node";

import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import { zCustomAction, zid } from "convex-helpers/server/zod";
import { z } from "zod";

import { generateWithModel } from "../packages/ai/src/index";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { action } from "./_generated/server";
import {
  axisValuesToArray,
  evaluateDistinctness,
  isDistinctEnough,
  MAX_RETRIES_PER_VARIANT,
  planVariants,
  resolveRunBudget,
  type GeneratedVariantCandidate,
  type ProtoPersonaForAllocation,
  validateGeneratedVariantCandidate,
} from "./personaEngine/variantGeneration";

const zAction = zCustomAction(action, NoOp);

export const previewVariants = zAction({
  args: {
    packId: zid("personaPacks"),
    budget: z.number().int(),
  },
  handler: async (ctx, args): Promise<PreviewSummary> => {
    const identity = await ctx.auth.getUserIdentity();

    if (identity === null) {
      throw new ConvexError("Not authenticated.");
    }

    const previewContext: PreviewContext = await ctx.runQuery(
      internal.personaVariantGenerationModel.getPreviewContext,
      {
        packId: args.packId,
        orgId: identity.tokenIdentifier,
      },
    );

    const budget = resolveRunBudget(args.budget);
    const protoPersonasForAllocation: ProtoPersonaForAllocation[] =
      previewContext.protoPersonas.map((protoPersona) => ({
        id: protoPersona._id,
        axes: protoPersona.axes,
        evidenceSnippets: protoPersona.evidenceSnippets,
        axisKeys: previewContext.pack.sharedAxes.map((axis) => axis.key),
      }));

    const projectedVariants = planVariants(protoPersonasForAllocation, budget).map(
      (variantPlan) => ({
        protoPersonaId: variantPlan.protoPersonaId as Id<"protoPersonas">,
        axisValues: axisValuesToArray(variantPlan.axisValues),
        sampleType: variantPlan.sampleType,
        edgeScore: variantPlan.edgeScore,
      }),
    );

    return {
      coverage: {
        budget,
        edgeCount: projectedVariants.filter((variant) => variant.sampleType === "edge")
          .length,
        interiorCount: projectedVariants.filter(
          (variant) => variant.sampleType === "interior",
        ).length,
        minimumPairwiseDistance: calculateMinimumPairwiseDistance(projectedVariants),
        perProtoPersona: summarizeProjectedPerProtoPersona(projectedVariants),
      },
      projectedVariants,
    };
  },
});

export const generateVariantsForStudy = zAction({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args): Promise<GenerationSummary> => {
    const identity = await ctx.auth.getUserIdentity();

    if (identity === null) {
      throw new ConvexError("Not authenticated.");
    }

    const generationContext: GenerationContext = await ctx.runQuery(
      internal.personaVariantGenerationModel.getGenerationContext,
      {
        studyId: args.studyId,
        orgId: identity.tokenIdentifier,
      },
    );

    if (generationContext.existingVariants.length > 0) {
      return await ctx.runMutation(
        internal.personaVariantGenerationModel.persistVariantsIfAbsent,
        {
          studyId: args.studyId,
          orgId: identity.tokenIdentifier,
          variants: [],
          summary: {
            acceptedCount: 0,
            rejectedCount: 0,
            retryCount: 0,
            coverage: {
              budget: generationContext.resolvedBudget,
              edgeCount: 0,
              interiorCount: 0,
              minimumPairwiseDistance: 1,
              perProtoPersona: [],
            },
          },
        },
      );
    }

    const budget = resolveRunBudget(generationContext.resolvedBudget);
    const protoPersonasForAllocation: ProtoPersonaForAllocation[] =
      generationContext.protoPersonas.map((protoPersona) => ({
        id: protoPersona._id,
        axes: protoPersona.axes,
        evidenceSnippets: protoPersona.evidenceSnippets,
        axisKeys: generationContext.pack.sharedAxes.map((axis) => axis.key),
      }));
    const variantPlans = planVariants(protoPersonasForAllocation, budget);
    const acceptedAxisValues = new Map<string, Record<string, number>>();
    const persistedVariants: PersistedVariant[] = [];
    let retryCount = 0;

    for (const variantPlan of variantPlans) {
      const protoPersona = generationContext.protoPersonas.find(
        (candidate) => candidate._id === variantPlan.protoPersonaId,
      );

      if (!protoPersona) {
        throw new ConvexError(`Proto-persona ${variantPlan.protoPersonaId} not found.`);
      }

      let bestCandidate: PersistedVariant | null = null;
      let acceptedVariantGenerated = false;

      for (
        let attemptIndex = 0;
        attemptIndex <= MAX_RETRIES_PER_VARIANT;
        attemptIndex += 1
      ) {
        if (attemptIndex > 0) {
          retryCount += 1;
        }

        const generatedCandidate = await generateCandidate(
          generationContext.pack,
          protoPersona,
          variantPlan.axisValues,
        );

        const distinctness = evaluateDistinctness(
          variantPlan.axisValues,
          Array.from(acceptedAxisValues.values()),
        );
        const validation = validateGeneratedVariantCandidate(generatedCandidate);
        const accepted = validation.accepted && isDistinctEnough(distinctness);
        const persistedVariant = toPersistedVariant({
          studyId: generationContext.study._id,
          personaPackId: generationContext.pack._id,
          protoPersonaId: protoPersona._id,
          axisValues: variantPlan.axisValues,
          edgeScore: variantPlan.edgeScore,
          candidate: generatedCandidate,
          distinctnessScore: distinctness.distinctnessScore,
          accepted,
        });

        if (
          bestCandidate === null ||
          persistedVariant.coherenceScore + persistedVariant.distinctnessScore >
            bestCandidate.coherenceScore + bestCandidate.distinctnessScore
        ) {
          bestCandidate = persistedVariant;
        }

        if (accepted) {
          persistedVariants.push(persistedVariant);
          acceptedAxisValues.set(
            `${protoPersona._id}:${persistedVariants.length}`,
            variantPlan.axisValues,
          );
          acceptedVariantGenerated = true;
          break;
        }
      }

      if (!acceptedVariantGenerated && bestCandidate !== null) {
        persistedVariants.push({
          ...bestCandidate,
          accepted: false,
        });
      }
    }

    const acceptedCount = persistedVariants.filter((variant) => variant.accepted).length;
    const rejectedCount = persistedVariants.length - acceptedCount;
    const edgeCount = persistedVariants.filter((variant) => variant.edgeScore >= 0.65).length;

    return await ctx.runMutation(
      internal.personaVariantGenerationModel.persistVariantsIfAbsent,
      {
        studyId: args.studyId,
        orgId: identity.tokenIdentifier,
        variants: persistedVariants,
        summary: {
          acceptedCount,
          rejectedCount,
          retryCount,
          coverage: {
            budget,
            edgeCount,
            interiorCount: persistedVariants.length - edgeCount,
            minimumPairwiseDistance: calculateMinimumPairwiseDistance(
              persistedVariants.filter((variant) => variant.accepted),
            ),
            perProtoPersona: summarizePerProtoPersona(persistedVariants),
          },
        },
      },
    );
  },
});

async function generateCandidate(
  pack: Doc<"personaPacks">,
  protoPersona: Doc<"protoPersonas">,
  axisValues: Record<string, number>,
): Promise<GeneratedVariantCandidate> {
  try {
    const result = await generateWithModel("expansion", {
      system:
        "Return only valid JSON for a synthetic persona variant. Do not include markdown fences.",
      prompt: buildExpansionPrompt(pack, protoPersona, axisValues),
    });

    const parsedCandidate = generatedVariantCandidateSchema.safeParse(
      JSON.parse(result.text),
    );

    if (!parsedCandidate.success) {
      throw new Error(parsedCandidate.error.message);
    }

    return parsedCandidate.data;
  } catch {
    return {
      firstPersonBio: "",
      behaviorRules: [],
      tensionSeed: "",
      coherenceScore: 0,
    };
  }
}

function toPersistedVariant({
  studyId,
  personaPackId,
  protoPersonaId,
  axisValues,
  edgeScore,
  candidate,
  distinctnessScore,
  accepted,
}: {
  studyId: Id<"studies">;
  personaPackId: Id<"personaPacks">;
  protoPersonaId: Id<"protoPersonas">;
  axisValues: Record<string, number>;
  edgeScore: number;
  candidate: GeneratedVariantCandidate;
  distinctnessScore: number;
  accepted: boolean;
}) {
  return {
    studyId,
    personaPackId,
    protoPersonaId,
    axisValues: axisValuesToArray(axisValues),
    edgeScore,
    tensionSeed: candidate.tensionSeed.trim(),
    firstPersonBio: candidate.firstPersonBio.trim(),
    behaviorRules: candidate.behaviorRules.map((rule) => rule.trim()),
    coherenceScore: candidate.coherenceScore,
    distinctnessScore,
    accepted,
  };
}

function buildExpansionPrompt(
  pack: Doc<"personaPacks">,
  protoPersona: Doc<"protoPersonas">,
  axisValues: Record<string, number>,
) {
  return [
    `Pack name: ${pack.name}`,
    `Pack context: ${pack.context}`,
    `Proto-persona summary: ${protoPersona.summary}`,
    `Evidence snippets: ${protoPersona.evidenceSnippets.join(" | ")}`,
    `Axis values: ${JSON.stringify(axisValues)}`,
    "Return JSON with keys firstPersonBio, behaviorRules, tensionSeed, coherenceScore.",
    "The bio must be 80-150 words, behaviorRules must contain 5-8 strings, tensionSeed must be non-empty, and coherenceScore must be between 0 and 1.",
  ].join("\n");
}

function summarizeProjectedPerProtoPersona(
  variants: PreviewSummary["projectedVariants"],
) {
  return Array.from(
    variants.reduce((map, variant) => {
      const entry = map.get(variant.protoPersonaId) ?? {
        protoPersonaId: variant.protoPersonaId,
        projectedCount: 0,
        edgeCount: 0,
        interiorCount: 0,
      };

      entry.projectedCount += 1;

      if (variant.sampleType === "edge") {
        entry.edgeCount += 1;
      } else {
        entry.interiorCount += 1;
      }

      map.set(variant.protoPersonaId, entry);
      return map;
    }, new Map<Id<"protoPersonas">, {
      protoPersonaId: Id<"protoPersonas">;
      projectedCount: number;
      edgeCount: number;
      interiorCount: number;
    }>()),
  ).map(([, value]) => value);
}

function summarizePerProtoPersona(variants: readonly PersistedVariant[]) {
  return Array.from(
    variants.reduce((map, variant) => {
      const entry = map.get(variant.protoPersonaId) ?? {
        protoPersonaId: variant.protoPersonaId,
        acceptedCount: 0,
        rejectedCount: 0,
      };

      if (variant.accepted) {
        entry.acceptedCount += 1;
      } else {
        entry.rejectedCount += 1;
      }

      map.set(variant.protoPersonaId, entry);
      return map;
    }, new Map<Id<"protoPersonas">, {
      protoPersonaId: Id<"protoPersonas">;
      acceptedCount: number;
      rejectedCount: number;
    }>()),
  ).map(([, value]) => value);
}

function calculateMinimumPairwiseDistance(
  variants: readonly Pick<PersistedVariant, "axisValues">[],
) {
  if (variants.length < 2) {
    return 1;
  }

  let minimumDistance = Number.POSITIVE_INFINITY;

  for (let leftIndex = 0; leftIndex < variants.length; leftIndex += 1) {
    const left = toAxisRecord(variants[leftIndex]!.axisValues);

    for (
      let rightIndex = leftIndex + 1;
      rightIndex < variants.length;
      rightIndex += 1
    ) {
      const right = toAxisRecord(variants[rightIndex]!.axisValues);
      const distance = Math.sqrt(
        Object.keys({ ...left, ...right }).reduce((sum, key) => {
          const delta = (left[key] ?? 0) - (right[key] ?? 0);
          return sum + delta ** 2;
        }, 0),
      );
      minimumDistance = Math.min(minimumDistance, distance);
    }
  }

  return Number.isFinite(minimumDistance) ? minimumDistance : 1;
}

function toAxisRecord(axisValues: readonly { key: string; value: number }[]) {
  return Object.fromEntries(axisValues.map((axisValue) => [axisValue.key, axisValue.value]));
}

const generatedVariantCandidateSchema = z.object({
  firstPersonBio: z.string(),
  behaviorRules: z.array(z.string()),
  tensionSeed: z.string(),
  coherenceScore: z.number(),
});

type PersistedVariant = {
  studyId: Id<"studies">;
  personaPackId: Id<"personaPacks">;
  protoPersonaId: Id<"protoPersonas">;
  axisValues: { key: string; value: number }[];
  edgeScore: number;
  tensionSeed: string;
  firstPersonBio: string;
  behaviorRules: string[];
  coherenceScore: number;
  distinctnessScore: number;
  accepted: boolean;
};

type GenerationSummary = {
  acceptedCount: number;
  rejectedCount: number;
  retryCount: number;
  coverage: {
    budget: number;
    edgeCount: number;
    interiorCount: number;
    minimumPairwiseDistance: number;
    perProtoPersona: {
      protoPersonaId: Id<"protoPersonas">;
      acceptedCount: number;
      rejectedCount: number;
    }[];
  };
};

type PreviewSummary = {
  coverage: {
    budget: number;
    edgeCount: number;
    interiorCount: number;
    minimumPairwiseDistance: number;
    perProtoPersona: {
      protoPersonaId: Id<"protoPersonas">;
      projectedCount: number;
      edgeCount: number;
      interiorCount: number;
    }[];
  };
  projectedVariants: {
    protoPersonaId: Id<"protoPersonas">;
    axisValues: { key: string; value: number }[];
    sampleType: "edge" | "interior";
    edgeScore: number;
  }[];
};

type GenerationContext = {
  study: Doc<"studies">;
  pack: Doc<"personaPacks">;
  protoPersonas: Doc<"protoPersonas">[];
  existingVariants: PersistedVariant[];
  resolvedBudget: number;
};

type PreviewContext = {
  pack: Doc<"personaPacks">;
  protoPersonas: Doc<"protoPersonas">[];
};
