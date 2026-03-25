import { describe, expect, it } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import worker from "./index";

const executionContext = {} as ExecutionContext;
const env = { CALLBACK_SIGNING_SECRET: "test-callback-secret" };

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

  it("dispatches valid POST /execute-run requests to the handler", async () => {
    const validExecuteRunRequest = await createValidExecuteRunRequest();
    const response = await worker.fetch(
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
