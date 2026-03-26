import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import { zCustomMutation, zid } from "convex-helpers/server/zod";
import { z } from "zod";

import type { Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { mutation } from "./_generated/server";

const zMutation = zCustomMutation(mutation, NoOp);

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

export const addNote = zMutation({
  args: {
    issueId: zid("issueClusters"),
    note: requiredString("Analyst note"),
    authorId: requiredString("Author ID"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    await getIssueClusterForOrg(ctx, args.issueId, identity.tokenIdentifier);

    const createdAt = Date.now();
    const noteId = await ctx.db.insert("issueClusterNotes", {
      issueClusterId: args.issueId,
      authorId: args.authorId,
      note: args.note,
      createdAt,
    });

    const insertedNote = await ctx.db.get(noteId);

    if (insertedNote === null) {
      throw new ConvexError("Analyst note could not be created.");
    }

    return insertedNote;
  },
});

async function requireIdentity(ctx: QueryCtx | MutationCtx | ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (identity === null) {
    throw new ConvexError("Not authenticated.");
  }

  return identity;
}

async function getIssueClusterForOrg(
  ctx: QueryCtx | MutationCtx,
  issueId: Id<"issueClusters">,
  orgId: string,
) {
  const issueCluster = await ctx.db.get(issueId);

  if (issueCluster === null) {
    throw new ConvexError("Issue cluster not found.");
  }

  const study = await ctx.db.get(issueCluster.studyId);

  if (study === null || study.orgId !== orgId) {
    throw new ConvexError("Issue cluster not found.");
  }

  return issueCluster;
}
