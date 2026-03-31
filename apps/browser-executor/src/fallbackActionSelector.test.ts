import { describe, expect, it } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import type { ObservationBundle } from "./observationBuilder";
import type { BrowserPageSnapshot, SelectActionInput } from "./runExecutor";
import { createFallbackActionSelector } from "./fallbackActionSelector";

function createRequest(overrides: Partial<ExecuteRunRequest> = {}): ExecuteRunRequest {
  return {
    runId: "run_fallback",
    studyId: "study_fallback",
    personaVariant: {
      id: "variant_123",
      personaConfigId: "config_123",
      syntheticUserId: "user_123",
      axisValues: {},
      edgeScore: 0.4,
      tensionSeed: "I do not want to get lost.",
      firstPersonBio: "I prefer safe interactions.",
      behaviorRules: ["Avoid risky or unclear interactions."],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    },
    taskSpec: {
      scenario: "Try to progress through checkout.",
      goal: "Make safe progress.",
      startingUrl: "https://shop.example.com/cart",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["click", "scroll", "wait", "finish", "abort"],
      forbiddenActions: [],
      successCriteria: ["Reach checkout"],
      stopConditions: [],
      postTaskQuestions: [],
      maxSteps: 6,
      maxDurationSec: 180,
      environmentLabel: "staging",
      locale: "en-US",
      viewport: { width: 1280, height: 720 },
    },
    callbackToken: "unused",
    callbackBaseUrl: "https://convex.example.com",
    ...overrides,
  };
}

function createPage(overrides: Partial<BrowserPageSnapshot> = {}): BrowserPageSnapshot {
  return {
    url: "https://shop.example.com/cart",
    title: "Cart",
    visibleText: "Continue to checkout when you are ready.",
    interactiveElements: [],
    pageFingerprint: "cart",
    branchOptions: [],
    isMajorBranchDecision: false,
    navigationError: null,
    httpStatus: 200,
    deadEnd: false,
    agentNotes: null,
    ...overrides,
  };
}

function createObservation(overrides: Partial<ObservationBundle> = {}): ObservationBundle {
  return {
    currentUrl: "https://shop.example.com/cart",
    pageTitle: "Cart",
    visibleTextExcerpt: "Continue to checkout when you are ready.",
    interactiveElementSummary: "No interactive elements summarized.",
    recentActionHistory: "No prior actions recorded.",
    taskProgressSummary: "Step 1 of 6. Goal: Make safe progress.",
    text: "URL: https://shop.example.com/cart",
    tokenCount: 8,
    truncated: false,
    ...overrides,
  };
}

function createInput(overrides: Partial<SelectActionInput> = {}): SelectActionInput {
  return {
    request: createRequest(),
    stepIndex: 1,
    page: createPage(),
    observation: createObservation(),
    actionHistory: [],
    ...overrides,
  };
}

describe("fallbackActionSelector", () => {
  it("clicks the first interactive element when click is allowed and a selector is available", async () => {
    const selectAction = createFallbackActionSelector();

    await expect(
      selectAction(
        createInput({
          stepIndex: 0,
          page: createPage({
            interactiveElements: [
              {
                role: "button",
                label: "Continue to checkout",
                selector: "#checkout",
              },
            ],
          }),
        }),
      ),
    ).resolves.toEqual({
      type: "click",
      selector: "#checkout",
      rationale: 'Try the prominent "Continue to checkout" control first.',
    });
  });

  it("uses scroll instead of emitting goto/type/select without required fields", async () => {
    const selectAction = createFallbackActionSelector();

    await expect(
      selectAction(
        createInput({
          request: createRequest({
            taskSpec: {
              ...createRequest().taskSpec,
              allowedActions: ["goto", "type", "select", "scroll"],
            },
          }),
        }),
      ),
    ).resolves.toEqual({
      type: "scroll",
      durationMs: 300,
      rationale: "Reveal more of the page.",
    });
  });

  it("uses wait when only wait is safely available", async () => {
    const selectAction = createFallbackActionSelector();

    await expect(
      selectAction(
        createInput({
          request: createRequest({
            taskSpec: {
              ...createRequest().taskSpec,
              allowedActions: ["type", "wait"],
            },
          }),
        }),
      ),
    ).resolves.toEqual({
      type: "wait",
      durationMs: 250,
      rationale: "Pause briefly to observe the page.",
    });
  });

  it("returns abort when no safe allowed action can be derived", async () => {
    const selectAction = createFallbackActionSelector();

    await expect(
      selectAction(
        createInput({
          request: createRequest({
            taskSpec: {
              ...createRequest().taskSpec,
              allowedActions: ["goto", "type", "select"],
            },
          }),
        }),
      ),
    ).resolves.toEqual({
      type: "abort",
      rationale: "No safe fallback action is available.",
    });
  });
});
