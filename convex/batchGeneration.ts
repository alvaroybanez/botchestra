import { ConvexError, v } from "convex/values";
import { z } from "zod";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  type MutationCtx,
  type QueryCtx,
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import {
  generateGridAnchors,
  type GridLevelCount,
  type LevelsPerAxis,
  validateGenerationConfig,
} from "./batchGeneration/gridAnchors";
import { expandedSyntheticUserPersistedSchema } from "./batchGeneration/expansion";
import { MAX_SYNTHETIC_USERS_PER_CONFIG } from "./personaConfig.constants";
import { requireIdentity, requireRole, STUDY_MANAGER_ROLES } from "./rbac";

const gridLevelCountSchema = z.union([z.literal(3), z.literal(5), z.literal(7)]);

const levelsPerAxisSchema: z.ZodType<LevelsPerAxis> = z.union([
  gridLevelCountSchema,
  z.record(z.string(), gridLevelCountSchema),
]);

const levelsPerAxisValidator = v.union(
  v.number(),
  v.record(v.string(), v.number()),
);

const expandedSyntheticUserPersistedValidator = v.object({
  name: v.string(),
  summary: v.string(),
  axes: v.array(
    v.object({
      key: v.string(),
      label: v.string(),
      description: v.string(),
      lowAnchor: v.string(),
      midAnchor: v.string(),
      highAnchor: v.string(),
      weight: v.number(),
    }),
  ),
  firstPersonBio: v.string(),
  behaviorRules: v.array(v.string()),
  tensionSeed: v.string(),
});

export const startBatchGeneration = mutation({
  args: {
    configId: v.id("personaConfigs"),
    levelsPerAxis: levelsPerAxisValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        configId: z.string(),
        levelsPerAxis: levelsPerAxisSchema,
      })
      .parse(args);
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const configId = parsedArgs.configId as Id<"personaConfigs">;
    const config = await getConfigForOrg(ctx, configId, identity.tokenIdentifier);

    assertConfigIsDraft(config);

    const activeRun = await findActiveBatchGenerationRun(ctx, configId);

    if (activeRun !== null) {
      throw new ConvexError(
        "An active batch generation run already exists for this persona configuration.",
      );
    }

    const validation = validateGenerationConfig(
      config.sharedAxes.map((axis) => ({
        name: axis.key,
        lowAnchor: axis.lowAnchor,
        midAnchor: axis.midAnchor,
        highAnchor: axis.highAnchor,
      })),
      parsedArgs.levelsPerAxis,
      MAX_SYNTHETIC_USERS_PER_CONFIG,
    );

    if (!validation.valid) {
      throw new ConvexError(validation.error);
    }

    const existingSyntheticUserCount = await ctx.db
      .query("syntheticUsers")
      .withIndex("by_configId", (q) => q.eq("configId", configId))
      .collect();

    if (
      existingSyntheticUserCount.length + validation.totalUsers >
      MAX_SYNTHETIC_USERS_PER_CONFIG
    ) {
      throw new ConvexError(
        `A config may contain a maximum of ${MAX_SYNTHETIC_USERS_PER_CONFIG} synthetic users.`,
      );
    }

    const normalizedLevelsPerAxis = normalizeLevelsPerAxis(
      config.sharedAxes,
      parsedArgs.levelsPerAxis,
    );
    const anchors = generateGridAnchors(
      config.sharedAxes.map((axis) => ({
        name: axis.key,
        lowAnchor: axis.lowAnchor,
        midAnchor: axis.midAnchor,
        highAnchor: axis.highAnchor,
      })),
      normalizedLevelsPerAxis,
    );
    const startedAt = Date.now();
    const runId = await ctx.db.insert("batchGenerationRuns", {
      configId,
      orgId: identity.tokenIdentifier,
      status: "pending",
      levelsPerAxis: normalizedLevelsPerAxis,
      totalCount: validation.totalUsers,
      completedCount: 0,
      failedCount: 0,
      startedAt,
    });

    for (const [index, anchor] of anchors.entries()) {
      await ctx.db.insert("syntheticUsers", {
        configId,
        name: `Generated Synthetic User ${index + 1}`,
        summary: "Pending synthetic user expansion.",
        axes: config.sharedAxes,
        axisValues: toAxisValuesArray(anchor.axisValues),
        sourceType: "generated",
        batchGenerationRunId: runId,
        generationStatus: "pending_expansion",
        sourceRefs: [],
        evidenceSnippets: [],
      });
    }

    await ctx.db.patch(configId, {
      updatedAt: startedAt,
      updatedBy: identity.tokenIdentifier,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.batchGenerationAction.expandNextUser,
      { runId },
    );

    return runId;
  },
});

