import { ConvexError } from "convex/values";
import { z } from "zod";
import { zid, zInternalMutation, zInternalQuery } from "./zodHelpers";

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

const persistedVariantSchema = z.object({
  studyId: zid("studies"),
  personaPackId: zid("personaPacks"),
  protoPersonaId: zid("protoPersonas"),
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
    perProtoPersona: z.array(
      z.object({
        protoPersonaId: zid("protoPersonas"),
        acceptedCount: z.number().int().nonnegative(),
        rejectedCount: z.number().int().nonnegative(),
      }),
    ),
  }),
});

export const getGenerationContext = zInternalQuery({
  args: {
    studyId: zid("studies"),
    orgId: z.string(),
  },
  handler: async (ctx, args) => {
    const study = await ctx.db.get(args.studyId);

    if (study === null || study.orgId !== args.orgId) {
      throw new ConvexError("Study not found.");
    }

    const pack = await ctx.db.get(study.personaPackId);

    if (pack === null || pack.orgId !== args.orgId) {
      throw new ConvexError("Persona pack not found.");
    }

    if (pack.status !== "published") {
      throw new ConvexError("Variant generation requires a published persona pack.");
    }

    const protoPersonas = await ctx.db
      .query("protoPersonas")
      .withIndex("by_packId", (q) => q.eq("packId", pack._id))
      .take(10);

    if (protoPersonas.length === 0) {
      throw new ConvexError("At least one proto-persona is required.");
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
      pack,
      protoPersonas,
      existingVariants,
      resolvedBudget,
    };
  },
});

export const getStudyGenerationOwner = zInternalQuery({
  args: {
    studyId: zid("studies"),
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

export const getPreviewContext = zInternalQuery({
  args: {
    packId: zid("personaPacks"),
    orgId: z.string(),
  },
  handler: async (ctx, args) => {
    const pack = await ctx.db.get(args.packId);

    if (pack === null || pack.orgId !== args.orgId) {
      throw new ConvexError("Persona pack not found.");
    }

    if (pack.status !== "draft" && pack.status !== "published") {
      throw new ConvexError(
        "Variant preview requires a draft or published persona pack.",
      );
    }

    const protoPersonas = await ctx.db
      .query("protoPersonas")
      .withIndex("by_packId", (q) => q.eq("packId", pack._id))
      .take(10);

    if (protoPersonas.length === 0) {
      throw new ConvexError("At least one proto-persona is required.");
    }

    return {
      pack,
      protoPersonas,
    };
  },
});

export const persistVariantsIfAbsent = zInternalMutation({
  args: {
    studyId: zid("studies"),
    orgId: z.string(),
    variants: z.array(persistedVariantSchema),
    summary: generationSummarySchema,
  },
  handler: async (ctx, args) => {
    const study = await ctx.db.get(args.studyId);

    if (study === null || study.orgId !== args.orgId) {
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

    if (args.variants.length === 0 || acceptedExistingCount >= resolvedBudget) {
      return buildSummary(existingVariants, resolvedBudget);
    }

    for (const variant of args.variants) {
      await ctx.db.insert("personaVariants", variant);
    }

    return args.summary;
  },
});

export function buildSummary(
  variants: readonly {
    protoPersonaId: Id<"protoPersonas">;
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
  const perProtoPersona = Array.from(
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

  return {
    acceptedCount,
    rejectedCount,
    retryCount: 0,
    coverage: {
      budget,
      edgeCount,
      interiorCount: acceptedVariants.length - edgeCount,
      minimumPairwiseDistance: minimumPairwiseDistance(acceptedVariants),
      perProtoPersona,
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
