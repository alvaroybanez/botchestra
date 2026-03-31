"use node";

import { ConvexError, v } from "convex/values";

import { generateWithModel } from "../packages/ai/src/index";

import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { type ActionCtx, internalAction } from "./_generated/server";
import {
  buildExpandedSyntheticUserPrompt,
  parseExpandedSyntheticUserResponse,
} from "./batchGeneration/expansion";

export const expandNextUser = internalAction({
  args: {
    runId: v.id("batchGenerationRuns"),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(
      internal.batchGeneration.claimNextSyntheticUserForExpansion,
      {
        runId: args.runId,
      },
    );

    if (claim === null) {
      return null;
    }

    try {
      const generatedUser = await generateSyntheticUserExpansion(
        ctx,
        claim.orgId,
        claim.config,
        claim.syntheticUser,
      );

      await ctx.runMutation(internal.batchGeneration.completeSyntheticUserExpansion, {
        runId: claim.runId,
        syntheticUserId: claim.syntheticUserId,
        generatedUser,
      });
    } catch (error) {
      await ctx.runMutation(internal.batchGeneration.failSyntheticUserExpansion, {
        runId: claim.runId,
        syntheticUserId: claim.syntheticUserId,
        errorMessage: getErrorMessage(error),
      });
    }

    await ctx.scheduler.runAfter(0, internal.batchGenerationAction.expandNextUser, {
      runId: args.runId,
    });

    return null;
  },
});

export const regenerateSyntheticUserProfile = internalAction({
  args: {
    syntheticUserId: v.id("syntheticUsers"),
  },
  handler: async (ctx, args) => {
    const claim = await ctx.runMutation(
      internal.batchGeneration.claimSyntheticUserForRegeneration,
      {
        syntheticUserId: args.syntheticUserId,
      },
    );

    try {
      const generatedUser = await generateSyntheticUserExpansion(
        ctx,
        claim.orgId,
        claim.config,
        claim.syntheticUser,
      );

      await ctx.runMutation(internal.batchGeneration.completeSyntheticUserExpansion, {
        syntheticUserId: args.syntheticUserId,
        generatedUser,
      });
    } catch (error) {
      await ctx.runMutation(internal.batchGeneration.failSyntheticUserExpansion, {
        syntheticUserId: args.syntheticUserId,
        errorMessage: getErrorMessage(error),
      });
    }

    return null;
  },
});

async function generateSyntheticUserExpansion(
  ctx: ActionCtx,
  orgId: string,
  config: Doc<"personaConfigs">,
  syntheticUser: {
    name: string;
    summary: string;
    axes: {
      key: string;
      label: string;
      description: string;
      lowAnchor: string;
      midAnchor: string;
      highAnchor: string;
      weight: number;
    }[];
    axisValues?: { key: string; value: number }[];
    evidenceSnippets: string[];
  },
) {
  const settings = await ctx.runQuery(internal.settings.getEffectiveSettingsForOrg, {
    orgId,
  });
  const expansionModelOverride = settings.modelConfig.find(
    (entry: { taskCategory: string; modelId: string }) =>
      entry.taskCategory === "expansion",
  )?.modelId;
  const result = await generateWithModel("expansion", {
    modelOverride: expansionModelOverride,
    system:
      "Return only valid JSON for a generated synthetic user. Do not include markdown fences.",
    prompt: buildExpandedSyntheticUserPrompt(config, syntheticUser),
  });

  return parseExpandedSyntheticUserResponse(result.text, syntheticUser.axes);
}

function getErrorMessage(error: unknown) {
  if (error instanceof ConvexError && typeof error.data === "string") {
    return error.data;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Synthetic user expansion failed.";
}
