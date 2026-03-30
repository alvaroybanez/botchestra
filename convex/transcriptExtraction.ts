import { ConvexError, v } from "convex/values";
import { z } from "zod";
import { resolveModel } from "../packages/ai/src/index";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import { axisSchema, axisValidator } from "./personaPacks";
import { requireIdentity, requireRole, STUDY_MANAGER_ROLES } from "./rbac";
import { loadEffectiveSettingsForOrg } from "./settings";

const MAX_TRANSCRIPTS_PER_PACK = 100;
const MODEL_INPUT_PRICE_PER_MILLION_TOKENS_USD: Record<string, number> = {
  "gpt-5.4": 2.5,
  "gpt-5.4-mini": 0.75,
  "gpt-5.4-nano": 0.2,
  "gpt-5.4-pro": 30,
  "gpt-5": 1.25,
  "gpt-5-mini": 0.25,
  "gpt-5-nano": 0.05,
  "gpt-5-pro": 15,
  "gpt-4.1": 2,
  "gpt-4.1-mini": 0.4,
  "gpt-4.1-nano": 0.1,
  "gpt-4o": 2.5,
  "gpt-4o-mini": 0.15,
};

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

const extractionModeSchema = z.enum(["auto_discover", "guided"]);

const transcriptEvidenceSnippetSchema = z
  .object({
    quote: requiredString("Evidence snippet quote"),
    startChar: z.number().int().nonnegative().optional(),
    endChar: z.number().int().nonnegative().optional(),
  })
  .superRefine((snippet, ctx) => {
    if (
      snippet.startChar !== undefined &&
      snippet.endChar !== undefined &&
      snippet.endChar <= snippet.startChar
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endChar"],
        message: "Evidence snippet endChar must be greater than startChar.",
      });
    }
  });

const transcriptSignalsSchema = z.object({
  themes: z.array(requiredString("Theme")),
  attitudes: z.array(requiredString("Attitude")),
  painPoints: z.array(requiredString("Pain point")),
  decisionPatterns: z.array(requiredString("Decision pattern")),
  evidenceSnippets: z.array(transcriptEvidenceSnippetSchema),
});

const guidedAxesSchema = z
  .array(axisSchema)
  .min(1, "At least one axis is required for guided extraction.")
  .superRefine((axes, ctx) => {
    const seen = new Set<string>();

    axes.forEach((axis, index) => {
      if (seen.has(axis.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "Guided axis keys must be unique.",
        });
      }

      seen.add(axis.key);
    });
  });

const archetypeAxisValueSchema = z
  .array(
    z.object({
      key: requiredString("Axis key"),
      value: z.number(),
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
      }

      seen.add(axisValue.key);
    });
  });

const archetypeEvidenceSnippetSchema = z
  .object({
    transcriptId: requiredString("Evidence transcript ID"),
    quote: requiredString("Evidence quote"),
    startChar: z.number().int().nonnegative().optional(),
    endChar: z.number().int().nonnegative().optional(),
  })
  .superRefine((snippet, ctx) => {
    if (
      snippet.startChar !== undefined &&
      snippet.endChar !== undefined &&
      snippet.endChar <= snippet.startChar
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endChar"],
        message: "Evidence snippet endChar must be greater than startChar.",
      });
    }
  });

const archetypeSchema = z.object({
  name: requiredString("Archetype name"),
  summary: requiredString("Archetype summary"),
  axisValues: archetypeAxisValueSchema,
  evidenceSnippets: z.array(archetypeEvidenceSnippetSchema),
  contributingTranscriptIds: z
    .array(requiredString("Contributing transcript ID"))
    .min(1, "Each archetype must reference at least one transcript."),
});

const proposedAxesSchema = z
  .array(axisSchema)
  .superRefine((axes, ctx) => {
    const seen = new Set<string>();

    axes.forEach((axis, index) => {
      if (seen.has(axis.key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "key"],
          message: "Proposed axis keys must be unique.",
        });
      }

      seen.add(axis.key);
    });
  });

const clusteringResponseSchema = z.object({
  archetypes: z.array(archetypeSchema).min(1, "At least one archetype is required."),
  proposedAxes: proposedAxesSchema.optional().default([]),
});

const extractionModeValidator = v.union(
  v.literal("auto_discover"),
  v.literal("guided"),
);

const transcriptEvidenceSnippetValidator = v.object({
  quote: v.string(),
  startChar: v.number(),
  endChar: v.number(),
});

const transcriptSignalsValidator = v.object({
  themes: v.array(v.string()),
  attitudes: v.array(v.string()),
  painPoints: v.array(v.string()),
  decisionPatterns: v.array(v.string()),
  evidenceSnippets: v.array(transcriptEvidenceSnippetValidator),
});

const archetypeAxisValueValidator = v.object({
  key: v.string(),
  value: v.number(),
});

const archetypeEvidenceSnippetValidator = v.object({
  transcriptId: v.id("transcripts"),
  quote: v.string(),
  startChar: v.number(),
  endChar: v.number(),
});

const archetypeValidator = v.object({
  name: v.string(),
  summary: v.string(),
  axisValues: v.array(archetypeAxisValueValidator),
  evidenceSnippets: v.array(archetypeEvidenceSnippetValidator),
  contributingTranscriptIds: v.array(v.id("transcripts")),
});

