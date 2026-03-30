import { ConvexError, v } from "convex/values";
import { z } from "zod";

import type { Id } from "./_generated/dataModel";
import { internalMutation, internalQuery } from "./_generated/server";
import {
  DEFAULT_RUN_BUDGET,
  MAX_RUN_BUDGET,
  MIN_RUN_BUDGET,
  resolveRunBudget,
} from "./personaEngine/variantGeneration";

const axisValueSchema = z.object({
  key: z.string(),
  value: z.number(),
});

const axisValueValidator = v.object({
  key: v.string(),
  value: v.number(),
});

const persistedVariantSchema = z.object({
  studyId: z.string(),
  personaConfigId: z.string(),
  syntheticUserId: z.string(),
  axisValues: z.array(axisValueSchema),
  edgeScore: z.number(),
  tensionSeed: z.string(),
  firstPersonBio: z.string(),
  behaviorRules: z.array(z.string()),
  coherenceScore: z.number(),
  distinctnessScore: z.number(),
  accepted: z.boolean(),
});

const generationSummarySchema = z.object({
  acceptedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  coverage: z.object({
    budget: z.number().int().nonnegative(),
    edgeCount: z.number().int().nonnegative(),
    interiorCount: z.number().int().nonnegative(),
    minimumPairwiseDistance: z.number().nonnegative(),
    perSyntheticUser: z.array(
      z.object({
        syntheticUserId: z.string(),
        acceptedCount: z.number().int().nonnegative(),
        rejectedCount: z.number().int().nonnegative(),
      }),
    ),
  }),
});

const persistedVariantValidator = v.object({
  studyId: v.id("studies"),
  personaConfigId: v.id("personaConfigs"),
  syntheticUserId: v.id("syntheticUsers"),
  axisValues: v.array(axisValueValidator),
  edgeScore: v.number(),
  tensionSeed: v.string(),
  firstPersonBio: v.string(),
  behaviorRules: v.array(v.string()),
  coherenceScore: v.number(),
  distinctnessScore: v.number(),
  accepted: v.boolean(),
});

const generationSummaryValidator = v.object({
  acceptedCount: v.number(),
  rejectedCount: v.number(),
  retryCount: v.number(),
  coverage: v.object({
    budget: v.number(),
    edgeCount: v.number(),
    interiorCount: v.number(),
    minimumPairwiseDistance: v.number(),
    perSyntheticUser: v.array(
      v.object({
        syntheticUserId: v.id("syntheticUsers"),
        acceptedCount: v.number(),
        rejectedCount: v.number(),
      }),
    ),
  }),
});

export const getGenerationContext = internalQuery({
  args: {
    studyId: v.id("studies"),
    orgId: v.string(),
  },
  handler: async (ctx, args) => {
    const study = await ctx.db.get(args.studyId);

    if (study === null || study.orgId !== args.orgId) {
      throw new ConvexError("Study not found.");
    }

    const config = await ctx.db.get(study.personaConfigId);

    if (config === null || config.orgId !== args.orgId) {
      throw new ConvexError("Persona config not found.");
    }

    if (config.status !== "published") {
      throw new ConvexError("Variant generation requires a published persona configuration.");
    }

    const syntheticUsers = await ctx.db
      .query("syntheticUsers")
      .withIndex("by_configId", (q) => q.eq("configId", config._id))
      .take(10);

    if (syntheticUsers.length === 0) {
      throw new ConvexError("At least one synthetic user is required.");
    }

    const existingVariants = await ctx.db
      .query("personaVariants")
      .withIndex("by_studyId", (q) => q.eq("studyId", study._id))
      .collect();

    const resolvedBudget = resolveRunBudget(
      (study as { runBudget?: number }).runBudget ?? DEFAULT_RUN_BUDGET,
    );

    return {
      study,
      config,
      syntheticUsers,
      existingVariants,
      resolvedBudget,
    };
  },
});

export const getStudyGenerationOwner = internalQuery({
  args: {
    studyId: v.id("studies"),
  },
  handler: async (ctx, args) => {
    const study = await ctx.db.get(args.studyId);

    if (study === null) {
      throw new ConvexError("Study not found.");
    }

    return {
      orgId: study.orgId,
    };
  },
});

