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

const MAX_PROTO_PERSONAS_PER_PACK = 10;

const protoPersonaAxisSchema = z
  .array(axisSchema)
  .min(1, "At least one proto-persona axis is required.")
  .superRefine((axes, ctx) => {
    const seen = new Set<string>();

    axes.forEach((axis, index) => {
      if (seen.has(axis.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "Proto-persona axis keys must be unique.",
        });
        return;
      }

      seen.add(axis.key);
    });
  });

const protoPersonaSchema = z.object({
  name: requiredString("Proto-persona name"),
  summary: requiredString("Proto-persona summary"),
  axes: protoPersonaAxisSchema,
  evidenceSnippets: z.array(requiredString("Evidence snippet")),
  notes: requiredString("Proto-persona notes").optional(),
});

const updateProtoPersonaSchema = z
  .object({
    name: requiredString("Proto-persona name").optional(),
    summary: requiredString("Proto-persona summary").optional(),
    axes: protoPersonaAxisSchema.optional(),
    evidenceSnippets: z.array(requiredString("Evidence snippet")).optional(),
    notes: requiredString("Proto-persona notes").optional(),
  })
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    "At least one proto-persona field must be provided.",
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

export const createProtoPersona = zMutation({
  args: {
    packId: zid("personaPacks"),
    protoPersona: protoPersonaSchema,
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const pack = await getPackForIdentity(ctx, args.packId, identity.tokenIdentifier);

    assertPackIsDraft(pack);
    assertProtoPersonaAxisKeys(pack, args.protoPersona.axes);
    await assertProtoPersonaCapacity(ctx, args.packId);

    return await ctx.db.insert("protoPersonas", {
      packId: args.packId,
      name: args.protoPersona.name,
      summary: args.protoPersona.summary,
      axes: args.protoPersona.axes,
      sourceType: "manual",
      sourceRefs: [],
      evidenceSnippets: args.protoPersona.evidenceSnippets,
      ...(args.protoPersona.notes !== undefined
        ? { notes: args.protoPersona.notes }
        : {}),
    });
  },
});

export const updateProtoPersona = zMutation({
  args: {
    protoPersonaId: zid("protoPersonas"),
    patch: updateProtoPersonaSchema,
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const { pack } = await getProtoPersonaForIdentity(
      ctx,
      args.protoPersonaId,
      identity.tokenIdentifier,
    );

    assertPackIsDraft(pack);

    if (args.patch.axes !== undefined) {
      assertProtoPersonaAxisKeys(pack, args.patch.axes);
    }

    await ctx.db.patch(args.protoPersonaId, {
      ...args.patch,
    });

    return args.protoPersonaId;
  },
});

export const deleteProtoPersona = zMutation({
  args: {
    protoPersonaId: zid("protoPersonas"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const { pack } = await getProtoPersonaForIdentity(
      ctx,
      args.protoPersonaId,
      identity.tokenIdentifier,
    );

    assertPackIsDraft(pack);

    await ctx.db.delete(args.protoPersonaId);

    return args.protoPersonaId;
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

export const getProtoPersona = zQuery({
  args: {
    protoPersonaId: zid("protoPersonas"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);

    return await getProtoPersonaOrNull(
      ctx,
      args.protoPersonaId,
      identity.tokenIdentifier,
    );
  },
});

export const listProtoPersonas = zQuery({
  args: {
    packId: zid("personaPacks"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const pack = await ctx.db.get(args.packId);

    if (pack === null || pack.orgId !== identity.tokenIdentifier) {
      return [];
    }

    return await ctx.db
      .query("protoPersonas")
      .withIndex("by_packId", (q) => q.eq("packId", args.packId))
      .take(MAX_PROTO_PERSONAS_PER_PACK);
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

async function getProtoPersonaOrNull(
  ctx: QueryCtx | MutationCtx,
  protoPersonaId: Id<"protoPersonas">,
  orgId: string,
) {
  const protoPersona = await ctx.db.get(protoPersonaId);

  if (protoPersona === null) {
    return null;
  }

  const pack = await ctx.db.get(protoPersona.packId);

  if (pack === null || pack.orgId !== orgId) {
    return null;
  }

  return protoPersona;
}

async function getProtoPersonaForIdentity(
  ctx: QueryCtx | MutationCtx,
  protoPersonaId: Id<"protoPersonas">,
  orgId: string,
) {
  const protoPersona = await ctx.db.get(protoPersonaId);

  if (protoPersona === null) {
    throw new ConvexError("Proto-persona not found.");
  }

  const pack = await ctx.db.get(protoPersona.packId);

  if (pack === null || pack.orgId !== orgId) {
    throw new ConvexError("Proto-persona not found.");
  }

  return { protoPersona, pack };
}

function assertProtoPersonaAxisKeys(
  pack: Doc<"personaPacks">,
  axes: readonly { key: string }[],
) {
  const validAxisKeys = new Set(pack.sharedAxes.map((axis) => axis.key));

  if (!axes.every((axis) => validAxisKeys.has(axis.key))) {
    throw new ConvexError(
      "Proto-persona axes must reference shared pack axis keys.",
    );
  }
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

async function assertProtoPersonaCapacity(
  ctx: MutationCtx,
  packId: Id<"personaPacks">,
) {
  const protoPersonas = await ctx.db
    .query("protoPersonas")
    .withIndex("by_packId", (q) => q.eq("packId", packId))
    .take(MAX_PROTO_PERSONAS_PER_PACK);

  if (protoPersonas.length >= MAX_PROTO_PERSONAS_PER_PACK) {
    throw new ConvexError(
      `A pack may contain a maximum of ${MAX_PROTO_PERSONAS_PER_PACK} proto-personas.`,
    );
  }
}

export type PersonaPackStatus = z.infer<typeof draftStatusSchema>;
