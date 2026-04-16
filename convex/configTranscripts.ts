import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertConfigIsDraft } from "./personaConfigs";
import { requireIdentity, requireRole, resolveOrgId, STUDY_MANAGER_ROLES } from "./rbac";

const MAX_CONFIG_TRANSCRIPT_QUERY_SIZE = 100;

export const attachTranscript = mutation({
  args: {
    configId: v.id("personaConfigs"),
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const config = await loadConfigForOrg(ctx, args.configId, resolveOrgId(identity));
    const transcript = await loadTranscriptForOrg(
      ctx,
      args.transcriptId,
      resolveOrgId(identity),
    );

    assertConfigIsDraft(config);

    const existing = await findConfigTranscript(ctx, args.configId, args.transcriptId);

    if (existing !== null) {
      throw new ConvexError("Transcript is already attached to this persona configuration.");
    }

    const createdAt = Date.now();
    const configTranscriptId = await ctx.db.insert("configTranscripts", {
      configId: config._id,
      transcriptId: transcript._id,
      createdAt,
    });

    await ctx.db.patch(config._id, {
      updatedBy: resolveOrgId(identity),
      updatedAt: createdAt,
    });

    return {
      _id: configTranscriptId,
      configId: config._id,
      transcriptId: transcript._id,
      createdAt,
    };
  },
});

export const detachTranscript = mutation({
  args: {
    configId: v.id("personaConfigs"),
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const config = await loadConfigForOrg(ctx, args.configId, resolveOrgId(identity));
    await loadTranscriptForOrg(ctx, args.transcriptId, resolveOrgId(identity));

    assertConfigIsDraft(config);

    const existing = await findConfigTranscript(ctx, args.configId, args.transcriptId);

    if (existing === null) {
      throw new ConvexError("Transcript is not attached to this persona configuration.");
    }

    await ctx.db.delete(existing._id);
    await ctx.db.patch(config._id, {
      updatedBy: resolveOrgId(identity),
      updatedAt: Date.now(),
    });

    return {
      configId: args.configId,
      transcriptId: args.transcriptId,
      detached: true as const,
    };
  },
});

export const listConfigTranscripts = query({
  args: {
    configId: v.id("personaConfigs"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const config = await ctx.db.get(args.configId);

    if (config === null || config.orgId !== resolveOrgId(identity)) {
      return [];
    }

    const associations = await ctx.db
      .query("configTranscripts")
      .withIndex("by_configId", (q) => q.eq("configId", args.configId))
      .take(MAX_CONFIG_TRANSCRIPT_QUERY_SIZE);
    const results = [];

    for (const association of associations) {
      const transcript = await ctx.db.get(association.transcriptId);

      if (transcript === null || transcript.orgId !== resolveOrgId(identity)) {
        continue;
      }

      results.push({
        ...association,
        transcript,
      });
    }

    return results;
  },
});

export const listTranscriptConfigs = query({
  args: {
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const transcript = await ctx.db.get(args.transcriptId);

    if (transcript === null || transcript.orgId !== resolveOrgId(identity)) {
      return [];
    }

    const associations = await ctx.db
      .query("configTranscripts")
      .withIndex("by_transcriptId", (q) => q.eq("transcriptId", args.transcriptId))
      .take(MAX_CONFIG_TRANSCRIPT_QUERY_SIZE);
    const results = [];

    for (const association of associations) {
      const config = await ctx.db.get(association.configId);

      if (config === null || config.orgId !== resolveOrgId(identity)) {
        continue;
      }

      results.push({
        ...association,
        config,
      });
    }

    return results;
  },
});

async function loadConfigForOrg(
  ctx: QueryCtx | MutationCtx,
  configId: Id<"personaConfigs">,
  orgId: string,
) {
  const config = await ctx.db.get(configId);

  if (config === null || config.orgId !== orgId) {
    throw new ConvexError("Persona configuration not found.");
  }

  return config;
}

async function loadTranscriptForOrg(
  ctx: QueryCtx | MutationCtx,
  transcriptId: Id<"transcripts">,
  orgId: string,
) {
  const transcript = await ctx.db.get(transcriptId);

  if (transcript === null || transcript.orgId !== orgId) {
    throw new ConvexError("Transcript not found.");
  }

  return transcript;
}

async function findConfigTranscript(
  ctx: QueryCtx | MutationCtx,
  configId: Id<"personaConfigs">,
  transcriptId: Id<"transcripts">,
) {
  const associations = await ctx.db
    .query("configTranscripts")
    .withIndex("by_configId", (q) => q.eq("configId", configId))
    .take(MAX_CONFIG_TRANSCRIPT_QUERY_SIZE);

  return associations.find((association) => association.transcriptId === transcriptId) ?? null;
}
