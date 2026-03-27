import { ConvexError, v } from "convex/values";
import { z } from "zod";

import type { Doc, Id } from "./_generated/dataModel";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  internalMutation,
  mutation,
  query,
} from "./_generated/server";
import { requireIdentity, requireRole, STUDY_MANAGER_ROLES } from "./rbac";
import {
  capStudyActiveConcurrency,
  capStudyRunBudget,
  loadEffectiveSettingsForOrg,
} from "./settings";
import {
  recordAuditEvent,
  recordMetric,
} from "./observability";
import { workflow } from "./workflow";

const allowedActionSchema = z.enum([
  "goto",
  "click",
  "type",
  "select",
  "scroll",
  "wait",
  "back",
  "finish",
  "abort",
]);

const forbiddenActionSchema = z.enum([
  "external_download",
  "payment_submission",
  "email_send",
  "sms_send",
  "captcha_bypass",
  "account_creation_without_fixture",
  "cross_domain_escape",
  "file_upload_unless_allowed",
]);

const studyStatusSchema = z.enum([
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
]);

const cancellableStudyStatusSchema = z.enum([
  "persona_review",
  "queued",
  "running",
  "replaying",
]);

const requiredString = (label: string) =>
  z.string().trim().min(1, `${label} is required.`);

const positiveInteger = (label: string) =>
  z.number().int(`${label} must be an integer.`).positive(`${label} must be greater than 0.`);

const viewportSchema = z.object({
  width: positiveInteger("Viewport width"),
  height: positiveInteger("Viewport height"),
});

const postTaskQuestionsSchema = z.array(requiredString("Post-task question"));

const taskSpecInputSchema = z.object({
  scenario: requiredString("Task scenario"),
  goal: requiredString("Task goal"),
  startingUrl: requiredString("Starting URL"),
  allowedDomains: z.array(requiredString("Allowed domain")),
  allowedActions: z.array(allowedActionSchema),
  forbiddenActions: z.array(forbiddenActionSchema),
  successCriteria: z.array(requiredString("Success criterion")),
  stopConditions: z.array(requiredString("Stop condition")),
  postTaskQuestions: postTaskQuestionsSchema.optional(),
  maxSteps: positiveInteger("Max steps"),
  maxDurationSec: positiveInteger("Max duration"),
  environmentLabel: requiredString("Environment label"),
  locale: requiredString("Locale"),
  viewport: viewportSchema,
  credentialsRef: requiredString("Credentials reference").optional(),
  randomSeed: requiredString("Random seed").optional(),
});

const taskSpecPatchSchema = taskSpecInputSchema.partial();

const createStudySchema = z.object({
  personaPackId: z.string(),
  name: requiredString("Study name"),
  description: requiredString("Study description").optional(),
  taskSpec: taskSpecInputSchema,
  runBudget: positiveInteger("Run budget").optional(),
  activeConcurrency: positiveInteger("Active concurrency"),
});

const updateStudyPatchSchema = z
  .object({
    name: requiredString("Study name").optional(),
    description: requiredString("Study description").optional(),
    taskSpec: taskSpecPatchSchema.optional(),
    runBudget: positiveInteger("Run budget").optional(),
    activeConcurrency: positiveInteger("Active concurrency").optional(),
  })
  .refine(
    (patch) => Object.values(patch).some((value) => value !== undefined),
    "At least one study field must be provided.",
  );

const allowedActionValidator = v.union(
  v.literal("goto"),
  v.literal("click"),
  v.literal("type"),
  v.literal("select"),
  v.literal("scroll"),
  v.literal("wait"),
  v.literal("back"),
  v.literal("finish"),
  v.literal("abort"),
);

const forbiddenActionValidator = v.union(
  v.literal("external_download"),
  v.literal("payment_submission"),
  v.literal("email_send"),
  v.literal("sms_send"),
  v.literal("captcha_bypass"),
  v.literal("account_creation_without_fixture"),
  v.literal("cross_domain_escape"),
  v.literal("file_upload_unless_allowed"),
);

