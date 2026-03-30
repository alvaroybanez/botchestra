"use node";

import { ConvexError, v } from "convex/values";
import { z } from "zod";

import { generateWithModel } from "../packages/ai/src/index";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { type ActionCtx, action, internalAction } from "./_generated/server";
import {
  axisValuesToArray,
  evaluateDistinctness,
  isDistinctEnough,
  MAX_RETRIES_PER_VARIANT,
  planVariants,
  resolveRunBudget,
  type GeneratedVariantCandidate,
  type SyntheticUserForAllocation,
  validateGeneratedVariantCandidate,
} from "./personaEngine/variantGeneration";
import { requireIdentity, requireRole, STUDY_MANAGER_ROLES } from "./rbac";

export const previewVariants = action({
  args: {
    configId: v.id("personaConfigs"),
    budget: v.number(),
  },
  handler: async (ctx, args): Promise<PreviewSummary> => {
    const parsedArgs = z
      .object({
        configId: z.string(),
        budget: z.number().int(),
      })
      .parse(args);
    const identity = await requireIdentity(ctx);

    const previewContext: PreviewContext = await ctx.runQuery(
      internal.personaVariantGenerationModel.getPreviewContext,
      {
        configId: parsedArgs.configId as Id<"personaConfigs">,
        orgId: identity.tokenIdentifier,
      },
    );

    const budget = resolveRunBudget(parsedArgs.budget);
    const syntheticUsersForAllocation: SyntheticUserForAllocation[] =
      previewContext.syntheticUsers.map((syntheticUser) => ({
        id: syntheticUser._id,
        axes: syntheticUser.axes,
        evidenceSnippets: syntheticUser.evidenceSnippets,
        axisKeys: previewContext.config.sharedAxes.map((axis) => axis.key),
      }));

    const projectedVariants = planVariants(syntheticUsersForAllocation, budget).map(
      (variantPlan) => ({
        syntheticUserId: variantPlan.syntheticUserId as Id<"syntheticUsers">,
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
        perSyntheticUser: summarizeProjectedPerSyntheticUser(projectedVariants),
      },
      projectedVariants,
    };
  },
});

export const generateVariantsForStudy = action({
  args: {
    studyId: v.id("studies"),
  },
  handler: async (ctx, args): Promise<GenerationSummary> => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);

    return await generateVariantsForStudyForOrg(
      ctx,
      args.studyId,
      identity.tokenIdentifier,
    );
  },
});

export const generateVariantsForStudyInternal = internalAction({
  args: {
    studyId: v.id("studies"),
  },
  handler: async (ctx, args): Promise<GenerationSummary> => {
    const { orgId } = await ctx.runQuery(
      internal.personaVariantGenerationModel.getStudyGenerationOwner,
      {
        studyId: args.studyId,
      },
    );

    return await generateVariantsForStudyForOrg(ctx, args.studyId, orgId);
  },
});

