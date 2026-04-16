import { ConvexError, v } from "convex/values";
import { z } from "zod";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { resolveArtifactUrlsForStudy } from "./artifactResolver";
import { decodeRunSummaryKey } from "./analysis/runSummaries";
import { requireIdentity, resolveOrgId } from "./rbac";

const severitySchema = z.enum(["blocker", "major", "minor", "cosmetic"]);
const runStatusSchema = z.enum([
  "queued",
  "dispatching",
  "running",
  "success",
  "hard_fail",
  "soft_fail",
  "gave_up",
  "timeout",
  "blocked_by_guardrail",
  "infra_error",
  "cancelled",
]);

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

const axisRangeFilterSchema = z
  .object({
    key: requiredString("Axis key"),
    min: z.number().min(-1).max(1).optional(),
    max: z.number().min(-1).max(1).optional(),
  })
  .refine(
    (value) => value.min !== undefined || value.max !== undefined,
    "Axis range filter must include min, max, or both.",
  )
  .refine(
    (value) =>
      value.min === undefined ||
      value.max === undefined ||
      value.min <= value.max,
    "Axis range filter min cannot exceed max.",
  );

const severityValidator = v.union(
  v.literal("blocker"),
  v.literal("major"),
  v.literal("minor"),
  v.literal("cosmetic"),
);

const runStatusValidator = v.union(
  v.literal("queued"),
  v.literal("dispatching"),
  v.literal("running"),
  v.literal("success"),
  v.literal("hard_fail"),
  v.literal("soft_fail"),
  v.literal("gave_up"),
  v.literal("timeout"),
  v.literal("blocked_by_guardrail"),
  v.literal("infra_error"),
  v.literal("cancelled"),
);

const axisRangeFilterValidator = v.object({
  key: v.string(),
  min: v.optional(v.number()),
  max: v.optional(v.number()),
});

export const getReport = query({
  args: {
    studyId: v.id("studies"),
  },
  handler: async (ctx, args) => {
    await getStudyForOrg(ctx, args.studyId);
    return await findStudyReportByStudyId(ctx, args.studyId);
  },
});

export const listFindings = query({
  args: {
    studyId: v.id("studies"),
    severity: v.optional(severityValidator),
    syntheticUserId: v.optional(v.id("syntheticUsers")),
    axisRange: v.optional(axisRangeFilterValidator),
    outcome: v.optional(runStatusValidator),
    urlPrefix: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        studyId: z.string(),
        severity: severitySchema.optional(),
        syntheticUserId: z.string().optional(),
        axisRange: axisRangeFilterSchema.optional(),
        outcome: runStatusSchema.optional(),
        urlPrefix: requiredString("URL prefix").optional(),
      })
      .parse(args);
    const studyId = parsedArgs.studyId as Id<"studies">;
    await getStudyForOrg(ctx, args.studyId);
    const report = await findStudyReportByStudyId(ctx, studyId);

    if (report === null) {
      return [];
    }

    const orderedClusters = await listIssueClustersByIds(ctx, report.issueClusterIds);
    const findingViews = await buildFindingViews(ctx, orderedClusters);

    return findingViews.filter((finding) =>
      matchesFilters(finding, {
        severity: parsedArgs.severity,
        axisRange: parsedArgs.axisRange,
        outcome: parsedArgs.outcome,
        urlPrefix: parsedArgs.urlPrefix,
        ...(parsedArgs.syntheticUserId !== undefined
          ? { syntheticUserId: parsedArgs.syntheticUserId as Id<"syntheticUsers"> }
          : {}),
      }),
    );
  },
});

export const getIssueCluster = query({
  args: {
    issueId: v.id("issueClusters"),
  },
  handler: async (ctx, args) => {
    const issueCluster = await ctx.db.get(args.issueId);

    if (issueCluster === null) {
      return null;
    }

    await getStudyForOrg(ctx, issueCluster.studyId);
    const findings = await buildFindingViews(ctx, [issueCluster]);
    return findings[0] ?? null;
  },
});

