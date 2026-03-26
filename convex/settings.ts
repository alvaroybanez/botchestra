import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import { zCustomMutation, zCustomQuery } from "convex-helpers/server/zod";
import { z } from "zod";

import type { Doc } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { listCredentialSummariesForOrg } from "./credentials";
import { recordAuditEvent } from "./observability";
import { ADMIN_ROLES, requireRole } from "./rbac";

const zMutation = zCustomMutation(mutation, NoOp);
const zQuery = zCustomQuery(query, NoOp);

const taskCategorySchema = z.enum([
  "expansion",
  "action",
  "summarization",
  "clustering",
  "recommendation",
]);

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

const positiveInteger = (label: string) =>
  z.number().int(`${label} must be an integer.`).positive(`${label} must be greater than 0.`);

const modelConfigEntrySchema = z.object({
  taskCategory: taskCategorySchema,
  modelId: requiredString("Model ID"),
});

const budgetLimitsPatchSchema = z.object({
  maxTokensPerStudy: positiveInteger("Max tokens per study").optional(),
  maxBrowserSecPerStudy: positiveInteger("Max browser seconds per study").optional(),
});

const browserPolicyPatchSchema = z.object({
  blockAnalytics: z.boolean().optional(),
  blockHeavyMedia: z.boolean().optional(),
  screenshotFormat: requiredString("Screenshot format").optional(),
  screenshotMode: requiredString("Screenshot mode").optional(),
});

export const SETTINGS_MAX_CONCURRENCY_HARD_CAP = 30;
export const DEFAULT_SETTINGS_RUN_BUDGET_CAP = 100;
export const DEFAULT_SIGNED_URL_EXPIRY_SECONDS = 4 * 60 * 60;
export const DEFAULT_BROWSER_POLICY = {
  blockAnalytics: false,
  blockHeavyMedia: false,
  screenshotFormat: "jpeg",
  screenshotMode: "milestones",
} as const;

const settingsPatchSchema = z
  .object({
    domainAllowlist: z.array(requiredString("Allowed domain")).optional(),
    maxConcurrency: positiveInteger("Max concurrency")
      .max(
        SETTINGS_MAX_CONCURRENCY_HARD_CAP,
        `Max concurrency cannot exceed ${SETTINGS_MAX_CONCURRENCY_HARD_CAP}.`,
      )
      .optional(),
    modelConfig: z.array(modelConfigEntrySchema).optional(),
    runBudgetCap: positiveInteger("Run budget cap").optional(),
    budgetLimits: budgetLimitsPatchSchema.optional(),
    browserPolicy: browserPolicyPatchSchema.optional(),
    signedUrlExpirySeconds: positiveInteger("Signed URL expiry seconds").optional(),
  })
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    "At least one settings field must be provided.",
  );

export const getSettings = zQuery({
  args: {},
  handler: async (ctx) => {
    const { identity } = await requireRole(ctx, ADMIN_ROLES);

    return {
      ...(await loadEffectiveSettingsForOrg(ctx, identity.tokenIdentifier)),
      credentials: await listCredentialSummariesForOrg(
        ctx,
        identity.tokenIdentifier,
      ),
    };
  },
});

export const updateSettings = zMutation({
  args: {
    patch: settingsPatchSchema,
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, ADMIN_ROLES);

    return await upsertSettingsForOrg(ctx, {
      orgId: identity.tokenIdentifier,
      actorId: identity.tokenIdentifier,
      patch: args.patch,
    });
  },
});

export const addDomainToAllowlist = zMutation({
  args: {
    domain: requiredString("Domain"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, ADMIN_ROLES);
    const currentSettings = await loadEffectiveSettingsForOrg(
      ctx,
      identity.tokenIdentifier,
    );

    return await upsertSettingsForOrg(ctx, {
      orgId: identity.tokenIdentifier,
      actorId: identity.tokenIdentifier,
      patch: {
        domainAllowlist: [...currentSettings.domainAllowlist, args.domain],
      },
    });
  },
});

