import { type WorkflowCtx, vWorkflowId } from "@convex-dev/workflow";
import { vResultValidator } from "@convex-dev/workpool";
import { ConvexError, v } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import {
  zCustomMutation,
  zCustomQuery,
  zid,
} from "convex-helpers/server/zod";
import { z } from "zod";

import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import {
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import {
  buildLimitationsSection,
  computeHeadlineMetrics,
} from "./analysis/pure";
import { isRunExcludedFromClustering } from "./analysis/runSummaries";
import { DEFAULT_STUDY_RUN_BUDGET } from "./studies";
import { workflow } from "./workflow";

const zQuery = zCustomQuery(query, NoOp);
const zInternalMutation = zCustomMutation(internalMutation, NoOp);
const zInternalQuery = zCustomQuery(internalQuery, NoOp);

const WORKFLOW_POLL_INTERVAL_MS = 1_000;

const lifecycleTerminalStatusSchema = z.enum([
  "completed",
  "failed",
  "cancelled",
]);

export const startStudyLifecycleWorkflow = internalMutation({
  args: {
    studyId: v.id("studies"),
    launchRequestedBy: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<string> => {
    const study = await getStudyById(ctx, args.studyId);

    if (
      study.status !== "persona_review" &&
      study.status !== "ready" &&
      study.status !== "queued" &&
      study.status !== "running"
    ) {
      throw new ConvexError(
        "Study lifecycle workflow can only start for studies that are preparing, queued, or running.",
      );
    }

    return await workflow.start(
      ctx,
      internal.studyLifecycleWorkflow.runStudyLifecycle,
      {
        studyId: args.studyId,
        ...(args.launchRequestedBy !== undefined
          ? { launchRequestedBy: args.launchRequestedBy }
          : {}),
      },
      {
        onComplete: internal.studyLifecycleWorkflow.handleStudyLifecycleComplete,
        context: { studyId: args.studyId },
        startAsync: true,
      },
    );
  },
});

export const runStudyLifecycle = workflow.define({
  args: {
    studyId: v.id("studies"),
    launchRequestedBy: v.optional(v.string()),
  },
  handler: async (step, args): Promise<void> => {
    await step.sleep(0, { name: "defer-lifecycle-start" });
    const initialSnapshot = await step.runQuery(
      internal.studyLifecycleWorkflow.getStudyLifecycleSnapshot,
      { studyId: args.studyId },
      { inline: true, name: "read-lifecycle-snapshot" },
    );

    if (isTerminalStudyStatus(initialSnapshot.studyStatus)) {
      return;
    }

    const launchPreparation = await step.runMutation(
      internal.studyLifecycleWorkflow.prepareStudyForLaunch,
      {
        studyId: args.studyId,
        ...(args.launchRequestedBy !== undefined
          ? { launchRequestedBy: args.launchRequestedBy }
          : {}),
      },
      { inline: true, name: "prepare-study-launch" },
    );

    if (launchPreparation.needsVariantGeneration) {
      await step.runAction(
        internal.personaVariantGeneration.generateVariantsForStudyInternal,
        { studyId: args.studyId },
        { name: "generate-study-variants" },
      );
      await step.runMutation(
        internal.studyLifecycleWorkflow.finalizePreparedStudyLaunch,
        {
          studyId: args.studyId,
          ...(args.launchRequestedBy !== undefined
            ? { launchRequestedBy: args.launchRequestedBy }
            : {}),
        },
        { inline: true, name: "finalize-study-launch" },
      );
    }

    const preparedSnapshot = await step.runQuery(
      internal.studyLifecycleWorkflow.getStudyLifecycleSnapshot,
      { studyId: args.studyId },
      { inline: true, name: "read-prepared-snapshot" },
    );

    if (isTerminalStudyStatus(preparedSnapshot.studyStatus)) {
      return;
    }

    await step.runMutation(
      internal.waveDispatch.dispatchStudyWave,
      { studyId: args.studyId },
      { inline: true, name: "dispatch-wave" },
    );

    const settledSnapshot = await waitForInitialCohortToSettle(step, args.studyId);

    if (isTerminalStudyStatus(settledSnapshot.studyStatus)) {
      return;
    }

    await step.runMutation(
      internal.studyLifecycleWorkflow.advanceStudyLifecycleAfterInitialCohort,
      { studyId: args.studyId },
      { inline: true, name: "advance-study-lifecycle" },
    );

    const replaySnapshot = await waitForInitialCohortToSettle(step, args.studyId);

    if (isTerminalStudyStatus(replaySnapshot.studyStatus)) {
      return;
    }

    await step.runMutation(
      internal.studyLifecycleWorkflow.completeStudyLifecycleAfterReplay,
      { studyId: args.studyId },
      { inline: true, name: "complete-study-lifecycle" },
    );
  },
});

export const prepareStudyForLaunch = zInternalMutation({
  args: {
    studyId: zid("studies"),
    launchRequestedBy: z.string().optional(),
  },
  handler: async (ctx, args) => {
    let study = await getStudyById(ctx, args.studyId);

    if (isTerminalStudyStatus(study.status) || study.status === "analyzing") {
      return {
        studyStatus: study.status,
        needsVariantGeneration: false,
      };
    }

    if (
      study.status === "queued" ||
      study.status === "running" ||
      study.status === "replaying"
    ) {
      return {
        studyStatus: study.status,
        needsVariantGeneration: false,
      };
    }

    if (study.status === "draft") {
      study = await ctx.runMutation(internal.studies.transitionStudyState, {
        studyId: args.studyId,
        nextStatus: "persona_review",
      });
    }

    const runBudget = study.runBudget ?? DEFAULT_STUDY_RUN_BUDGET;
    const hasConfirmedVariants = await hasEnoughAcceptedVariantsForStudy(
      ctx,
      args.studyId,
      runBudget,
    );

    if (!hasConfirmedVariants) {
      const updatedAt = Date.now();
      await ctx.db.patch(args.studyId, {
        status: "persona_review",
        ...(args.launchRequestedBy !== undefined
          ? { launchRequestedBy: args.launchRequestedBy }
          : {}),
        updatedAt,
      });

      return {
        studyStatus: "persona_review" as const,
        needsVariantGeneration: true,
      };
    }

    return await queuePreparedStudy(ctx, args.studyId, args.launchRequestedBy);
  },
});

export const finalizePreparedStudyLaunch = zInternalMutation({
  args: {
    studyId: zid("studies"),
    launchRequestedBy: z.string().optional(),
  },
  handler: async (ctx, args) => {
    const study = await getStudyById(ctx, args.studyId);

    if (
      isTerminalStudyStatus(study.status) ||
      study.status === "queued" ||
      study.status === "running" ||
      study.status === "replaying" ||
      study.status === "analyzing"
    ) {
      return {
        studyStatus: study.status,
        needsVariantGeneration: false,
      };
    }

    const runBudget = study.runBudget ?? DEFAULT_STUDY_RUN_BUDGET;
    const hasConfirmedVariants = await hasEnoughAcceptedVariantsForStudy(
      ctx,
      args.studyId,
      runBudget,
    );

    if (!hasConfirmedVariants) {
      throw new ConvexError(
        "Variant generation did not produce enough accepted persona variants for launch.",
      );
    }

    return await queuePreparedStudy(ctx, args.studyId, args.launchRequestedBy);
  },
});

export const handleStudyLifecycleComplete = internalMutation({
  args: {
    workflowId: vWorkflowId,
    context: v.object({
      studyId: v.id("studies"),
    }),
    result: vResultValidator,
  },
  handler: async (ctx, args) => {
    void args.workflowId;
    const study = await ctx.db.get(args.context.studyId);

    if (study === null) {
      return null;
    }

    if (args.result.kind === "success") {
      return null;
    }

    if (
      study.status === "completed" ||
      study.status === "failed" ||
      study.status === "cancelled"
    ) {
      return null;
    }

    await ctx.db.patch(study._id, {
      status: args.result.kind === "canceled" ? "cancelled" : "failed",
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const getStudyLifecycleSnapshot = zInternalQuery({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args) => {
    const study = await getStudyById(ctx, args.studyId);
    const runs = await listRunsForStudy(ctx, args.studyId);

    const queuedRunCount = runs.filter((run) => run.status === "queued").length;
    const activeRunCount = runs.filter((run) =>
      run.status === "dispatching" || run.status === "running",
    ).length;
    const terminalRunCount = runs.filter((run) => isTerminalRunStatus(run.status)).length;

    return {
      studyStatus: study.status,
      totalRuns: runs.length,
      queuedRunCount,
      activeRunCount,
      terminalRunCount,
    };
  },
});

export const createStudyLifecycleReport = zInternalMutation({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args) => {
    const existingReport = await findStudyReportByStudyId(ctx, args.studyId);

    if (existingReport !== null) {
      return existingReport;
    }

    await getStudyById(ctx, args.studyId);
    const runs = await listRunsForStudy(ctx, args.studyId);

    if (runs.length === 0) {
      throw new ConvexError("Cannot create a study report before any runs exist.");
    }

    if (!runs.every((run) => isTerminalRunStatus(run.status))) {
      throw new ConvexError("Cannot create a study report before all runs are terminal.");
    }

    const primaryRuns = runs.filter((run) => run.replayOfRunId === undefined);

    const headlineMetrics = computeHeadlineMetrics(primaryRuns);

    await ctx.runMutation(
      internal.analysisPipelineModel.replaceIssueClustersForStudy,
      { studyId: args.studyId },
    );
    const issueClusterIds: Id<"issueClusters">[] = await ctx.runQuery(
      internal.analysisPipelineModel.listRankedIssueClusterIds,
      { studyId: args.studyId },
    );
    const createdAt = Date.now();
    const reportId = await ctx.db.insert("studyReports", {
      studyId: args.studyId,
      headlineMetrics,
      issueClusterIds,
      segmentBreakdownKey: `study-reports/${args.studyId}/segment-breakdown.json`,
      limitations: buildLimitationsSection(),
      htmlReportKey: `study-reports/${args.studyId}/report.html`,
      jsonReportKey: `study-reports/${args.studyId}/report.json`,
      createdAt,
    });

    const report = await ctx.db.get(reportId);

    if (report === null) {
      throw new ConvexError("Study report was not created.");
    }

    return report;
  },
});

export const advanceStudyLifecycleAfterInitialCohort = zInternalMutation({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args) => {
    const study = await getStudyById(ctx, args.studyId);

    if (study.status === "completed" || study.status === "cancelled") {
      return study;
    }

    if (study.status !== "queued" && study.status !== "running") {
      throw new ConvexError(
        "Study lifecycle can only advance after the initial cohort while queued or running.",
      );
    }

    if (study.status === "queued") {
      await ctx.runMutation(internal.studies.transitionStudyState, {
        studyId: args.studyId,
        nextStatus: "running",
      });
    }

    await ctx.runMutation(internal.studies.transitionStudyState, {
      studyId: args.studyId,
      nextStatus: "replaying",
    });

    await ctx.runMutation(internal.studyLifecycleWorkflow.queueReplayRunsForStudy, {
      studyId: args.studyId,
    });
    await ctx.runMutation(internal.waveDispatch.dispatchQueuedRunsForStudy, {
      studyId: args.studyId,
    });

    return await getStudyById(ctx, args.studyId);
  },
});

export const queueReplayRunsForStudy = zInternalMutation({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args) => {
    const study = await getStudyById(ctx, args.studyId);

    if (study.status !== "replaying") {
      throw new ConvexError("Replay runs can only be queued while the study is replaying.");
    }

    return {
      studyId: args.studyId,
      createdReplayRunCount: await createReplayRunsForStudy(ctx, args.studyId),
    };
  },
});

export const completeStudyLifecycleAfterReplay = zInternalMutation({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args) => {
    const study = await getStudyById(ctx, args.studyId);

    if (study.status === "completed" || study.status === "cancelled") {
      return study;
    }

    if (study.status !== "replaying") {
      throw new ConvexError(
        "Study lifecycle can only complete replay verification while replaying.",
      );
    }

    const runs = await listRunsForStudy(ctx, args.studyId);

    if (!runs.every((run) => isTerminalRunStatus(run.status))) {
      throw new ConvexError("Replay verification cannot complete before all runs are terminal.");
    }

    if (runs.every((run) => run.status === "infra_error")) {
      await ctx.runMutation(internal.studies.transitionStudyState, {
        studyId: args.studyId,
        nextStatus: "failed",
      });

      return await getStudyById(ctx, args.studyId);
    }

    await ctx.runMutation(internal.studies.transitionStudyState, {
      studyId: args.studyId,
      nextStatus: "analyzing",
    });
    await ctx.runMutation(internal.studyLifecycleWorkflow.createStudyLifecycleReport, {
      studyId: args.studyId,
    });
    await ctx.runMutation(internal.studies.transitionStudyState, {
      studyId: args.studyId,
      nextStatus: "completed",
    });

    return await getStudyById(ctx, args.studyId);
  },
});

export const getReplayCandidates = zInternalQuery({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args) => {
    await getStudyById(ctx, args.studyId);
    const runs = await listRunsForStudy(ctx, args.studyId);
    return buildReplayCandidates(runs);
  },
});

export const getStudyReport = zQuery({
  args: {
    studyId: zid("studies"),
  },
  handler: async (ctx, args) => {
    await getStudyForOrg(ctx, args.studyId);
    return await findStudyReportByStudyId(ctx, args.studyId);
  },
});

async function waitForInitialCohortToSettle(
  step: WorkflowCtx,
  studyId: Id<"studies">,
) {
  while (true) {
    const snapshot = await step.runQuery(
      internal.studyLifecycleWorkflow.getStudyLifecycleSnapshot,
      { studyId },
      { inline: true, name: "poll-study-runs" },
    );

    if (isTerminalStudyStatus(snapshot.studyStatus)) {
      return snapshot;
    }

    if (
      snapshot.totalRuns > 0 &&
      snapshot.queuedRunCount === 0 &&
      snapshot.activeRunCount === 0 &&
      snapshot.terminalRunCount === snapshot.totalRuns
    ) {
      return snapshot;
    }

    await step.sleep(WORKFLOW_POLL_INTERVAL_MS, {
      name: "wait-for-study-runs",
    });
  }
}

async function createVerifiedIssueClusters(
  ctx: MutationCtx,
  runs: Array<Doc<"runs">>,
) {
  const replayCandidates = buildReplayCandidates(runs);

  if (replayCandidates.length === 0) {
    return [] as Id<"issueClusters">[];
  }

  const promotedClusterIds: Id<"issueClusters">[] = [];
  for (const candidate of replayCandidates) {
    if (candidate.replayConfidence <= 0) {
      continue;
    }

    const clusterId = await ctx.db.insert("issueClusters", {
      studyId: candidate.studyId,
      title: buildReplayCandidateTitle(candidate),
      summary: buildReplayCandidateSummary(candidate),
      severity: candidate.severity,
      affectedRunCount: candidate.affectedRunCount,
      affectedRunRate: candidate.affectedRunRate,
      affectedProtoPersonaIds: candidate.affectedProtoPersonaIds,
      affectedAxisRanges: [],
      representativeRunIds: candidate.representativeRunIds,
      replayConfidence: candidate.replayConfidence,
      evidenceKeys: candidate.evidenceKeys,
      recommendation:
        "Prioritize fixes for the reproduced failure pattern before broadening analysis.",
      confidenceNote: `Replay reproduced ${candidate.reproducedFailures}/${candidate.replayAttempts} attempt(s).`,
      score:
        candidate.affectedRunRate *
        severityWeight(candidate.severity) *
        candidate.replayConfidence,
    });

    promotedClusterIds.push(clusterId);
  }

  return promotedClusterIds;
}

function severityWeight(severity: Doc<"issueClusters">["severity"]) {
  switch (severity) {
    case "blocker":
      return 1;
    case "major":
      return 0.6;
    case "minor":
      return 0.3;
    case "cosmetic":
      return 0.1;
  }
}

function ratio(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

async function createReplayRunsForStudy(
  ctx: MutationCtx,
  studyId: Id<"studies">,
) {
  const runs = await listRunsForStudy(ctx, studyId);
  const replayCandidates = buildReplayCandidates(runs);
  let createdReplayRunCount = 0;

  for (const candidate of replayCandidates) {
    const representativeRun = runs.find(
      (run) => run._id === candidate.representativeRunId,
    );

    if (representativeRun === undefined) {
      continue;
    }

    const existingReplayRuns = runs.filter(
      (run) => run.replayOfRunId === candidate.representativeRunId,
    );
    const replayRunsToCreate = Math.max(0, 2 - existingReplayRuns.length);

    for (let index = 0; index < replayRunsToCreate; index += 1) {
      await ctx.db.insert("runs", {
        studyId,
        personaVariantId: representativeRun.personaVariantId,
        protoPersonaId: representativeRun.protoPersonaId,
        status: "queued",
        replayOfRunId: candidate.representativeRunId,
        frustrationCount: 0,
        milestoneKeys: [],
      });
      createdReplayRunCount += 1;
    }
  }

  return createdReplayRunCount;
}

function buildReplayCandidates(runs: Array<Doc<"runs">>) {
  const originalRuns = runs.filter((run) => run.replayOfRunId === undefined);
  const originalFailureGroups = new Map<string, Array<Doc<"runs">>>();

  for (const run of originalRuns) {
    const signature = getReplayFailureSignature(run);

    if (signature === null) {
      continue;
    }

    originalFailureGroups.set(signature, [
      ...(originalFailureGroups.get(signature) ?? []),
      run,
    ]);
  }

  const replayCandidates: ReplayCandidate[] = [];
  for (const [signature, groupedRuns] of originalFailureGroups.entries()) {
    const severity = deriveReplaySeverity(groupedRuns);

    if (groupedRuns.length < 2 && severity !== "blocker") {
      continue;
    }

    const representativeRun = groupedRuns[0]!;
    const replayAttempts = runs.filter(
      (run) =>
        run.replayOfRunId === representativeRun._id && isTerminalRunStatus(run.status),
    );
    const reproducedFailures = replayAttempts.filter((run) => {
      return getReplayFailureSignature(run) === signature;
    });

    replayCandidates.push({
      studyId: representativeRun.studyId,
      signature,
      severity,
      affectedRunCount: groupedRuns.length,
      affectedRunRate: ratio(groupedRuns.length, originalRuns.length),
      affectedProtoPersonaIds: uniqueIds(groupedRuns.map((run) => run.protoPersonaId)),
      representativeRunId: representativeRun._id,
      representativeRunIds: groupedRuns.slice(0, 3).map((run) => run._id),
      replayAttempts: replayAttempts.length,
      reproducedFailures: reproducedFailures.length,
      replayConfidence: ratio(reproducedFailures.length, replayAttempts.length),
      evidenceKeys: uniqueStrings(
        [...groupedRuns, ...reproducedFailures].flatMap((run) => run.milestoneKeys),
      ),
    });
  }

  return replayCandidates.sort((left, right) => {
    if (left.affectedRunCount !== right.affectedRunCount) {
      return right.affectedRunCount - left.affectedRunCount;
    }

    return left.signature.localeCompare(right.signature);
  });
}

function getReplayFailureSignature(run: Doc<"runs">) {
  if (run.status === "success" || isRunExcludedFromClustering(run.status)) {
    return null;
  }

  return `${run.status}|${run.errorCode ?? "NO_ERROR_CODE"}|${run.finalUrl ?? "NO_FINAL_URL"}`;
}

function deriveReplaySeverity(runs: Array<Doc<"runs">>) {
  const severities = runs.map((run) => severityFromRunStatus(run.status));

  if (severities.includes("blocker")) {
    return "blocker" as const;
  }

  if (severities.includes("major")) {
    return "major" as const;
  }

  if (severities.includes("minor")) {
    return "minor" as const;
  }

  return "cosmetic" as const;
}

function severityFromRunStatus(status: Doc<"runs">["status"]) {
  switch (status) {
    case "hard_fail":
    case "blocked_by_guardrail":
      return "blocker" as const;
    case "timeout":
    case "infra_error":
      return "major" as const;
    case "soft_fail":
    case "gave_up":
      return "minor" as const;
    default:
      return "cosmetic" as const;
  }
}

function buildReplayCandidateTitle(candidate: ReplayCandidate) {
  return `Replay verified failure: ${candidate.signature}`;
}

function buildReplayCandidateSummary(candidate: ReplayCandidate) {
  return `Failure signature ${candidate.signature} affected ${candidate.affectedRunCount} original run(s) and replay reproduced ${candidate.reproducedFailures}/${candidate.replayAttempts} attempt(s).`;
}

function uniqueIds<TableName extends "issueClusters" | "protoPersonas" | "runs">(
  values: Array<Id<TableName>>,
) {
  return values.reduce<Array<Id<TableName>>>((accumulator, value) => {
    if (accumulator.includes(value)) {
      return accumulator;
    }

    return [...accumulator, value];
  }, []);
}

function uniqueStrings(values: string[]) {
  return values.reduce<string[]>((accumulator, value) => {
    if (accumulator.includes(value)) {
      return accumulator;
    }

    return [...accumulator, value];
  }, []);
}

function isTerminalRunStatus(status: Doc<"runs">["status"]) {
  return !["queued", "dispatching", "running"].includes(status);
}

function isTerminalStudyStatus(
  status: Doc<"studies">["status"],
): status is z.infer<typeof lifecycleTerminalStatusSchema> {
  return lifecycleTerminalStatusSchema.safeParse(status).success;
}

async function hasEnoughAcceptedVariantsForStudy(
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

async function listRunsForStudy(
  ctx: QueryCtx | MutationCtx,
  studyId: Id<"studies">,
) {
  return await ctx.db
    .query("runs")
    .withIndex("by_studyId", (query) => query.eq("studyId", studyId))
    .take(200);
}

async function findStudyReportByStudyId(
  ctx: QueryCtx | MutationCtx,
  studyId: Id<"studies">,
) {
  for await (const report of ctx.db.query("studyReports")) {
    if (report.studyId === studyId) {
      return report;
    }
  }

  return null;
}

async function getStudyById(
  ctx: QueryCtx | MutationCtx,
  studyId: Id<"studies">,
) {
  const study = await ctx.db.get(studyId);

  if (study === null) {
    throw new ConvexError("Study not found.");
  }

  return study;
}

async function queuePreparedStudy(
  ctx: MutationCtx,
  studyId: Id<"studies">,
  launchRequestedBy: string | undefined,
) {
  let study = await getStudyById(ctx, studyId);

  if (study.status === "persona_review") {
    study = await ctx.runMutation(internal.studies.transitionStudyState, {
      studyId,
      nextStatus: "ready",
    });
  }

  if (study.status === "ready") {
    const launchTimestamp = Date.now();
    await ctx.db.patch(studyId, {
      status: "queued",
      ...(launchRequestedBy !== undefined
        ? { launchRequestedBy }
        : study.launchRequestedBy !== undefined
          ? { launchRequestedBy: study.launchRequestedBy }
          : {}),
      launchedAt: launchTimestamp,
      updatedAt: launchTimestamp,
    });

    return {
      studyStatus: "queued" as const,
      needsVariantGeneration: false,
    };
  }

  return {
    studyStatus: study.status,
    needsVariantGeneration: false,
  };
}

type ReplayCandidate = {
  studyId: Id<"studies">;
  signature: string;
  severity: Doc<"issueClusters">["severity"];
  affectedRunCount: number;
  affectedRunRate: number;
  affectedProtoPersonaIds: Array<Id<"protoPersonas">>;
  representativeRunId: Id<"runs">;
  representativeRunIds: Array<Id<"runs">>;
  replayAttempts: number;
  reproducedFailures: number;
  replayConfidence: number;
  evidenceKeys: string[];
};

async function getStudyForOrg(
  ctx: QueryCtx,
  studyId: Id<"studies">,
) {
  const identity = await ctx.auth.getUserIdentity();

  if (identity === null) {
    throw new ConvexError("Not authenticated.");
  }

  const study = await ctx.db.get(studyId);

  if (study === null || study.orgId !== identity.tokenIdentifier) {
    throw new ConvexError("Study not found.");
  }

  return study;
}
