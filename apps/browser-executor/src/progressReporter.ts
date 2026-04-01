import {
  RunProgressUpdateSchema,
  type ExecuteRunRequest,
  type RunProgressUpdate,
} from "@botchestra/shared";
import { redactSecrets, type MaskableSecret } from "./guardrails";
import { logStructured, logStructuredError } from "./structuredLogger";

export const RUN_FAILURE_ERROR_CODES = [
  "LEASE_UNAVAILABLE",
  "MAX_STEPS_EXCEEDED",
  "MAX_DURATION_EXCEEDED",
  "GUARDRAIL_VIOLATION",
  "BROWSER_ERROR",
] as const;

export type RunFailureErrorCode = (typeof RUN_FAILURE_ERROR_CODES)[number];

type FetchLike = typeof fetch;

type ProgressReporterOptions = {
  runId: string;
  callbackBaseUrl: string;
  callbackToken: string;
  fetch?: FetchLike;
  secretValues?: readonly MaskableSecret[];
};

type ProgressReporterRequest = Pick<ExecuteRunRequest, "runId" | "callbackBaseUrl" | "callbackToken">;

type RunProgressPayload<TEventType extends RunProgressUpdate["eventType"]> = Extract<
  RunProgressUpdate,
  { eventType: TEventType }
>["payload"];

type FailurePayload = Omit<RunProgressPayload<"failure">, "errorCode"> & {
  errorCode: RunFailureErrorCode;
};

function getProgressCallbackUrl(callbackBaseUrl: string) {
  return new URL("/api/run-progress", callbackBaseUrl).toString();
}

function getFetchImplementation(fetchImplementation?: FetchLike) {
  if (fetchImplementation) {
    return fetchImplementation;
  }

  if (typeof globalThis.fetch !== "function") {
    throw new Error("Global fetch is unavailable for progress reporting");
  }

  return globalThis.fetch.bind(globalThis);
}

function toValidationMessage(update: RunProgressUpdate) {
  return `Invalid run progress update: ${update.eventType}`;
}

function validateRunProgressUpdate(update: RunProgressUpdate) {
  const result = RunProgressUpdateSchema.safeParse(update);

  if (!result.success) {
    throw new Error(toValidationMessage(update));
  }

  return result.data;
}

async function postUpdate(
  fetchImplementation: FetchLike,
  callbackUrl: string,
  callbackToken: string,
  update: RunProgressUpdate,
  secretValues: readonly MaskableSecret[],
) {
  try {
    const validatedUpdate = validateRunProgressUpdate(redactSecrets(update, secretValues));
    const response = await fetchImplementation(callbackUrl, {
      method: "POST",
      headers: {
        authorization: `Bearer ${callbackToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(validatedUpdate),
    });

    if (!response.ok) {
      throw new Error(`Run progress callback failed with status ${response.status}`);
    }

    logStructured("callback.sent", update.runId, {
      type: update.eventType,
      status: response.status,
    });

    return response;
  } catch (error) {
    logStructuredError("callback.error", update.runId, error, {
      type: update.eventType,
    });
    throw error;
  }
}

async function parseHeartbeatShouldStop(response: Response, runId: string) {
  try {
    const body = await response.json() as { shouldStop?: unknown };
    return body.shouldStop === true;
  } catch (error) {
    logStructuredError("callback.error", runId, error, {
      type: "heartbeat",
      status: response.status,
    });
    return false;
  }
}

export function createProgressReporter(options: ProgressReporterOptions) {
  const fetchImplementation = getFetchImplementation(options.fetch);
  const callbackUrl = getProgressCallbackUrl(options.callbackBaseUrl);

  return {
    callbackUrl,
    async sendHeartbeat(payload: Partial<RunProgressPayload<"heartbeat">> = {}) {
      const response = await postUpdate(fetchImplementation, callbackUrl, options.callbackToken, {
        runId: options.runId,
        eventType: "heartbeat",
        payload: {
          timestamp: payload.timestamp ?? Date.now(),
        },
      }, options.secretValues ?? []);

      return parseHeartbeatShouldStop(response, options.runId);
    },
    sendMilestone(payload: RunProgressPayload<"milestone">) {
      return postUpdate(fetchImplementation, callbackUrl, options.callbackToken, {
        runId: options.runId,
        eventType: "milestone",
        payload,
      }, options.secretValues ?? []);
    },
    sendCompletion(payload: RunProgressPayload<"completion">) {
      return postUpdate(fetchImplementation, callbackUrl, options.callbackToken, {
        runId: options.runId,
        eventType: "completion",
        payload,
      }, options.secretValues ?? []);
    },
    sendFailure(payload: FailurePayload) {
      return postUpdate(fetchImplementation, callbackUrl, options.callbackToken, {
        runId: options.runId,
        eventType: "failure",
        payload,
      }, options.secretValues ?? []);
    },
  };
}

export function createProgressReporterFromRequest(
  request: ProgressReporterRequest,
  options: Pick<ProgressReporterOptions, "fetch" | "secretValues"> = {},
) {
  return createProgressReporter({
    runId: request.runId,
    callbackBaseUrl: request.callbackBaseUrl,
    callbackToken: request.callbackToken,
    fetch: options.fetch,
    secretValues: options.secretValues,
  });
}

export type ProgressReporter = ReturnType<typeof createProgressReporter>;
