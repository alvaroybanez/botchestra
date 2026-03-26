import { httpRouter } from "convex/server";
import { RunProgressUpdateSchema } from "@botchestra/shared";

import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { auth } from "./auth";
import {
  callbackSelfReportSchema,
  getCallbackSigningSecret,
  mapCompletionOutcomeToRunStatus,
  mapFailureCodeToRunStatus,
  validateCallbackToken,
} from "./runProgress";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/api/run-progress",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authorizationHeader = request.headers.get("authorization");
    const callbackToken = authorizationHeader?.startsWith("Bearer ")
      ? authorizationHeader.slice("Bearer ".length).trim()
      : null;

    if (!callbackToken) {
      return Response.json({ error: "invalid_callback_token" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "invalid_json" }, { status: 400 });
    }

    const parseResult = RunProgressUpdateSchema.safeParse(body);
    if (!parseResult.success) {
      return Response.json(
        {
          error: "invalid_request",
          issues: parseResult.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    }

    const secret = getCallbackSigningSecret();
    if (!secret) {
      return Response.json({ error: "misconfigured_callback_secret" }, { status: 500 });
    }

    const tokenValidation = await validateCallbackToken(
      callbackToken,
      secret,
      parseResult.data.runId,
    );
    if (!tokenValidation.ok) {
      return Response.json({ error: "invalid_callback_token" }, { status: 401 });
    }

    switch (parseResult.data.eventType) {
      case "heartbeat":
        const heartbeatAck = await ctx.runMutation(internal.runProgress.recordRunHeartbeat, {
          runId: parseResult.data.runId as never,
          timestamp: parseResult.data.payload.timestamp,
        });
        return Response.json(
          { ok: true, shouldStop: heartbeatAck.shouldStop },
          { status: 200 },
        );

      case "milestone":
        await ctx.runMutation(internal.runProgress.appendRunMilestone, {
          runId: parseResult.data.runId as never,
          ...parseResult.data.payload,
        });
        return Response.json({ ok: true }, { status: 200 });

      case "completion": {
        const selfReport =
          parseResult.data.payload.selfReport === undefined
            ? undefined
            : callbackSelfReportSchema.parse(parseResult.data.payload.selfReport);

        await ctx.runMutation(internal.runs.settleRunFromCallback, {
          runId: parseResult.data.runId as never,
          nextStatus: mapCompletionOutcomeToRunStatus(
            parseResult.data.payload.finalOutcome,
          ),
          patch: {
            endedAt: Date.now(),
            finalOutcome: parseResult.data.payload.finalOutcome,
            stepCount: parseResult.data.payload.stepCount,
            durationSec: parseResult.data.payload.durationSec,
            frustrationCount: parseResult.data.payload.frustrationCount,
            ...(selfReport !== undefined ? { selfReport } : {}),
            ...(parseResult.data.payload.artifactManifestKey !== undefined
              ? { artifactManifestKey: parseResult.data.payload.artifactManifestKey }
              : {}),
          },
        });
        return Response.json({ ok: true }, { status: 200 });
      }

      case "failure": {
        const selfReport =
          parseResult.data.payload.selfReport === undefined
            ? undefined
            : callbackSelfReportSchema.parse(parseResult.data.payload.selfReport);

        await ctx.runMutation(internal.runs.settleRunFromCallback, {
          runId: parseResult.data.runId as never,
          nextStatus: mapFailureCodeToRunStatus(parseResult.data.payload.errorCode),
          patch: {
            endedAt: Date.now(),
            finalOutcome: "FAILED",
            errorCode: parseResult.data.payload.errorCode,
            errorMessage: parseResult.data.payload.message,
            ...(selfReport !== undefined ? { selfReport } : {}),
          },
        });
        return Response.json({ ok: true }, { status: 200 });
      }
    }
  }),
});

export default http;