export const removeDomainFromAllowlist = zMutation({
  args: {
    domain: requiredString("Domain"),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, ADMIN_ROLES);
    const normalizedDomain = normalizeHostname(args.domain);

    if (normalizedDomain === null) {
      throw new ConvexError("Domain is required.");
    }

    const currentSettings = await loadEffectiveSettingsForOrg(
      ctx,
      identity.tokenIdentifier,
    );

    return await upsertSettingsForOrg(ctx, {
      orgId: identity.tokenIdentifier,
      actorId: identity.tokenIdentifier,
      patch: {
        domainAllowlist: currentSettings.domainAllowlist.filter(
          (domain) => domain !== normalizedDomain,
        ),
      },
    });
  },
});

export async function loadEffectiveSettingsForOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
) {
  const storedSettings = await loadStoredSettingsForOrg(ctx, orgId);
  return toEffectiveSettings(orgId, storedSettings);
}

export function capStudyActiveConcurrency(
  requestedConcurrency: number,
  maxConcurrency: number,
) {
  if (!Number.isFinite(requestedConcurrency)) {
    return requestedConcurrency;
  }

  return Math.min(
    Math.floor(requestedConcurrency),
    normalizeMaxConcurrency(maxConcurrency),
  );
}

export function capStudyRunBudget(requestedRunBudget: number, runBudgetCap: number) {
  if (!Number.isFinite(requestedRunBudget)) {
    return requestedRunBudget;
  }

  return Math.min(
    Math.floor(requestedRunBudget),
    normalizeRunBudgetCap(runBudgetCap),
  );
}

async function upsertSettingsForOrg(
  ctx: MutationCtx,
  {
    orgId,
    actorId,
    patch,
  }: {
    orgId: string;
    actorId: string;
    patch: z.infer<typeof settingsPatchSchema>;
  },
) {
  const existing = await loadStoredSettingsForOrg(ctx, orgId);
  const effective = toEffectiveSettings(orgId, existing);
  const nextSettings = {
    orgId,
    domainAllowlist:
      patch.domainAllowlist === undefined
        ? effective.domainAllowlist
        : normalizeDomainAllowlist(patch.domainAllowlist),
    maxConcurrency:
      patch.maxConcurrency === undefined
        ? effective.maxConcurrency
        : normalizeMaxConcurrency(patch.maxConcurrency),
    modelConfig:
      patch.modelConfig === undefined
        ? effective.modelConfig
        : normalizeModelConfigForWrite(patch.modelConfig),
    runBudgetCap:
      patch.runBudgetCap === undefined
        ? effective.runBudgetCap
        : normalizeRunBudgetCap(patch.runBudgetCap),
    budgetLimits: toStoredBudgetLimits(
      patch.budgetLimits === undefined
        ? effective.budgetLimits
        : {
            ...effective.budgetLimits,
            ...patch.budgetLimits,
          },
    ),
    browserPolicy: {
      ...effective.browserPolicy,
      ...patch.browserPolicy,
    },
    signedUrlExpirySeconds:
      patch.signedUrlExpirySeconds === undefined
        ? effective.signedUrlExpirySeconds
        : normalizeSignedUrlExpirySeconds(patch.signedUrlExpirySeconds),
    updatedBy: actorId,
    updatedAt: Date.now(),
  } satisfies Omit<Doc<"settings">, "_id" | "_creationTime">;

  if (existing === null) {
    await ctx.db.insert("settings", nextSettings);
  } else {
    await ctx.db.replace(existing._id, nextSettings);
  }

  await recordAuditEvent(ctx, {
    orgId,
    actorId,
    eventType: "settings.updated",
    resourceType: "settings",
    resourceId: orgId,
    createdAt: nextSettings.updatedAt,
  });

  return await loadEffectiveSettingsForOrg(ctx, orgId);
}

async function loadStoredSettingsForOrg(
  ctx: QueryCtx | MutationCtx,
  orgId: string,
) {
  return await ctx.db
    .query("settings")
    .withIndex("by_orgId", (query) => query.eq("orgId", orgId))
    .unique();
}