const extractionRunStatusValidator = v.union(
  v.literal("processing"),
  v.literal("completed"),
  v.literal("completed_with_failures"),
  v.literal("failed"),
);

const extractionRunStateValidator = v.object({
  packId: v.id("personaPacks"),
  orgId: v.string(),
  mode: extractionModeValidator,
  status: extractionRunStatusValidator,
  guidedAxes: v.array(axisValidator),
  proposedAxes: v.array(axisValidator),
  archetypes: v.array(archetypeValidator),
  totalTranscripts: v.number(),
  processedTranscriptCount: v.number(),
  currentTranscriptId: v.optional(v.id("transcripts")),
  succeededTranscriptIds: v.array(v.id("transcripts")),
  failedTranscripts: v.array(
    v.object({
      transcriptId: v.id("transcripts"),
      error: v.string(),
    }),
  ),
  errorMessage: v.optional(v.string()),
  startedBy: v.string(),
  startedAt: v.number(),
  updatedAt: v.number(),
  completedAt: v.optional(v.number()),
});

export const estimateExtractionCost = query({
  args: {
    transcriptIds: v.array(v.id("transcripts")),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const transcripts = await loadTranscriptsForOrg(
      ctx,
      args.transcriptIds,
      identity.tokenIdentifier,
    );
    const totalCharacters = transcripts.reduce(
      (sum, transcript) => sum + transcript.characterCount,
      0,
    );
    const estimatedTokens = Math.ceil(totalCharacters / 4);
    const settings = await loadEffectiveSettingsForOrg(ctx, identity.tokenIdentifier);
    const modelOverride = settings.modelConfig.find(
      (entry) => entry.taskCategory === "summarization",
    )?.modelId;
    const modelId = resolveModel("summarization", modelOverride);
    const estimatedCostUsd = roundUsd(
      estimatedTokens * lookupInputTokenPriceUsd(modelId),
    );

    return {
      totalCharacters,
      estimatedTokens,
      estimatedCostUsd,
    };
  },
});

export const getExtractionStatus = query({
  args: {
    packId: v.id("personaPacks"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const pack = await loadPackForOrg(ctx, args.packId, identity.tokenIdentifier);
    const attachedTranscripts = await loadAttachedTranscripts(
      ctx,
      pack._id,
      identity.tokenIdentifier,
    );
    const attachedTranscriptIds = new Set(attachedTranscripts.map((transcript) => transcript._id));
    const transcriptSignals = (
      await ctx.db
        .query("transcriptSignals")
        .withIndex("by_packId", (query) => query.eq("packId", args.packId))
        .take(MAX_TRANSCRIPTS_PER_PACK)
    ).filter((signal) => attachedTranscriptIds.has(signal.transcriptId));
    const run = await ctx.db
      .query("transcriptExtractionRuns")
      .withIndex("by_packId", (query) => query.eq("packId", args.packId))
      .unique();

    if (run === null) {
      return null;
    }

    return buildExtractionStatusPayload(run, transcriptSignals);
  },
});

export const clusterArchetypes = action({
  args: {
    packId: v.id("personaPacks"),
    mode: extractionModeValidator,
    guidedAxes: v.optional(v.array(axisValidator)),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        packId: z.string(),
        mode: extractionModeSchema,
        guidedAxes: guidedAxesSchema.optional(),
      })
      .parse(args);
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const context: ClusteringContext = await ctx.runQuery(
      (internal as any).transcriptExtraction.getClusteringContext,
      {
        packId: parsedArgs.packId as Id<"personaPacks">,
        orgId: identity.tokenIdentifier,
      },
    );
    const guidedAxes = resolveGuidedAxes(
      context.pack.sharedAxes,
      parsedArgs.guidedAxes,
      parsedArgs.mode,
    );

    return await clusterArchetypesForPack(ctx, {
      pack: context.pack,
      mode: parsedArgs.mode,
      guidedAxes,
      modelOverride: context.modelOverride,
      signalDocs: context.transcriptSignals,
    });
  },
});

