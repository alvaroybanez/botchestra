import { ConvexError } from "convex/values";
import { z } from "zod";

import type { Doc, Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { resolveArtifactUrlsForStudy } from "./artifactResolver";
import { decodeRunSummaryKey } from "./analysis/runSummaries";
import { zid, zQuery } from "./zodHelpers";

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

export const getReport = zQuery({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args) => {
    await getStudyForOrg(ctx, args.studyId);
    return await findStudyReportByStudyId(ctx, args.studyId);
  },
});

export const listFindings = zQuery({
  args: {
    studyId: zid("studies"),
    severity: severitySchema.optional(),
    protoPersonaId: zid("protoPersonas").optional(),
    axisRange: axisRangeFilterSchema.optional(),
    outcome: runStatusSchema.optional(),
    urlPrefix: requiredString("URL prefix").optional(),
  },
  handler: async (ctx, args) => {
    await getStudyForOrg(ctx, args.studyId);
    const report = await findStudyReportByStudyId(ctx, args.studyId);

    if (report === null) {
      return [];
    }

    const orderedClusters = await listIssueClustersByIds(ctx, report.issueClusterIds);
    const findingViews = await buildFindingViews(ctx, orderedClusters);

    return findingViews.filter((finding) => matchesFilters(finding, args));
  },
});

export const getIssueCluster = zQuery({
  args: {
    issueId: zid("issueClusters"),
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

export const resolveArtifactUrls = zQuery({
  args: {
    studyId: zid("studies"),
    keys: z.array(requiredString("Artifact key")),
  },
  handler: async (ctx, args) => {
    await getStudyForOrg(ctx, args.studyId);

    return await resolveArtifactUrlsForStudy(ctx, {
      studyId: args.studyId,
      keys: args.keys,
    });
  },
});

async function buildFindingViews(
  ctx: QueryCtx,
  issueClusters: readonly Doc<"issueClusters">[],
) {
  const representativeRunsById = await getRepresentativeRunsById(ctx, issueClusters);
  const protoPersonasById = await getProtoPersonasById(ctx, issueClusters, representativeRunsById);
  const notesByIssueClusterId = await getNotesByIssueClusterId(ctx, issueClusters);

  return issueClusters.map((issueCluster) => {
    const representativeRuns = issueCluster.representativeRunIds.map((runId) => {
      const run = representativeRunsById.get(runId);

      if (run === undefined) {
        throw new ConvexError(`Representative run ${runId} not found.`);
      }

      const decodedSummary = decodeRunSummaryKey(run.summaryKey);
      const protoPersona = protoPersonasById.get(run.protoPersonaId);

      return {
        _id: run._id,
        protoPersonaId: run.protoPersonaId,
        protoPersonaName: protoPersona?.name ?? null,
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
      affectedProtoPersonas: issueCluster.affectedProtoPersonaIds
        .map((protoPersonaId) => {
          const protoPersona = protoPersonasById.get(protoPersonaId);

          if (protoPersona === undefined) {
            return null;
          }

          return {
            _id: protoPersona._id,
            name: protoPersona.name,
          };
        })
        .filter((protoPersona): protoPersona is { _id: Id<"protoPersonas">; name: string } =>
          protoPersona !== null,
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

async function getProtoPersonasById(
  ctx: QueryCtx,
  issueClusters: readonly Doc<"issueClusters">[],
  representativeRunsById: Map<Id<"runs">, Doc<"runs">>,
) {
  const protoPersonaIds = uniqueIds([
    ...issueClusters.flatMap((issueCluster) => issueCluster.affectedProtoPersonaIds),
    ...[...representativeRunsById.values()].map((run) => run.protoPersonaId),
  ]);

  const protoPersonas = await Promise.all(
    protoPersonaIds.map(async (protoPersonaId) => {
      const protoPersona = await ctx.db.get(protoPersonaId);

      if (protoPersona === null) {
        throw new ConvexError(`Proto-persona ${protoPersonaId} not found.`);
      }

      return protoPersona;
    }),
  );

  return new Map(protoPersonas.map((protoPersona) => [protoPersona._id, protoPersona]));
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
    protoPersonaId?: Id<"protoPersonas">;
    axisRange?: z.infer<typeof axisRangeFilterSchema>;
    outcome?: z.infer<typeof runStatusSchema>;
    urlPrefix?: string;
  },
) {
  if (filters.severity !== undefined && finding.severity !== filters.severity) {
    return false;
  }

  if (
    filters.protoPersonaId !== undefined &&
    !finding.affectedProtoPersonaIds.includes(filters.protoPersonaId)
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

  if (study === null || study.orgId !== identity.tokenIdentifier) {
    throw new ConvexError("Study not found.");
  }

  return study;
}

async function requireIdentity(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (identity === null) {
    throw new ConvexError("Not authenticated.");
  }

  return identity;
}

function uniqueIds<TableName extends "issueClusters" | "protoPersonas" | "runs">(
  values: readonly Id<TableName>[],
) {
  return values.reduce<Id<TableName>[]>((accumulator, value) => {
    if (accumulator.includes(value)) {
      return accumulator;
    }

    return [...accumulator, value];
  }, []);
}
