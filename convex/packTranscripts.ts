import { ConvexError, v } from "convex/values";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { assertPackIsDraft } from "./personaPacks";
import { requireIdentity, requireRole, STUDY_MANAGER_ROLES } from "./rbac";

const MAX_PACK_TRANSCRIPT_QUERY_SIZE = 100;

export const attachTranscript = mutation({
  args: {
    packId: v.id("personaPacks"),
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const pack = await loadPackForOrg(ctx, args.packId, identity.tokenIdentifier);
    const transcript = await loadTranscriptForOrg(
      ctx,
      args.transcriptId,
      identity.tokenIdentifier,
    );

    assertPackIsDraft(pack);

    const existing = await findPackTranscript(ctx, args.packId, args.transcriptId);

    if (existing !== null) {
      throw new ConvexError("Transcript is already attached to this pack.");
    }

    const createdAt = Date.now();
    const packTranscriptId = await ctx.db.insert("packTranscripts", {
      packId: pack._id,
      transcriptId: transcript._id,
      createdAt,
    });

    await ctx.db.patch(pack._id, {
      updatedBy: identity.tokenIdentifier,
      updatedAt: createdAt,
    });

    return {
      _id: packTranscriptId,
      packId: pack._id,
      transcriptId: transcript._id,
      createdAt,
    };
  },
});

export const detachTranscript = mutation({
  args: {
    packId: v.id("personaPacks"),
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const pack = await loadPackForOrg(ctx, args.packId, identity.tokenIdentifier);
    await loadTranscriptForOrg(ctx, args.transcriptId, identity.tokenIdentifier);

    assertPackIsDraft(pack);

    const existing = await findPackTranscript(ctx, args.packId, args.transcriptId);

    if (existing === null) {
      throw new ConvexError("Transcript is not attached to this pack.");
    }

    await ctx.db.delete(existing._id);
    await ctx.db.patch(pack._id, {
      updatedBy: identity.tokenIdentifier,
      updatedAt: Date.now(),
    });

    return {
      packId: args.packId,
      transcriptId: args.transcriptId,
      detached: true as const,
    };
  },
});

export const listPackTranscripts = query({
  args: {
    packId: v.id("personaPacks"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const pack = await ctx.db.get(args.packId);

    if (pack === null || pack.orgId !== identity.tokenIdentifier) {
      return [];
    }

    const associations = await ctx.db
      .query("packTranscripts")
      .withIndex("by_packId", (q) => q.eq("packId", args.packId))
      .take(MAX_PACK_TRANSCRIPT_QUERY_SIZE);
    const results = [];

    for (const association of associations) {
      const transcript = await ctx.db.get(association.transcriptId);

      if (transcript === null || transcript.orgId !== identity.tokenIdentifier) {
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

export const listTranscriptPacks = query({
  args: {
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const transcript = await ctx.db.get(args.transcriptId);

    if (transcript === null || transcript.orgId !== identity.tokenIdentifier) {
      return [];
    }

    const associations = await ctx.db
      .query("packTranscripts")
      .withIndex("by_transcriptId", (q) => q.eq("transcriptId", args.transcriptId))
      .take(MAX_PACK_TRANSCRIPT_QUERY_SIZE);
    const results = [];

    for (const association of associations) {
      const pack = await ctx.db.get(association.packId);

      if (pack === null || pack.orgId !== identity.tokenIdentifier) {
        continue;
      }

      results.push({
        ...association,
        pack,
      });
    }

    return results;
  },
});

async function loadPackForOrg(
  ctx: QueryCtx | MutationCtx,
  packId: Id<"personaPacks">,
  orgId: string,
) {
  const pack = await ctx.db.get(packId);

  if (pack === null || pack.orgId !== orgId) {
    throw new ConvexError("Persona pack not found.");
  }

  return pack;
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

async function findPackTranscript(
  ctx: QueryCtx | MutationCtx,
  packId: Id<"personaPacks">,
  transcriptId: Id<"transcripts">,
) {
  const associations = await ctx.db
    .query("packTranscripts")
    .withIndex("by_packId", (q) => q.eq("packId", packId))
    .take(MAX_PACK_TRANSCRIPT_QUERY_SIZE);

  return associations.find((association) => association.transcriptId === transcriptId) ?? null;
}
