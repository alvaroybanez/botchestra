import { ConvexError } from "convex/values";
import { NoOp } from "convex-helpers/server/customFunctions";
import { zCustomMutation, zid } from "convex-helpers/server/zod";
import { z } from "zod";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation } from "./_generated/server";

const zInternalMutation = zCustomMutation(internalMutation, NoOp);

const runMilestoneArgsSchema = {
  runId: zid("runs"),
  stepIndex: z.number().int().nonnegative(),
  url: z.string().url(),
  title: z.string(),
  actionType: z.string(),
  rationaleShort: z.string(),
  screenshotKey: z.string().optional(),
};

const SELF_REPORT_ANSWER_SCHEMA = z.union([z.string(), z.number(), z.boolean()]);

const selfReportSchema = z.object({
  perceivedSuccess: z.boolean(),
  hardestPart: z.string().optional(),
  confusion: z.string().optional(),
  confidence: z.number().optional(),
  suggestedChange: z.string().optional(),
  answers: z.record(SELF_REPORT_ANSWER_SCHEMA).optional(),
});

export const recordRunHeartbeat = zInternalMutation({
  args: {
    runId: zid("runs"),
    timestamp: z.number(),
  },
  handler: async (ctx, args) => {
    const run = await getRunById(ctx, args.runId);

    if (isCallbackClosed(run.status)) {
      return {
        run,
        shouldStop: false,
      };
    }

    await ctx.db.patch(args.runId, {
      lastHeartbeatAt: args.timestamp,
    });

    const updatedRun = await getRunById(ctx, args.runId);

    return {
      run: updatedRun,
      shouldStop: updatedRun.cancellationRequestedAt !== undefined,
    };
  },
});

export const appendRunMilestone = zInternalMutation({
  args: runMilestoneArgsSchema,
  handler: async (ctx, args) => {
    const run = await getRunById(ctx, args.runId);

    if (isCallbackClosed(run.status)) {
      return null;
    }

    const existingMilestone = await ctx.db
      .query("runMilestones")
      .withIndex("by_runId_and_stepIndex", (q) =>
        q.eq("runId", args.runId).eq("stepIndex", args.stepIndex),
      )
      .unique();

    if (existingMilestone !== null) {
      return existingMilestone;
    }

    const milestoneId = await ctx.db.insert("runMilestones", {
      runId: args.runId,
      studyId: run.studyId,
      stepIndex: args.stepIndex,
      timestamp: Date.now(),
      url: args.url,
      title: args.title,
      actionType: args.actionType,
      rationaleShort: args.rationaleShort,
      ...(args.screenshotKey !== undefined ? { screenshotKey: args.screenshotKey } : {}),
    });

    if (
      args.screenshotKey !== undefined &&
      !run.milestoneKeys.includes(args.screenshotKey)
    ) {
      await ctx.db.patch(args.runId, {
        milestoneKeys: [...run.milestoneKeys, args.screenshotKey],
      });
    }

    return await ctx.db.get(milestoneId);
  },
});

export function mapCompletionOutcomeToRunStatus(finalOutcome: string) {
  switch (finalOutcome) {
    case "SUCCESS":
      return "success" as const;
    case "ABANDONED":
      return "gave_up" as const;
    default:
      return "hard_fail" as const;
  }
}

export function mapFailureCodeToRunStatus(errorCode: string) {
  switch (errorCode) {
    case "MAX_STEPS_EXCEEDED":
    case "MAX_DURATION_EXCEEDED":
      return "timeout" as const;
    case "GUARDRAIL_VIOLATION":
      return "blocked_by_guardrail" as const;
    case "LEASE_UNAVAILABLE":
    case "BROWSER_ERROR":
    default:
      return "infra_error" as const;
  }
}

export function getCallbackSigningSecret() {
  return process.env.CALLBACK_SIGNING_SECRET;
}

export async function validateCallbackToken(
  token: string,
  secret: string,
  expectedRunId: string,
) {
  const [encodedPayload, encodedSignature] = token.split(".");

  if (!encodedPayload || !encodedSignature) {
    return { ok: false as const };
  }

  try {
    const payloadJson = new TextDecoder().decode(decodeBase64Url(encodedPayload));
    const payload = callbackTokenPayloadSchema.parse(JSON.parse(payloadJson));

    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );

    const signatureIsValid = await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64Url(encodedSignature),
      new TextEncoder().encode(encodedPayload),
    );

    if (!signatureIsValid) {
      return { ok: false as const };
    }

    if (payload.runId !== expectedRunId || payload.exp <= Date.now()) {
      return { ok: false as const };
    }

    return { ok: true as const, payload };
  } catch {
    return { ok: false as const };
  }
}

export const callbackSelfReportSchema = selfReportSchema;

const callbackTokenPayloadSchema = z.object({
  runId: z.string(),
  exp: z.number(),
});

function decodeBase64Url(value: string) {
  const padded = value
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");

  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isCallbackClosed(status: RunStatus) {
  return (
    status === "cancelled" ||
    status === "success" ||
    status === "hard_fail" ||
    status === "soft_fail" ||
    status === "gave_up" ||
    status === "timeout" ||
    status === "blocked_by_guardrail" ||
    status === "infra_error"
  );
}

async function getRunById(ctx: MutationCtx, runId: Id<"runs">) {
  const run = await ctx.db.get(runId);

  if (run === null) {
    throw new ConvexError("Run not found.");
  }

  return run;
}

type RunStatus =
  | "queued"
  | "dispatching"
  | "running"
  | "success"
  | "hard_fail"
  | "soft_fail"
  | "gave_up"
  | "timeout"
  | "blocked_by_guardrail"
  | "infra_error"
  | "cancelled";