export const resolveArtifactUrls = query({
  args: {
    studyId: v.id("studies"),
    keys: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        studyId: z.string(),
        keys: z.array(requiredString("Artifact key")),
      })
      .parse(args);
    await getStudyForOrg(ctx, args.studyId);

    return await resolveArtifactUrlsForStudy(ctx, {
      studyId: args.studyId,
      keys: parsedArgs.keys,
    });
  },
});

async function buildFindingViews(
  ctx: QueryCtx,
  issueClusters: readonly Doc<"issueClusters">[],
) {
  const representativeRunsById = await getRepresentativeRunsById(ctx, issueClusters);
  const syntheticUsersById = await getSyntheticUsersById(ctx, issueClusters, representativeRunsById);
  const notesByIssueClusterId = await getNotesByIssueClusterId(ctx, issueClusters);

  return issueClusters.map((issueCluster) => {
    const representativeRuns = issueCluster.representativeRunIds.map((runId) => {
      const run = representativeRunsById.get(runId);

      if (run === undefined) {
        throw new ConvexError(`Representative run ${runId} not found.`);
      }

      const decodedSummary = decodeRunSummaryKey(run.summaryKey);
      const syntheticUser = syntheticUsersById.get(run.syntheticUserId);

      return {
        _id: run._id,
        syntheticUserId: run.syntheticUserId,
        syntheticUserName: syntheticUser?.name ?? null,
        status: run.status,
        finalUrl: run.finalUrl ?? null,
        finalOutcome: run.finalOutcome ?? null,
        milestoneKeys: run.milestoneKeys,
        evidence: run.milestoneKeys.map(toEvidenceRef),
        representativeQuote:
          decodedSummary?.representativeQuote ??
          run.selfReport?.hardestPart ??
          run.selfReport?.confusion ??
          run.selfReport?.suggestedChange ??
          null,
      };
    });

    return {
      ...issueCluster,
      affectedSyntheticUsers: issueCluster.affectedSyntheticUserIds
        .map((syntheticUserId) => {
          const syntheticUser = syntheticUsersById.get(syntheticUserId);

          if (syntheticUser === undefined) {
            return null;
          }

          return {
            _id: syntheticUser._id,
            name: syntheticUser.name,
          };
        })
        .filter((syntheticUser): syntheticUser is { _id: Id<"syntheticUsers">; name: string } =>
          syntheticUser !== null,
        ),
      evidence: issueCluster.evidenceKeys.map(toEvidenceRef),
      notes: notesByIssueClusterId.get(issueCluster._id) ?? [],
      representativeRuns,
    };
  });
}

async function getRepresentativeRunsById(
  ctx: QueryCtx,
  issueClusters: readonly Doc<"issueClusters">[],
) {
  const representativeRunIds = uniqueIds(
    issueClusters.flatMap((issueCluster) => issueCluster.representativeRunIds),
  );

  const representativeRuns = await Promise.all(
    representativeRunIds.map(async (runId) => {
      const run = await ctx.db.get(runId);

      if (run === null) {
        throw new ConvexError(`Representative run ${runId} not found.`);
      }

      return run;
    }),
  );

  return new Map(representativeRuns.map((run) => [run._id, run]));
}

async function getSyntheticUsersById(
  ctx: QueryCtx,
  issueClusters: readonly Doc<"issueClusters">[],
  representativeRunsById: Map<Id<"runs">, Doc<"runs">>,
) {
  const syntheticUserIds = uniqueIds([
    ...issueClusters.flatMap((issueCluster) => issueCluster.affectedSyntheticUserIds),
    ...[...representativeRunsById.values()].map((run) => run.syntheticUserId),
  ]);

  const syntheticUsers = await Promise.all(
    syntheticUserIds.map(async (syntheticUserId) => {
      const syntheticUser = await ctx.db.get(syntheticUserId);

      if (syntheticUser === null) {
        throw new ConvexError(`Synthetic user ${syntheticUserId} not found.`);
      }

      return syntheticUser;
    }),
  );

  return new Map(syntheticUsers.map((syntheticUser) => [syntheticUser._id, syntheticUser]));
}