export const getPreviewContext = internalQuery({
  args: {
    configId: v.id("personaConfigs"),
    orgId: v.string(),
  },
  handler: async (ctx, args) => {
    const config = await ctx.db.get(args.configId);

    if (config === null || config.orgId !== args.orgId) {
      throw new ConvexError("Persona config not found.");
    }

    if (config.status !== "draft" && config.status !== "published") {
      throw new ConvexError(
        "Variant preview requires a draft or published persona configuration.",
      );
    }

    const syntheticUsers = await ctx.db
      .query("syntheticUsers")
      .withIndex("by_configId", (q) => q.eq("configId", config._id))
      .take(10);

    if (syntheticUsers.length === 0) {
      throw new ConvexError("At least one synthetic user is required.");
    }

    return {
      config,
      syntheticUsers,
    };
  },
});

export const persistVariantsIfAbsent = internalMutation({
  args: {
    studyId: v.id("studies"),
    orgId: v.string(),
    variants: v.array(persistedVariantValidator),
    summary: generationSummaryValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        studyId: z.string(),
        orgId: z.string(),
        variants: z.array(persistedVariantSchema),
        summary: generationSummarySchema,
      })
      .parse(args);
    const study = await ctx.db.get(args.studyId);

    if (study === null || study.orgId !== parsedArgs.orgId) {
      throw new ConvexError("Study not found.");
    }

    const existingVariants = await ctx.db
      .query("personaVariants")
      .withIndex("by_studyId", (q) => q.eq("studyId", args.studyId))
      .collect();

    const resolvedBudget = resolveRunBudget(
      (study as { runBudget?: number }).runBudget ?? DEFAULT_RUN_BUDGET,
    );
    const acceptedExistingCount = existingVariants.filter(
      (variant) => variant.accepted,
    ).length;

    if (parsedArgs.variants.length === 0 || acceptedExistingCount >= resolvedBudget) {
      return buildSummary(existingVariants, resolvedBudget);
    }

    for (const variant of parsedArgs.variants) {
      await ctx.db.insert("personaVariants", {
        ...variant,
        studyId: variant.studyId as Id<"studies">,
        personaConfigId: variant.personaConfigId as Id<"personaConfigs">,
        syntheticUserId: variant.syntheticUserId as Id<"syntheticUsers">,
      });
    }

    return parsedArgs.summary;
  },
});

export function buildSummary(
  variants: readonly {
    syntheticUserId: Id<"syntheticUsers">;
    axisValues: readonly { key: string; value: number }[];
    accepted: boolean;
    edgeScore: number;
  }[],
  budget: number,
) {
  const acceptedVariants = variants.filter((variant) => variant.accepted);
  const acceptedCount = acceptedVariants.length;
  const rejectedCount = variants.length - acceptedCount;
  const edgeCount = acceptedVariants.filter((variant) => variant.edgeScore >= 0.65)
    .length;
  const perSyntheticUser = Array.from(
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

  return {
    acceptedCount,
    rejectedCount,
    retryCount: 0,
    coverage: {
      budget,
      edgeCount,
      interiorCount: acceptedVariants.length - edgeCount,
      minimumPairwiseDistance: minimumPairwiseDistance(acceptedVariants),
      perSyntheticUser,
    },
  };
}

export const RUN_BUDGET_ERROR = `Run budget must be an integer between ${MIN_RUN_BUDGET} and ${MAX_RUN_BUDGET}.`;

function minimumPairwiseDistance(
  variants: readonly {
    axisValues: readonly { key: string; value: number }[];
  }[],
): number {
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
      minimumDistance = Math.min(
        minimumDistance,
        Math.sqrt(
          Object.keys({ ...left, ...right }).reduce((sum, key) => {
            const delta = (left[key] ?? 0) - (right[key] ?? 0);
            return sum + delta ** 2;
          }, 0),
        ),
      );
    }
  }

  return Number.isFinite(minimumDistance) ? minimumDistance : 1;
}

function toAxisRecord(axisValues: readonly { key: string; value: number }[]) {
  return Object.fromEntries(axisValues.map((axisValue) => [axisValue.key, axisValue.value]));
}
