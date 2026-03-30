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

const MAX_SYNTHETIC_USERS_PER_PACK = 10;

const syntheticUserAxisSchema = z
  .array(axisSchema)
  .min(1, "At least one synthetic user axis is required.")
  .superRefine((axes, ctx) => {
    const seen = new Set<string>();

    axes.forEach((axis, index) => {
      if (seen.has(axis.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "Synthetic user axis keys must be unique.",
        });
        return;
      }

      seen.add(axis.key);
    });
  });

const syntheticUserSchema = z.object({
  name: requiredString("Synthetic user name"),
  summary: requiredString("Synthetic user summary"),
  axes: syntheticUserAxisSchema,
  evidenceSnippets: z.array(requiredString("Evidence snippet")),
  notes: requiredString("Synthetic user notes").optional(),
});

const updateSyntheticUserSchema = z
  .object({
    name: requiredString("Synthetic user name").optional(),
    summary: requiredString("Synthetic user summary").optional(),
    axes: syntheticUserAxisSchema.optional(),
    evidenceSnippets: z.array(requiredString("Evidence snippet")).optional(),
    notes: requiredString("Synthetic user notes").optional(),
  })
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    "At least one synthetic user field must be provided.",
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

const applyTranscriptDerivedSyntheticUsersSchema = z.object({
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
  syntheticUsers: z
    .array(syntheticUserSchema)
    .max(
      MAX_SYNTHETIC_USERS_PER_PACK,
      `A pack may contain a maximum of ${MAX_SYNTHETIC_USERS_PER_PACK} synthetic users.`,
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

const syntheticUserValidator = v.object({
  name: v.string(),
  summary: v.string(),
  axes: v.array(axisValidator),
  evidenceSnippets: v.array(v.string()),
  notes: v.optional(v.string()),
});

const updateSyntheticUserValidator = v.object({
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
  syntheticUsers: v.array(syntheticUserValidator),
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

    const hasSyntheticUsers = await packHasSyntheticUsers(ctx, args.packId);

    if (!hasSyntheticUsers) {
      throw new ConvexError(
        "At least one synthetic user is required before publishing a pack.",
      );
    }

    const syntheticUsers = await listSyntheticUsersForPack(ctx, args.packId);

    for (const syntheticUser of syntheticUsers) {
      assertSyntheticUserAxisKeys(pack.sharedAxes, syntheticUser.axes);
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

export const createSyntheticUser = mutation({
  args: {
    packId: v.id("personaPacks"),
    syntheticUser: syntheticUserValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        packId: z.string(),
        syntheticUser: syntheticUserSchema,
      })
      .parse(args);
    const packId = parsedArgs.packId as Id<"personaPacks">;
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const pack = await getPackForIdentity(ctx, packId, identity.tokenIdentifier);

    assertPackIsDraft(pack);
    assertSyntheticUserAxisKeys(pack.sharedAxes, parsedArgs.syntheticUser.axes);
    await assertSyntheticUserCapacity(ctx, packId);

    const syntheticUserId = await ctx.db.insert("syntheticUsers", {
      packId,
      name: parsedArgs.syntheticUser.name,
      summary: parsedArgs.syntheticUser.summary,
      axes: parsedArgs.syntheticUser.axes,
      sourceType: "manual",
      sourceRefs: [],
      evidenceSnippets: parsedArgs.syntheticUser.evidenceSnippets,
      ...(parsedArgs.syntheticUser.notes !== undefined
        ? { notes: parsedArgs.syntheticUser.notes }
        : {}),
    });

    await touchPack(ctx, packId, identity.tokenIdentifier);

    return syntheticUserId;
  },
});

export const updateSyntheticUser = mutation({
  args: {
    syntheticUserId: v.id("syntheticUsers"),
    patch: updateSyntheticUserValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        syntheticUserId: z.string(),
        patch: updateSyntheticUserSchema,
      })
      .parse(args);
    const syntheticUserId = parsedArgs.syntheticUserId as Id<"syntheticUsers">;
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const { pack } = await getSyntheticUserForIdentity(
      ctx,
      syntheticUserId,
      identity.tokenIdentifier,
    );

    assertPackIsDraft(pack);

    if (parsedArgs.patch.axes !== undefined) {
      assertSyntheticUserAxisKeys(pack.sharedAxes, parsedArgs.patch.axes);
    }

    await ctx.db.patch(syntheticUserId, {
      ...parsedArgs.patch,
    });
    await touchPack(ctx, pack._id, identity.tokenIdentifier);

    return syntheticUserId;
  },
});

export const deleteSyntheticUser = mutation({
  args: {
    syntheticUserId: v.id("syntheticUsers"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const { pack } = await getSyntheticUserForIdentity(
      ctx,
      args.syntheticUserId,
      identity.tokenIdentifier,
    );

    assertPackIsDraft(pack);

    await ctx.db.delete(args.syntheticUserId);
    await touchPack(ctx, pack._id, identity.tokenIdentifier);

    return args.syntheticUserId;
  },
});

export const applyTranscriptDerivedSyntheticUsers = mutation({
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
        input: applyTranscriptDerivedSyntheticUsersSchema,
      })
      .parse(args);
    const packId = parsedArgs.packId as Id<"personaPacks">;
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const pack = await getPackForIdentity(ctx, packId, identity.tokenIdentifier);

    assertPackIsDraft(pack);
    await assertSyntheticUserCapacityForBatch(
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

    const createdSyntheticUserIds: Id<"syntheticUsers">[] = [];

    for (const archetype of parsedArgs.input.archetypes) {
      const syntheticUserId = await ctx.db.insert("syntheticUsers", {
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

      createdSyntheticUserIds.push(syntheticUserId);
    }

    await touchPack(ctx, packId, identity.tokenIdentifier);

    return createdSyntheticUserIds;
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

export const getSyntheticUser = query({
  args: {
    syntheticUserId: v.id("syntheticUsers"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);

    return await getSyntheticUserOrNull(
      ctx,
      args.syntheticUserId,
      identity.tokenIdentifier,
    );
  },
});

export const listSyntheticUsers = query({
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
      .query("syntheticUsers")
      .withIndex("by_packId", (q) => q.eq("packId", args.packId))
      .take(MAX_SYNTHETIC_USERS_PER_PACK);
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

    for (const syntheticUser of parsedArgs.importedPack.syntheticUsers) {
      await ctx.db.insert("syntheticUsers", {
        packId,
        name: syntheticUser.name,
        summary: syntheticUser.summary,
        axes: syntheticUser.axes,
        sourceType: "json_import",
        sourceRefs: [],
        evidenceSnippets: syntheticUser.evidenceSnippets,
        ...(syntheticUser.notes !== undefined
          ? { notes: syntheticUser.notes }
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
    const syntheticUsers = await ctx.db
      .query("syntheticUsers")
      .withIndex("by_packId", (q) => q.eq("packId", args.packId))
      .take(MAX_SYNTHETIC_USERS_PER_PACK);

    return {
      name: pack.name,
      description: pack.description,
      context: pack.context,
      status: pack.status,
      sharedAxes: pack.sharedAxes,
      syntheticUsers: syntheticUsers.map((syntheticUser) => ({
        name: syntheticUser.name,
        summary: syntheticUser.summary,
        axes: syntheticUser.axes,
        evidenceSnippets: syntheticUser.evidenceSnippets,
        ...(syntheticUser.notes !== undefined
          ? { notes: syntheticUser.notes }
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

async function getSyntheticUserOrNull(
  ctx: QueryCtx | MutationCtx,
  syntheticUserId: Id<"syntheticUsers">,
  orgId: string,
) {
  const syntheticUser = await ctx.db.get(syntheticUserId);

  if (syntheticUser === null) {
    return null;
  }

  const pack = await ctx.db.get(syntheticUser.packId);

  if (pack === null || pack.orgId !== orgId) {
    return null;
  }

  return syntheticUser;
}

async function getSyntheticUserForIdentity(
  ctx: QueryCtx | MutationCtx,
  syntheticUserId: Id<"syntheticUsers">,
  orgId: string,
) {
  const syntheticUser = await ctx.db.get(syntheticUserId);

  if (syntheticUser === null) {
    throw new ConvexError("Synthetic user not found.");
  }

  const pack = await ctx.db.get(syntheticUser.packId);

  if (pack === null || pack.orgId !== orgId) {
    throw new ConvexError("Synthetic user not found.");
  }

  return { syntheticUser, pack };
}

function assertSyntheticUserAxisKeys(
  sharedAxes: readonly { key: string }[],
  axes: readonly { key: string }[],
) {
  const validAxisKeys = new Set(sharedAxes.map((axis) => axis.key));

  if (!axes.every((axis) => validAxisKeys.has(axis.key))) {
    throw new ConvexError(
      "Synthetic user axes must reference shared pack axis keys.",
    );
  }
}

async function packHasSyntheticUsers(
  ctx: MutationCtx,
  packId: Id<"personaPacks">,
) {
  const syntheticUsers = await listSyntheticUsersForPack(ctx, packId, 1);

  return syntheticUsers.length > 0;
}

async function assertSyntheticUserCapacity(
  ctx: MutationCtx,
  packId: Id<"personaPacks">,
) {
  const syntheticUsers = await listSyntheticUsersForPack(
    ctx,
    packId,
    MAX_SYNTHETIC_USERS_PER_PACK,
  );

  if (syntheticUsers.length >= MAX_SYNTHETIC_USERS_PER_PACK) {
    throw new ConvexError(
      `A pack may contain a maximum of ${MAX_SYNTHETIC_USERS_PER_PACK} synthetic users.`,
    );
  }
}

async function assertSyntheticUserCapacityForBatch(
  ctx: MutationCtx,
  packId: Id<"personaPacks">,
  requestedCount: number,
) {
  const syntheticUsers = await listSyntheticUsersForPack(
    ctx,
    packId,
    MAX_SYNTHETIC_USERS_PER_PACK,
  );

  if (syntheticUsers.length + requestedCount > MAX_SYNTHETIC_USERS_PER_PACK) {
    throw new ConvexError(
      `A pack may contain a maximum of ${MAX_SYNTHETIC_USERS_PER_PACK} synthetic users.`,
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

  for (const syntheticUser of parsedPack.data.syntheticUsers) {
    assertSyntheticUserAxisKeys(parsedPack.data.sharedAxes, syntheticUser.axes);
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

async function listSyntheticUsersForPack(
  ctx: QueryCtx | MutationCtx,
  packId: Id<"personaPacks">,
  limit = MAX_SYNTHETIC_USERS_PER_PACK,
) {
  return await ctx.db
    .query("syntheticUsers")
    .withIndex("by_packId", (q) => q.eq("packId", packId))
    .take(limit);
}
