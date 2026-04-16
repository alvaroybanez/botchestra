import { ConvexError, v } from "convex/values";
import { z } from "zod";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { query } from "./_generated/server";
import { buildStudyReportArtifactKeys } from "./analysis/reportArtifacts";
import { requireIdentity, resolveOrgId } from "./rbac";

const LOCAL_ARTIFACT_PROXY_BASE_URL = "http://localhost:8787";
const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 4 * 60 * 60;
const HTTP_URL_PATTERN = /^https?:\/\//i;
const RUN_ARTIFACT_KEY_PATTERN = /^runs\/([^/]+)\/.+$/;
const STUDY_REPORT_ARTIFACT_KEY_PATTERN = /^study-reports\/([^/]+)\/.+$/;

type ArtifactResolverCtx = Pick<QueryCtx | MutationCtx, "db" | "storage">;
type ArtifactScope = {
  studyId: Id<"studies">;
  orgId: string;
  report: Doc<"studyReports"> | null;
  signedUrlExpirySeconds: number;
};

export const getArtifactUrl = query({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        key: z.string().trim().min(1, "Artifact key is required."),
      })
      .parse(args);
    const identity = await requireIdentity(ctx);
    const normalizedKey = parsedArgs.key.trim();

    if (isDirectArtifactUrl(normalizedKey)) {
      return normalizedKey;
    }

    const scope = await getArtifactScopeForKey(
      ctx,
      normalizedKey,
      resolveOrgId(identity),
    );

    return await resolveArtifactUrlWithScope(ctx, scope, normalizedKey);
  },
});

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

  const study = await ctx.db.get(studyId);

  if (study === null) {
    throw new ConvexError("Study not found.");
  }

  const scope = await loadArtifactScope(ctx, study._id, study.orgId);
  const entries = await Promise.all(
    normalizedKeys.map(async (key) => [
      key,
      await resolveArtifactUrlWithScope(ctx, scope, key),
    ] as const),
  );

  return Object.fromEntries(entries);
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
      isDirectArtifactUrl(key) ? key : buildArtifactProxyUrl(key),
    ]),
  );
}

export function resolveArtifactUrl(key: string) {
  return isDirectArtifactUrl(key) ? key : buildArtifactProxyUrl(key);
}

async function getArtifactScopeForKey(
  ctx: ArtifactResolverCtx,
  key: string,
  orgId: string,
) {
  const runMatch = key.match(RUN_ARTIFACT_KEY_PATTERN);

  if (runMatch) {
    const runId = runMatch[1] as Id<"runs">;
    const run = await ctx.db.get(runId);

    if (run === null) {
      throw new ConvexError("Artifact not found.");
    }

    const study = await ctx.db.get(run.studyId);

    if (study === null || study.orgId !== orgId) {
      throw new ConvexError("Artifact not found.");
    }

    return await loadArtifactScope(ctx, study._id, study.orgId);
  }

  const reportMatch = key.match(STUDY_REPORT_ARTIFACT_KEY_PATTERN);

  if (reportMatch) {
    const studyId = reportMatch[1] as Id<"studies">;
    const study = await ctx.db.get(studyId);

    if (study === null || study.orgId !== orgId) {
      throw new ConvexError("Artifact not found.");
    }

    return await loadArtifactScope(ctx, study._id, study.orgId);
  }

  throw new ConvexError("Artifact not found.");
}

async function loadArtifactScope(
  ctx: ArtifactResolverCtx,
  studyId: Id<"studies">,
  orgId: string,
): Promise<ArtifactScope> {
  const [report, signedUrlExpirySeconds] = await Promise.all([
    findStudyReportByStudyId(ctx, studyId),
    getSignedUrlExpirySeconds(ctx, orgId),
  ]);

  return {
    studyId,
    orgId,
    report,
    signedUrlExpirySeconds,
  };
}

async function resolveArtifactUrlWithScope(
  ctx: ArtifactResolverCtx,
  scope: ArtifactScope,
  key: string,
) {
  if (isDirectArtifactUrl(key)) {
    return key;
  }

  const storedUrl = await getStudyReportArtifactUrl(ctx, scope.report, key);

  if (storedUrl !== null) {
    return storedUrl;
  }

  return await buildSignedArtifactProxyUrl(key, scope.signedUrlExpirySeconds);
}

async function getStudyReportArtifactUrl(
  ctx: ArtifactResolverCtx,
  report: Doc<"studyReports"> | null,
  key: string,
) {
  if (report === null) {
    return null;
  }

  const reportArtifactKeys = buildStudyReportArtifactKeys(report.studyId);
  const htmlReportKey = report.htmlReportKey ?? reportArtifactKeys.htmlReportKey;
  const jsonReportKey = report.jsonReportKey ?? reportArtifactKeys.jsonReportKey;

  if (key === htmlReportKey && report.htmlReportStorageId) {
    return await ctx.storage.getUrl(report.htmlReportStorageId);
  }

  if (key === jsonReportKey && report.jsonReportStorageId) {
    return await ctx.storage.getUrl(report.jsonReportStorageId);
  }

  return null;
}

async function getSignedUrlExpirySeconds(
  ctx: ArtifactResolverCtx,
  orgId: string,
) {
  const settings = await ctx.db
    .query("settings")
    .withIndex("by_orgId", (query) => query.eq("orgId", orgId))
    .unique();

  return normalizeSignedUrlExpirySeconds(
    (
      settings as
        | (Doc<"settings"> & { signedUrlExpirySeconds?: number })
        | null
    )?.signedUrlExpirySeconds,
  );
}

function normalizeSignedUrlExpirySeconds(value: number | undefined) {
  if (
    value === undefined ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return DEFAULT_SIGNED_URL_EXPIRY_SECONDS;
  }

  return Math.floor(value);
}

async function buildSignedArtifactProxyUrl(
  key: string,
  signedUrlExpirySeconds: number,
) {
  const expiresAt = Date.now() + signedUrlExpirySeconds * 1000;
  const signature = await createArtifactSignature(key, expiresAt);

  return `${buildArtifactProxyUrl(key)}?expires=${expiresAt}&signature=${encodeURIComponent(
    signature,
  )}`;
}

function buildArtifactProxyUrl(key: string) {
  const baseUrl = (
    process.env.ARTIFACT_BASE_URL ??
    process.env.BROWSER_EXECUTOR_URL ??
    LOCAL_ARTIFACT_PROXY_BASE_URL
  )
    .trim()
    .replace(/\/+$/, "");

  return `${baseUrl}/artifacts/${encodeURIComponent(key)}`;
}

async function createArtifactSignature(
  key: string,
  expiresAt: number,
) {
  const secret = getArtifactSigningSecret();
  const data = `${key}:${expiresAt}`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data),
  );

  return encodeBase64Url(new Uint8Array(signature));
}

function getArtifactSigningSecret() {
  const secret =
    process.env.ARTIFACT_SIGNING_SECRET ??
    process.env.CALLBACK_SIGNING_SECRET;

  if (!secret) {
    throw new ConvexError("Artifact signing secret is not configured.");
  }

  return secret;
}

function encodeBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function isDirectArtifactUrl(key: string) {
  return key.startsWith("data:") || HTTP_URL_PATTERN.test(key);
}

async function findStudyReportByStudyId(
  ctx: ArtifactResolverCtx,
  studyId: Id<"studies">,
) {
  return await ctx.db
    .query("studyReports")
    .withIndex("by_studyId", (query) => query.eq("studyId", studyId))
    .unique();
}

function uniqueStrings(values: readonly string[]) {
  return [...new Set(values)];
}
