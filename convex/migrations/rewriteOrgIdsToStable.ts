import { v } from "convex/values";

import { internal } from "../_generated/api";
import type { FunctionReference } from "convex/server";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { resolveOrgId } from "../rbac";

// Migrates all tokenIdentifier-format fields from the 3-part
// "<issuer>|<userId>|<sessionId>" form to the 2-part stable
// "<issuer>|<userId>" form. Idempotent — safe to re-run.
//
// Run via:
//   bunx convex run migrations/rewriteOrgIdsToStable:runAll '{"dryRun":true}'
//   bunx convex run migrations/rewriteOrgIdsToStable:runAll '{"dryRun":false}'
//   bunx convex run migrations/rewriteOrgIdsToStable:verify

const DEFAULT_PAGE_SIZE = 500;

const paginationArgs = {
  cursor: v.union(v.string(), v.null()),
  pageSize: v.optional(v.number()),
  dryRun: v.optional(v.boolean()),
};

function computePatch(
  row: Record<string, unknown>,
  fields: readonly string[],
): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const field of fields) {
    const value = row[field];
    if (typeof value !== "string") continue;
    const next = resolveOrgId({ tokenIdentifier: value });
    if (next !== value) patch[field] = next;
  }
  return patch;
}

async function rewritePage(
  ctx: { db: any },
  tableName: string,
  fields: readonly string[],
  args: { cursor: string | null; pageSize?: number; dryRun?: boolean },
) {
  const page = await ctx.db.query(tableName).paginate({
    cursor: args.cursor,
    numItems: args.pageSize ?? DEFAULT_PAGE_SIZE,
  });

  let updated = 0;
  for (const row of page.page) {
    const patch = computePatch(row, fields);
    if (Object.keys(patch).length === 0) continue;
    updated += 1;
    if (!args.dryRun) {
      await ctx.db.patch(row._id, patch);
    }
  }

  return {
    isDone: page.isDone,
    continueCursor: page.continueCursor,
    scanned: page.page.length,
    updated,
  };
}

export const rewritePersonaConfigs = internalMutation({
  args: paginationArgs,
  handler: async (ctx, args) =>
    rewritePage(ctx, "personaConfigs", ["orgId", "createdBy", "updatedBy"], args),
});

export const rewriteAxisDefinitions = internalMutation({
  args: paginationArgs,
  handler: async (ctx, args) =>
    rewritePage(ctx, "axisDefinitions", ["orgId", "createdBy", "updatedBy"], args),
});

export const rewriteTranscripts = internalMutation({
  args: paginationArgs,
  handler: async (ctx, args) =>
    rewritePage(ctx, "transcripts", ["orgId", "createdBy"], args),
});

export const rewriteTranscriptSignals = internalMutation({
  args: paginationArgs,
  handler: async (ctx, args) =>
    rewritePage(ctx, "transcriptSignals", ["orgId"], args),
});

export const rewriteTranscriptExtractionRuns = internalMutation({
  args: paginationArgs,
  handler: async (ctx, args) =>
    rewritePage(ctx, "transcriptExtractionRuns", ["orgId", "startedBy"], args),
});

export const rewriteBatchGenerationRuns = internalMutation({
  args: paginationArgs,
  handler: async (ctx, args) =>
    rewritePage(ctx, "batchGenerationRuns", ["orgId"], args),
});

export const rewriteStudies = internalMutation({
  args: paginationArgs,
  handler: async (ctx, args) =>
    rewritePage(ctx, "studies", ["orgId", "createdBy", "launchRequestedBy"], args),
});

export const rewriteAuditEvents = internalMutation({
  args: paginationArgs,
  handler: async (ctx, args) =>
    rewritePage(ctx, "auditEvents", ["orgId", "actorId"], args),
});

export const rewriteGuardrailEvents = internalMutation({
  args: paginationArgs,
  handler: async (ctx, args) =>
    rewritePage(ctx, "guardrailEvents", ["orgId", "actorId"], args),
});

