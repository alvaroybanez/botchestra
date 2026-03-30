import { describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import { generateSelfReport } from "./selfReport";
import type { RunExecutionResult } from "./runExecutor";

function createExecuteRunRequest(
  overrides: Partial<ExecuteRunRequest> = {},
): ExecuteRunRequest {
  return {
    runId: "run_self_report",
    studyId: "study_self_report",
    personaVariant: {
      id: "variant_123",
      personaConfigId: "pack_123",
      syntheticUserId: "proto_123",
      axisValues: { confidence: -0.2 },
      edgeScore: 0.4,
      tensionSeed: "I worry about making mistakes during checkout.",
      firstPersonBio: "I am a cautious shopper who double-checks each step.",
      behaviorRules: ["Prefer visible navigation affordances"],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    },
    taskSpec: {
      scenario: "Buy a product",
      goal: "Complete the checkout flow",
      startingUrl: "https://shop.example.com/cart",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["goto", "click", "type", "select", "scroll", "wait", "back", "finish", "abort"],
      forbiddenActions: [],
      successCriteria: ["Order confirmation is visible"],
      stopConditions: ["Order confirmed"],
      postTaskQuestions: [
        "Do you think you completed the task?",
        "What was the hardest part?",
        "What would you change?",
      ],
      maxSteps: 4,
      maxDurationSec: 120,
      environmentLabel: "staging",
      locale: "en-US",
      viewport: { width: 1280, height: 720 },
    },
    callbackToken: "unused",
    callbackBaseUrl: "https://convex.example.com",
    ...overrides,
  };
}

function createResult(overrides: Partial<RunExecutionResult> = {}): RunExecutionResult {
  return {
    ok: true,
    finalOutcome: "SUCCESS",
    stepCount: 2,
    durationSec: 8.4,
    frustrationCount: 1,
    milestones: [
      {
        stepIndex: 1,
        url: "https://shop.example.com/checkout",
        title: "Checkout",
        actionType: "click",
        rationaleShort: "Selected checkout",
        captureReason: "always",
      },
    ],
    ...overrides,
  } as RunExecutionResult;
}

describe("generateSelfReport", () => {
  it("returns LLM-generated answers keyed to the task's postTaskQuestions", async () => {
    const request = createExecuteRunRequest();
    const selfReport = await generateSelfReport({
      request,
      result: createResult(),
      generateText: vi.fn(async () => ({
        text: JSON.stringify({
          perceivedSuccess: true,
          hardestPart: "Finding the checkout button",
          confusion: "The shipping step looked optional at first.",
          confidence: 0.82,
          suggestedChange: "Make the checkout CTA more prominent.",
          answers: {
            "Do you think you completed the task?": true,
            "What was the hardest part?": "Finding the checkout button",
            "What would you change?": "Make the checkout CTA more prominent.",
          },
        }),
      })),
    });

    expect(selfReport).toEqual({
      perceivedSuccess: true,
      hardestPart: "Finding the checkout button",
      confusion: "The shipping step looked optional at first.",
      confidence: 0.82,
      suggestedChange: "Make the checkout CTA more prominent.",
      answers: {
        "Do you think you completed the task?": true,
        "What was the hardest part?": "Finding the checkout button",
        "What would you change?": "Make the checkout CTA more prominent.",
      },
    });
  });

  it("falls back to deterministic answers when the LLM response is invalid", async () => {
    const request = createExecuteRunRequest();
    const result = createResult({
      ok: false,
      finalOutcome: "FAILED",
      errorCode: "BROWSER_ERROR",
      message: "Browser crashed",
    });

    const selfReport = await generateSelfReport({
      request,
      result,
      generateText: vi.fn(async () => ({ text: "{not valid json" })),
    });

    expect(selfReport.perceivedSuccess).toBe(false);
    expect(selfReport.confusion).toContain("Browser crashed");
    expect(Object.keys(selfReport.answers)).toEqual(request.taskSpec.postTaskQuestions);
    expect(selfReport.answers["Do you think you completed the task?"]).toBe(false);
    expect(selfReport.answers["What was the hardest part?"]).toContain("Browser crashed");
  });
});
