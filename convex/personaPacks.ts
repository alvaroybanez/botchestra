import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import { zCustomMutation, zCustomQuery, zid } from "convex-helpers/server/zod";
import { z } from "zod";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const zMutation = zCustomMutation(mutation, NoOp);
const zQuery = zCustomQuery(query, NoOp);

const draftStatusSchema = z.enum(["draft", "published", "archived"]);

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

const axisSchema = z.object({
  key: requiredString("Axis key"),
  label: requiredString("Axis label"),
  description: requiredString("Axis description"),
  lowAnchor: requiredString("Axis lowAnchor"),
  midAnchor: requiredString("Axis midAnchor"),
  highAnchor: requiredString("Axis highAnchor"),
  weight: z.number().positive("Axis weight must be a positive number."),
});

const sharedAxesSchema = z
  .array(axisSchema)
  .min(1, "At least one shared axis is required.")
  .superRefine((axes, ctx) => {
    const seen = new Set<string>();

    axes.forEach((axis, index) => {
      if (seen.has(axis.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "Axis keys must be unique within a pack.",
        });
        return;
      }

      seen.add(axis.key);
    });
  });

const createDraftSchema = z.object({
  name: requiredString("Pack name"),
  description: requiredString("Pack description"),
  context: requiredString("Pack context"),
  sharedAxes: sharedAxesSchema,
});

const updateDraftSchema = z
  .object({
    name: requiredString("Pack name").optional(),
    description: requiredString("Pack description").optional(),
    context: requiredString("Pack context").optional(),
    sharedAxes: sharedAxesSchema.optional(),
  })
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    "At least one draft field must be provided.",
  );

export const createDraft = zMutation({
  args: {
    pack: createDraftSchema,
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const now = Date.now();

    return await ctx.db.insert("personaPacks", {
      ...args.pack,
      version: 1,
      status: "draft",
      orgId: identity.tokenIdentifier,
      createdBy: identity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateDraft = zMutation({
  args: {
    packId: zid("personaPacks"),
    patch: updateDraftSchema,
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const pack = await getPackForIdentity(ctx, args.packId, identity.tokenIdentifier);

    assertPackIsDraft(pack);

    await ctx.db.patch(args.packId, {
      ...args.patch,
      updatedAt: Date.now(),
    });

    return args.packId;
  },
});

export const publish = zMutation({
  args: {
    packId: zid("personaPacks"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const pack = await getPackForIdentity(ctx, args.packId, identity.tokenIdentifier);

    if (pack.status === "published") {
      throw new ConvexError("Persona pack is already published.");
    }

    if (pack.status === "archived") {
      throw new ConvexError("Archived persona packs cannot be published.");
    }

    const hasProtoPersonas = await packHasProtoPersonas(ctx, args.packId);

    if (!hasProtoPersonas) {
      throw new ConvexError(
        "At least one proto-persona is required before publishing a pack.",
      );
    }

    await ctx.db.patch(args.packId, {
      status: "published",
      version: pack.version + 1,
      updatedAt: Date.now(),
    });

    return args.packId;
  },
});

export const archive = zMutation({
  args: {
    packId: zid("personaPacks"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const pack = await getPackForIdentity(ctx, args.packId, identity.tokenIdentifier);

    if (pack.status === "draft") {
      throw new ConvexError("Only published persona packs can be archived.");
    }

    if (pack.status === "archived") {
      throw new ConvexError("Persona pack is already archived.");
    }

    await ctx.db.patch(args.packId, {
      status: "archived",
      updatedAt: Date.now(),
    });

    return args.packId;
  },
});

export const get = zQuery({
  args: {
    packId: zid("personaPacks"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const pack = await ctx.db.get(args.packId);

    if (pack === null || pack.orgId !== identity.tokenIdentifier) {
      return null;
    }

    return pack;
  },
});

export const list = zQuery({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);

    return await ctx.db
      .query("personaPacks")
      .withIndex("by_orgId", (q) => q.eq("orgId", identity.tokenIdentifier))
      .order("desc")
      .take(50);
  },
});

export function assertPackIsDraft(pack: Doc<"personaPacks">): void {
  if (pack.status === "published") {
    throw new ConvexError("Published persona packs are frozen.");
  }

  if (pack.status === "archived") {
    throw new ConvexError("Archived persona packs cannot be modified.");
  }
}

async function requireIdentity(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (identity === null) {
    throw new ConvexError("Not authenticated.");
  }

  return identity;
}

async function getPackForIdentity(
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

async function packHasProtoPersonas(
  ctx: MutationCtx,
  packId: Id<"personaPacks">,
) {
  const protoPersonas = await ctx.db
    .query("protoPersonas")
    .withIndex("by_packId", (q) => q.eq("packId", packId))
    .take(1);

  return protoPersonas.length > 0;
}

export type PersonaPackStatus = z.infer<typeof draftStatusSchema>;