export const getBatchGenerationRun = query({
  args: {
    configId: v.id("personaConfigs"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const config = await ctx.db.get(args.configId);

    if (config === null || config.orgId !== identity.tokenIdentifier) {
      return null;
    }

    const run = await findCurrentOrLatestBatchGenerationRun(ctx, args.configId);

    if (run === null) {
      return null;
    }

    return {
      ...run,
      remainingCount: Math.max(
        0,
        run.totalCount - run.completedCount - run.failedCount,
      ),
      progressPercent:
        run.totalCount === 0
          ? 0
          : Math.round(
              ((run.completedCount + run.failedCount) / run.totalCount) * 100,
            ),
    };
  },
});

export const regenerateSyntheticUser = mutation({
  args: {
    syntheticUserId: v.id("syntheticUsers"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const { syntheticUser, config } = await getSyntheticUserForOrg(
      ctx,
      args.syntheticUserId,
      identity.tokenIdentifier,
    );

    assertConfigIsDraft(config);

    if (syntheticUser.sourceType !== "generated") {
      throw new ConvexError("Only generated synthetic users can be regenerated.");
    }

    if (
      syntheticUser.axisValues === undefined ||
      syntheticUser.axisValues.length === 0
    ) {
      throw new ConvexError(
        "Generated synthetic users must keep axis values before regeneration.",
      );
    }

    const activeRun = await findActiveBatchGenerationRun(ctx, config._id);

    if (activeRun !== null) {
      throw new ConvexError(
        "Cannot regenerate a synthetic user while batch generation is still running.",
      );
    }

    await ctx.scheduler.runAfter(
      0,
      internal.batchGenerationAction.regenerateSyntheticUserProfile,
      { syntheticUserId: args.syntheticUserId },
    );

    return args.syntheticUserId;
  },
});

export const claimNextSyntheticUserForExpansion = internalMutation({
  args: {
    runId: v.id("batchGenerationRuns"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);

    if (run === null) {
      throw new ConvexError("Batch generation run not found.");
    }

    if (isTerminalRunStatus(run.status)) {
      return null;
    }

    const config = await ctx.db.get(run.configId);

    if (config === null || config.orgId !== run.orgId) {
      throw new ConvexError("Persona configuration not found.");
    }

    const [syntheticUser] = await ctx.db
      .query("syntheticUsers")
      .withIndex("by_batchGenerationRunId_and_generationStatus", (q) =>
        q
          .eq("batchGenerationRunId", run._id)
          .eq("generationStatus", "pending_expansion"),
      )
      .take(1);

    if (syntheticUser === undefined) {
      return null;
    }

    await ctx.db.patch(syntheticUser._id, {
      generationStatus: "expanding",
      generationError: undefined,
    });

    if (run.status === "pending") {
      await ctx.db.patch(run._id, {
        status: "running",
      });
    }

    return {
      runId: run._id,
      orgId: run.orgId,
      levelsPerAxis: run.levelsPerAxis,
      syntheticUserId: syntheticUser._id,
      config,
      syntheticUser: {
        ...syntheticUser,
        generationStatus: "expanding" as const,
      },
    };
  },
});

export const claimSyntheticUserForRegeneration = internalMutation({
  args: {
    syntheticUserId: v.id("syntheticUsers"),
  },
  handler: async (ctx, args) => {
    const syntheticUser = await ctx.db.get(args.syntheticUserId);

    if (syntheticUser === null) {
      throw new ConvexError("Synthetic user not found.");
    }

    if (syntheticUser.sourceType !== "generated") {
      throw new ConvexError("Only generated synthetic users can be regenerated.");
    }

    if (
      syntheticUser.axisValues === undefined ||
      syntheticUser.axisValues.length === 0
    ) {
      throw new ConvexError(
        "Generated synthetic users must keep axis values before regeneration.",
      );
    }

    const config = await ctx.db.get(syntheticUser.configId);

    if (config === null) {
      throw new ConvexError("Persona configuration not found.");
    }

    return {
      orgId: config.orgId,
      config,
      syntheticUser,
    };
  },
});

export const completeSyntheticUserExpansion = internalMutation({
  args: {
    runId: v.optional(v.id("batchGenerationRuns")),
    syntheticUserId: v.id("syntheticUsers"),
    generatedUser: expandedSyntheticUserPersistedValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        runId: z.string().optional(),
        syntheticUserId: z.string(),
        generatedUser: expandedSyntheticUserPersistedSchema,
      })
      .parse(args);
    const syntheticUserId = parsedArgs.syntheticUserId as Id<"syntheticUsers">;

    await ctx.db.patch(syntheticUserId, {
      name: parsedArgs.generatedUser.name,
      summary: parsedArgs.generatedUser.summary,
      axes: parsedArgs.generatedUser.axes,
      firstPersonBio: parsedArgs.generatedUser.firstPersonBio,
      behaviorRules: parsedArgs.generatedUser.behaviorRules,
      tensionSeed: parsedArgs.generatedUser.tensionSeed,
      generationStatus: "completed",
      generationError: undefined,
    });

    if (parsedArgs.runId === undefined) {
      return syntheticUserId;
    }

    const runId = parsedArgs.runId as Id<"batchGenerationRuns">;
    const run = await ctx.db.get(runId);

    if (run === null) {
      throw new ConvexError("Batch generation run not found.");
    }

    const completedCount = run.completedCount + 1;
    const terminalStatus = getTerminalRunStatus({
      completedCount,
      failedCount: run.failedCount,
      totalCount: run.totalCount,
    });

    await ctx.db.patch(runId, {
      status: terminalStatus ?? "running",
      completedCount,
      ...(terminalStatus !== null ? { completedAt: Date.now() } : {}),
    });

    return syntheticUserId;
  },
});