export const startExtraction = action({
  args: {
    packId: v.id("personaPacks"),
    mode: extractionModeValidator,
    guidedAxes: v.optional(v.array(axisValidator)),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        packId: z.string(),
        mode: extractionModeSchema,
        guidedAxes: guidedAxesSchema.optional(),
      })
      .parse(args);
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const packContext: PackExtractionContext = await ctx.runQuery(
      (internal as any).transcriptExtraction.getPackExtractionContext,
      {
        packId: parsedArgs.packId as Id<"personaPacks">,
        orgId: identity.tokenIdentifier,
      },
    );

    if (packContext.transcripts.length === 0) {
      throw new ConvexError("Attach at least one transcript before starting extraction.");
    }

    const guidedAxes = resolveGuidedAxes(
      packContext.pack.sharedAxes,
      parsedArgs.guidedAxes,
      parsedArgs.mode,
    );
    const now = Date.now();
    const initialState: ExtractionRunState = {
      packId: packContext.pack._id,
      orgId: identity.tokenIdentifier,
      mode: parsedArgs.mode,
      status: "processing",
      guidedAxes,
      proposedAxes: [],
      archetypes: [],
      totalTranscripts: packContext.transcripts.length,
      processedTranscriptCount: 0,
      succeededTranscriptIds: [],
      failedTranscripts: [],
      startedBy: identity.tokenIdentifier,
      startedAt: now,
      updatedAt: now,
    };

    await ctx.runMutation((internal as any).transcriptExtraction.beginExtractionRun, {
      runState: toExtractionRunMutationValue(initialState),
    });

    let runState = initialState;

    for (const transcript of packContext.transcripts) {
      runState = {
        ...runState,
        currentTranscriptId: transcript._id,
        updatedAt: Date.now(),
      };
      await ctx.runMutation((internal as any).transcriptExtraction.persistExtractionRunState, {
        runState: toExtractionRunMutationValue(runState),
      });

      try {
        await extractTranscriptSignalsForPack(ctx, {
          packId: packContext.pack._id,
          transcriptId: transcript._id,
        });
        runState = {
          ...runState,
          succeededTranscriptIds: [...runState.succeededTranscriptIds, transcript._id],
        };
      } catch (error) {
        runState = {
          ...runState,
          failedTranscripts: [
            ...runState.failedTranscripts,
            {
              transcriptId: transcript._id,
              error: toErrorMessage(error),
            },
          ],
        };
      }

      runState = {
        ...runState,
        processedTranscriptCount: runState.processedTranscriptCount + 1,
        currentTranscriptId: undefined,
        updatedAt: Date.now(),
      };
      await ctx.runMutation((internal as any).transcriptExtraction.persistExtractionRunState, {
        runState: toExtractionRunMutationValue(runState),
      });
    }

    if (runState.succeededTranscriptIds.length === 0) {
      const failedState: ExtractionRunState = {
        ...runState,
        status: "failed",
        errorMessage:
          runState.failedTranscripts[0]?.error ??
          "Transcript extraction failed before any transcript completed.",
        completedAt: Date.now(),
        updatedAt: Date.now(),
      };

      await ctx.runMutation((internal as any).transcriptExtraction.persistExtractionRunState, {
        runState: toExtractionRunMutationValue(failedState),
      });

      return buildExtractionStatusPayload(
        failedState,
        await fetchSignalsForPack(ctx, args.packId),
      );
    }

    try {
      const clusteringResult = await clusterArchetypesForPack(ctx, {
        pack: packContext.pack,
        mode: parsedArgs.mode,
        guidedAxes,
        modelOverride: await getModelOverrideForOrg(
          ctx,
          identity.tokenIdentifier,
          "clustering",
        ),
        signalDocs: await getCompletedSignalsForPackFromAction(ctx, args.packId),
      });
      const completedState: ExtractionRunState = {
        ...runState,
        status:
          runState.failedTranscripts.length > 0
            ? "completed_with_failures"
            : "completed",
        proposedAxes: clusteringResult.proposedAxes,
        archetypes: clusteringResult.archetypes,
        updatedAt: Date.now(),
        completedAt: Date.now(),
      };

      await ctx.runMutation((internal as any).transcriptExtraction.persistExtractionRunState, {
        runState: toExtractionRunMutationValue(completedState),
      });

      return buildExtractionStatusPayload(
        completedState,
        await fetchSignalsForPack(ctx, args.packId),
      );
    } catch (error) {
      const failedState: ExtractionRunState = {
        ...runState,
        status: "failed",
        errorMessage: toErrorMessage(error),
        updatedAt: Date.now(),
        completedAt: Date.now(),
      };

      await ctx.runMutation((internal as any).transcriptExtraction.persistExtractionRunState, {
        runState: toExtractionRunMutationValue(failedState),
      });

      return buildExtractionStatusPayload(
        failedState,
        await fetchSignalsForPack(ctx, args.packId),
      );
    }
  },
});

export const extractTranscriptSignals = internalAction({
  args: {
    packId: v.id("personaPacks"),
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args) => {
    return await extractTranscriptSignalsForPack(ctx, args);
  },
});

export const getPackExtractionContext = internalQuery({
  args: {
    packId: v.id("personaPacks"),
    orgId: v.string(),
  },
  handler: async (ctx, args): Promise<PackExtractionContext> => {
    const pack = await loadPackForOrg(ctx, args.packId, args.orgId);
    const transcripts = await loadAttachedTranscripts(ctx, args.packId, args.orgId);

    return {
      pack,
      transcripts,
    };
  },
});

export const getClusteringContext = internalQuery({
  args: {
    packId: v.id("personaPacks"),
    orgId: v.string(),
  },
  handler: async (ctx, args): Promise<ClusteringContext> => {
    const pack = await loadPackForOrg(ctx, args.packId, args.orgId);
    const transcriptSignals = await getCompletedSignalsForPackFromQuery(
      ctx,
      args.packId,
      args.orgId,
    );

    return {
      pack,
      transcriptSignals,
      modelOverride: await getModelOverrideForOrgQuery(
        ctx,
        args.orgId,
        "clustering",
      ),
    };
  },
});