const studyStatusValidator = v.union(
  v.literal("draft"),
  v.literal("persona_review"),
  v.literal("ready"),
  v.literal("queued"),
  v.literal("running"),
  v.literal("replaying"),
  v.literal("analyzing"),
  v.literal("completed"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const viewportValidator = v.object({
  width: v.number(),
  height: v.number(),
});

const taskSpecInputValidator = v.object({
  scenario: v.string(),
  goal: v.string(),
  startingUrl: v.string(),
  allowedDomains: v.array(v.string()),
  allowedActions: v.array(allowedActionValidator),
  forbiddenActions: v.array(forbiddenActionValidator),
  successCriteria: v.array(v.string()),
  stopConditions: v.array(v.string()),
  postTaskQuestions: v.optional(v.array(v.string())),
  maxSteps: v.number(),
  maxDurationSec: v.number(),
  environmentLabel: v.string(),
  locale: v.string(),
  viewport: viewportValidator,
  credentialsRef: v.optional(v.string()),
  randomSeed: v.optional(v.string()),
});

const taskSpecPatchValidator = v.object({
  scenario: v.optional(v.string()),
  goal: v.optional(v.string()),
  startingUrl: v.optional(v.string()),
  allowedDomains: v.optional(v.array(v.string())),
  allowedActions: v.optional(v.array(allowedActionValidator)),
  forbiddenActions: v.optional(v.array(forbiddenActionValidator)),
  successCriteria: v.optional(v.array(v.string())),
  stopConditions: v.optional(v.array(v.string())),
  postTaskQuestions: v.optional(v.array(v.string())),
  maxSteps: v.optional(v.number()),
  maxDurationSec: v.optional(v.number()),
  environmentLabel: v.optional(v.string()),
  locale: v.optional(v.string()),
  viewport: v.optional(viewportValidator),
  credentialsRef: v.optional(v.string()),
  randomSeed: v.optional(v.string()),
});

const createStudyValidator = v.object({
  personaPackId: v.id("personaPacks"),
  name: v.string(),
  description: v.optional(v.string()),
  taskSpec: taskSpecInputValidator,
  runBudget: v.optional(v.number()),
  activeConcurrency: v.number(),
});

const updateStudyPatchValidator = v.object({
  name: v.optional(v.string()),
  description: v.optional(v.string()),
  taskSpec: v.optional(taskSpecPatchValidator),
  runBudget: v.optional(v.number()),
  activeConcurrency: v.optional(v.number()),
});

export const DEFAULT_POST_TASK_QUESTIONS = [
  "Do you think you completed the task?",
  "What was the hardest part?",
  "What confused or frustrated you?",
  "How confident are you that you did the right thing?",
  "What would you change?",
] as const;

export const DEFAULT_STUDY_RUN_BUDGET = 64;
export const ACTIVE_CONCURRENCY_HARD_CAP = 30;
export const DEFAULT_CANCELLATION_REASON = "Cancelled by user.";

const FORBIDDEN_ACTION_PATTERNS: Record<
  z.infer<typeof forbiddenActionSchema>,
  readonly RegExp[]
> = {
  external_download: [
    /\bdownload\b/i,
    /\bexport (?:a|the)? ?file\b/i,
    /\bsave (?:a|the)? ?file\b/i,
  ],
  payment_submission: [
    /\bpayment submission\b/i,
    /\bsubmit payment\b/i,
    /\bpay now\b/i,
    /\bcharge (?:the )?card\b/i,
    /\bplace (?:the )?order\b/i,
  ],
  email_send: [/\bsend (?:an? )?email\b/i, /\bemail (?:the|a) /i],
  sms_send: [/\bsend (?:an? )?(?:sms|text)\b/i, /\btext message\b/i],
  captcha_bypass: [/\bbypass (?:a )?captcha\b/i, /\brecaptcha\b/i],
  account_creation_without_fixture: [
    /\bcreate (?:an )?account\b/i,
    /\bregister (?:an )?account\b/i,
    /\bsign up\b/i,
  ],
  cross_domain_escape: [
    /\bnavigate to (?:another|a different) domain\b/i,
    /\bleave the allow(?:ed)? domain\b/i,
    /\bthird-party site\b/i,
  ],
  file_upload_unless_allowed: [
    /\bupload (?:a|the)? ?file\b/i,
    /\battach (?:a|the)? ?file\b/i,
    /\bchoose (?:a|the)? ?file\b/i,
  ],
};

const VALID_STUDY_TRANSITIONS: Record<StudyStatus, readonly StudyStatus[]> = {
  draft: ["persona_review"],
  persona_review: ["ready", "cancelled"],
  ready: ["queued"],
  queued: ["running", "cancelled"],
  running: ["replaying", "failed", "cancelled"],
  replaying: ["analyzing", "failed", "cancelled"],
  analyzing: ["completed", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

export const createStudy = mutation({
  args: {
    study: createStudyValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        study: createStudySchema,
      })
      .parse(args);
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const pack = await getPackForOrg(
      ctx,
      parsedArgs.study.personaPackId as Id<"personaPacks">,
      identity.tokenIdentifier,
    );
    const effectiveSettings = await loadEffectiveSettingsForOrg(
      ctx,
      identity.tokenIdentifier,
    );
    const now = Date.now();
    const studyId = await ctx.db.insert("studies", {
      orgId: identity.tokenIdentifier,
      personaPackId: pack._id,
      name: parsedArgs.study.name,
      ...(parsedArgs.study.description !== undefined
        ? { description: parsedArgs.study.description }
        : {}),
      taskSpec: normalizeTaskSpec(parsedArgs.study.taskSpec),
      runBudget: capStudyRunBudget(
        parsedArgs.study.runBudget ?? DEFAULT_STUDY_RUN_BUDGET,
        effectiveSettings.runBudgetCap,
      ),
      activeConcurrency: capStudyActiveConcurrency(
        parsedArgs.study.activeConcurrency,
        effectiveSettings.maxConcurrency,
      ),
      status: "draft",
      createdBy: identity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    });

    return await getStudyForOrg(ctx, studyId, identity.tokenIdentifier);
  },
});

export const updateStudy = mutation({
  args: {
    studyId: v.id("studies"),
    patch: updateStudyPatchValidator,
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        studyId: z.string(),
        patch: updateStudyPatchSchema,
      })
      .parse(args);
    const studyId = parsedArgs.studyId as Id<"studies">;
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const study = await getStudyForOrg(ctx, studyId, identity.tokenIdentifier);
    const effectiveSettings = await loadEffectiveSettingsForOrg(
      ctx,
      identity.tokenIdentifier,
    );

    if (study.status !== "draft") {
      throw new ConvexError("Only draft studies can be updated.");
    }

    const taskSpec =
      parsedArgs.patch.taskSpec === undefined
        ? study.taskSpec
        : normalizeTaskSpec({
            ...study.taskSpec,
            ...parsedArgs.patch.taskSpec,
            viewport: parsedArgs.patch.taskSpec.viewport ?? study.taskSpec.viewport,
            postTaskQuestions:
              parsedArgs.patch.taskSpec.postTaskQuestions ??
              study.taskSpec.postTaskQuestions,
          });

    await ctx.db.patch(studyId, {
      ...(parsedArgs.patch.name !== undefined ? { name: parsedArgs.patch.name } : {}),
      ...(parsedArgs.patch.description !== undefined
        ? { description: parsedArgs.patch.description }
        : {}),
      runBudget: capStudyRunBudget(
        parsedArgs.patch.runBudget ?? study.runBudget ?? DEFAULT_STUDY_RUN_BUDGET,
        effectiveSettings.runBudgetCap,
      ),
      activeConcurrency: capStudyActiveConcurrency(
        parsedArgs.patch.activeConcurrency ?? study.activeConcurrency,
        effectiveSettings.maxConcurrency,
      ),
      ...(parsedArgs.patch.taskSpec !== undefined ? { taskSpec } : {}),
      updatedAt: Date.now(),
    });

    return await getStudyForOrg(ctx, studyId, identity.tokenIdentifier);
  },
});

