import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import {
  zCustomQuery,
  zid,
} from "convex-helpers/server/zod";
import { z } from "zod";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { ADMIN_ROLES, requireRole } from "./rbac";

const zQuery = zCustomQuery(query, NoOp);

export const AUDIT_EVENT_TYPES = [
  "study.launched",
  "study.cancelled",
  "report.published",
  "settings.updated",
  "credential.created",
  "credential.updated",
  "credential.deleted",
] as const;

export const METRIC_TYPES = [
  "wave.dispatched_runs",
  "run.completed",
  "study.completed",
] as const;

export const STANDARD_INFRA_ERROR_CODES = [
  "BROWSER_LEASE_TIMEOUT",
  "CONTEXT_CREATION_FAILED",
  "NAVIGATION_TIMEOUT",
  "CALLBACK_REJECTED",
  "R2_UPLOAD_FAILED",
  "WORKER_INTERNAL_ERROR",
] as const;

const auditEventTypeSchema = z.enum(AUDIT_EVENT_TYPES);
const metricTypeSchema = z.enum(METRIC_TYPES);
const standardInfraErrorCodeSchema = z.enum(STANDARD_INFRA_ERROR_CODES);

const boundedLimitSchema = z.number().int().positive().max(200);
const dashboardLimitSchema = z.number().int().positive().max(50);

const studyStatuses = [
  "draft",
  "persona_review",
  "ready",
  "queued",
  "running",
  "replaying",
  "analyzing",
  "completed",
  "failed",
  "cancelled",
] as const;

const terminalRunStatuses = [
  "success",
  "hard_fail",
  "soft_fail",
  "gave_up",
  "timeout",
  "blocked_by_guardrail",
  "infra_error",
  "cancelled",
] as const;

export const getAdminDiagnosticsOverview = zQuery({
  args: {
    recentMetricLimit: dashboardLimitSchema.optional(),
    recentStudyLimit: dashboardLimitSchema.optional(),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, ADMIN_ROLES);
    const recentMetricLimit = args.recentMetricLimit ?? 40;
    const recentStudyLimit = args.recentStudyLimit ?? 20;

    const [recentMetrics, recentStudies] = await Promise.all([
      ctx.db
        .query("metrics")
        .withIndex("by_orgId_and_recordedAt", (q) => q.eq("orgId", identity.tokenIdentifier))
        .order("desc")
        .take(recentMetricLimit),
      ctx.db
        .query("studies")
        .withIndex("by_orgId_and_updatedAt", (q) => q.eq("orgId", identity.tokenIdentifier))
        .order("desc")
        .take(recentStudyLimit),
    ]);

    const studyIds = [
      ...new Set([
        ...recentStudies.map((study) => study._id),
        ...recentMetrics.map((metric) => metric.studyId),
      ]),
    ];

    const loadedStudies = await Promise.all(studyIds.map((studyId) => ctx.db.get(studyId)));
    const studiesById = new Map(
      loadedStudies
        .filter(
          (study): study is Doc<"studies"> =>
            study !== null && study.orgId === identity.tokenIdentifier,
        )
        .map((study) => [study._id, study]),
    );

    const runEntries: Array<[Id<"studies">, Doc<"runs">[]]> = await Promise.all(
      recentStudies.map(async (study): Promise<[Id<"studies">, Doc<"runs">[]]> => {
        const runs = await ctx.db
          .query("runs")
          .withIndex("by_studyId", (q) => q.eq("studyId", study._id))
          .collect();

        return [study._id, runs];
      }),
    );
    const runsByStudyId = new Map(runEntries);

    const liveStudyCounts = studyStatuses.reduce<Record<(typeof studyStatuses)[number], number>>(
      (accumulator, status) => ({
        ...accumulator,
        [status]: recentStudies.filter((study) => study.status === status).length,
      }),
      {
        draft: 0,
        persona_review: 0,
        ready: 0,
        queued: 0,
        running: 0,
        replaying: 0,
        analyzing: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      },
    );

    const studyUsage = recentStudies.map((study) => {
      const runs = runsByStudyId.get(study._id) ?? [];
      const studyMetrics = recentMetrics.filter((metric) => metric.studyId === study._id);
      const infraRuns = runs.filter((run) => run.status === "infra_error");

      return {
        studyId: study._id,
        studyName: study.name,
        status: study.status,
        runBudget: study.runBudget ?? 64,
        updatedAt: study.updatedAt,
        browserSecondsUsed: runs.reduce(
          (total, run) => total + (run.durationSec ?? 0),
          0,
        ),
        tokenUsage: studyMetrics.reduce(
          (total, metric) => total + (isTokenMetric(metric) ? metric.value : 0),
          0,
        ),
        completedRunCount: runs.filter((run) => isTerminalRunStatus(run.status)).length,
        infraErrorCount: infraRuns.length,
        latestInfraErrorCode: infraRuns.find((run) => run.errorCode !== undefined)?.errorCode,
        lastMetricRecordedAt: studyMetrics[0]?.recordedAt ?? null,
      };
    });

    const infraErrorCounts = aggregateInfraErrorCounts(recentMetrics);

    return {
      generatedAt: Date.now(),
      liveStudyCounts: {
        ...liveStudyCounts,
        active:
          liveStudyCounts.queued +
          liveStudyCounts.running +
          liveStudyCounts.replaying +
          liveStudyCounts.analyzing,
      },
      historicalMetrics: {
        dispatchedRuns: sumMetricValues(recentMetrics, "wave.dispatched_runs"),
        completedRuns: sumMetricValues(recentMetrics, "run.completed"),
        completedStudies: sumMetricValues(recentMetrics, "study.completed"),
        totalTokenUsage: studyUsage.reduce((total, study) => total + study.tokenUsage, 0),
        totalBrowserSeconds: studyUsage.reduce(
          (total, study) => total + study.browserSecondsUsed,
          0,
        ),
        recentInfraErrors: infraErrorCounts.reduce((total, item) => total + item.count, 0),
        lastMetricRecordedAt: recentMetrics[0]?.recordedAt ?? null,
      },
      infraErrorCodes: infraErrorCounts,
      recentMetrics: recentMetrics.map((metric) => ({
        studyId: metric.studyId,
        studyName: studiesById.get(metric.studyId)?.name ?? "Study unavailable",
        metricType: metric.metricType,
        value: metric.value,
        unit: metric.unit,
        ...(metric.status !== undefined ? { status: metric.status } : {}),
        ...(metric.errorCode !== undefined ? { errorCode: metric.errorCode } : {}),
        recordedAt: metric.recordedAt,
      })),
      studyUsage,
    };
  },
});

