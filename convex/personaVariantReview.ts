import { ConvexError, v } from "convex/values";
import { z } from "zod";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { DEFAULT_RUN_BUDGET, MAX_RUN_BUDGET } from "./personaEngine/variantGeneration";

const studySummarySchema = z.object({
  _id: z.string(),
  name: z.string(),
  status: z.string(),
  runBudget: z.number(),
  updatedAt: z.number(),
});

export const getStudyVariantReview = query({
  args: {
    studyId: v.id("studies"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const study = await ctx.db.get(args.studyId);

    if (study === null || study.orgId !== identity.tokenIdentifier) {
      return null;
    }

    const pack = await ctx.db.get(study.personaPackId);

    if (pack === null || pack.orgId !== identity.tokenIdentifier) {
      return null;
    }

    return {
      ...(await buildVariantReviewData(ctx, pack, study)),
    };
  },
});

export const getPackVariantReview = query({
  args: {
    packId: v.id("personaPacks"),
    studyId: v.optional(v.id("studies")),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const pack = await ctx.db.get(args.packId);

    if (pack === null || pack.orgId !== identity.tokenIdentifier) {
      return null;
    }

    const studies = await ctx.db
      .query("studies")
      .withIndex("by_personaPackId", (q) => q.eq("personaPackId", pack._id))
      .order("desc")
      .take(10);

    const acceptedVariantCounts = new Map<Id<"studies">, number>();
    const acceptedVariantsByStudy = new Map<
      Id<"studies">,
      Doc<"personaVariants">[]
    >();

    for (const study of studies) {
      if (study.orgId !== identity.tokenIdentifier) {
        continue;
      }

      const variants = await ctx.db
        .query("personaVariants")
        .withIndex("by_studyId", (q) => q.eq("studyId", study._id))
        .take(MAX_RUN_BUDGET);
      const acceptedVariants = variants.filter((variant) => variant.accepted);
      acceptedVariantsByStudy.set(study._id, acceptedVariants);
      acceptedVariantCounts.set(study._id, acceptedVariants.length);
    }

    const scopedStudies = studies.filter(
      (study) => study.orgId === identity.tokenIdentifier,
    );
    const selectedStudy =
      scopedStudies.find((study) => study._id === args.studyId) ??
      scopedStudies.find(
        (study) => (acceptedVariantCounts.get(study._id) ?? 0) > 0,
      ) ??
      scopedStudies[0] ??
      null;

    return {
      studies: scopedStudies.map((study) => ({
        ...toStudySummary(study),
        acceptedVariantCount: acceptedVariantCounts.get(study._id) ?? 0,
      })),
      selectedStudy: selectedStudy ? toStudySummary(selectedStudy) : null,
      ...(await buildVariantReviewData(ctx, pack, selectedStudy, {
        acceptedVariants:
          selectedStudy === null
            ? []
            : acceptedVariantsByStudy.get(selectedStudy._id) ?? [],
      })),
    };
  },
});

async function buildVariantReviewData(
  ctx: QueryCtx,
  pack: Doc<"personaPacks">,
  study: Doc<"studies"> | null,
  options?: {
    acceptedVariants?: Doc<"personaVariants">[];
  },
) {
  const syntheticUsers = await ctx.db
    .query("syntheticUsers")
    .withIndex("by_packId", (q) => q.eq("packId", pack._id))
    .take(10);
  const syntheticUserMap = new Map(
    syntheticUsers.map((syntheticUser) => [syntheticUser._id, syntheticUser]),
  );
  const acceptedVariants =
    options?.acceptedVariants ??
    (study === null
      ? []
      : await listAcceptedVariantsForStudy(ctx, study._id));

  return {
    study: study ? toStudySummary(study) : null,
    pack: {
      _id: pack._id,
      name: pack.name,
      status: pack.status,
      sharedAxes: pack.sharedAxes,
    },
    syntheticUsers: syntheticUsers.map((syntheticUser) => ({
      _id: syntheticUser._id,
      name: syntheticUser.name,
      summary: syntheticUser.summary,
    })),
    variants: acceptedVariants.flatMap((variant) => {
      const syntheticUser = syntheticUserMap.get(variant.syntheticUserId);

      if (!syntheticUser) {
        throw new ConvexError(
          "Persona variant references a synthetic user outside the study's pack.",
        );
      }

      return [
        {
          _id: variant._id,
          syntheticUserId: variant.syntheticUserId,
          syntheticUserName: syntheticUser.name,
          axisValues: variant.axisValues,
          edgeScore: variant.edgeScore,
          coherenceScore: variant.coherenceScore,
          distinctnessScore: variant.distinctnessScore,
          firstPersonBio: variant.firstPersonBio,
        },
      ];
    }),
  };
}

async function listAcceptedVariantsForStudy(
  ctx: QueryCtx,
  studyId: Id<"studies">,
) {
  const variants = await ctx.db
    .query("personaVariants")
    .withIndex("by_studyId", (q) => q.eq("studyId", studyId))
    .take(MAX_RUN_BUDGET);

  return variants.filter((variant) => variant.accepted);
}

function toStudySummary(study: Doc<"studies">) {
  return {
    _id: study._id,
    name: study.name,
    status: study.status,
    runBudget: study.runBudget ?? DEFAULT_RUN_BUDGET,
    updatedAt: study.updatedAt,
  };
}

async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (identity === null) {
    throw new ConvexError("Not authenticated.");
  }

  return identity;
}
