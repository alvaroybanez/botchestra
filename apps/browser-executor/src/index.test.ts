import { describe, expect, it } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import worker from "./index";

const executionContext = {} as ExecutionContext;
const env = {};

const validExecuteRunRequest: ExecuteRunRequest = {
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
  callbackToken: "signed-token-abc",
  callbackBaseUrl: "https://convex.example.com",
};

describe("browser executor worker stub", () => {
  it("returns 200 for POST /health", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/health", { method: "POST" }),
      env,
      executionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns 501 for POST /execute-run with a valid request body", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validExecuteRunRequest),
      }),
      env,
      executionContext,
    );

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({ error: "not_implemented" });
  });

  it("returns 501 for POST /execute-run with an invalid request body", async () => {
    const response = await worker.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      }),
      env,
      executionContext,
    );

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toEqual({ error: "not_implemented" });
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