export const validateStudyLaunch = mutation({
  args: {
    studyId: v.id("studies"),
    productionAck: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const study = await getStudyForOrg(ctx, args.studyId, identity.tokenIdentifier);

    return await validateStudyLaunchWithRecording(ctx, {
      study,
      actorId: identity.tokenIdentifier,
      productionAck: args.productionAck === true,
    });
  },
});

export const launchStudy = mutation({
  args: {
    studyId: v.id("studies"),
    productionAck: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const study = await getStudyForOrg(ctx, args.studyId, identity.tokenIdentifier);
    const effectiveSettings = await loadEffectiveSettingsForOrg(
      ctx,
      identity.tokenIdentifier,
    );
    const runBudget = capStudyRunBudget(
      study.runBudget ?? DEFAULT_STUDY_RUN_BUDGET,
      effectiveSettings.runBudgetCap,
    );
    const activeConcurrency = capStudyActiveConcurrency(
      study.activeConcurrency,
      effectiveSettings.maxConcurrency,
    );

    if (
      study.status !== "draft" &&
      study.status !== "persona_review" &&
      study.status !== "ready"
    ) {
      throw new ConvexError(
        "Only draft, persona review, or ready studies can be launched.",
      );
    }

    if (
      study.status === "persona_review" &&
      study.launchRequestedBy !== undefined &&
      study.launchedAt === undefined
    ) {
      throw new ConvexError("This study is already preparing for launch.");
    }

    if (runBudget <= 0) {
      throw new ConvexError("Study run budget must be greater than 0 before launch.");
    }

    if (activeConcurrency <= 0) {
      throw new ConvexError(
        "Study active concurrency must be greater than 0 before launch.",
      );
    }

    if (
      runBudget !== study.runBudget ||
      activeConcurrency !== study.activeConcurrency
    ) {
      await ctx.db.patch(study._id, {
        runBudget,
        activeConcurrency,
        updatedAt: Date.now(),
      });
    }

    const pack = await getPackForOrg(
      ctx,
      study.personaPackId,
      identity.tokenIdentifier,
    );

    if (pack.status !== "published") {
      throw new ConvexError("A published persona pack is required before launch.");
    }

    const guardrailValidation = await validateStudyLaunchWithRecording(ctx, {
      study,
      actorId: identity.tokenIdentifier,
      productionAck: args.productionAck === true,
    });

    if (!guardrailValidation.pass) {
      throw new ConvexError(guardrailValidation.reasons.join(" "));
    }

    const hasConfirmedVariants = await hasEnoughAcceptedVariants(
      ctx,
      study._id,
      runBudget,
    );
    const launchTimestamp = Date.now();

    if (study.status !== "ready" || !hasConfirmedVariants) {
      await ctx.db.patch(study._id, {
        status: "persona_review",
        launchRequestedBy: identity.tokenIdentifier,
        updatedAt: launchTimestamp,
      });
    } else {
      await ctx.db.patch(study._id, {
        status: "queued",
        launchRequestedBy: identity.tokenIdentifier,
        launchedAt: launchTimestamp,
        updatedAt: launchTimestamp,
      });
    }
    await recordAuditEvent(ctx, {
      actorId: identity.tokenIdentifier,
      eventType: "study.launched",
      studyId: study._id,
      resourceType: "study",
      resourceId: String(study._id),
      createdAt: launchTimestamp,
    });
    await workflow.start(
      ctx,
      internal.studyLifecycleWorkflow.runStudyLifecycle,
      {
        studyId: study._id,
        launchRequestedBy: identity.tokenIdentifier,
      },
      {
        onComplete: internal.studyLifecycleWorkflow.handleStudyLifecycleComplete,
        context: { studyId: study._id },
        startAsync: true,
      },
    );

    return await getStudyForOrg(ctx, study._id, identity.tokenIdentifier);
  },
});