export const getSignalExtractionContext = internalQuery({
  args: {
    packId: v.id("personaPacks"),
    transcriptId: v.id("transcripts"),
  },
  handler: async (ctx, args): Promise<SignalExtractionContext> => {
    const pack = await ctx.db.get(args.packId);

    if (pack === null) {
      throw new ConvexError("Persona pack not found.");
    }

    const transcript = await ctx.db.get(args.transcriptId);

    if (transcript === null || transcript.orgId !== pack.orgId) {
      throw new ConvexError("Transcript not found.");
    }

    const attachmentExists = await hasTranscriptAttachment(ctx, args.packId, args.transcriptId);

    if (!attachmentExists) {
      throw new ConvexError("Transcript is not attached to this pack.");
    }

    return {
      orgId: pack.orgId,
      packId: pack._id,
      transcriptId: transcript._id,
      storageId: transcript.storageId,
      transcriptFormat: transcript.format,
      originalFilename: transcript.originalFilename,
      packName: pack.name,
      packDescription: pack.description,
      packContext: pack.context,
      modelOverride: await getModelOverrideForOrgQuery(
        ctx,
        pack.orgId,
        "summarization",
      ),
    };
  },
});

export const markTranscriptSignalProcessing = internalMutation({
  args: {
    packId: v.id("personaPacks"),
    transcriptId: v.id("transcripts"),
    orgId: v.string(),
  },
  handler: async (ctx, args) => {
    await upsertTranscriptSignalRecord(ctx, {
      packId: args.packId,
      transcriptId: args.transcriptId,
      orgId: args.orgId,
      status: "processing",
      signals: undefined,
      processingError: undefined,
    });

    return null;
  },
});

export const storeTranscriptSignals = internalMutation({
  args: {
    packId: v.id("personaPacks"),
    transcriptId: v.id("transcripts"),
    orgId: v.string(),
    signals: transcriptSignalsValidator,
  },
  handler: async (ctx, args) => {
    await upsertTranscriptSignalRecord(ctx, {
      packId: args.packId,
      transcriptId: args.transcriptId,
      orgId: args.orgId,
      status: "completed",
      signals: args.signals,
      processingError: undefined,
    });

    return null;
  },
});

export const markTranscriptSignalFailed = internalMutation({
  args: {
    packId: v.id("personaPacks"),
    transcriptId: v.id("transcripts"),
    orgId: v.string(),
    processingError: v.string(),
  },
  handler: async (ctx, args) => {
    await upsertTranscriptSignalRecord(ctx, {
      packId: args.packId,
      transcriptId: args.transcriptId,
      orgId: args.orgId,
      status: "failed",
      signals: undefined,
      processingError: args.processingError,
    });

    return null;
  },
});

export const beginExtractionRun = internalMutation({
  args: {
    runState: extractionRunStateValidator,
  },
  handler: async (ctx, args) => {
    const existingRun = await ctx.db
      .query("transcriptExtractionRuns")
      .withIndex("by_packId", (query) => query.eq("packId", args.runState.packId))
      .unique();

    if (existingRun !== null && existingRun.status === "processing") {
      throw new ConvexError("Transcript extraction is already in progress for this pack.");
    }

    await upsertExtractionRunStateInDb(ctx, args.runState);
    return null;
  },
});

export const persistExtractionRunState = internalMutation({
  args: {
    runState: extractionRunStateValidator,
  },
  handler: async (ctx, args) => {
    await upsertExtractionRunStateInDb(ctx, args.runState);
    return null;
  },
});

async function extractTranscriptSignalsForPack(
  ctx: ActionCtx,
  args: {
    packId: Id<"personaPacks">;
    transcriptId: Id<"transcripts">;
  },
) {
  const context: SignalExtractionContext = await ctx.runQuery(
    (internal as any).transcriptExtraction.getSignalExtractionContext,
    args,
  );
  await ctx.runMutation((internal as any).transcriptExtraction.markTranscriptSignalProcessing, {
    packId: args.packId,
    transcriptId: args.transcriptId,
    orgId: context.orgId,
  });

  try {
    const blob = await ctx.storage.get(context.storageId);

    if (blob === null) {
      throw new ConvexError("Transcript file not found in storage.");
    }

    const rawTranscript = await blob.text();
    const transcriptText = normalizeTranscriptText(
      context.transcriptFormat,
      rawTranscript,
    );
    const { generateWithModel } = await import("../packages/ai/src/index");
    const result = await generateWithModel("summarization", {
      modelOverride: context.modelOverride,
      system: buildSignalExtractionSystemPrompt(),
      prompt: buildSignalExtractionPrompt(context, transcriptText),
    });
    const parsedSignals = parseTranscriptSignalsResponse(result.text, transcriptText);

    await ctx.runMutation((internal as any).transcriptExtraction.storeTranscriptSignals, {
      packId: args.packId,
      transcriptId: args.transcriptId,
      orgId: context.orgId,
      signals: parsedSignals,
    });

    return parsedSignals;
  } catch (error) {
    const convexError = ensureConvexError(
      error,
      "Transcript signal extraction failed.",
    );

    await ctx.runMutation((internal as any).transcriptExtraction.markTranscriptSignalFailed, {
      packId: args.packId,
      transcriptId: args.transcriptId,
      orgId: context.orgId,
      processingError: toErrorMessage(convexError),
    });

    throw convexError;
  }
}