function toEffectiveSettings(
  orgId: string,
  settings: Doc<"settings"> | null,
) {
  return {
    orgId,
    domainAllowlist: normalizeDomainAllowlist(settings?.domainAllowlist ?? []),
    maxConcurrency: normalizeMaxConcurrency(
      settings?.maxConcurrency ?? SETTINGS_MAX_CONCURRENCY_HARD_CAP,
    ),
    modelConfig: normalizeModelConfigForRead(settings?.modelConfig ?? []),
    runBudgetCap: normalizeRunBudgetCap(
      settings?.runBudgetCap ?? DEFAULT_SETTINGS_RUN_BUDGET_CAP,
    ),
    budgetLimits: normalizeBudgetLimits(settings?.budgetLimits),
    browserPolicy: normalizeBrowserPolicy(settings?.browserPolicy),
    signedUrlExpirySeconds: normalizeSignedUrlExpirySeconds(
      settings?.signedUrlExpirySeconds,
    ),
    updatedBy: settings?.updatedBy ?? null,
    updatedAt: settings?.updatedAt ?? null,
  };
}

function normalizeDomainAllowlist(domainAllowlist: readonly string[]) {
  return [...new Set(domainAllowlist.map(normalizeHostname).filter(isPresent))].sort();
}

function normalizeModelConfigForWrite(
  modelConfig: readonly z.infer<typeof modelConfigEntrySchema>[],
) {
  const duplicates = findDuplicates(modelConfig.map((entry) => entry.taskCategory));

  if (duplicates.length > 0) {
    throw new ConvexError(
      `Model config contains duplicate task categories: ${duplicates.join(", ")}.`,
    );
  }

  return [...modelConfig];
}

function normalizeModelConfigForRead(
  modelConfig: readonly { taskCategory: string; modelId: string }[],
) {
  const normalized: Array<z.infer<typeof modelConfigEntrySchema>> = [];
  const seen = new Set<string>();

  for (const entry of modelConfig) {
    const parsedEntry = modelConfigEntrySchema.safeParse(entry);

    if (!parsedEntry.success || seen.has(parsedEntry.data.taskCategory)) {
      continue;
    }

    seen.add(parsedEntry.data.taskCategory);
    normalized.push(parsedEntry.data);
  }

  return normalized;
}

function normalizeBudgetLimits(
  budgetLimits:
    | Doc<"settings">["budgetLimits"]
    | undefined,
) {
  const normalized: {
    maxTokensPerStudy?: number;
    maxBrowserSecPerStudy?: number;
  } = {};

  if (budgetLimits?.maxTokensPerStudy !== undefined) {
    normalized.maxTokensPerStudy = positiveInteger(
      "Max tokens per study",
    ).parse(budgetLimits.maxTokensPerStudy);
  }

  if (budgetLimits?.maxBrowserSecPerStudy !== undefined) {
    normalized.maxBrowserSecPerStudy = positiveInteger(
      "Max browser seconds per study",
    ).parse(budgetLimits.maxBrowserSecPerStudy);
  }

  return normalized;
}

function toStoredBudgetLimits(
  budgetLimits: ReturnType<typeof normalizeBudgetLimits>,
) {
  if (Object.keys(budgetLimits).length === 0) {
    return undefined;
  }

  return budgetLimits;
}

function normalizeBrowserPolicy(
  browserPolicy: Doc<"settings">["browserPolicy"] | undefined,
) {
  return {
    ...DEFAULT_BROWSER_POLICY,
    ...browserPolicy,
  };
}

function normalizeMaxConcurrency(maxConcurrency: number) {
  return Math.min(maxConcurrency, SETTINGS_MAX_CONCURRENCY_HARD_CAP);
}

function normalizeRunBudgetCap(runBudgetCap: number) {
  return Math.floor(runBudgetCap);
}

function normalizeSignedUrlExpirySeconds(value: number | undefined) {
  if (value === undefined) {
    return DEFAULT_SIGNED_URL_EXPIRY_SECONDS;
  }

  return Math.floor(value);
}

function normalizeHostname(value: string) {
  const trimmedValue = value.trim();
  if (trimmedValue.length === 0) {
    return null;
  }

  try {
    if (trimmedValue.includes("://")) {
      return new URL(trimmedValue).hostname.toLowerCase();
    }

    return new URL(`https://${trimmedValue}`).hostname.toLowerCase();
  } catch {
    return trimmedValue
      .replace(/^https?:\/\//i, "")
      .replace(/\/.*$/, "")
      .replace(/:\d+$/, "")
      .toLowerCase();
  }
}

function findDuplicates(values: readonly string[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value)
    .sort();
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
