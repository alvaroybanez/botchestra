import { ConvexError, v } from "convex/values";
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

const draftStatusSchema = z.enum(["draft", "published", "archived"]);

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

export const axisSchema = z.object({
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

const archetypeAxisValueSchema = z
  .array(
    z.object({
      key: requiredString("Archetype axis key"),
      value: z
        .number()
        .min(-1, "Archetype axis values must be between -1 and 1.")
        .max(1, "Archetype axis values must be between -1 and 1."),
    }),
  )
  .superRefine((axisValues, ctx) => {
    const seen = new Set<string>();

    axisValues.forEach((axisValue, index) => {
      if (seen.has(axisValue.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "Archetype axis keys must be unique.",
        });
        return;
      }

      seen.add(axisValue.key);
    });
  });

const transcriptDerivedEvidenceSchema = z.object({
  transcriptId: requiredString("Evidence transcript ID"),
  quote: requiredString("Evidence quote"),
});

const transcriptDerivedArchetypeSchema = z.object({
  name: requiredString("Archetype name"),
  summary: requiredString("Archetype summary"),
  axisValues: archetypeAxisValueSchema,
  evidenceSnippets: z
    .array(transcriptDerivedEvidenceSchema)
    .min(1, "At least one evidence snippet is required."),
  contributingTranscriptIds: z
    .array(requiredString("Contributing transcript ID"))
    .min(1, "At least one contributing transcript is required."),
  notes: requiredString("Archetype notes").optional(),
});

const applyTranscriptDerivedProtoPersonasSchema = z.object({
  sharedAxes: sharedAxesSchema,
  archetypes: z
    .array(transcriptDerivedArchetypeSchema)
    .min(1, "Select at least one archetype to apply."),
});

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

const draftStatusValidator = v.union(
  v.literal("draft"),
  v.literal("published"),
  v.literal("archived"),
);

export const axisValidator = v.object({
  key: v.string(),
  label: v.string(),
  description: v.string(),
  lowAnchor: v.string(),
  midAnchor: v.string(),
  highAnchor: v.string(),
  weight: v.number(),
});

const sharedAxesValidator = v.array(axisValidator);

const createDraftValidator = v.object({
  name: v.string(),
  description: v.string(),
  context: v.string(),
  sharedAxes: sharedAxesValidator,
});

const updateDraftValidator = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  context: v.optional(v.string()),
  sharedAxes: v.optional(sharedAxesValidator),
});

const protoPersonaValidator = v.object({
  name: v.string(),
  summary: v.string(),
  axes: v.array(axisValidator),
  evidenceSnippets: v.array(v.string()),
  notes: v.optional(v.string()),
});

const updateProtoPersonaValidator = v.object({
  name: v.optional(v.string()),
  summary: v.optional(v.string()),
  axes: v.optional(v.array(axisValidator)),
  evidenceSnippets: v.optional(v.array(v.string())),
  notes: v.optional(v.string()),
});

const archetypeAxisValueValidator = v.array(
  v.object({
    key: v.string(),
    value: v.number(),
  }),
);

const transcriptDerivedEvidenceValidator = v.array(
  v.object({
    transcriptId: v.string(),
    quote: v.string(),
  }),
);

const transcriptDerivedArchetypeValidator = v.object({
  name: v.string(),
  summary: v.string(),
  axisValues: archetypeAxisValueValidator,
  evidenceSnippets: transcriptDerivedEvidenceValidator,
  contributingTranscriptIds: v.array(v.string()),
  notes: v.optional(v.string()),
});

const importedPackJsonValidator = v.object({
  name: v.string(),
  description: v.string(),
  context: v.string(),
  status: v.optional(draftStatusValidator),
  version: v.optional(v.number()),
  sharedAxes: sharedAxesValidator,
  protoPersonas: v.array(protoPersonaValidator),
});