export const cancelStudy = mutation({
  args: {
    studyId: v.id("studies"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        studyId: z.string(),
        reason: requiredString("Cancellation reason").optional(),
      })
      .parse(args);
    const studyId = parsedArgs.studyId as Id<"studies">;
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const study = await getStudyForOrg(ctx, studyId, identity.tokenIdentifier);

    if (isTerminalStudyStatus(study.status)) {
      throw new ConvexError(
        `Cannot cancel a study that is already ${study.status}.`,
      );
    }

    if (!canCancelStudy(study.status)) {
      throw new ConvexError(`Cannot cancel a study while it is ${study.status}.`);
    }

    const cancellationRequestedAt = Date.now();
    const cancellationReason = parsedArgs.reason ?? DEFAULT_CANCELLATION_REASON;

    if (study.status === "persona_review") {
      await ctx.db.patch(study._id, {
        status: "cancelled",
        cancellationRequestedAt,
        cancellationReason,
        updatedAt: cancellationRequestedAt,
      });
      await recordAuditEvent(ctx, {
        actorId: identity.tokenIdentifier,
        eventType: "study.cancelled",
        studyId: study._id,
        resourceType: "study",
        resourceId: String(study._id),
        reason: cancellationReason,
        createdAt: cancellationRequestedAt,
      });

      return await getStudyForOrg(ctx, study._id, identity.tokenIdentifier);
    }

    const runs = await listRunsForStudy(ctx, study._id);
    for (const run of runs) {
      if (run.status === "queued") {
        await ctx.db.patch(run._id, {
          status: "cancelled",
          endedAt: cancellationRequestedAt,
          cancellationRequestedAt,
          cancellationReason,
        });
        continue;
      }

      if (run.status === "dispatching" || run.status === "running") {
        await ctx.db.patch(run._id, {
          cancellationRequestedAt,
          cancellationReason,
        });
      }
    }

    await ctx.db.patch(study._id, {
      cancellationRequestedAt,
      cancellationReason,
      updatedAt: cancellationRequestedAt,
    });
    await recordAuditEvent(ctx, {
      actorId: identity.tokenIdentifier,
      eventType: "study.cancelled",
      studyId: study._id,
      resourceType: "study",
      resourceId: String(study._id),
      reason: cancellationReason,
      createdAt: cancellationRequestedAt,
    });
    await ctx.runMutation(internal.studies.finalizeCancelledStudyIfComplete, {
      studyId: study._id,
    });

    return await getStudyForOrg(ctx, study._id, identity.tokenIdentifier);
  },
});

