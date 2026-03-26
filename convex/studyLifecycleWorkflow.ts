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

const reportLimitations = [
  "Findings are synthetic and directional.",
  "Agents may miss or invent behavior relative to humans.",
  "Human follow-up is recommended for high-stakes decisions.",
] as const;

export const startStudyLifecycleWorkflow = internalMutation({
  args: {
    studyId: v.id("studies"),
  },
  handler: async (ctx, args): Promise<string> => {
    const study = await getStudyById(ctx, args.studyId);

    if (study.status !== "queued" && study.status !== "running") {
      throw new ConvexError(
        "Study lifecycle workflow can only start for queued or running studies.",
      );
    }

    return await workflow.start(
      ctx,
      internal.studyLifecycleWorkflow.runStudyLifecycle,
      { studyId: args.studyId },
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

    const completionRate = ratio(
      runs.filter((run) => run.status === "success").length,
      runs.length,
    );
    const abandonmentRate = ratio(
      runs.filter((run) => run.status === "gave_up").length,
      runs.length,
    );
    const headlineMetrics = {
      completionRate,
      abandonmentRate,
      medianSteps: median(runs.map((run) => run.stepCount ?? 0)),
      medianDurationSec: median(runs.map((run) => run.durationSec ?? 0)),
    };

    const issueClusterIds = await createPreliminaryIssueClusters(ctx, runs);
    const createdAt = Date.now();
    const reportId = await ctx.db.insert("studyReports", {
      studyId: args.studyId,
      headlineMetrics,
      issueClusterIds,
      segmentBreakdownKey: `study-reports/${args.studyId}/segment-breakdown.json`,
      limitations: [...reportLimitations],
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

async function createPreliminaryIssueClusters(
  ctx: MutationCtx,
  runs: Array<Doc<"runs">>,
) {
  const failingRuns = runs.filter(
    (run) =>
      run.status !== "success" &&
      run.status !== "cancelled",
  );

  if (failingRuns.length === 0) {
    return [] as Id<"issueClusters">[];
  }

  const affectedProtoPersonaIds = uniqueIds(
    failingRuns.map((run) => run.protoPersonaId),
  );
  const representativeRunIds = failingRuns
    .slice(0, 3)
    .map((run) => run._id);
  const evidenceKeys = uniqueStrings(
    failingRuns.flatMap((run) => run.milestoneKeys),
  );
  const severity = deriveClusterSeverity(failingRuns);
  const affectedRunRate = ratio(failingRuns.length, runs.length);
  const clusterId = await ctx.db.insert("issueClusters", {
    studyId: failingRuns[0]!.studyId,
    title: "Preliminary lifecycle findings",
    summary: `The lifecycle workflow observed ${failingRuns.length} non-success terminal run(s) before deep analysis was available.`,
    severity,
    affectedRunCount: failingRuns.length,
    affectedRunRate,
    affectedProtoPersonaIds,
    affectedAxisRanges: [],
    representativeRunIds,
    replayConfidence: 0,
    evidenceKeys,
    recommendation:
      "Review replay results and deeper analysis before prioritizing a fix.",
    confidenceNote:
      "This preliminary cluster is generated from raw terminal outcomes before replay verification.",
    score: affectedRunRate * severityWeight(severity),
  });

  return [clusterId];
}

function deriveClusterSeverity(runs: Array<Doc<"runs">>) {
  if (
    runs.some(
      (run) =>
        run.status === "hard_fail" ||
        run.status === "blocked_by_guardrail" ||
        run.status === "infra_error",
    )
  ) {
    return "major" as const;
  }

  if (runs.some((run) => run.status === "timeout")) {
    return "major" as const;
  }

  if (runs.some((run) => run.status === "gave_up")) {
    return "minor" as const;
  }

  return "cosmetic" as const;
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

function median(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1]! + sorted[middle]!) / 2;
  }

  return sorted[middle]!;
}

function ratio(numerator: number, denominator: number) {
  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
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
