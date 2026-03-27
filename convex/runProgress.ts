import { ConvexError, v } from "convex/values";
import { z } from "zod";

import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";

const runMilestoneArgsSchema = z.object({
  runId: z.string(),
  stepIndex: z.number().int().nonnegative(),
  url: z.string().url(),
  title: z.string(),
  actionType: z.string(),
  rationaleShort: z.string(),
  screenshotKey: z.string().optional(),
});

const runMilestoneArgsValidator = {
  runId: v.id("runs"),
  stepIndex: v.number(),
  url: v.string(),
  title: v.string(),
  actionType: v.string(),
  rationaleShort: v.string(),
  screenshotKey: v.optional(v.string()),
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

export const recordRunHeartbeat = internalMutation({
  args: {
    runId: v.id("runs"),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    const parsedArgs = z
      .object({
        runId: z.string(),
        timestamp: z.number(),
      })
      .parse(args);
    const run = await getRunById(ctx, parsedArgs.runId as Id<"runs">);

    if (isCallbackClosed(run.status)) {
      return {
        run,
        shouldStop: false,
      };
    }

    await ctx.db.patch(parsedArgs.runId as Id<"runs">, {
      lastHeartbeatAt: parsedArgs.timestamp,
    });
    await ctx.runMutation(internal.costControls.evaluateStudyCostControls, {
      studyId: run.studyId,
      observedAt: parsedArgs.timestamp,
    });

    const updatedRun = await getRunById(ctx, parsedArgs.runId as Id<"runs">);

    return {
      run: updatedRun,
      shouldStop: updatedRun.cancellationRequestedAt !== undefined,
    };
  },
});

export const appendRunMilestone = internalMutation({
  args: runMilestoneArgsValidator,
  handler: async (ctx, args) => {
    const parsedArgs = runMilestoneArgsSchema.parse(args);
    const run = await getRunById(ctx, parsedArgs.runId as Id<"runs">);

    if (isCallbackClosed(run.status)) {
      return null;
    }

    const existingMilestone = await ctx.db
      .query("runMilestones")
      .withIndex("by_runId_and_stepIndex", (q) =>
        q.eq("runId", parsedArgs.runId as Id<"runs">).eq("stepIndex", parsedArgs.stepIndex),
      )
      .unique();

    if (existingMilestone !== null) {
      return existingMilestone;
    }

    const milestoneId = await ctx.db.insert("runMilestones", {
      runId: parsedArgs.runId as Id<"runs">,
      studyId: run.studyId,
      stepIndex: parsedArgs.stepIndex,
      timestamp: Date.now(),
      url: parsedArgs.url,
      title: parsedArgs.title,
      actionType: parsedArgs.actionType,
      rationaleShort: parsedArgs.rationaleShort,
      ...(parsedArgs.screenshotKey !== undefined
        ? { screenshotKey: parsedArgs.screenshotKey }
        : {}),
    });

    if (
      parsedArgs.screenshotKey !== undefined &&
      !run.milestoneKeys.includes(parsedArgs.screenshotKey)
    ) {
      await ctx.db.patch(parsedArgs.runId as Id<"runs">, {
        milestoneKeys: [...run.milestoneKeys, parsedArgs.screenshotKey],
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