export const getStudy = query({
  args: {
    studyId: v.id("studies"),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const study = await ctx.db.get(args.studyId);

    if (study === null || study.orgId !== identity.tokenIdentifier) {
      return null;
    }

    return study;
  },
});

export const listStudies = query({
  args: {},
  handler: async (ctx) => {
    const identity = await requireIdentity(ctx);

    return await ctx.db
      .query("studies")
      .withIndex("by_orgId_and_updatedAt", (q) =>
        q.eq("orgId", identity.tokenIdentifier),
      )
      .order("desc")
      .take(100);
  },
});

export const transitionStudyState = internalMutation({
  args: {
    studyId: v.id("studies"),
    nextStatus: studyStatusValidator,
    failureReason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        studyId: z.string(),
        nextStatus: studyStatusSchema,
        failureReason: z.string().trim().min(1).optional(),
      })
      .parse(args);
    const studyId = parsedArgs.studyId as Id<"studies">;
    const study = await getStudyById(ctx, studyId);

    assertValidStudyTransition(study.status, parsedArgs.nextStatus);

    const transitionTimestamp = Date.now();
    await ctx.db.patch(studyId, {
      status: parsedArgs.nextStatus,
      ...(parsedArgs.nextStatus === "completed"
        ? { completedAt: transitionTimestamp }
        : {}),
      ...(parsedArgs.nextStatus === "failed" && parsedArgs.failureReason !== undefined
        ? { failureReason: parsedArgs.failureReason }
        : {}),
      updatedAt: transitionTimestamp,
    });

    if (parsedArgs.nextStatus === "completed") {
      await recordMetric(ctx, {
        studyId,
        metricType: "study.completed",
        value: 1,
        unit: "count",
        status: parsedArgs.nextStatus,
        recordedAt: transitionTimestamp,
      });
    }

    return await getStudyById(ctx, studyId);
  },
});

