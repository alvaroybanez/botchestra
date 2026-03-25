import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import { zCustomQuery, zid } from "convex-helpers/server/zod";

import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { DEFAULT_RUN_BUDGET, MAX_RUN_BUDGET } from "./personaEngine/variantGeneration";

const zQuery = zCustomQuery(query, NoOp);

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

    const protoPersonas = await ctx.db
      .query("protoPersonas")
      .withIndex("by_packId", (q) => q.eq("packId", pack._id))
      .take(10);
    const protoPersonaMap = new Map(
      protoPersonas.map((protoPersona) => [protoPersona._id, protoPersona]),
    );
    const variants = await ctx.db
      .query("personaVariants")
      .withIndex("by_studyId", (q) => q.eq("studyId", study._id))
      .take(MAX_RUN_BUDGET);

    return {
      study: {
        _id: study._id,
        name: study.name,
        status: study.status,
        runBudget: study.runBudget ?? DEFAULT_RUN_BUDGET,
        updatedAt: study.updatedAt,
      },
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
      variants: variants.flatMap((variant) => {
        if (!variant.accepted) {
          return [];
        }

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
  },
});

async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (identity === null) {
    throw new ConvexError("Not authenticated.");
  }

  return identity;
}