async function clusterArchetypesForPack(
  ctx: ActionCtx,
  {
    pack,
    mode,
    guidedAxes,
    modelOverride,
    signalDocs,
  }: {
    pack: Doc<"personaPacks">;
    mode: ExtractionMode;
    guidedAxes: GuidedAxis[];
    modelOverride?: string;
    signalDocs: Doc<"transcriptSignals">[];
  },
) {
  if (signalDocs.length === 0) {
    throw new ConvexError("Extract transcript signals before clustering archetypes.");
  }

  const { generateWithModel } = await import("../packages/ai/src/index");
  const result = await generateWithModel("clustering", {
    modelOverride,
    system: buildClusteringSystemPrompt(mode),
    prompt: buildClusteringPrompt({
      pack,
      mode,
      guidedAxes,
      signalDocs,
    }),
  });

  return parseClusteringResponse(result.text, {
    mode,
    guidedAxes,
    validTranscriptIds: new Set(signalDocs.map((signal) => signal.transcriptId)),
  });
}

function buildSignalExtractionSystemPrompt() {
  return [
    "You extract behavioral signals from user-research transcripts.",
    "Return only valid JSON with these keys: themes, attitudes, painPoints, decisionPatterns, evidenceSnippets.",
    "Every evidence snippet must contain quote, startChar, and endChar.",
    "Use direct quotes copied from the transcript text exactly.",
  ].join(" ");
}

function buildSignalExtractionPrompt(
  context: SignalExtractionContext,
  transcriptText: string,
) {
  return [
    "Extract the participant's behavioral signals from this transcript.",
    `Persona pack: ${context.packName}`,
    `Pack context: ${context.packContext}`,
    `Pack description: ${context.packDescription}`,
    `Transcript filename: ${context.originalFilename}`,
    "Return JSON matching this shape exactly:",
    JSON.stringify({
      themes: ["string"],
      attitudes: ["string"],
      painPoints: ["string"],
      decisionPatterns: ["string"],
      evidenceSnippets: [
        {
          quote: "direct quote",
          startChar: 0,
          endChar: 12,
        },
      ],
    }),
    "Transcript text (character offsets refer to this exact text):",
    transcriptText,
  ].join("\n");
}

function buildClusteringSystemPrompt(mode: ExtractionMode) {
  return [
    "You cluster transcript-derived behavioral signals into distinct user archetypes.",
    "Return only valid JSON with keys archetypes and proposedAxes.",
    "Each archetype must include name, summary, axisValues, evidenceSnippets, and contributingTranscriptIds.",
    mode === "guided"
      ? "Guided mode must map archetypes onto the provided axes only and proposedAxes must be []."
      : "Auto-discover mode must also propose axes that fit the discovered archetypes.",
  ].join(" ");
}

function buildClusteringPrompt({
  pack,
  mode,
  guidedAxes,
  signalDocs,
}: {
  pack: Doc<"personaPacks">;
  mode: ExtractionMode;
  guidedAxes: GuidedAxis[];
  signalDocs: Doc<"transcriptSignals">[];
}) {
  return [
    "Cluster these transcript signals into distinct behavioral archetypes.",
    `Pack name: ${pack.name}`,
    `Pack context: ${pack.context}`,
    `Extraction mode: ${mode}`,
    mode === "guided"
      ? `Use these axes exactly: ${JSON.stringify(guidedAxes)}`
      : "Propose 1 or more axes that explain the clustering outcome.",
    "Transcript signals:",
    JSON.stringify(
      signalDocs.map((signalDoc) => ({
        transcriptId: signalDoc.transcriptId,
        themes: signalDoc.signals?.themes ?? [],
        attitudes: signalDoc.signals?.attitudes ?? [],
        painPoints: signalDoc.signals?.painPoints ?? [],
        decisionPatterns: signalDoc.signals?.decisionPatterns ?? [],
        evidenceSnippets: signalDoc.signals?.evidenceSnippets ?? [],
      })),
      null,
      2,
    ),
    "Return JSON matching this shape exactly:",
    JSON.stringify({
      archetypes: [
        {
          name: "string",
          summary: "string",
          axisValues: [{ key: "axis_key", value: 0.5 }],
          evidenceSnippets: [
            {
              transcriptId: String(signalDocs[0]?.transcriptId ?? ""),
              quote: "direct quote",
              startChar: 0,
              endChar: 12,
            },
          ],
          contributingTranscriptIds: [String(signalDocs[0]?.transcriptId ?? "")],
        },
      ],
      proposedAxes:
        mode === "auto_discover"
          ? [
              {
                key: "axis_key",
                label: "Axis Label",
                description: "What this axis explains.",
                lowAnchor: "Low anchor",
                midAnchor: "Mid anchor",
                highAnchor: "High anchor",
                weight: 1,
              },
            ]
          : [],
    }),
  ].join("\n");
}

function parseTranscriptSignalsResponse(
  responseText: string,
  transcriptText: string,
) {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(responseText);
  } catch {
    throw new ConvexError("Failed to parse transcript signals response.");
  }

  const parsedSignals = transcriptSignalsSchema.safeParse(parsedJson);

  if (!parsedSignals.success) {
    throw new ConvexError(
      `Transcript signals response is invalid: ${formatZodIssues(parsedSignals.error.issues)}`,
    );
  }

  return {
    ...parsedSignals.data,
    evidenceSnippets: parsedSignals.data.evidenceSnippets.map((snippet) =>
      normalizeTranscriptEvidenceSnippet(snippet, transcriptText),
    ),
  };
}