export const createDraft = mutation({
  args: {
    pack: createDraftValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        pack: createDraftSchema,
      })
      .parse(args);
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const now = Date.now();

    return await ctx.db.insert("personaPacks", {
      ...parsedArgs.pack,
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

export const importJson = action({
  args: {
    json: v.string(),
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

export const exportJson = action({
  args: {
    packId: v.id("personaPacks"),
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

export const updateDraft = mutation({
  args: {
    packId: v.id("personaPacks"),
    patch: updateDraftValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        packId: z.string(),
        patch: updateDraftSchema,
      })
      .parse(args);
    const packId = parsedArgs.packId as Id<"personaPacks">;
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const pack = await getPackForIdentity(ctx, packId, identity.tokenIdentifier);

    assertPackIsDraft(pack);

    await ctx.db.patch(packId, {
      ...parsedArgs.patch,
      updatedBy: identity.tokenIdentifier,
      updatedAt: Date.now(),
    });

    return packId;
  },
});

export const publish = mutation({
  args: {
    packId: v.id("personaPacks"),
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

    await ctx.runMutation(internal.axisLibrary.upsertSharedAxesFromPackPublish, {
      orgId: identity.tokenIdentifier,
      actorId: identity.tokenIdentifier,
      sharedAxes: pack.sharedAxes,
    });

    await ctx.db.patch(args.packId, {
      status: "published",
      version: pack.version + 1,
      updatedBy: identity.tokenIdentifier,
      updatedAt: Date.now(),
    });

    return args.packId;
  },
});

export const archive = mutation({
  args: {
    packId: v.id("personaPacks"),
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

export const createProtoPersona = mutation({
  args: {
    packId: v.id("personaPacks"),
    protoPersona: protoPersonaValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        packId: z.string(),
        protoPersona: protoPersonaSchema,
      })
      .parse(args);
    const packId = parsedArgs.packId as Id<"personaPacks">;
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const pack = await getPackForIdentity(ctx, packId, identity.tokenIdentifier);

    assertPackIsDraft(pack);
    assertProtoPersonaAxisKeys(pack.sharedAxes, parsedArgs.protoPersona.axes);
    await assertProtoPersonaCapacity(ctx, packId);

    const protoPersonaId = await ctx.db.insert("protoPersonas", {
      packId,
      name: parsedArgs.protoPersona.name,
      summary: parsedArgs.protoPersona.summary,
      axes: parsedArgs.protoPersona.axes,
      sourceType: "manual",
      sourceRefs: [],
      evidenceSnippets: parsedArgs.protoPersona.evidenceSnippets,
      ...(parsedArgs.protoPersona.notes !== undefined
        ? { notes: parsedArgs.protoPersona.notes }
        : {}),
    });

    await touchPack(ctx, packId, identity.tokenIdentifier);

    return protoPersonaId;
  },
});

export const updateProtoPersona = mutation({
  args: {
    protoPersonaId: v.id("protoPersonas"),
    patch: updateProtoPersonaValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        protoPersonaId: z.string(),
        patch: updateProtoPersonaSchema,
      })
      .parse(args);
    const protoPersonaId = parsedArgs.protoPersonaId as Id<"protoPersonas">;
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const { pack } = await getProtoPersonaForIdentity(
      ctx,
      protoPersonaId,
      identity.tokenIdentifier,
    );

    assertPackIsDraft(pack);

    if (parsedArgs.patch.axes !== undefined) {
      assertProtoPersonaAxisKeys(pack.sharedAxes, parsedArgs.patch.axes);
    }

    await ctx.db.patch(protoPersonaId, {
      ...parsedArgs.patch,
    });
    await touchPack(ctx, pack._id, identity.tokenIdentifier);

    return protoPersonaId;
  },
});

export const deleteProtoPersona = mutation({
  args: {
    protoPersonaId: v.id("protoPersonas"),
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

export const applyTranscriptDerivedProtoPersonas = mutation({
  args: {
    packId: v.id("personaPacks"),
    input: v.object({
      sharedAxes: sharedAxesValidator,
      archetypes: v.array(transcriptDerivedArchetypeValidator),
    }),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        packId: z.string(),
        input: applyTranscriptDerivedProtoPersonasSchema,
      })
      .parse(args);
    const packId = parsedArgs.packId as Id<"personaPacks">;
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const pack = await getPackForIdentity(ctx, packId, identity.tokenIdentifier);

    assertPackIsDraft(pack);
    await assertProtoPersonaCapacityForBatch(
      ctx,
      packId,
      parsedArgs.input.archetypes.length,
    );
    assertTranscriptDerivedArchetypesMatchAxes(
      parsedArgs.input.sharedAxes,
      parsedArgs.input.archetypes,
    );

    await ctx.db.patch(packId, {
      sharedAxes: parsedArgs.input.sharedAxes,
      updatedAt: Date.now(),
      updatedBy: identity.tokenIdentifier,
    });

    const createdProtoPersonaIds: Id<"protoPersonas">[] = [];

    for (const archetype of parsedArgs.input.archetypes) {
      const protoPersonaId = await ctx.db.insert("protoPersonas", {
        packId,
        name: archetype.name,
        summary: archetype.summary,
        axes: parsedArgs.input.sharedAxes,
        sourceType: "transcript_derived",
        sourceRefs: archetype.evidenceSnippets.map((snippet) => snippet.transcriptId),
        evidenceSnippets: archetype.evidenceSnippets.map((snippet) => snippet.quote),
        ...(archetype.notes !== undefined
          ? { notes: archetype.notes }
          : {}),
      });

      createdProtoPersonaIds.push(protoPersonaId);
    }

    await touchPack(ctx, packId, identity.tokenIdentifier);

    return createdProtoPersonaIds;
  },
});

export const get = query({
  args: {
    packId: v.id("personaPacks"),
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

export const list = query({
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

export const getProtoPersona = query({
  args: {
    protoPersonaId: v.id("protoPersonas"),
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

export const listProtoPersonas = query({
  args: {
    packId: v.id("personaPacks"),
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

export const persistImportedPack = internalMutation({
  args: {
    importedPack: importedPackJsonValidator,
    orgId: v.string(),
    createdBy: v.string(),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        importedPack: importedPackJsonSchema,
        orgId: z.string(),
        createdBy: z.string(),
      })
      .parse(args);
    const now = Date.now();
    const packId = await ctx.db.insert("personaPacks", {
      name: parsedArgs.importedPack.name,
      description: parsedArgs.importedPack.description,
      context: parsedArgs.importedPack.context,
      sharedAxes: parsedArgs.importedPack.sharedAxes,
      version: 1,
      status: "draft",
      orgId: parsedArgs.orgId,
      createdBy: parsedArgs.createdBy,
      updatedBy: parsedArgs.createdBy,
      createdAt: now,
      updatedAt: now,
    });

    for (const protoPersona of parsedArgs.importedPack.protoPersonas) {
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

export const getExportPayload = internalQuery({
  args: {
    packId: v.id("personaPacks"),
    orgId: v.string(),
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

async function assertProtoPersonaCapacityForBatch(
  ctx: MutationCtx,
  packId: Id<"personaPacks">,
  requestedCount: number,
) {
  const protoPersonas = await listProtoPersonasForPack(
    ctx,
    packId,
    MAX_PROTO_PERSONAS_PER_PACK,
  );

  if (protoPersonas.length + requestedCount > MAX_PROTO_PERSONAS_PER_PACK) {
    throw new ConvexError(
      `A pack may contain a maximum of ${MAX_PROTO_PERSONAS_PER_PACK} proto-personas.`,
    );
  }
}

function assertTranscriptDerivedArchetypesMatchAxes(
  sharedAxes: readonly { key: string }[],
  archetypes: readonly z.infer<typeof transcriptDerivedArchetypeSchema>[],
) {
  const sharedAxisKeys = new Set(sharedAxes.map((axis) => axis.key));

  archetypes.forEach((archetype) => {
    const axisValueKeys = new Set(archetype.axisValues.map((axisValue) => axisValue.key));
    const missingKeys = [...sharedAxisKeys].filter((axisKey) => !axisValueKeys.has(axisKey));
    const unexpectedKeys = [...axisValueKeys].filter((axisKey) => !sharedAxisKeys.has(axisKey));

    if (missingKeys.length > 0 || unexpectedKeys.length > 0) {
      throw new ConvexError(
        "Transcript-derived archetypes must provide axis values for the selected pack axes only.",
      );
    }
  });
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
