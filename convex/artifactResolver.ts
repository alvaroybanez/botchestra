import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const LOCAL_ARTIFACT_PROXY_BASE_URL = "http://localhost:8787";
const HTTP_URL_PATTERN = /^https?:\/\//i;

type ArtifactResolverCtx = Pick<QueryCtx | MutationCtx, "db" | "storage">;

export async function resolveArtifactUrlsForStudy(
  ctx: ArtifactResolverCtx,
  {
    studyId,
    keys,
  }: {
    studyId: Doc<"studyReports">["studyId"];
    keys: readonly string[];
  },
) {
  const normalizedKeys = uniqueStrings(
    keys.map((key) => key.trim()).filter((key) => key.length > 0),
  );

  if (normalizedKeys.length === 0) {
    return {} as Record<string, string>;
  }

  const report = await ctx.db
    .query("studyReports")
    .withIndex("by_studyId", (query) => query.eq("studyId", studyId))
    .unique();
  const reportArtifactUrls = await getStudyReportArtifactUrls(ctx, report);

  return Object.fromEntries(
    normalizedKeys.map((key) => [key, reportArtifactUrls.get(key) ?? resolveArtifactUrl(key)]),
  );
}

export function collectIssueClusterArtifactKeys(
  issueClusters: readonly Pick<Doc<"issueClusters">, "evidenceKeys">[],
) {
  return uniqueStrings(issueClusters.flatMap((issueCluster) => issueCluster.evidenceKeys));
}

export function buildArtifactUrlMap(keys: readonly string[]) {
  return Object.fromEntries(
    uniqueStrings(keys.map((key) => key.trim()).filter((key) => key.length > 0)).map((key) => [
      key,
      resolveArtifactUrl(key),
    ]),
  );
}

async function getStudyReportArtifactUrls(
  ctx: ArtifactResolverCtx,
  report: Doc<"studyReports"> | null,
) {
  const urls = new Map<string, string>();

  if (report?.htmlReportKey && report.htmlReportStorageId) {
    const url = await ctx.storage.getUrl(report.htmlReportStorageId);

    if (url !== null) {
      urls.set(report.htmlReportKey, url);
    }
  }

  if (report?.jsonReportKey && report.jsonReportStorageId) {
    const url = await ctx.storage.getUrl(report.jsonReportStorageId);

    if (url !== null) {
      urls.set(report.jsonReportKey, url);
    }
  }

  return urls;
}

export function resolveArtifactUrl(key: string) {
  if (key.startsWith("data:") || HTTP_URL_PATTERN.test(key)) {
    return key;
  }

  return buildArtifactProxyUrl(key);
}

function buildArtifactProxyUrl(key: string) {
  const baseUrl = (process.env.ARTIFACT_BASE_URL ?? LOCAL_ARTIFACT_PROXY_BASE_URL)
    .trim()
    .replace(/\/+$/, "");

  return `${baseUrl}/artifacts/${encodeURIComponent(key)}`;
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values)];
}