export const listAuditEvents = zQuery({
  args: {
    actorId: z.string().trim().min(1).optional(),
    studyId: zid("studies").optional(),
    eventType: auditEventTypeSchema.optional(),
    startAt: z.number().optional(),
    endAt: z.number().optional(),
    limit: boundedLimitSchema.optional(),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, ADMIN_ROLES);
    const limit = args.limit ?? 100;
    const rows = await loadAuditEventsForOrg(ctx, identity.tokenIdentifier, {
      actorId: args.actorId,
      studyId: args.studyId,
      eventType: args.eventType,
      startAt: args.startAt,
      endAt: args.endAt,
      limit,
    });

    return rows.filter((row) => {
      if (args.startAt !== undefined && row.createdAt < args.startAt) {
        return false;
      }

      if (args.endAt !== undefined && row.createdAt > args.endAt) {
        return false;
      }

      if (args.actorId !== undefined && row.actorId !== args.actorId) {
        return false;
      }

      if (args.studyId !== undefined && row.studyId !== args.studyId) {
        return false;
      }

      if (args.eventType !== undefined && row.eventType !== args.eventType) {
        return false;
      }

      return true;
    });
  },
});

export const listMetrics = zQuery({
  args: {
    studyId: zid("studies").optional(),
    metricType: metricTypeSchema.optional(),
    startAt: z.number().optional(),
    endAt: z.number().optional(),
    limit: boundedLimitSchema.optional(),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, ADMIN_ROLES);
    const limit = args.limit ?? 100;
    const rows = await loadMetricsForOrg(ctx, identity.tokenIdentifier, {
      studyId: args.studyId,
      metricType: args.metricType,
      startAt: args.startAt,
      endAt: args.endAt,
      limit,
    });

    return rows.filter((row) => {
      if (args.startAt !== undefined && row.recordedAt < args.startAt) {
        return false;
      }

      if (args.endAt !== undefined && row.recordedAt > args.endAt) {
        return false;
      }

      if (args.studyId !== undefined && row.studyId !== args.studyId) {
        return false;
      }

      if (args.metricType !== undefined && row.metricType !== args.metricType) {
        return false;
      }

      return true;
    });
  },
});

