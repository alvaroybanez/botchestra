import { ConvexError, v } from "convex/values";
import { z } from "zod";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation } from "./_generated/server";
import { COMMENTER_ROLES, requireRole, resolveOrgId } from "./rbac";

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

export const addNote = mutation({
  args: {
    issueId: v.id("issueClusters"),
    note: v.string(),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        issueId: z.string(),
        note: requiredString("Analyst note"),
      })
      .parse(args);
    const { identity } = await requireRole(ctx, COMMENTER_ROLES);
    await getIssueClusterForOrg(
      ctx,
      parsedArgs.issueId as Id<"issueClusters">,
      resolveOrgId(identity),
    );

    const createdAt = Date.now();
    const noteId = await ctx.db.insert("issueClusterNotes", {
      issueClusterId: parsedArgs.issueId as Id<"issueClusters">,
      authorId: identity.subject,
      note: parsedArgs.note,
      createdAt,
    });

    const insertedNote = await ctx.db.get("issueClusterNotes", noteId);

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
  const issueCluster = await ctx.db.get("issueClusters", issueId);

  if (issueCluster === null) {
    throw new ConvexError("Issue cluster not found.");
  }

  const study = await ctx.db.get("studies", issueCluster.studyId);

  if (study === null || study.orgId !== orgId) {
    throw new ConvexError("Issue cluster not found.");
  }

  return issueCluster;
}
