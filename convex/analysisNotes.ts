import { ConvexError } from "convex/values";
import { z } from "zod";

import type { Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { COMMENTER_ROLES, requireIdentity, requireRole } from "./rbac";
import { zid, zMutation } from "./zodHelpers";

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

export const addNote = zMutation({
  args: {
    issueId: zid("issueClusters"),
    note: requiredString("Analyst note"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, COMMENTER_ROLES);
    await getIssueClusterForOrg(ctx, args.issueId, identity.tokenIdentifier);

    const createdAt = Date.now();
    const noteId = await ctx.db.insert("issueClusterNotes", {
      issueClusterId: args.issueId,
      authorId: identity.subject,
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
