import { ConvexError, v } from "convex/values";
import { z } from "zod";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireIdentity, requireRole, STUDY_MANAGER_ROLES } from "./rbac";

const MAX_TRANSCRIPT_QUERY_SIZE = 100;
const DELETE_BATCH_SIZE = 100;

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

const clearableOptionalString = z
  .string()
  .trim()
  .transform((value) => (value.length === 0 ? undefined : value));

const transcriptMetadataSchema = z.object({
  participantId: clearableOptionalString.optional(),
  date: z.number().optional(),
  tags: z.array(requiredString("Transcript tag")),
  notes: clearableOptionalString.optional(),
});

const transcriptMetadataPatchSchema = z
  .object({
    participantId: clearableOptionalString.optional(),
    date: z.number().optional(),
    tags: z.array(requiredString("Transcript tag")).optional(),
    notes: clearableOptionalString.optional(),
  })
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    "At least one transcript metadata field must be provided.",
  );

const transcriptTurnSchema = z.object({
  speaker: requiredString("Transcript speaker"),
  text: requiredString("Transcript text"),
  timestamp: z.number().optional(),
});

const transcriptTurnsSchema = z.array(transcriptTurnSchema);

const transcriptMetadataValidator = v.object({
  participantId: v.optional(v.string()),
  date: v.optional(v.number()),
  tags: v.array(v.string()),
  notes: v.optional(v.string()),
});

const transcriptMetadataPatchValidator = v.object({
  participantId: v.optional(v.string()),
  date: v.optional(v.number()),
  tags: v.optional(v.array(v.string())),
  notes: v.optional(v.string()),
});

export const uploadTranscript = mutation({
  args: {
    storageId: v.optional(v.id("_storage")),
    originalFilename: v.string(),
    metadata: v.optional(transcriptMetadataValidator),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        storageId: z.string().optional(),
        originalFilename: requiredString("Transcript filename"),
        metadata: transcriptMetadataSchema.optional(),
      })
      .parse(args);
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const format = inferTranscriptFormat(parsedArgs.originalFilename);

    if (parsedArgs.storageId === undefined) {
      return {
        uploadUrl: await ctx.storage.generateUploadUrl(),
        transcriptId: null,
      };
    }

    const now = Date.now();
    const transcriptId = await ctx.db.insert("transcripts", {
      storageId: parsedArgs.storageId as Id<"_storage">,
      originalFilename: parsedArgs.originalFilename,
      format,
      metadata: normalizeTranscriptMetadata(parsedArgs.metadata),
      processingStatus: "pending",
      characterCount: 0,
      orgId: identity.tokenIdentifier,
      createdBy: identity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      (internal as any).transcripts.processTranscript,
      { transcriptId },
    );

    return {
      uploadUrl: null,
      transcriptId,
    };
  },
});

export const processTranscript = internalAction({
  args: {
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args) => {
    const transcript: Doc<"transcripts"> | null = await ctx.runQuery(
      (internal as any).transcripts.getTranscriptForProcessing,
      { transcriptId: args.transcriptId },
    );

    if (transcript === null) {
      return null;
    }

    await ctx.runMutation((internal as any).transcripts.markTranscriptProcessingStarted, {
      transcriptId: args.transcriptId,
    });

    try {
      const blob = await ctx.storage.get(transcript.storageId);

      if (blob === null) {
        throw new ConvexError("Transcript file not found in storage.");
      }

      const text = await blob.text();
      const parsedContent = parseTranscriptContent(transcript.format, text);

      await ctx.runMutation((internal as any).transcripts.markTranscriptProcessed, {
        transcriptId: args.transcriptId,
        characterCount: parsedContent.characterCount,
      });
    } catch (error) {
      await ctx.runMutation((internal as any).transcripts.markTranscriptErrored, {
        transcriptId: args.transcriptId,
        processingError: toErrorMessage(error),
      });
    }

    return null;
  },
});