export async function recordAuditEvent(
  ctx: MutationCtx,
  args: {
    actorId: string;
    eventType: AuditEventType;
    orgId?: string;
    studyId?: Id<"studies">;
    resourceType?: string;
    resourceId?: string;
    reason?: string;
    createdAt?: number;
  },
) {
  const orgId =
    args.orgId ?? (args.studyId !== undefined ? (await getStudyById(ctx, args.studyId)).orgId : null);

  if (orgId === null) {
    throw new ConvexError("Observability events require an org or study context.");
  }

  return await ctx.db.insert("auditEvents", {
    orgId,
    actorId: args.actorId,
    eventType: args.eventType,
    ...(args.studyId !== undefined ? { studyId: args.studyId } : {}),
    ...(args.resourceType !== undefined ? { resourceType: args.resourceType } : {}),
    ...(args.resourceId !== undefined ? { resourceId: args.resourceId } : {}),
    ...(args.reason !== undefined ? { reason: args.reason } : {}),
    createdAt: args.createdAt ?? Date.now(),
  });
}

export async function recordMetric(
  ctx: MutationCtx,
  args: {
    studyId: Id<"studies">;
    metricType: MetricType;
    value: number;
    unit: string;
    runId?: Id<"runs">;
    status?: string;
    errorCode?: string;
    recordedAt?: number;
  },
) {
  const study = await getStudyById(ctx, args.studyId);

  return await ctx.db.insert("metrics", {
    orgId: study.orgId,
    studyId: args.studyId,
    ...(args.runId !== undefined ? { runId: args.runId } : {}),
    metricType: args.metricType,
    value: args.value,
    unit: args.unit,
    ...(args.status !== undefined ? { status: args.status } : {}),
    ...(args.errorCode !== undefined ? { errorCode: args.errorCode } : {}),
    recordedAt: args.recordedAt ?? Date.now(),
  });
}

export function normalizeInfraErrorCode(
  errorCode: string | undefined,
  errorMessage?: string,
): StandardInfraErrorCode | undefined {
  if (errorCode === undefined) {
    return undefined;
  }

  const alreadyStandard = standardInfraErrorCodeSchema.safeParse(errorCode);
  if (alreadyStandard.success) {
    return alreadyStandard.data;
  }

  switch (errorCode) {
    case "LEASE_UNAVAILABLE":
      return "BROWSER_LEASE_TIMEOUT";
    case "RUN_DISPATCH_FAILED":
      return "CONTEXT_CREATION_FAILED";
    case "HEARTBEAT_STALE":
      return "CALLBACK_REJECTED";
    case "BROWSER_ERROR":
      return normalizeBrowserErrorMessage(errorMessage);
    default:
      return "WORKER_INTERNAL_ERROR";
  }
}

async function loadAuditEventsForOrg(
  ctx: QueryCtx,
  orgId: string,
  args: {
    actorId?: string;
    studyId?: Id<"studies">;
    eventType?: AuditEventType;
    startAt?: number;
    endAt?: number;
    limit: number;
  },
) {
  if (args.studyId !== undefined) {
    return await ctx.db
      .query("auditEvents")
      .withIndex("by_orgId_and_studyId_and_createdAt", (q) => {
        const afterStudy = q.eq("orgId", orgId).eq("studyId", args.studyId!);
        return constrainLowerBound(afterStudy, "createdAt", args.startAt);
      })
      .order("desc")
      .take(args.limit);
  }

  if (args.actorId !== undefined) {
    return await ctx.db
      .query("auditEvents")
      .withIndex("by_orgId_and_actorId_and_createdAt", (q) => {
        const afterActor = q.eq("orgId", orgId).eq("actorId", args.actorId!);
        return constrainLowerBound(afterActor, "createdAt", args.startAt);
      })
      .order("desc")
      .take(args.limit);
  }

  if (args.eventType !== undefined) {
    return await ctx.db
      .query("auditEvents")
      .withIndex("by_orgId_and_eventType_and_createdAt", (q) => {
        const afterEventType = q.eq("orgId", orgId).eq("eventType", args.eventType!);
        return constrainLowerBound(afterEventType, "createdAt", args.startAt);
      })
      .order("desc")
      .take(args.limit);
  }

  return await ctx.db
    .query("auditEvents")
    .withIndex("by_orgId_and_createdAt", (q) =>
      constrainLowerBound(q.eq("orgId", orgId), "createdAt", args.startAt),
    )
    .order("desc")
    .take(args.limit);
}

