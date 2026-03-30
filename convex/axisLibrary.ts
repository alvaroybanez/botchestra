import { ConvexError, v } from "convex/values";
import { z } from "zod";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireIdentity, requireRole, STUDY_MANAGER_ROLES } from "./rbac";

const MAX_AXIS_DEFINITION_QUERY_SIZE = 100;
const AXIS_KEY_PATTERN = /^[a-z0-9_]+$/;

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

const axisKeySchema = requiredString("Axis key").regex(
  AXIS_KEY_PATTERN,
  "Axis key must be snake_case (lowercase letters, numbers, and underscores only).",
);

const axisDefinitionInputSchema = z.object({
  key: axisKeySchema,
  label: requiredString("Axis label"),
  description: requiredString("Axis description"),
  lowAnchor: requiredString("Axis lowAnchor"),
  midAnchor: requiredString("Axis midAnchor"),
  highAnchor: requiredString("Axis highAnchor"),
  weight: z.number().positive("Axis weight must be a positive number."),
  tags: z.array(requiredString("Axis tag")),
});

const axisDefinitionInputValidator = v.object({
  key: v.string(),
  label: v.string(),
  description: v.string(),
  lowAnchor: v.string(),
  midAnchor: v.string(),
  highAnchor: v.string(),
  weight: v.number(),
  tags: v.array(v.string()),
});

const axisDefinitionPatchSchema = z
  .object({
    key: axisKeySchema.optional(),
    label: requiredString("Axis label").optional(),
    description: requiredString("Axis description").optional(),
    lowAnchor: requiredString("Axis lowAnchor").optional(),
    midAnchor: requiredString("Axis midAnchor").optional(),
    highAnchor: requiredString("Axis highAnchor").optional(),
    weight: z
      .number()
      .positive("Axis weight must be a positive number.")
      .optional(),
    tags: z.array(requiredString("Axis tag")).optional(),
  })
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    "At least one axis field must be provided.",
  );

const axisDefinitionPatchValidator = v.object({
  key: v.optional(v.string()),
  label: v.optional(v.string()),
  description: v.optional(v.string()),
  lowAnchor: v.optional(v.string()),
  midAnchor: v.optional(v.string()),
  highAnchor: v.optional(v.string()),
  weight: v.optional(v.number()),
  tags: v.optional(v.array(v.string())),
});

export const createAxisDefinition = mutation({
  args: {
    axis: axisDefinitionInputValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z.object({ axis: axisDefinitionInputSchema }).parse(args);
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const orgId = identity.tokenIdentifier;
    const existing = await getAxisDefinitionByKey(ctx, orgId, parsedArgs.axis.key);

    if (existing !== null) {
      throw new ConvexError(
        `Axis definition with key "${parsedArgs.axis.key}" already exists.`,
      );
    }

    const now = Date.now();

    return await ctx.db.insert("axisDefinitions", {
      ...parsedArgs.axis,
      usageCount: 0,
      creationSource: "manual",
      orgId,
      createdBy: identity.tokenIdentifier,
      updatedBy: identity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateAxisDefinition = mutation({
  args: {
    axisDefinitionId: v.id("axisDefinitions"),
    patch: axisDefinitionPatchValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        axisDefinitionId: z.string(),
        patch: axisDefinitionPatchSchema,
      })
      .parse(args);
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const axisDefinitionId = parsedArgs.axisDefinitionId as Id<"axisDefinitions">;
    const existing = await loadAxisDefinitionForOrg(
      ctx,
      axisDefinitionId,
      identity.tokenIdentifier,
    );

    if (
      parsedArgs.patch.key !== undefined &&
      parsedArgs.patch.key !== existing.key
    ) {
      throw new ConvexError("Axis definition key is immutable.");
    }

    const updatedAt = Date.now();

    await ctx.db.replace(existing._id, {
      key: existing.key,
      label: parsedArgs.patch.label ?? existing.label,
      description: parsedArgs.patch.description ?? existing.description,
      lowAnchor: parsedArgs.patch.lowAnchor ?? existing.lowAnchor,
      midAnchor: parsedArgs.patch.midAnchor ?? existing.midAnchor,
      highAnchor: parsedArgs.patch.highAnchor ?? existing.highAnchor,
      weight: parsedArgs.patch.weight ?? existing.weight,
      tags: parsedArgs.patch.tags ?? existing.tags,
      usageCount: existing.usageCount,
      creationSource: existing.creationSource,
      orgId: existing.orgId,
      createdBy: existing.createdBy,
      updatedBy: identity.tokenIdentifier,
      createdAt: existing.createdAt,
      updatedAt,
    });

    return await loadAxisDefinitionForOrg(ctx, axisDefinitionId, identity.tokenIdentifier);
  },
});

export const deleteAxisDefinition = mutation({
  args: {
    axisDefinitionId: v.id("axisDefinitions"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const axisDefinition = await loadAxisDefinitionForOrg(
      ctx,
      args.axisDefinitionId,
      identity.tokenIdentifier,
    );

    await ctx.db.delete(axisDefinition._id);

    return {
      axisDefinitionId: axisDefinition._id,
      deleted: true as const,
    };
  },
});

export const listAxisDefinitions = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);

    return await ctx.db
      .query("axisDefinitions")
      .withIndex("by_orgId", (q) => q.eq("orgId", identity.tokenIdentifier))
      .order("desc")
      .take(MAX_AXIS_DEFINITION_QUERY_SIZE);
  },
});

export const getAxisDefinition = query({
  args: {
    axisDefinitionId: v.id("axisDefinitions"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const axisDefinition = await ctx.db.get(args.axisDefinitionId);

    if (
      axisDefinition === null ||
      axisDefinition.orgId !== identity.tokenIdentifier
    ) {
      return null;
    }

    return axisDefinition;
  },
});

async function getAxisDefinitionByKey(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
  key: string,
) {
  const query = ctx.db
    .query("axisDefinitions")
    .withIndex("by_orgId", (q) => q.eq("orgId", orgId));

  for await (const axisDefinition of query) {
    if (axisDefinition.key === key) {
      return axisDefinition;
    }
  }

  return null;
}

async function loadAxisDefinitionForOrg(
  ctx: QueryCtx | MutationCtx,
  axisDefinitionId: Id<"axisDefinitions">,
  orgId: string,
): Promise<Doc<"axisDefinitions">> {
  const axisDefinition = await ctx.db.get(axisDefinitionId);

  if (axisDefinition === null || axisDefinition.orgId !== orgId) {
    throw new ConvexError("Axis definition not found.");
  }

  return axisDefinition;
}
