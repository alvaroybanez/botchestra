import { ConvexError, v } from "convex/values";
import { z } from "zod";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";

const auditEventTypeSchema = z.enum(["study.cancelled"]);

export const recordAuditEvent = internalMutation({
  args: {
    studyId: v.id("studies"),
    actorId: v.string(),
    eventType: v.literal("study.cancelled"),
    reason: v.optional(v.string()),
    timestamp: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        studyId: z.string(),
        actorId: z.string(),
        eventType: auditEventTypeSchema,
        reason: z.string().optional(),
        timestamp: z.number().optional(),
      })
      .parse(args);
    const study = await getStudyById(
      ctx,
      parsedArgs.studyId as Id<"studies">,
    );
    const createdAt = parsedArgs.timestamp ?? Date.now();

    return await ctx.db.insert("auditEvents", {
      orgId: study.orgId,
      actorId: parsedArgs.actorId,
      eventType: parsedArgs.eventType,
      studyId: study._id,
      ...(parsedArgs.reason !== undefined ? { reason: parsedArgs.reason } : {}),
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