function parseClusteringResponse(
  responseText: string,
  {
    mode,
    guidedAxes,
    validTranscriptIds,
  }: {
    mode: ExtractionMode;
    guidedAxes: GuidedAxis[];
    validTranscriptIds: Set<Id<"transcripts">>;
  },
) {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(responseText);
  } catch {
    throw new ConvexError("Failed to parse archetype clustering response.");
  }

  const parsedResponse = clusteringResponseSchema.safeParse(parsedJson);

  if (!parsedResponse.success) {
    throw new ConvexError(
      `Archetype clustering response is invalid: ${formatZodIssues(parsedResponse.error.issues)}`,
    );
  }

  const proposedAxes = parsedResponse.data.proposedAxes;

  if (mode === "guided" && proposedAxes.length > 0) {
    throw new ConvexError("Guided clustering must not propose new axes.");
  }

  if (mode === "auto_discover" && proposedAxes.length === 0) {
    throw new ConvexError("Auto-discover clustering must propose at least one axis.");
  }

  const guidedAxisKeys = new Set(guidedAxes.map((axis) => axis.key));
  const archetypes = parsedResponse.data.archetypes.map((archetype) => {
    const contributingTranscriptIds = archetype.contributingTranscriptIds.map((transcriptId) =>
      normalizeTranscriptIdRef(transcriptId, validTranscriptIds),
    );
    const evidenceSnippets = archetype.evidenceSnippets.map((snippet) => ({
      transcriptId: normalizeTranscriptIdRef(snippet.transcriptId, validTranscriptIds),
      quote: snippet.quote,
      startChar: snippet.startChar ?? 0,
      endChar: snippet.endChar ?? snippet.quote.length,
    }));

    if (mode === "guided") {
      const axisKeys = new Set(archetype.axisValues.map((axisValue) => axisValue.key));
      const missingKeys = [...guidedAxisKeys].filter((axisKey) => !axisKeys.has(axisKey));
      const unexpectedKeys = [...axisKeys].filter((axisKey) => !guidedAxisKeys.has(axisKey));

      if (missingKeys.length > 0 || unexpectedKeys.length > 0) {
        throw new ConvexError(
          "Guided clustering must map every archetype onto the provided axes only.",
        );
      }
    }

    return {
      name: archetype.name,
      summary: archetype.summary,
      axisValues: archetype.axisValues,
      evidenceSnippets,
      contributingTranscriptIds,
    };
  });

  return {
    mode,
    guidedAxes,
    proposedAxes,
    archetypes,
  };
}

function normalizeTranscriptEvidenceSnippet(
  snippet: z.infer<typeof transcriptEvidenceSnippetSchema>,
  transcriptText: string,
) {
  const quote = snippet.quote.trim();
  const providedStart = snippet.startChar;
  const providedEnd = snippet.endChar;

  if (
    providedStart !== undefined &&
    providedEnd !== undefined &&
    transcriptText.slice(providedStart, providedEnd) === quote
  ) {
    return {
      quote,
      startChar: providedStart,
      endChar: providedEnd,
    };
  }

  const searchStart = providedStart !== undefined ? Math.max(0, providedStart - 50) : 0;
  const foundIndex = transcriptText.indexOf(quote, searchStart);

  if (foundIndex === -1) {
    throw new ConvexError(`Evidence snippet quote not found in transcript: "${quote}"`);
  }

  return {
    quote,
    startChar: foundIndex,
    endChar: foundIndex + quote.length,
  };
}

function normalizeTranscriptText(
  format: Doc<"transcripts">["format"],
  rawTranscript: string,
) {
  if (format === "txt") {
    return rawTranscript;
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawTranscript);
  } catch {
    throw new ConvexError("Transcript JSON could not be parsed for extraction.");
  }

  const turns = z
    .array(
      z.object({
        speaker: requiredString("Transcript speaker"),
        text: requiredString("Transcript text"),
        timestamp: z.number().optional(),
      }),
    )
    .safeParse(parsedJson);

  if (!turns.success) {
    throw new ConvexError(
      `Transcript JSON is invalid for extraction: ${formatZodIssues(turns.error.issues)}`,
    );
  }

  return turns.data.map((turn) => `${turn.speaker}: ${turn.text}`).join("\n");
}

function buildExtractionStatusPayload(
  run: ExtractionRunState | Doc<"transcriptExtractionRuns">,
  transcriptSignals: Doc<"transcriptSignals">[],
) {
  return {
    packId: run.packId,
    mode: run.mode,
    status: run.status,
    guidedAxes: run.guidedAxes,
    proposedAxes: run.proposedAxes,
    archetypes: run.archetypes,
    totalTranscripts: run.totalTranscripts,
    processedTranscriptCount: run.processedTranscriptCount,
    currentTranscriptId: run.currentTranscriptId ?? null,
    succeededTranscriptIds: run.succeededTranscriptIds,
    failedTranscripts: run.failedTranscripts,
    errorMessage: run.errorMessage ?? null,
    startedBy: run.startedBy,
    startedAt: run.startedAt,
    updatedAt: run.updatedAt,
    completedAt: run.completedAt ?? null,
    transcriptSignals,
  };
}