export const recordGuardrailEvent = internalMutation({
  args: {
    studyId: v.id("studies"),
    actorId: v.string(),
    outcome: v.union(v.literal("pass"), v.literal("fail")),
    reasons: v.array(v.string()),
    createdAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const study = await getStudyById(ctx, args.studyId);

    return await ctx.db.insert("guardrailEvents", {
      orgId: study.orgId,
      studyId: study._id,
      actorId: args.actorId,
      outcome: args.outcome,
      reasons: args.reasons,
      createdAt: args.createdAt ?? Date.now(),
    });
  },
});

export const finalizeCancelledStudyIfComplete = internalMutation({
  args: {
    studyId: v.id("studies"),
  },
  handler: async (ctx, args) => {
    return await finalizeCancelledStudyIfCompleteInPlace(ctx, args.studyId);
  },
});

export function isValidStudyTransition(
  currentStatus: StudyStatus,
  nextStatus: StudyStatus,
) {
  return VALID_STUDY_TRANSITIONS[currentStatus].includes(nextStatus);
}

function assertValidStudyTransition(
  currentStatus: StudyStatus,
  nextStatus: StudyStatus,
) {
  if (!isValidStudyTransition(currentStatus, nextStatus)) {
    throw new ConvexError(
      `Invalid study state transition: ${currentStatus} -> ${nextStatus}.`,
    );
  }
}

function canCancelStudy(status: StudyStatus): status is z.infer<typeof cancellableStudyStatusSchema> {
  return cancellableStudyStatusSchema.safeParse(status).success;
}

function normalizeTaskSpec(taskSpec: StudyTaskSpecInput): StudyTaskSpec {
  return {
    ...taskSpec,
    postTaskQuestions:
      taskSpec.postTaskQuestions !== undefined &&
      taskSpec.postTaskQuestions.length > 0
        ? taskSpec.postTaskQuestions
        : [...DEFAULT_POST_TASK_QUESTIONS],
  };
}

function isTerminalStudyStatus(status: StudyStatus) {
  return status === "completed" || status === "failed" || status === "cancelled";
}

export function evaluateStudyLaunchGuardrails({
  taskSpec,
  domainAllowlist,
  productionAck,
}: {
  taskSpec: StudyTaskSpecInput;
  domainAllowlist: readonly string[];
  productionAck: boolean;
}): GuardrailValidationResult {
  const reasons = [
    ...getDomainAllowlistReasons(taskSpec, domainAllowlist),
    ...getForbiddenActionReasons(taskSpec),
    ...(requiresProductionAcknowledgement(taskSpec.environmentLabel) &&
    !productionAck
      ? ["Production acknowledgement is required before launching this study."]
      : []),
  ];

  return {
    pass: reasons.length === 0,
    reasons,
  };
}

function isActiveRunStatus(status: Doc<"runs">["status"]) {
  return status === "queued" || status === "dispatching" || status === "running";
}

async function hasEnoughAcceptedVariants(
  ctx: MutationCtx,
  studyId: Id<"studies">,
  requiredAcceptedCount: number,
) {
  let acceptedCount = 0;

  for await (const variant of ctx.db
    .query("personaVariants")
    .withIndex("by_studyId", (q) => q.eq("studyId", studyId))) {
    if (!variant.accepted) {
      continue;
    }

    acceptedCount += 1;

    if (acceptedCount >= requiredAcceptedCount) {
      return true;
    }
  }

  return false;
}