export const updateTranscriptMetadata = mutation({
  args: {
    transcriptId: v.id("transcripts"),
    metadata: transcriptMetadataPatchValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        transcriptId: z.string(),
        metadata: transcriptMetadataPatchSchema,
      })
      .parse(args);
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const transcriptId = parsedArgs.transcriptId as Id<"transcripts">;
    const transcript = await loadTranscriptForOrg(
      ctx,
      transcriptId,
      identity.tokenIdentifier,
    );
    const nextMetadata = normalizeTranscriptMetadata({
      ...transcript.metadata,
      ...parsedArgs.metadata,
      tags: parsedArgs.metadata.tags ?? transcript.metadata.tags,
    });

    await ctx.db.patch(transcriptId, {
      metadata: nextMetadata,
      updatedAt: Date.now(),
    });

    return await loadTranscriptForOrg(ctx, transcriptId, identity.tokenIdentifier);
  },
});

export const deleteTranscript = mutation({
  args: {
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const transcript = await loadTranscriptForOrg(
      ctx,
      args.transcriptId,
      identity.tokenIdentifier,
    );

    while (true) {
      const associations = await ctx.db
        .query("configTranscripts")
        .withIndex("by_transcriptId", (q) => q.eq("transcriptId", args.transcriptId))
        .take(DELETE_BATCH_SIZE);

      if (associations.length === 0) {
        break;
      }

      for (const association of associations) {
        await ctx.db.delete(association._id);
      }
    }

    await ctx.storage.delete(transcript.storageId);
    await ctx.db.delete(args.transcriptId);

    return {
      transcriptId: args.transcriptId,
      deleted: true as const,
    };
  },
});

export const listTranscripts = query({
  args: {
    search: v.optional(v.string()),
    format: v.optional(v.union(v.literal("txt"), v.literal("json"))),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const normalizedSearch = args.search?.trim().toLowerCase() ?? "";
    const normalizedTags = new Set(args.tags?.map((tag) => tag.trim().toLowerCase()) ?? []);
    const transcripts = await ctx.db
      .query("transcripts")
      .withIndex("by_orgId", (q) => q.eq("orgId", identity.tokenIdentifier))
      .order("desc")
      .take(MAX_TRANSCRIPT_QUERY_SIZE);

    return transcripts.filter((transcript) => {
      if (args.format !== undefined && transcript.format !== args.format) {
        return false;
      }

      if (normalizedTags.size > 0) {
        const transcriptTags = new Set(
          transcript.metadata.tags.map((tag) => tag.trim().toLowerCase()),
        );

        for (const tag of normalizedTags) {
          if (!transcriptTags.has(tag)) {
            return false;
          }
        }
      }

      if (normalizedSearch.length === 0) {
        return true;
      }

      const searchableHaystack = [
        transcript.originalFilename,
        transcript.metadata.participantId ?? "",
        transcript.metadata.notes ?? "",
        transcript.metadata.tags.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      return searchableHaystack.includes(normalizedSearch);
    });
  },
});

export const getTranscript = query({
  args: {
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const transcript = await ctx.db.get(args.transcriptId);

    if (transcript === null || transcript.orgId !== identity.tokenIdentifier) {
      return null;
    }

    return transcript;
  },
});

export const normalizeTranscriptId = query({
  args: {
    transcriptId: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const normalizedTranscriptId = ctx.db.normalizeId(
      "transcripts",
      args.transcriptId,
    );

    if (normalizedTranscriptId === null) {
      return null;
    }

    const transcript = await ctx.db.get(normalizedTranscriptId);

    if (transcript === null || transcript.orgId !== identity.tokenIdentifier) {
      return null;
    }

    return normalizedTranscriptId;
  },
});

export const getTranscriptContent = action({
  args: {
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const transcript: Doc<"transcripts"> | null = await ctx.runQuery(
      (internal as any).transcripts.getTranscriptForProcessing,
      { transcriptId: args.transcriptId },
    );

    if (transcript === null || transcript.orgId !== identity.tokenIdentifier) {
      return null;
    }

    const blob = await ctx.storage.get(transcript.storageId);

    if (blob === null) {
      throw new ConvexError("Transcript file not found in storage.");
    }

    const text = await blob.text();

    if (transcript.format === "txt") {
      return {
        format: "txt" as const,
        text,
      };
    }

    return {
      format: "json" as const,
      turns: parseTranscriptTurns(text),
    };
  },
});

export const getTranscriptForProcessing = internalQuery({
  args: {
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.transcriptId);
  },
});