async function loadPackForOrg(
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

async function loadTranscriptsForOrg(
  ctx: QueryCtx,
  transcriptIds: readonly Id<"transcripts">[],
  orgId: string,
) {
  const transcripts: Doc<"transcripts">[] = [];

  for (const transcriptId of transcriptIds) {
    const transcript = await ctx.db.get(transcriptId);

    if (transcript === null || transcript.orgId !== orgId) {
      throw new ConvexError("Transcript not found.");
    }

    transcripts.push(transcript);
  }

  return transcripts;
}

async function loadAttachedTranscripts(
  ctx: QueryCtx,
  packId: Id<"personaPacks">,
  orgId: string,
) {
  const attachments = await ctx.db
    .query("packTranscripts")
    .withIndex("by_packId", (query) => query.eq("packId", packId))
    .take(MAX_TRANSCRIPTS_PER_PACK);
  const transcripts: Doc<"transcripts">[] = [];

  for (const attachment of attachments) {
    const transcript = await ctx.db.get(attachment.transcriptId);

    if (transcript !== null && transcript.orgId === orgId) {
      transcripts.push(transcript);
    }
  }

  return transcripts;
}

async function hasTranscriptAttachment(
  ctx: QueryCtx,
  packId: Id<"personaPacks">,
  transcriptId: Id<"transcripts">,
) {
  const attachments = await ctx.db
    .query("packTranscripts")
    .withIndex("by_packId", (query) => query.eq("packId", packId))
    .take(MAX_TRANSCRIPTS_PER_PACK);

  return attachments.some((attachment) => attachment.transcriptId === transcriptId);
}

async function fetchSignalsForPack(ctx: ActionCtx, packId: Id<"personaPacks">) {
  return await ctx.runQuery((internal as any).transcriptExtraction.getSignalsForPack, {
    packId,
  });
}

async function getCompletedSignalsForPackFromAction(
  ctx: ActionCtx,
  packId: Id<"personaPacks">,
) {
  const allSignals = await ctx.runQuery(
    (internal as any).transcriptExtraction.getSignalsForPack,
    {
      packId,
    },
  );

  return allSignals.filter(
    (signal: Doc<"transcriptSignals">) => signal.status === "completed",
  );
}

async function getCompletedSignalsForPackFromQuery(
  ctx: QueryCtx,
  packId: Id<"personaPacks">,
  orgId?: string,
) {
  const allSignals: Doc<"transcriptSignals">[] = await ctx.db
    .query("transcriptSignals")
    .withIndex("by_packId", (query) => query.eq("packId", packId))
    .take(MAX_TRANSCRIPTS_PER_PACK);

  if (orgId === undefined) {
    return allSignals.filter((signal) => signal.status === "completed");
  }

  return allSignals.filter(
    (signal) => signal.status === "completed" && signal.orgId === orgId,
  );
}

export const getSignalsForPack = internalQuery({
  args: {
    packId: v.id("personaPacks"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("transcriptSignals")
      .withIndex("by_packId", (query) => query.eq("packId", args.packId))
      .take(MAX_TRANSCRIPTS_PER_PACK);
  },
});

async function upsertTranscriptSignalRecord(
  ctx: MutationCtx,
  {
    packId,
    transcriptId,
    orgId,
    status,
    signals,
    processingError,
  }: {
    packId: Id<"personaPacks">;
    transcriptId: Id<"transcripts">;
    orgId: string;
    status: "processing" | "completed" | "failed";
    signals: StoredTranscriptSignals | undefined;
    processingError: string | undefined;
  },
) {
  const existingRecord = await ctx.db
    .query("transcriptSignals")
    .withIndex("by_packId_and_transcriptId", (query) =>
      query.eq("packId", packId).eq("transcriptId", transcriptId),
    )
    .unique();
  const nextRecord = {
    transcriptId,
    packId,
    orgId,
    status,
    signals,
    processingError,
    createdAt: existingRecord?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  };

  if (existingRecord === null) {
    await ctx.db.insert("transcriptSignals", omitUndefined(nextRecord));
    return;
  }

  await ctx.db.replace(existingRecord._id, omitUndefined(nextRecord));
}

async function upsertExtractionRunStateInDb(
  ctx: MutationCtx,
  runState: ExtractionRunState,
) {
  const existingRun = await ctx.db
    .query("transcriptExtractionRuns")
    .withIndex("by_packId", (query) => query.eq("packId", runState.packId))
    .unique();

  if (existingRun === null) {
    await ctx.db.insert("transcriptExtractionRuns", omitUndefined(runState));
    return;
  }

  await ctx.db.replace(existingRun._id, omitUndefined(runState));
}

function resolveGuidedAxes(
  packSharedAxes: GuidedAxis[],
  guidedAxes: GuidedAxis[] | undefined,
  mode: ExtractionMode,
) {
  if (mode !== "guided") {
    return guidedAxes ?? [];
  }

  const axes = guidedAxes ?? packSharedAxes;
  const parsedAxes = guidedAxesSchema.safeParse(axes);

  if (!parsedAxes.success) {
    throw new ConvexError(formatZodIssues(parsedAxes.error.issues));
  }

  return parsedAxes.data;
}

async function getModelOverrideForOrg(
  ctx: ActionCtx,
  orgId: string,
  taskCategory: "summarization" | "clustering",
) {
  const settings = await ctx.runQuery(internal.settings.getEffectiveSettingsForOrg, {
    orgId,
  });

  return settings.modelConfig.find(
    (entry: { taskCategory: string; modelId: string }) =>
      entry.taskCategory === taskCategory,
  )?.modelId;
}

async function getModelOverrideForOrgQuery(
  ctx: QueryCtx,
  orgId: string,
  taskCategory: "summarization" | "clustering",
) {
  const settings = await loadEffectiveSettingsForOrg(ctx, orgId);

  return settings.modelConfig.find(
    (entry: { taskCategory: string; modelId: string }) =>
      entry.taskCategory === taskCategory,
  )?.modelId;
}

function lookupInputTokenPriceUsd(modelId: string) {
  const normalizedModelId = modelId.trim();
  const exactPrice = MODEL_INPUT_PRICE_PER_MILLION_TOKENS_USD[normalizedModelId];

  if (exactPrice !== undefined) {
    return exactPrice / 1_000_000;
  }

  const matchingEntry = Object.entries(MODEL_INPUT_PRICE_PER_MILLION_TOKENS_USD)
    .sort(([leftModelId], [rightModelId]) => rightModelId.length - leftModelId.length)
    .find(([candidateModelId]) =>
      normalizedModelId === candidateModelId ||
      normalizedModelId.startsWith(`${candidateModelId}-`),
    );

  if (matchingEntry !== undefined) {
    return matchingEntry[1] / 1_000_000;
  }

  throw new ConvexError(`No pricing metadata configured for model "${modelId}".`);
}

function normalizeTranscriptIdRef(
  transcriptId: string,
  validTranscriptIds: Set<Id<"transcripts">>,
) {
  const typedTranscriptId = transcriptId as Id<"transcripts">;

  if (!validTranscriptIds.has(typedTranscriptId)) {
    throw new ConvexError(`Archetype references unknown transcript ID "${transcriptId}".`);
  }

  return typedTranscriptId;
}

function formatZodIssues(issues: z.ZodIssue[]) {
  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "response";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

function ensureConvexError(error: unknown, fallbackMessage: string) {
  if (error instanceof ConvexError) {
    return error;
  }

  if (error instanceof Error) {
    return new ConvexError(error.message);
  }

  return new ConvexError(fallbackMessage);
}

function toErrorMessage(error: unknown) {
  if (error instanceof ConvexError) {
    return typeof error.data === "string" ? error.data : "Convex error.";
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown transcript extraction error.";
}

function roundUsd(value: number) {
  return Number(value.toFixed(8));
}

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entryValue]) => entryValue !== undefined),
  ) as T;
}

