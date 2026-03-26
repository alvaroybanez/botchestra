import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import {
  zCustomAction,
  zCustomMutation,
  zCustomQuery,
  zid,
} from "convex-helpers/server/zod";
import { z } from "zod";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireIdentity, requireRole, STUDY_MANAGER_ROLES } from "./rbac";

const zAction = zCustomAction(action, NoOp);
const zMutation = zCustomMutation(mutation, NoOp);
const zQuery = zCustomQuery(query, NoOp);
const zInternalMutation = zCustomMutation(internalMutation, NoOp);
const zInternalQuery = zCustomQuery(internalQuery, NoOp);

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

const importedPackJsonSchema = z.object({
  name: requiredString("Pack name"),
  description: requiredString("Pack description"),
  context: requiredString("Pack context"),
  status: draftStatusSchema.optional(),
  version: z.number().int().positive().optional(),
  sharedAxes: sharedAxesSchema,
  protoPersonas: z
    .array(protoPersonaSchema)
    .max(
      MAX_PROTO_PERSONAS_PER_PACK,
      `A pack may contain a maximum of ${MAX_PROTO_PERSONAS_PER_PACK} proto-personas.`,
    ),
});

export const createDraft = zMutation({
  args: {
    pack: createDraftSchema,
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const now = Date.now();

    return await ctx.db.insert("personaPacks", {
      ...args.pack,
      version: 1,
      status: "draft",
      orgId: identity.tokenIdentifier,
      createdBy: identity.tokenIdentifier,
      updatedBy: identity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const importJson = zAction({
  args: {
    json: z.string(),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const importedPack = parseImportedPackJson(args.json);
    const packId: Id<"personaPacks"> = await ctx.runMutation(
      internal.personaPacks.persistImportedPack,
      {
        importedPack,
        orgId: identity.tokenIdentifier,
        createdBy: identity.tokenIdentifier,
      },
    );

    return packId;
  },
});

export const exportJson = zAction({
  args: {
    packId: zid("personaPacks"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const exportedPack: ImportedPackJson = await ctx.runQuery(
      internal.personaPacks.getExportPayload,
      {
        packId: args.packId,
        orgId: identity.tokenIdentifier,
      },
    );

    return JSON.stringify(exportedPack, null, 2);
  },
});

export const updateDraft = zMutation({
  args: {
    packId: zid("personaPacks"),
    patch: updateDraftSchema,
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const pack = await getPackForIdentity(ctx, args.packId, identity.tokenIdentifier);

    assertPackIsDraft(pack);

    await ctx.db.patch(args.packId, {
      ...args.patch,
      updatedBy: identity.tokenIdentifier,
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
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
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

    const protoPersonas = await listProtoPersonasForPack(ctx, args.packId);

    for (const protoPersona of protoPersonas) {
      assertProtoPersonaAxisKeys(pack.sharedAxes, protoPersona.axes);
    }

    await ctx.db.patch(args.packId, {
      status: "published",
      version: pack.version + 1,
      updatedBy: identity.tokenIdentifier,
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
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const pack = await getPackForIdentity(ctx, args.packId, identity.tokenIdentifier);

    if (pack.status === "draft") {
      throw new ConvexError("Only published persona packs can be archived.");
    }

    if (pack.status === "archived") {
      throw new ConvexError("Persona pack is already archived.");
    }

    await ctx.db.patch(args.packId, {
      status: "archived",
      updatedBy: identity.tokenIdentifier,
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
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const pack = await getPackForIdentity(ctx, args.packId, identity.tokenIdentifier);

    assertPackIsDraft(pack);
    assertProtoPersonaAxisKeys(pack.sharedAxes, args.protoPersona.axes);
    await assertProtoPersonaCapacity(ctx, args.packId);

    const protoPersonaId = await ctx.db.insert("protoPersonas", {
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

    await touchPack(ctx, args.packId, identity.tokenIdentifier);

    return protoPersonaId;
  },
});

export const updateProtoPersona = zMutation({
  args: {
    protoPersonaId: zid("protoPersonas"),
    patch: updateProtoPersonaSchema,
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const { pack } = await getProtoPersonaForIdentity(
      ctx,
      args.protoPersonaId,
      identity.tokenIdentifier,
    );

    assertPackIsDraft(pack);

    if (args.patch.axes !== undefined) {
      assertProtoPersonaAxisKeys(pack.sharedAxes, args.patch.axes);
    }

    await ctx.db.patch(args.protoPersonaId, {
      ...args.patch,
    });
    await touchPack(ctx, pack._id, identity.tokenIdentifier);

    return args.protoPersonaId;
  },
});

export const deleteProtoPersona = zMutation({
  args: {
    protoPersonaId: zid("protoPersonas"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const { pack } = await getProtoPersonaForIdentity(
      ctx,
      args.protoPersonaId,
      identity.tokenIdentifier,
    );

    assertPackIsDraft(pack);

    await ctx.db.delete(args.protoPersonaId);
    await touchPack(ctx, pack._id, identity.tokenIdentifier);

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

export const persistImportedPack = zInternalMutation({
  args: {
    importedPack: importedPackJsonSchema,
    orgId: z.string(),
    createdBy: z.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const packId = await ctx.db.insert("personaPacks", {
      name: args.importedPack.name,
      description: args.importedPack.description,
      context: args.importedPack.context,
      sharedAxes: args.importedPack.sharedAxes,
      version: 1,
      status: "draft",
      orgId: args.orgId,
      createdBy: args.createdBy,
      updatedBy: args.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    for (const protoPersona of args.importedPack.protoPersonas) {
      await ctx.db.insert("protoPersonas", {
        packId,
        name: protoPersona.name,
        summary: protoPersona.summary,
        axes: protoPersona.axes,
        sourceType: "json_import",
        sourceRefs: [],
        evidenceSnippets: protoPersona.evidenceSnippets,
        ...(protoPersona.notes !== undefined
          ? { notes: protoPersona.notes }
          : {}),
      });
    }

    return packId;
  },
});

export const getExportPayload = zInternalQuery({
  args: {
    packId: zid("personaPacks"),
    orgId: z.string(),
  },
  handler: async (ctx, args) => {
    const pack = await getPackForOrg(ctx, args.packId, args.orgId);
    const protoPersonas = await ctx.db
      .query("protoPersonas")
      .withIndex("by_packId", (q) => q.eq("packId", args.packId))
      .take(MAX_PROTO_PERSONAS_PER_PACK);

    return {
      name: pack.name,
      description: pack.description,
      context: pack.context,
      status: pack.status,
      sharedAxes: pack.sharedAxes,
      protoPersonas: protoPersonas.map((protoPersona) => ({
        name: protoPersona.name,
        summary: protoPersona.summary,
        axes: protoPersona.axes,
        evidenceSnippets: protoPersona.evidenceSnippets,
        ...(protoPersona.notes !== undefined
          ? { notes: protoPersona.notes }
          : {}),
      })),
    };
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

async function getPackForIdentity(
  ctx: QueryCtx | MutationCtx,
  packId: Id<"personaPacks">,
  orgId: string,
) {
  return await getPackForOrg(ctx, packId, orgId);
}

async function getPackForOrg(
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
  sharedAxes: readonly { key: string }[],
  axes: readonly { key: string }[],
) {
  const validAxisKeys = new Set(sharedAxes.map((axis) => axis.key));

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
  const protoPersonas = await listProtoPersonasForPack(ctx, packId, 1);

  return protoPersonas.length > 0;
}

async function assertProtoPersonaCapacity(
  ctx: MutationCtx,
  packId: Id<"personaPacks">,
) {
  const protoPersonas = await listProtoPersonasForPack(
    ctx,
    packId,
    MAX_PROTO_PERSONAS_PER_PACK,
  );

  if (protoPersonas.length >= MAX_PROTO_PERSONAS_PER_PACK) {
    throw new ConvexError(
      `A pack may contain a maximum of ${MAX_PROTO_PERSONAS_PER_PACK} proto-personas.`,
    );
  }
}

function parseImportedPackJson(json: string): ImportedPackJson {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(json);
  } catch (error) {
    throw new ConvexError(
      `Malformed persona pack JSON: ${error instanceof Error ? error.message : "Unable to parse JSON."}`,
    );
  }

  const parsedPack = importedPackJsonSchema.safeParse(parsedJson);

  if (!parsedPack.success) {
    throw new ConvexError(
      `Invalid persona pack JSON: ${formatZodIssues(parsedPack.error.issues)}`,
    );
  }

  for (const protoPersona of parsedPack.data.protoPersonas) {
    assertProtoPersonaAxisKeys(parsedPack.data.sharedAxes, protoPersona.axes);
  }

  return parsedPack.data;
}

function formatZodIssues(issues: z.ZodIssue[]) {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

export type PersonaPackStatus = z.infer<typeof draftStatusSchema>;
type ImportedPackJson = z.infer<typeof importedPackJsonSchema>;

async function touchPack(
  ctx: MutationCtx,
  packId: Id<"personaPacks">,
  actorId: string,
) {
  await ctx.db.patch(packId, {
    updatedAt: Date.now(),
    updatedBy: actorId,
  });
}

async function listProtoPersonasForPack(
  ctx: QueryCtx | MutationCtx,
  packId: Id<"personaPacks">,
  limit = MAX_PROTO_PERSONAS_PER_PACK,
) {
  return await ctx.db
    .query("protoPersonas")
    .withIndex("by_packId", (q) => q.eq("packId", packId))
    .take(limit);
}