export const markTranscriptProcessingStarted = internalMutation({
  args: {
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args) => {
    const transcript = await ctx.db.get(args.transcriptId);

    if (transcript === null) {
      return null;
    }

    await ctx.db.patch(args.transcriptId, {
      processingStatus: "processing",
      processingError: undefined,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const markTranscriptProcessed = internalMutation({
  args: {
    transcriptId: v.id("transcripts"),
    characterCount: v.number(),
  },
  handler: async (ctx, args) => {
    const transcript = await ctx.db.get(args.transcriptId);

    if (transcript === null) {
      return null;
    }

    await ctx.db.patch(args.transcriptId, {
      processingStatus: "processed",
      processingError: undefined,
      characterCount: args.characterCount,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const markTranscriptErrored = internalMutation({
  args: {
    transcriptId: v.id("transcripts"),
    processingError: v.string(),
  },
  handler: async (ctx, args) => {
    const transcript = await ctx.db.get(args.transcriptId);

    if (transcript === null) {
      return null;
    }

    await ctx.db.patch(args.transcriptId, {
      processingStatus: "error",
      processingError: args.processingError,
      characterCount: 0,
      updatedAt: Date.now(),
    });

    return null;
  },
});

async function loadTranscriptForOrg(
  ctx: QueryCtx | MutationCtx,
  transcriptId: Id<"transcripts">,
  orgId: string,
) {
  const transcript = await ctx.db.get(transcriptId);

  if (transcript === null || transcript.orgId !== orgId) {
    throw new ConvexError("Transcript not found.");
  }

  return transcript;
}

function inferTranscriptFormat(filename: string): "txt" | "json" {
  const normalized = filename.trim().toLowerCase();

  if (normalized.endsWith(".txt")) {
    return "txt";
  }

  if (normalized.endsWith(".json")) {
    return "json";
  }

  throw new ConvexError("Unsupported transcript format. Use .txt or .json files.");
}

function normalizeTranscriptMetadata(
  metadata: z.infer<typeof transcriptMetadataSchema> | undefined,
) {
  const normalized = metadata ?? { tags: [] };

  return {
    ...(normalized.participantId !== undefined
      ? { participantId: normalized.participantId }
      : {}),
    ...(normalized.date !== undefined ? { date: normalized.date } : {}),
    tags: normalized.tags,
    ...(normalized.notes !== undefined ? { notes: normalized.notes } : {}),
  };
}

function parseTranscriptContent(format: "txt" | "json", rawText: string) {
  if (format === "txt") {
    return {
      characterCount: rawText.length,
    };
  }

  const turns = parseTranscriptTurns(rawText);

  return {
    characterCount: turns
      .map((turn) => `${turn.speaker}: ${turn.text}`)
      .join("\n")
      .length,
  };
}

function parseTranscriptTurns(rawText: string) {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawText);
  } catch (error) {
    throw new ConvexError(
      `Invalid transcript JSON: ${error instanceof Error ? error.message : "Unable to parse JSON."}`,
    );
  }

  const parsedTurns = transcriptTurnsSchema.safeParse(parsedJson);

  if (!parsedTurns.success) {
    throw new ConvexError(
      `Invalid transcript JSON: ${formatZodIssues(parsedTurns.error.issues)}`,
    );
  }

  return parsedTurns.data;
}

function formatZodIssues(issues: z.ZodIssue[]) {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "root";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function toErrorMessage(error: unknown) {
  if (error instanceof ConvexError) {
    return error.data as string;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown transcript processing error.";
}