async function getNotesByIssueClusterId(
  ctx: QueryCtx,
  issueClusters: readonly Doc<"issueClusters">[],
) {
  const entries = await Promise.all(
    issueClusters.map(async (issueCluster) => {
      const notes = await ctx.db
        .query("issueClusterNotes")
        .withIndex("by_issueClusterId", (query) =>
          query.eq("issueClusterId", issueCluster._id),
        )
        .take(100);

      return [issueCluster._id, notes.sort((left, right) => left.createdAt - right.createdAt)] as const;
    }),
  );

  return new Map(entries);
}

function matchesFilters(
  finding: Awaited<ReturnType<typeof buildFindingViews>>[number],
  filters: {
    severity?: z.infer<typeof severitySchema>;
    syntheticUserId?: Id<"syntheticUsers">;
    axisRange?: z.infer<typeof axisRangeFilterSchema>;
    outcome?: z.infer<typeof runStatusSchema>;
    urlPrefix?: string;
  },
) {
  if (filters.severity !== undefined && finding.severity !== filters.severity) {
    return false;
  }

  if (
    filters.syntheticUserId !== undefined &&
    !finding.affectedSyntheticUserIds.includes(filters.syntheticUserId)
  ) {
    return false;
  }

  if (
    filters.axisRange !== undefined &&
    !finding.affectedAxisRanges.some((axisRange) =>
      axisRange.key === filters.axisRange?.key &&
      overlapsAxisRange(axisRange, filters.axisRange),
    )
  ) {
    return false;
  }

  if (
    filters.outcome !== undefined &&
    !finding.representativeRuns.some((run) => run.status === filters.outcome)
  ) {
    return false;
  }

  if (
    filters.urlPrefix !== undefined &&
    !finding.representativeRuns.some(
      (run) =>
        run.finalUrl !== null && run.finalUrl.startsWith(filters.urlPrefix!),
    )
  ) {
    return false;
  }

  return true;
}

function overlapsAxisRange(
  left: Doc<"issueClusters">["affectedAxisRanges"][number],
  right: z.infer<typeof axisRangeFilterSchema>,
) {
  const rightMin = right.min ?? -1;
  const rightMax = right.max ?? 1;

  return left.max >= rightMin && left.min <= rightMax;
}

function toEvidenceRef(key: string) {
  return {
    key,
    thumbnailKey: key,
    fullResolutionKey: key,
  };
}

async function findStudyReportByStudyId(
  ctx: QueryCtx,
  studyId: Id<"studies">,
) {
  return await ctx.db
    .query("studyReports")
    .withIndex("by_studyId", (query) => query.eq("studyId", studyId))
    .unique();
}

async function listIssueClustersByIds(
  ctx: QueryCtx,
  issueClusterIds: readonly Id<"issueClusters">[],
) {
  return await Promise.all(
    issueClusterIds.map(async (issueClusterId) => {
      const issueCluster = await ctx.db.get(issueClusterId);

      if (issueCluster === null) {
        throw new ConvexError(`Issue cluster ${issueClusterId} not found.`);
      }

      return issueCluster;
    }),
  );
}

async function getStudyForOrg(ctx: QueryCtx, studyId: Id<"studies">) {
  const identity = await requireIdentity(ctx);
  const study = await ctx.db.get(studyId);

  if (study === null || study.orgId !== resolveOrgId(identity)) {
    throw new ConvexError("Study not found.");
  }

  return study;
}

function uniqueIds<TableName extends "issueClusters" | "syntheticUsers" | "runs">(
  values: readonly Id<TableName>[],
) {
  return values.reduce<Id<TableName>[]>((accumulator, value) => {
    if (accumulator.includes(value)) {
      return accumulator;
    }

    return [...accumulator, value];
  }, []);
}