function toExtractionRunMutationValue(runState: ExtractionRunState) {
  return omitUndefined({
    ...runState,
    currentTranscriptId: runState.currentTranscriptId,
    errorMessage: runState.errorMessage,
    completedAt: runState.completedAt,
  });
}

type ExtractionMode = z.infer<typeof extractionModeSchema>;
type GuidedAxis = z.infer<typeof axisSchema>;
type StoredTranscriptSignals = {
  themes: string[];
  attitudes: string[];
  painPoints: string[];
  decisionPatterns: string[];
  evidenceSnippets: Array<{
    quote: string;
    startChar: number;
    endChar: number;
  }>;
};

type SignalExtractionContext = {
  orgId: string;
  packId: Id<"personaPacks">;
  transcriptId: Id<"transcripts">;
  storageId: Id<"_storage">;
  transcriptFormat: Doc<"transcripts">["format"];
  originalFilename: string;
  packName: string;
  packDescription: string;
  packContext: string;
  modelOverride?: string;
};

type PackExtractionContext = {
  pack: Doc<"personaPacks">;
  transcripts: Doc<"transcripts">[];
};

type ClusteringContext = {
  pack: Doc<"personaPacks">;
  transcriptSignals: Doc<"transcriptSignals">[];
  modelOverride?: string;
};

type ExtractionRunState = {
  packId: Id<"personaPacks">;
  orgId: string;
  mode: ExtractionMode;
  status: "processing" | "completed" | "completed_with_failures" | "failed";
  guidedAxes: GuidedAxis[];
  proposedAxes: GuidedAxis[];
  archetypes: Array<{
    name: string;
    summary: string;
    axisValues: Array<{ key: string; value: number }>;
    evidenceSnippets: Array<{
      transcriptId: Id<"transcripts">;
      quote: string;
      startChar: number;
      endChar: number;
    }>;
    contributingTranscriptIds: Id<"transcripts">[];
  }>;
  totalTranscripts: number;
  processedTranscriptCount: number;
  currentTranscriptId?: Id<"transcripts">;
  succeededTranscriptIds: Id<"transcripts">[];
  failedTranscripts: Array<{
    transcriptId: Id<"transcripts">;
    error: string;
  }>;
  errorMessage?: string;
  startedBy: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
};