export const failSyntheticUserExpansion = internalMutation({
  args: {
    runId: v.optional(v.id("batchGenerationRuns")),
    syntheticUserId: v.id("syntheticUsers"),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const syntheticUser = await ctx.db.get(args.syntheticUserId);

    if (syntheticUser === null) {
      throw new ConvexError("Synthetic user not found.");
    }

    if (args.runId === undefined) {
      await ctx.db.patch(args.syntheticUserId, {
        generationStatus: syntheticUser.generationStatus ?? "failed",
        generationError: args.errorMessage,
      });

      return args.syntheticUserId;
    }

    await ctx.db.patch(args.syntheticUserId, {
      generationStatus: "failed",
      generationError: args.errorMessage,
    });

    const run = await ctx.db.get(args.runId);

    if (run === null) {
      throw new ConvexError("Batch generation run not found.");
    }

    const failedCount = run.failedCount + 1;
    const terminalStatus = getTerminalRunStatus({
      completedCount: run.completedCount,
      failedCount,
      totalCount: run.totalCount,
    });

    await ctx.db.patch(args.runId, {
      status: terminalStatus ?? "running",
      failedCount,
      ...(terminalStatus !== null ? { completedAt: Date.now() } : {}),
    });

    return args.syntheticUserId;
  },
});

function getTerminalRunStatus({
  completedCount,
  failedCount,
  totalCount,
}: {
  completedCount: number;
  failedCount: number;
  totalCount: number;
}) {
  if (completedCount + failedCount < totalCount) {
    return null;
  }

  if (failedCount === 0) {
    return "completed" as const;
  }

  if (completedCount === 0) {
    return "failed" as const;
  }

  return "partially_failed" as const;
}

function isTerminalRunStatus(status: Doc<"batchGenerationRuns">["status"]) {
  return status === "completed" || status === "failed" || status === "partially_failed";
}

function normalizeLevelsPerAxis(
  sharedAxes: readonly { key: string }[],
  levelsPerAxis: LevelsPerAxis,
): Record<string, GridLevelCount> {
  return Object.fromEntries(
    sharedAxes.map((axis) => [
      axis.key,
      typeof levelsPerAxis === "number"
        ? levelsPerAxis
        : (levelsPerAxis[axis.key] ?? 3),
    ]),
  ) as Record<string, GridLevelCount>;
}

function toAxisValuesArray(axisValues: Record<string, number>) {
  return Object.entries(axisValues).map(([key, value]) => ({
    key,
    value,
  }));
}

async function getConfigForOrg(
  ctx: MutationCtx | QueryCtx,
  configId: Id<"personaConfigs">,
  orgId: string,
) {
  const config = await ctx.db.get(configId);

  if (config === null || config.orgId !== orgId) {
    throw new ConvexError("Persona configuration not found.");
  }

  return config;
}

async function getSyntheticUserForOrg(
  ctx: MutationCtx | QueryCtx,
  syntheticUserId: Id<"syntheticUsers">,
  orgId: string,
) {
  const syntheticUser = await ctx.db.get(syntheticUserId);

  if (syntheticUser === null) {
    throw new ConvexError("Synthetic user not found.");
  }

  const config = await ctx.db.get(syntheticUser.configId);

  if (config === null || config.orgId !== orgId) {
    throw new ConvexError("Synthetic user not found.");
  }

  return {
    syntheticUser,
    config,
  };
}

async function findActiveBatchGenerationRun(
  ctx: MutationCtx | QueryCtx,
  configId: Id<"personaConfigs">,
) {
  const [pendingRun] = await ctx.db
    .query("batchGenerationRuns")
    .withIndex("by_configId_and_status", (q) =>
      q.eq("configId", configId).eq("status", "pending"),
    )
    .take(1);

  if (pendingRun !== undefined) {
    return pendingRun;
  }

  const [runningRun] = await ctx.db
    .query("batchGenerationRuns")
    .withIndex("by_configId_and_status", (q) =>
      q.eq("configId", configId).eq("status", "running"),
    )
    .take(1);

  return runningRun ?? null;
}

async function findCurrentOrLatestBatchGenerationRun(
  ctx: QueryCtx,
  configId: Id<"personaConfigs">,
) {
  const activeRun = await findActiveBatchGenerationRun(ctx, configId);

  if (activeRun !== null) {
    return activeRun;
  }

  const [latestRun] = await ctx.db
    .query("batchGenerationRuns")
    .withIndex("by_configId_and_startedAt", (q) => q.eq("configId", configId))
    .order("desc")
    .take(1);

  return latestRun ?? null;
}

function assertConfigIsDraft(config: Doc<"personaConfigs">) {
  if (config.status !== "draft") {
    throw new ConvexError(
      "Batch generation requires a draft persona configuration.",
    );
  }
}
