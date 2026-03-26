import { describe, expect, it, vi } from "vitest";
import {
  RunProgressUpdateSchema,
  type ExecuteRunRequest,
} from "@botchestra/shared";
import worker, { createWorker } from "./index";
import {
  RUN_FAILURE_ERROR_CODES,
  createProgressReporterFromRequest,
} from "./progressReporter";
import { generateSelfReport } from "./selfReport";

const executionContext = {} as ExecutionContext;
const env = { CALLBACK_SIGNING_SECRET: "test-callback-secret" };

type FetchMock = {
  calls: Array<{ input: RequestInfo | URL; init?: RequestInit }>;
  fetch: typeof fetch;
};

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createCallbackToken(runId: string, secret: string, exp = Date.now() + 60_000) {
  const payload = encodeBase64Url(JSON.stringify({ runId, exp }));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return `${payload}.${encodeBase64Url(String.fromCharCode(...new Uint8Array(signature)))}`;
}

async function createArtifactUrl(
  artifactKey: string,
  secret: string,
  expires = Date.now() + 60_000,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${artifactKey}:${expires}`),
  );

  return `https://example.com/artifacts/${encodeURIComponent(
    artifactKey,
  )}?expires=${expires}&signature=${encodeBase64Url(
    String.fromCharCode(...new Uint8Array(signature)),
  )}`;
}

async function createValidExecuteRunRequest(overrides: Partial<ExecuteRunRequest> = {}) {
  const base: ExecuteRunRequest = {
    runId: "run_abc123",
    studyId: "study_xyz789",
    personaVariant: {
      id: "pv_001",
      personaPackId: "pp_001",
      protoPersonaId: "proto_001",
      axisValues: { techSavviness: 0.8, patience: -0.3 },
      edgeScore: 0.75,
      tensionSeed: "Frustrated by slow loading times",
      firstPersonBio:
        "I'm a 34-year-old software engineer who hates waiting for pages to load.",
      behaviorRules: ["Always try keyboard shortcuts first", "Abandon after 3 failed attempts"],
      coherenceScore: 0.92,
      distinctnessScore: 0.85,
      accepted: true,
    },
    taskSpec: {
      scenario: "Complete a checkout flow",
      goal: "Purchase a single item using saved payment method",
      startingUrl: "https://staging.example.com/shop",
      allowedDomains: ["staging.example.com"],
      allowedActions: ["goto", "click", "type", "scroll", "finish"],
      forbiddenActions: ["payment_submission", "email_send"],
      successCriteria: ["Order confirmation page displayed"],
      stopConditions: ["Order confirmed", "Cart empty after checkout attempt"],
      postTaskQuestions: [
        "Did you feel the checkout was straightforward?",
        "What was the hardest part?",
      ],
      maxSteps: 50,
      maxDurationSec: 300,
      environmentLabel: "staging",
      locale: "en-US",
      viewport: { width: 1280, height: 720 },
    },
    callbackToken: "",
    callbackBaseUrl: "https://convex.example.com",
  };

  const runId = overrides.runId ?? base.runId;

  return {
    ...base,
    ...overrides,
    callbackToken:
      overrides.callbackToken ?? (await createCallbackToken(runId, env.CALLBACK_SIGNING_SECRET)),
  };
}

function getPostedUpdate(fetchMock: FetchMock) {
  const body = fetchMock.calls[0]?.init?.body;

  if (typeof body !== "string") {
    throw new Error("expected progress callback body to be a JSON string");
  }

  return JSON.parse(body);
}

function createFetchMock(): FetchMock {
  const calls: FetchMock["calls"] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(null, { status: 204 });
  }) as unknown as typeof globalThis.fetch;

  return { calls, fetch };
}

describe("browser executor worker entry point", () => {
  it("returns 200 for POST /health", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/health", { method: "POST" }),
      env,
      executionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("serves stored artifacts for GET /artifacts/:key", async () => {
    const artifactBody = new TextEncoder().encode("artifact body");
    const artifactWorker = createWorker();
    const requestUrl = await createArtifactUrl(
      "runs/run_abc123/manifest.json",
      env.CALLBACK_SIGNING_SECRET,
    );
    const response = await artifactWorker.fetch(
      new Request(requestUrl),
      {
        ...env,
        ARTIFACTS: {
          get: vi.fn(async () => ({
            arrayBuffer: async () => artifactBody.buffer,
            httpMetadata: { contentType: "application/json" },
          })),
          put: vi.fn(),
        },
      },
      executionContext,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json");
    await expect(response.text()).resolves.toBe("artifact body");
  });

  it("returns 404 when an artifact key is missing from storage", async () => {
    const artifactWorker = createWorker();
    const requestUrl = await createArtifactUrl(
      "runs/missing/manifest.json",
      env.CALLBACK_SIGNING_SECRET,
    );
    const response = await artifactWorker.fetch(
      new Request(requestUrl),
      {
        ...env,
        ARTIFACTS: {
          get: vi.fn(async () => null),
          put: vi.fn(),
        },
      },
      executionContext,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it("returns 401 for GET /artifacts/:key with an invalid signature", async () => {
    const artifactWorker = createWorker();
    const response = await artifactWorker.fetch(
      new Request(
        "https://example.com/artifacts/runs%2Frun_abc123%2Fmanifest.json?expires=1770000000000&signature=bad-signature",
      ),
      {
        ...env,
        ARTIFACTS: {
          get: vi.fn(async () => null),
          put: vi.fn(),
        },
      },
      executionContext,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_artifact_signature",
    });
  });

  it("dispatches valid POST /execute-run requests to the handler", async () => {
    const validExecuteRunRequest = await createValidExecuteRunRequest();
    const executeRun = vi.fn(async (request: ExecuteRunRequest) =>
      Response.json(
        {
          status: "accepted",
          runId: request.runId,
          studyId: request.studyId,
        },
        { status: 202 },
      ));
    const workerWithExecuteRun = createWorker({ executeRun });
    const response = await workerWithExecuteRun.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validExecuteRunRequest),
      }),
      env,
      executionContext,
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({
      status: "accepted",
      runId: validExecuteRunRequest.runId,
      studyId: validExecuteRunRequest.studyId,
    });
    expect(executeRun).toHaveBeenCalledWith(validExecuteRunRequest, env);
  });

  it.each([
    ["missing required fields", {}],
    ["missing taskSpec", { runId: "run_abc123", studyId: "study_xyz789" }],
    [
      "invalid taskSpec.maxSteps",
      async () => {
        const payload = await createValidExecuteRunRequest();
        return {
          ...payload,
          taskSpec: {
            ...payload.taskSpec,
            maxSteps: 0,
          },
        };
      },
    ],
  ])("returns 400 for POST /execute-run with %s", async (_label, input) => {
    const body = typeof input === "function" ? await input() : input;
    const response = await worker.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      env,
      executionContext,
    );

    expect(response.status).toBe(400);
    const payload = (await response.json()) as {
      error: string;
      issues: Array<{ path: string; message: string }>;
    };
    expect(payload.error).toBe("invalid_request");
    expect(payload.issues.length).toBeGreaterThan(0);
  });

  it("returns 400 for POST /execute-run with invalid JSON", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{not valid json",
      }),
      env,
      executionContext,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_json" });
  });

  it("returns 401 for POST /execute-run with an invalid callback token", async () => {
    const validExecuteRunRequest = await createValidExecuteRunRequest({
      callbackToken: await createCallbackToken("other_run", env.CALLBACK_SIGNING_SECRET),
    });

    const response = await worker.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validExecuteRunRequest),
      }),
      env,
      executionContext,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "invalid_callback_token" });
  });

  it("reports the completion callback body after a successful execute-run", async () => {
    const callbackFetch = createFetchMock();
    const workerWithProgressReporter = createWorker({
      executeRun: async (executeRunRequest) => {
        const progressReporter = createProgressReporterFromRequest(executeRunRequest, {
          fetch: callbackFetch.fetch,
        });

        await progressReporter.sendCompletion({
          finalOutcome: "SUCCESS",
          stepCount: 2,
          durationSec: 8.4,
          frustrationCount: 1,
          artifactManifestKey: `runs/${executeRunRequest.runId}/manifest.json`,
        });

        return Response.json({ finalOutcome: "SUCCESS" }, { status: 200 });
      },
    });
    const validExecuteRunRequest = await createValidExecuteRunRequest();

    const response = await workerWithProgressReporter.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validExecuteRunRequest),
      }),
      env,
      executionContext,
    );

    expect(response.status).toBe(200);
    expect(callbackFetch.calls).toHaveLength(1);

    const callbackBody = getPostedUpdate(callbackFetch);
    expect(RunProgressUpdateSchema.safeParse(callbackBody).success).toBe(true);
    expect(callbackBody).toEqual({
      runId: validExecuteRunRequest.runId,
      eventType: "completion",
      payload: {
        finalOutcome: "SUCCESS",
        stepCount: 2,
        durationSec: 8.4,
        frustrationCount: 1,
        artifactManifestKey: `runs/${validExecuteRunRequest.runId}/manifest.json`,
      },
    });
  });

  it("includes a generated selfReport keyed to postTaskQuestions in the completion callback", async () => {
    const callbackFetch = createFetchMock();
    const workerWithSelfReport = createWorker({
      executeRun: async (executeRunRequest) => {
        const progressReporter = createProgressReporterFromRequest(executeRunRequest, {
          fetch: callbackFetch.fetch,
        });
        const selfReport = await generateSelfReport({
          request: executeRunRequest,
          result: {
            ok: true,
            finalOutcome: "SUCCESS",
            stepCount: 2,
            durationSec: 8.4,
            frustrationCount: 1,
            milestones: [
              {
                stepIndex: 1,
                url: "https://staging.example.com/checkout",
                title: "Checkout",
                actionType: "click",
                rationaleShort: "Selected checkout",
                captureReason: "always",
              },
            ],
          },
          generateText: async () => ({
            text: JSON.stringify({
              perceivedSuccess: true,
              hardestPart: "Finding the checkout CTA",
              confusion: "The shipping step looked optional at first.",
              confidence: 0.86,
              suggestedChange: "Make the checkout CTA more prominent.",
              answers: {
                "Did you feel the checkout was straightforward?": true,
                "What was the hardest part?": "Finding the checkout CTA",
              },
            }),
          }),
        });

        await progressReporter.sendCompletion({
          finalOutcome: "SUCCESS",
          stepCount: 2,
          durationSec: 8.4,
          frustrationCount: 1,
          selfReport,
        });

        return Response.json({ finalOutcome: "SUCCESS" }, { status: 200 });
      },
    });
    const validExecuteRunRequest = await createValidExecuteRunRequest();

    const response = await workerWithSelfReport.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validExecuteRunRequest),
      }),
      env,
      executionContext,
    );

    expect(response.status).toBe(200);
    expect(callbackFetch.calls).toHaveLength(1);

    const callbackBody = getPostedUpdate(callbackFetch);
    expect(callbackBody.payload.selfReport).toEqual({
      perceivedSuccess: true,
      hardestPart: "Finding the checkout CTA",
      confusion: "The shipping step looked optional at first.",
      confidence: 0.86,
      suggestedChange: "Make the checkout CTA more prominent.",
      answers: {
        "Did you feel the checkout was straightforward?": true,
        "What was the hardest part?": "Finding the checkout CTA",
      },
    });
  });

  it.each(RUN_FAILURE_ERROR_CODES)("reports failure callback bodies for %s", async (errorCode) => {
    const callbackFetch = createFetchMock();
    const workerWithProgressReporter = createWorker({
      executeRun: async (executeRunRequest) => {
        const progressReporter = createProgressReporterFromRequest(executeRunRequest, {
          fetch: callbackFetch.fetch,
        });

        await progressReporter.sendFailure({
          errorCode,
          message: `${errorCode} occurred`,
        });

        return Response.json({ errorCode }, { status: 500 });
      },
    });
    const validExecuteRunRequest = await createValidExecuteRunRequest();

    const response = await workerWithProgressReporter.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validExecuteRunRequest),
      }),
      env,
      executionContext,
    );

    expect(response.status).toBe(500);
    expect(callbackFetch.calls).toHaveLength(1);

    const callbackBody = getPostedUpdate(callbackFetch);
    expect(RunProgressUpdateSchema.safeParse(callbackBody).success).toBe(true);
    expect(callbackBody).toEqual({
      runId: validExecuteRunRequest.runId,
      eventType: "failure",
      payload: {
        errorCode,
        message: `${errorCode} occurred`,
      },
    });
  });

  it.each([
    ["GET", "https://example.com/health"],
    ["POST", "https://example.com/foo"],
    ["GET", "https://example.com/"],
  ])("returns 404 for %s %s", async (method, url) => {
    const response = await worker.fetch(
      new Request(url, { method }),
      env,
      executionContext,
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });
});
