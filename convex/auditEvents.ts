import { ConvexError } from "convex/values";
import { z } from "zod";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";
import { zid, zInternalMutation } from "./zodHelpers";

const auditEventTypeSchema = z.enum(["study.cancelled"]);

export const recordAuditEvent = zInternalMutation({
  args: {
    studyId: zid("studies"),
    actorId: z.string(),
    eventType: auditEventTypeSchema,
    reason: z.string().optional(),
    timestamp: z.number().optional(),
  },
  handler: async (ctx, args) => {
    const study = await getStudyById(ctx, args.studyId);
    const createdAt = args.timestamp ?? Date.now();

    return await ctx.db.insert("auditEvents", {
      orgId: study.orgId,
      actorId: args.actorId,
      eventType: args.eventType,
      studyId: study._id,
      ...(args.reason !== undefined ? { reason: args.reason } : {}),
      createdAt,
    });
  },
});

async function getStudyById(ctx: MutationCtx, studyId: Id<"studies">) {
  const study = await ctx.db.get(studyId);

  if (study === null) {
    throw new ConvexError("Study not found.");
  }

  return study;
}
