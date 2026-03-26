import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import {
  zCustomAction,
  zCustomQuery,
  zid,
} from "convex-helpers/server/zod";
import { z } from "zod";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx, QueryCtx } from "./_generated/server";
import {
  action,
  internalQuery,
} from "./_generated/server";
import {
  buildStudyReportArtifacts,
  type StudyReportExportCluster,
} from "./analysis/reportArtifacts";
import { collectIssueClusterArtifactKeys, resolveArtifactUrlsForStudy } from "./artifactResolver";

const zAction = zCustomAction(action, NoOp);
const zInternalQuery = zCustomQuery(internalQuery, NoOp);

type ReportArtifactsPayload = ReturnType<typeof buildStudyReportArtifacts>;
type ExportedReportArtifact = {
  studyId: Id<"studies">;
  artifactKey: string;
  contentType: string;
  fileName: string;
  content: string;
};

export const exportJson = zAction({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args): Promise<ExportedReportArtifact> => {
    const identity = await requireIdentity(ctx);
    const artifacts: ReportArtifactsPayload = await ctx.runQuery(
      internal.reportExports.getArtifactsForOrg,
      {
      studyId: args.studyId,
      orgId: identity.tokenIdentifier,
      },
    );

    return {
      studyId: args.studyId,
      artifactKey: artifacts.jsonReportKey,
      contentType: "application/json",
      fileName: buildExportFileName(args.studyId, "json"),
      content: artifacts.json,
    };
  },
});

export const exportHtml = zAction({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args): Promise<ExportedReportArtifact> => {
    const identity = await requireIdentity(ctx);
    const artifacts: ReportArtifactsPayload = await ctx.runQuery(
      internal.reportExports.getArtifactsForOrg,
      {
      studyId: args.studyId,
      orgId: identity.tokenIdentifier,
      },
    );

    return {
      studyId: args.studyId,
      artifactKey: artifacts.htmlReportKey,
      contentType: "text/html; charset=utf-8",
      fileName: buildExportFileName(args.studyId, "html"),
      content: artifacts.html,
    };
  },
});

export const getArtifactsForOrg = zInternalQuery({
  args: {
    studyId: zid("studies"),
    orgId: z.string(),
  },
  handler: async (ctx, args) => {
    await getStudyForOrg(ctx, args.studyId, args.orgId);
    const report = await findStudyReportByStudyId(ctx, args.studyId);

    if (report === null) {
      throw new ConvexError("Study report not found.");
    }

    const issueClusters = await listIssueClustersByIds(ctx, report.issueClusterIds);
    const resolvedArtifactUrls = await resolveArtifactUrlsForStudy(ctx, {
      studyId: args.studyId,
      keys: collectIssueClusterArtifactKeys(issueClusters),
    });

    return buildStudyReportArtifacts({
      report,
      issueClusters,
      resolvedArtifactUrls,
    });
  },
});

async function requireIdentity(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();

  if (identity === null) {
    throw new ConvexError("Not authenticated.");
  }

  return identity;
}

async function getStudyForOrg(
  ctx: QueryCtx,
  studyId: Id<"studies">,
  orgId: string,
) {
  const study = await ctx.db.get(studyId);

  if (study === null || study.orgId !== orgId) {
    throw new ConvexError("Study not found.");
  }

  return study;
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

      return issueCluster as StudyReportExportCluster;
    }),
  );
}

function buildExportFileName(
  studyId: Id<"studies">,
  extension: "json" | "html",
) {
  return `study-report-${studyId}.${extension}`;
}
