import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import { zCustomQuery, zid } from "convex-helpers/server/zod";
import { z } from "zod";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { DEFAULT_RUN_BUDGET, MAX_RUN_BUDGET } from "./personaEngine/variantGeneration";

const zQuery = zCustomQuery(query, NoOp);

const studySummarySchema = z.object({
  _id: zid("studies"),
  name: z.string(),
  status: z.string(),
  runBudget: z.number(),
  updatedAt: z.number(),
});

export const getStudyVariantReview = zQuery({
  args: {
    studyId: zid("studies"),
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

export const getPackVariantReview = zQuery({
  args: {
    packId: zid("personaPacks"),
    studyId: studySummarySchema.shape._id.optional(),
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
  const protoPersonas = await ctx.db
    .query("protoPersonas")
    .withIndex("by_packId", (q) => q.eq("packId", pack._id))
    .take(10);
  const protoPersonaMap = new Map(
    protoPersonas.map((protoPersona) => [protoPersona._id, protoPersona]),
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
    protoPersonas: protoPersonas.map((protoPersona) => ({
      _id: protoPersona._id,
      name: protoPersona.name,
      summary: protoPersona.summary,
    })),
    variants: acceptedVariants.flatMap((variant) => {
      const protoPersona = protoPersonaMap.get(variant.protoPersonaId);

      if (!protoPersona) {
        throw new ConvexError(
          "Persona variant references a proto-persona outside the study's pack.",
        );
      }

      return [
        {
          _id: variant._id,
          protoPersonaId: variant.protoPersonaId,
          protoPersonaName: protoPersona.name,
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