async function generateVariantsForStudyForOrg(
  ctx: ActionCtx,
  studyId: Id<"studies">,
  orgId: string,
): Promise<GenerationSummary> {
  const generationContext: GenerationContext = await ctx.runQuery(
    internal.personaVariantGenerationModel.getGenerationContext,
    {
      studyId,
      orgId,
    },
  );

  const budget = resolveRunBudget(generationContext.resolvedBudget);
  const settings = await ctx.runQuery(internal.settings.getEffectiveSettingsForOrg, {
    orgId,
  });
  const expansionModelOverride = settings.modelConfig.find(
    (entry: { taskCategory: string; modelId: string }) =>
      entry.taskCategory === "expansion",
  )?.modelId;
  const acceptedExistingVariants = generationContext.existingVariants.filter(
    (variant) => variant.accepted,
  );

  if (acceptedExistingVariants.length >= budget) {
    return await ctx.runMutation(
      internal.personaVariantGenerationModel.persistVariantsIfAbsent,
      {
        studyId,
        orgId,
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
            perSyntheticUser: [],
          },
        },
      },
    );
  }

  const syntheticUsersForAllocation: SyntheticUserForAllocation[] =
    generationContext.syntheticUsers.map((syntheticUser) => ({
      id: syntheticUser._id,
      axes: syntheticUser.axes,
      evidenceSnippets: syntheticUser.evidenceSnippets,
      axisKeys: generationContext.config.sharedAxes.map((axis) => axis.key),
    }));
  const acceptedAxisValues = new Map<string, Record<string, number>>();

  acceptedExistingVariants.forEach((variant, index) => {
    acceptedAxisValues.set(`existing:${index}`, toAxisRecord(variant.axisValues));
  });

  const persistedVariants: PersistedVariant[] = [];
  let retryCount = 0;
  let acceptedCount = acceptedExistingVariants.length;
  let passIndex = 0;

  while (acceptedCount < budget) {
    const acceptedCountAtStartOfPass = acceptedCount;
    const remainingBudget = budget - acceptedCount;
    const variantPlans = planVariants(
      syntheticUsersForAllocation,
      remainingBudget,
      undefined,
      Array.from(acceptedAxisValues.values()),
      passIndex * 100_000,
    );

    for (const variantPlan of variantPlans) {
      const syntheticUser = generationContext.syntheticUsers.find(
        (candidate) => candidate._id === variantPlan.syntheticUserId,
      );

      if (!syntheticUser) {
        throw new ConvexError(
          `Synthetic user ${variantPlan.syntheticUserId} not found.`,
        );
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
          generationContext.config,
          syntheticUser,
          variantPlan.axisValues,
          expansionModelOverride,
        );

        const distinctness = evaluateDistinctness(
          variantPlan.axisValues,
          Array.from(acceptedAxisValues.values()),
        );
        const validation = validateGeneratedVariantCandidate(generatedCandidate);
        const accepted = validation.accepted && isDistinctEnough(distinctness);
        const persistedVariant = toPersistedVariant({
          studyId: generationContext.study._id,
          personaConfigId: generationContext.config._id,
          syntheticUserId: syntheticUser._id,
          axisValues: variantPlan.axisValues,
          edgeScore: variantPlan.edgeScore,
          candidate: generatedCandidate,
          coherenceScore: validation.coherenceScore,
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
            `${syntheticUser._id}:${acceptedAxisValues.size}`,
            variantPlan.axisValues,
          );
          acceptedCount += 1;
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

    if (acceptedCount === acceptedCountAtStartOfPass) {
      break;
    }

    passIndex += 1;
  }

  const allVariants = [...generationContext.existingVariants, ...persistedVariants];
  const acceptedVariants = allVariants.filter((variant) => variant.accepted);
  const rejectedCount = allVariants.length - acceptedVariants.length;
  const edgeCount = acceptedVariants.filter((variant) => variant.edgeScore >= 0.65)
    .length;

  return await ctx.runMutation(
    internal.personaVariantGenerationModel.persistVariantsIfAbsent,
    {
      studyId,
      orgId,
      variants: persistedVariants,
      summary: {
        acceptedCount: acceptedVariants.length,
        rejectedCount,
        retryCount,
        coverage: {
          budget,
          edgeCount,
          interiorCount: acceptedVariants.length - edgeCount,
          minimumPairwiseDistance: calculateMinimumPairwiseDistance(
            acceptedVariants,
          ),
          perSyntheticUser: summarizePerSyntheticUser(allVariants),
        },
      },
    },
  );
}

async function generateCandidate(
  config: Doc<"personaConfigs">,
  syntheticUser: Doc<"syntheticUsers">,
  axisValues: Record<string, number>,
  modelOverride?: string,
): Promise<GeneratedVariantCandidate> {
  try {
    const result = await generateWithModel("expansion", {
      modelOverride,
      system:
        "Return only valid JSON for a synthetic persona variant. Do not include markdown fences.",
      prompt: buildExpansionPrompt(config, syntheticUser, axisValues),
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
  personaConfigId,
  syntheticUserId,
  axisValues,
  edgeScore,
  candidate,
  coherenceScore,
  distinctnessScore,
  accepted,
}: {
  studyId: Id<"studies">;
  personaConfigId: Id<"personaConfigs">;
  syntheticUserId: Id<"syntheticUsers">;
  axisValues: Record<string, number>;
  edgeScore: number;
  candidate: GeneratedVariantCandidate;
  coherenceScore: number;
  distinctnessScore: number;
  accepted: boolean;
}) {
  return {
    studyId,
    personaConfigId,
    syntheticUserId,
    axisValues: axisValuesToArray(axisValues),
    edgeScore,
    tensionSeed: candidate.tensionSeed.trim(),
    firstPersonBio: candidate.firstPersonBio.trim(),
    behaviorRules: candidate.behaviorRules.map((rule) => rule.trim()),
    coherenceScore,
    distinctnessScore,
    accepted,
  };
}

function buildExpansionPrompt(
  config: Doc<"personaConfigs">,
  syntheticUser: Doc<"syntheticUsers">,
  axisValues: Record<string, number>,
) {
  return [
    `Config name: ${config.name}`,
    `Config context: ${config.context}`,
    `Synthetic user summary: ${syntheticUser.summary}`,
    `Evidence snippets: ${syntheticUser.evidenceSnippets.join(" | ")}`,
    `Axis values: ${JSON.stringify(axisValues)}`,
    "Return JSON with keys firstPersonBio, behaviorRules, tensionSeed, coherenceScore.",
    "The bio must be 80-150 words, behaviorRules must contain 5-8 strings, tensionSeed must be non-empty, and coherenceScore must be between 0 and 1.",
  ].join("\n");
}

function summarizeProjectedPerSyntheticUser(
  variants: PreviewSummary["projectedVariants"],
) {
  return Array.from(
    variants.reduce((map, variant) => {
      const entry = map.get(variant.syntheticUserId) ?? {
        syntheticUserId: variant.syntheticUserId,
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

      map.set(variant.syntheticUserId, entry);
      return map;
    }, new Map<Id<"syntheticUsers">, {
      syntheticUserId: Id<"syntheticUsers">;
      projectedCount: number;
      edgeCount: number;
      interiorCount: number;
    }>()),
  ).map(([, value]) => value);
}

function summarizePerSyntheticUser(variants: readonly PersistedVariant[]) {
  return Array.from(
    variants.reduce((map, variant) => {
      const entry = map.get(variant.syntheticUserId) ?? {
        syntheticUserId: variant.syntheticUserId,
        acceptedCount: 0,
        rejectedCount: 0,
      };

      if (variant.accepted) {
        entry.acceptedCount += 1;
      } else {
        entry.rejectedCount += 1;
      }

      map.set(variant.syntheticUserId, entry);
      return map;
    }, new Map<Id<"syntheticUsers">, {
      syntheticUserId: Id<"syntheticUsers">;
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
  personaConfigId: Id<"personaConfigs">;
  syntheticUserId: Id<"syntheticUsers">;
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
    perSyntheticUser: {
      syntheticUserId: Id<"syntheticUsers">;
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
    perSyntheticUser: {
      syntheticUserId: Id<"syntheticUsers">;
      projectedCount: number;
      edgeCount: number;
      interiorCount: number;
    }[];
  };
  projectedVariants: {
    syntheticUserId: Id<"syntheticUsers">;
    axisValues: { key: string; value: number }[];
    sampleType: "edge" | "interior";
    edgeScore: number;
  }[];
};

type GenerationContext = {
  study: Doc<"studies">;
  config: Doc<"personaConfigs">;
  syntheticUsers: Doc<"syntheticUsers">[];
  existingVariants: PersistedVariant[];
  resolvedBudget: number;
};

type PreviewContext = {
  config: Doc<"personaConfigs">;
  syntheticUsers: Doc<"syntheticUsers">[];
};