async function loadMetricsForOrg(
  ctx: QueryCtx,
  orgId: string,
  args: {
    studyId?: Id<"studies">;
    metricType?: MetricType;
    startAt?: number;
    endAt?: number;
    limit: number;
  },
) {
  if (args.studyId !== undefined) {
    return await ctx.db
      .query("metrics")
      .withIndex("by_studyId_and_recordedAt", (q) =>
        constrainLowerBound(q.eq("studyId", args.studyId!), "recordedAt", args.startAt),
      )
      .order("desc")
      .take(args.limit);
  }

  if (args.metricType !== undefined) {
    return await ctx.db
      .query("metrics")
      .withIndex("by_orgId_and_metricType_and_recordedAt", (q) => {
        const afterMetricType = q.eq("orgId", orgId).eq("metricType", args.metricType!);
        return constrainLowerBound(afterMetricType, "recordedAt", args.startAt);
      })
      .order("desc")
      .take(args.limit);
  }

  return await ctx.db
    .query("metrics")
    .withIndex("by_orgId_and_recordedAt", (q) =>
      constrainLowerBound(q.eq("orgId", orgId), "recordedAt", args.startAt),
    )
    .order("desc")
    .take(args.limit);
}

function constrainLowerBound<TQuery>(query: TQuery, field: string, lowerBound?: number) {
  if (lowerBound === undefined) {
    return query;
  }

  return (query as QueryWithBounds).gte(field, lowerBound) as TQuery;
}

function normalizeBrowserErrorMessage(errorMessage?: string): StandardInfraErrorCode {
  const normalizedMessage = errorMessage?.toLowerCase() ?? "";

  if (normalizedMessage.includes("navigation") && normalizedMessage.includes("timeout")) {
    return "NAVIGATION_TIMEOUT";
  }

  if (normalizedMessage.includes("context")) {
    return "CONTEXT_CREATION_FAILED";
  }

  if (normalizedMessage.includes("r2") || normalizedMessage.includes("artifact")) {
    return "R2_UPLOAD_FAILED";
  }

  return "WORKER_INTERNAL_ERROR";
}

function aggregateInfraErrorCounts(
  metrics: Array<Doc<"metrics">>,
) {
  const counts = new Map<string, number>();

  for (const metric of metrics) {
    if (metric.errorCode === undefined) {
      continue;
    }

    counts.set(metric.errorCode, (counts.get(metric.errorCode) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([code, count]) => ({ code, count }))
    .sort((left, right) => right.count - left.count || left.code.localeCompare(right.code));
}

function isTerminalRunStatus(status: string): status is (typeof terminalRunStatuses)[number] {
  return terminalRunStatuses.includes(status as (typeof terminalRunStatuses)[number]);
}

function isTokenMetric(metric: Pick<Doc<"metrics">, "metricType" | "unit">) {
  const metricType = metric.metricType.toLowerCase();
  const unit = metric.unit.toLowerCase();

  return unit === "token" || unit === "tokens" || metricType.includes("token");
}

function sumMetricValues(metrics: Array<Doc<"metrics">>, metricType: MetricType | string) {
  return metrics.reduce(
    (total, metric) => total + (metric.metricType === metricType ? metric.value : 0),
    0,
  );
}

async function getStudyById(ctx: QueryCtx | MutationCtx, studyId: Id<"studies">) {
  const study = await ctx.db.get(studyId);

  if (study === null) {
    throw new ConvexError("Study not found.");
  }

  return study;
}

type AuditEventType = z.infer<typeof auditEventTypeSchema>;
type MetricType = z.infer<typeof metricTypeSchema>;
type StandardInfraErrorCode = z.infer<typeof standardInfraErrorCodeSchema>;

type QueryWithBounds = {
  gte(field: string, value: number): QueryWithBounds;
};
