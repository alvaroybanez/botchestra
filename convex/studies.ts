import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import {
  zCustomMutation,
  zCustomQuery,
  zid,
} from "convex-helpers/server/zod";
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
import { workflow } from "./workflow";

const zMutation = zCustomMutation(mutation, NoOp);
const zQuery = zCustomQuery(query, NoOp);
const zInternalMutation = zCustomMutation(internalMutation, NoOp);

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
  personaPackId: zid("personaPacks"),
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

export const createStudy = zMutation({
  args: {
    study: createStudySchema,
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const pack = await getPackForOrg(
      ctx,
      args.study.personaPackId,
      identity.tokenIdentifier,
    );
    const now = Date.now();
    const studyId = await ctx.db.insert("studies", {
      orgId: identity.tokenIdentifier,
      personaPackId: pack._id,
      name: args.study.name,
      ...(args.study.description !== undefined
        ? { description: args.study.description }
        : {}),
      taskSpec: normalizeTaskSpec(args.study.taskSpec),
      runBudget: args.study.runBudget ?? DEFAULT_STUDY_RUN_BUDGET,
      activeConcurrency: capActiveConcurrency(args.study.activeConcurrency),
      status: "draft",
      createdBy: identity.tokenIdentifier,
      createdAt: now,
      updatedAt: now,
    });

    return await getStudyForOrg(ctx, studyId, identity.tokenIdentifier);
  },
});

export const updateStudy = zMutation({
  args: {
    studyId: zid("studies"),
    patch: updateStudyPatchSchema,
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const study = await getStudyForOrg(ctx, args.studyId, identity.tokenIdentifier);

    if (study.status !== "draft") {
      throw new ConvexError("Only draft studies can be updated.");
    }

    const taskSpec =
      args.patch.taskSpec === undefined
        ? study.taskSpec
        : normalizeTaskSpec({
            ...study.taskSpec,
            ...args.patch.taskSpec,
            viewport: args.patch.taskSpec.viewport ?? study.taskSpec.viewport,
            postTaskQuestions:
              args.patch.taskSpec.postTaskQuestions ?? study.taskSpec.postTaskQuestions,
          });

    await ctx.db.patch(args.studyId, {
      ...(args.patch.name !== undefined ? { name: args.patch.name } : {}),
      ...(args.patch.description !== undefined
        ? { description: args.patch.description }
        : {}),
      ...(args.patch.runBudget !== undefined
        ? { runBudget: args.patch.runBudget }
        : {}),
      ...(args.patch.activeConcurrency !== undefined
        ? {
            activeConcurrency: capActiveConcurrency(args.patch.activeConcurrency),
          }
        : {}),
      ...(args.patch.taskSpec !== undefined ? { taskSpec } : {}),
      updatedAt: Date.now(),
    });

    return await getStudyForOrg(ctx, args.studyId, identity.tokenIdentifier);
  },
});

export const launchStudy = zMutation({
  args: {
    studyId: zid("studies"),
    productionAck: z.boolean().optional(),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const study = await getStudyForOrg(ctx, args.studyId, identity.tokenIdentifier);
    const runBudget = study.runBudget ?? DEFAULT_STUDY_RUN_BUDGET;

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

    if (study.activeConcurrency <= 0) {
      throw new ConvexError(
        "Study active concurrency must be greater than 0 before launch.",
      );
    }

    const pack = await getPackForOrg(
      ctx,
      study.personaPackId,
      identity.tokenIdentifier,
    );

    if (pack.status !== "published") {
      throw new ConvexError("A published persona pack is required before launch.");
    }

    if (
      study.taskSpec.environmentLabel === "production" &&
      args.productionAck !== true
    ) {
      throw new ConvexError(
        "Production acknowledgement is required before launching this study.",
      );
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

export const cancelStudy = zMutation({
  args: {
    studyId: zid("studies"),
    reason: requiredString("Cancellation reason").optional(),
  },
  handler: async (ctx, args) => {
    const { identity } = await requireRole(ctx, STUDY_MANAGER_ROLES);
    const study = await getStudyForOrg(ctx, args.studyId, identity.tokenIdentifier);

    if (isTerminalStudyStatus(study.status)) {
      throw new ConvexError(
        `Cannot cancel a study that is already ${study.status}.`,
      );
    }

    if (!canCancelStudy(study.status)) {
      throw new ConvexError(`Cannot cancel a study while it is ${study.status}.`);
    }

    const cancellationRequestedAt = Date.now();
    const cancellationReason = args.reason ?? DEFAULT_CANCELLATION_REASON;

    if (study.status === "persona_review") {
      await ctx.db.patch(study._id, {
        status: "cancelled",
        cancellationRequestedAt,
        cancellationReason,
        updatedAt: cancellationRequestedAt,
      });
      await ctx.runMutation(internal.auditEvents.recordAuditEvent, {
        studyId: study._id,
        actorId: identity.tokenIdentifier,
        eventType: "study.cancelled",
        reason: cancellationReason,
        timestamp: cancellationRequestedAt,
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
        });
        continue;
      }

      if (run.status === "dispatching" || run.status === "running") {
        await ctx.db.patch(run._id, {
          cancellationRequestedAt,
        });
      }
    }

    await ctx.db.patch(study._id, {
      cancellationRequestedAt,
      cancellationReason,
      updatedAt: cancellationRequestedAt,
    });
    await ctx.runMutation(internal.auditEvents.recordAuditEvent, {
      studyId: study._id,
      actorId: identity.tokenIdentifier,
      eventType: "study.cancelled",
      reason: cancellationReason,
      timestamp: cancellationRequestedAt,
    });
    await ctx.runMutation(internal.studies.finalizeCancelledStudyIfComplete, {
      studyId: study._id,
    });

    return await getStudyForOrg(ctx, study._id, identity.tokenIdentifier);
  },
});

export const getStudy = zQuery({
  args: {
    studyId: zid("studies"),
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

export const listStudies = zQuery({
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

export const transitionStudyState = zInternalMutation({
  args: {
    studyId: zid("studies"),
    nextStatus: studyStatusSchema,
    failureReason: z.string().trim().min(1).optional(),
  },
  handler: async (ctx, args) => {
    const study = await getStudyById(ctx, args.studyId);

    assertValidStudyTransition(study.status, args.nextStatus);

    const transitionTimestamp = Date.now();
    await ctx.db.patch(args.studyId, {
      status: args.nextStatus,
      ...(args.nextStatus === "completed"
        ? { completedAt: transitionTimestamp }
        : {}),
      ...(args.nextStatus === "failed" && args.failureReason !== undefined
        ? { failureReason: args.failureReason }
        : {}),
      updatedAt: transitionTimestamp,
    });

    return await getStudyById(ctx, args.studyId);
  },
});

export const finalizeCancelledStudyIfComplete = zInternalMutation({
  args: {
    studyId: zid("studies"),
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

function capActiveConcurrency(activeConcurrency: number) {
  return Math.min(activeConcurrency, ACTIVE_CONCURRENCY_HARD_CAP);
}

function isTerminalStudyStatus(status: StudyStatus) {
  return status === "completed" || status === "failed" || status === "cancelled";
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

type StudyStatus = z.infer<typeof studyStatusSchema>;
type StudyTaskSpecInput = z.infer<typeof taskSpecInputSchema>;
type StudyTaskSpec = StudyTaskSpecInput & {
  postTaskQuestions: string[];
};
