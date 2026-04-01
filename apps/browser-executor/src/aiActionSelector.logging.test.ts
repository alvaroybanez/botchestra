import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import type { BrowserPageSnapshot, SelectActionInput } from "./runExecutor";
import {
  createAiActionSelector,
  createAiActionSelectorWithFallback,
} from "./aiActionSelector";

function createRequest(): ExecuteRunRequest {
  return {
    runId: "run_ai_logging",
    studyId: "study_ai_logging",
    personaVariant: {
      id: "variant_ai_logging",
      personaConfigId: "config_ai_logging",
      syntheticUserId: "user_ai_logging",
      axisValues: { techSavviness: 0.6 },
      edgeScore: 0.4,
      tensionSeed: "I want to avoid mistakes.",
      firstPersonBio: "I am a cautious shopper.",
      behaviorRules: ["Prefer obvious buttons"],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    },
    taskSpec: {
      scenario: "Complete checkout",
      goal: "Finish the purchase",
      startingUrl: "https://shop.example.com/cart",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["click", "wait", "finish", "abort", "goto", "type", "select", "scroll", "back"],
      forbiddenActions: [],
      successCriteria: ["Confirmation is visible"],
      stopConditions: ["Task complete"],
      postTaskQuestions: [],
      maxSteps: 4,
      maxDurationSec: 60,
      environmentLabel: "staging",
      locale: "en-US",
      viewport: { width: 1280, height: 720 },
    },
    callbackToken: "unused",
    callbackBaseUrl: "https://convex.example.com",
  };
}

function createPage(): BrowserPageSnapshot {
  return {
    url: "https://shop.example.com/cart",
    title: "Cart",
    visibleText: "Continue to checkout",
    interactiveElements: [{ role: "button", label: "Checkout", selector: "#checkout" }],
    pageFingerprint: "cart",
    branchOptions: [],
    isMajorBranchDecision: false,
    navigationError: null,
    httpStatus: 200,
    deadEnd: false,
    agentNotes: null,
  };
}

function createInput(overrides: Partial<SelectActionInput> = {}): SelectActionInput {
  return {
    request: createRequest(),
    stepIndex: 1,
    page: createPage(),
    observation: {
      currentUrl: "https://shop.example.com/cart",
      pageTitle: "Cart",
      visibleTextExcerpt: "Continue to checkout",
      interactiveElementSummary: 'button "Checkout" (#checkout)',
      recentActionHistory: "No prior actions recorded.",
      taskProgressSummary: "Step 2 of 4. Goal: Finish the purchase.",
      text: "Cart page with a checkout button.",
      tokenCount: 12,
      truncated: false,
    },
    actionHistory: [],
    ...overrides,
  };
}

function parseEvents(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.map(([value]) => JSON.parse(String(value)) as Record<string, unknown>);
}

describe("aiActionSelector structured logging", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  beforeAll(() => {
    logSpy.mockImplementation(() => undefined);
  });

  beforeEach(() => {
    logSpy.mockClear();
  });

  afterAll(() => {
    logSpy.mockRestore();
  });

  it("logs AI request metadata and truncated response summaries", async () => {
    const longRationale = "a".repeat(700);
    const selectAction = createAiActionSelector({
      generateAction: async () => ({
        text: JSON.stringify({
          type: "click",
          selector: "#checkout",
          rationale: longRationale,
        }),
      }),
    });

    await expect(selectAction(createInput())).resolves.toMatchObject({
      type: "click",
      selector: "#checkout",
    });

    const events = parseEvents(logSpy);
    const responseEvent = events.find((event) => event.event === "ai.response");

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "ai.select",
        runId: "run_ai_logging",
        step: 1,
        model: "action",
      }),
    ]));
    expect(responseEvent).toMatchObject({
      event: "ai.response",
      runId: "run_ai_logging",
      step: 1,
      parsedAction: {
        type: "click",
        selector: "#checkout",
      },
    });
    expect(String(responseEvent?.rawResponsePreview)).toHaveLength(503);
  });

  it("logs parse recovery when the model returns malformed JSON", async () => {
    const selectAction = createAiActionSelector({
      generateAction: async () => ({ text: "{ definitely not valid json" }),
    });

    await expect(selectAction(createInput())).resolves.toMatchObject({
      type: "wait",
    });

    const events = parseEvents(logSpy);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "ai.recovery",
        runId: "run_ai_logging",
        step: 1,
      }),
    ]));
  });

  it("logs timeouts and wrapper fallback usage", async () => {
    const selectAction = createAiActionSelectorWithFallback({
      timeoutMs: 5,
      generateAction: ({ abortSignal }) => new Promise((_resolve, reject) => {
        abortSignal?.addEventListener("abort", () => {
          reject(abortSignal.reason ?? new Error("aborted"));
        }, { once: true });
      }),
    });

    await expect(selectAction(createInput())).resolves.toMatchObject({
      type: "finish",
    });

    const events = parseEvents(logSpy);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "ai.timeout",
        runId: "run_ai_logging",
        step: 1,
      }),
      expect.objectContaining({
        event: "ai.fallback",
        runId: "run_ai_logging",
        step: 1,
        reason: "AI action selection timed out after 5ms",
      }),
    ]));
  });
});