async function getStudyForOrg(
  ctx: QueryCtx | MutationCtx,
  studyId: Id<"studies">,
  orgId: string,
) {
  const study = await ctx.db.get(studyId);

  if (study === null || study.orgId !== orgId) {
    throw new ConvexError("Study not found.");
  }

  return study;
}

async function getStudyById(ctx: MutationCtx, studyId: Id<"studies">) {
  const study = await ctx.db.get(studyId);

  if (study === null) {
    throw new ConvexError("Study not found.");
  }

  return study;
}

async function getPackForOrg(
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

async function listRunsForStudy(
  ctx: QueryCtx | MutationCtx,
  studyId: Id<"studies">,
) {
  return await ctx.db
    .query("runs")
    .withIndex("by_studyId", (query) => query.eq("studyId", studyId))
    .take(200);
}

async function finalizeCancelledStudyIfCompleteInPlace(
  ctx: MutationCtx,
  studyId: Id<"studies">,
) {
  const study = await getStudyById(ctx, studyId);

  if (study.status === "cancelled") {
    return study;
  }

  if (study.cancellationRequestedAt === undefined) {
    return study;
  }

  const runs = await listRunsForStudy(ctx, studyId);

  if (runs.some((run) => isActiveRunStatus(run.status))) {
    return study;
  }

  const cancelledAt = Date.now();
  await ctx.db.patch(studyId, {
    status: "cancelled",
    updatedAt: cancelledAt,
  });

  return await getStudyById(ctx, studyId);
}

async function validateStudyLaunchWithRecording(
  ctx: MutationCtx,
  {
    study,
    actorId,
    productionAck,
  }: {
    study: Doc<"studies">;
    actorId: string;
    productionAck: boolean;
  },
) {
  const settings = await loadEffectiveSettingsForOrg(ctx, study.orgId);
  const validation = evaluateStudyLaunchGuardrails({
    taskSpec: study.taskSpec,
    domainAllowlist:
      settings.domainAllowlist.length > 0
        ? settings.domainAllowlist
        : study.taskSpec.allowedDomains,
    productionAck,
  });

  await ctx.runMutation(internal.studies.recordGuardrailEvent, {
    studyId: study._id,
    actorId,
    outcome: validation.pass ? "pass" : "fail",
    reasons: validation.reasons,
  });

  return validation;
}

function getDomainAllowlistReasons(
  taskSpec: StudyTaskSpecInput,
  domainAllowlist: readonly string[],
) {
  const normalizedAllowlist = new Set(
    domainAllowlist
      .map((domain) => normalizeHostname(domain))
      .filter((domain): domain is string => domain !== null),
  );
  const studyDomains = new Set(
    [taskSpec.startingUrl, ...taskSpec.allowedDomains]
      .map((domain) => normalizeHostname(domain))
      .filter((domain): domain is string => domain !== null),
  );

  return [...studyDomains]
    .filter((domain) => !normalizedAllowlist.has(domain))
    .map((domain) => `Domain "${domain}" is not on the allowlist.`);
}

function getForbiddenActionReasons(taskSpec: StudyTaskSpecInput) {
  const taskSpecText = [
    taskSpec.scenario,
    taskSpec.goal,
    ...taskSpec.successCriteria,
    ...taskSpec.stopConditions,
  ].join("\n");

  return taskSpec.forbiddenActions.flatMap((action) =>
    FORBIDDEN_ACTION_PATTERNS[action].some((pattern) => pattern.test(taskSpecText))
      ? [`Task spec references forbidden action "${action}".`]
      : [],
  );
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

function requiresProductionAcknowledgement(environmentLabel: string) {
  return /\bprod(?:uction)?\b/i.test(environmentLabel);
}

type StudyStatus = z.infer<typeof studyStatusSchema>;
type GuardrailValidationResult = {
  pass: boolean;
  reasons: string[];
};

export type StudyTaskSpecInput = z.infer<typeof taskSpecInputSchema>;
type StudyTaskSpec = StudyTaskSpecInput & {
  postTaskQuestions: string[];
};