export const rewriteCredentials = internalMutation({
  args: paginationArgs,
  handler: async (ctx, args) =>
    rewritePage(ctx, "credentials", ["orgId", "createdBy"], args),
});

export const rewriteSettings = internalMutation({
  args: paginationArgs,
  handler: async (ctx, args) =>
    rewritePage(ctx, "settings", ["orgId", "updatedBy"], args),
});

export const rewriteMetrics = internalMutation({
  args: paginationArgs,
  handler: async (ctx, args) =>
    rewritePage(ctx, "metrics", ["orgId"], args),
});

type PageResult = {
  isDone: boolean;
  continueCursor: string;
  scanned: number;
  updated: number;
};

type MutationArgs = {
  cursor: string | null;
  pageSize?: number;
  dryRun?: boolean;
};

type RewriteMutationRef = FunctionReference<
  "mutation",
  "internal",
  MutationArgs,
  PageResult
>;

const TABLE_MUTATIONS: ReadonlyArray<readonly [string, RewriteMutationRef]> = [
  ["personaConfigs", internal.migrations.rewriteOrgIdsToStable.rewritePersonaConfigs],
  ["axisDefinitions", internal.migrations.rewriteOrgIdsToStable.rewriteAxisDefinitions],
  ["transcripts", internal.migrations.rewriteOrgIdsToStable.rewriteTranscripts],
  [
    "transcriptSignals",
    internal.migrations.rewriteOrgIdsToStable.rewriteTranscriptSignals,
  ],
  [
    "transcriptExtractionRuns",
    internal.migrations.rewriteOrgIdsToStable.rewriteTranscriptExtractionRuns,
  ],
  [
    "batchGenerationRuns",
    internal.migrations.rewriteOrgIdsToStable.rewriteBatchGenerationRuns,
  ],
  ["studies", internal.migrations.rewriteOrgIdsToStable.rewriteStudies],
  ["auditEvents", internal.migrations.rewriteOrgIdsToStable.rewriteAuditEvents],
  ["guardrailEvents", internal.migrations.rewriteOrgIdsToStable.rewriteGuardrailEvents],
  ["credentials", internal.migrations.rewriteOrgIdsToStable.rewriteCredentials],
  ["settings", internal.migrations.rewriteOrgIdsToStable.rewriteSettings],
  ["metrics", internal.migrations.rewriteOrgIdsToStable.rewriteMetrics],
];

export const runAll = internalAction({
  args: { dryRun: v.optional(v.boolean()), pageSize: v.optional(v.number()) },
  handler: async (ctx, { dryRun, pageSize }) => {
    const perTable: Record<string, { scanned: number; updated: number }> = {};
    for (const [name, ref] of TABLE_MUTATIONS) {
      let cursor: string | null = null;
      let scanned = 0;
      let updated = 0;
      while (true) {
        const result: PageResult = await ctx.runMutation(ref, {
          cursor,
          dryRun,
          pageSize,
        });
        scanned += result.scanned;
        updated += result.updated;
        if (result.isDone) break;
        cursor = result.continueCursor;
      }
      perTable[name] = { scanned, updated };
    }
    return { dryRun: dryRun ?? false, perTable };
  },
});

const VERIFY_TABLES = [
  "personaConfigs",
  "axisDefinitions",
  "transcripts",
  "transcriptSignals",
  "transcriptExtractionRuns",
  "batchGenerationRuns",
  "studies",
  "auditEvents",
  "guardrailEvents",
  "credentials",
  "settings",
  "metrics",
] as const;

export const verify = internalQuery({
  args: {},
  handler: async (ctx) => {
    const db = ctx.db as any;
    const perTable: Record<string, number> = {};
    let total = 0;
    for (const table of VERIFY_TABLES) {
      const rows = (await db.query(table).collect()) as Array<
        Record<string, unknown>
      >;
      const threePart = rows.filter((row) => {
        const orgId = row.orgId;
        return typeof orgId === "string" && orgId.split("|").length >= 3;
      }).length;
      perTable[table] = threePart;
      total += threePart;
    }
    return { total3PartRowsRemaining: total, perTable };
  },
});
