import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import { generateWithModel } from "@botchestra/ai";
import type { ObservationBundle } from "./observationBuilder";
import type { BrowserPageSnapshot, SelectActionInput } from "./runExecutor";
import { createAiActionSelector } from "./aiActionSelector";

vi.mock("@botchestra/ai", () => ({
  generateWithModel: vi.fn(),
}));

const mockedGenerateWithModel = vi.mocked(generateWithModel);

function mockTextResult(text: string) {
  return {
    text,
  } as unknown as Awaited<ReturnType<typeof generateWithModel>>;
}

function createRequest(overrides: Partial<ExecuteRunRequest> = {}): ExecuteRunRequest {
  return {
    runId: "run_validation",
    studyId: "study_validation",
    personaVariant: {
      id: "variant_123",
      personaConfigId: "config_123",
      syntheticUserId: "user_123",
      axisValues: {
        techSavviness: 0.4,
      },
      edgeScore: 0.4,
      tensionSeed: "I do not want to get lost.",
      firstPersonBio: "I prefer safe and obvious interactions.",
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
      allowedActions: ["goto", "click", "type", "select", "scroll", "wait", "finish", "abort"],
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
    interactiveElements: [
      {
        role: "button",
        label: "Continue to checkout",
        ref: "@e1",
        selector: "#checkout",
      },
    ],
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
    interactiveElementSummary: 'button "Continue to checkout" [@e1] (#checkout)',
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
    stepIndex: 0,
    page: createPage(),
    observation: createObservation(),
    actionHistory: [],
    ...overrides,
  };
}

describe("aiActionSelector action validation", () => {
  beforeEach(() => {
    mockedGenerateWithModel.mockReset();
  });

  it("accepts ref-based targeting without requiring a selector", async () => {
    mockedGenerateWithModel.mockResolvedValue(mockTextResult(JSON.stringify({
      type: "click",
      ref: "@e1",
      rationale: "Use the primary checkout control.",
    })));

    const selectAction = createAiActionSelector();

    await expect(selectAction(createInput())).resolves.toEqual({
      type: "click",
      ref: "@e1",
      rationale: "Use the primary checkout control.",
    });
  });

  it("returns a safe wait action when the model response is malformed JSON", async () => {
    mockedGenerateWithModel.mockResolvedValue(mockTextResult("{type: click, selector: #checkout}"));

    const selectAction = createAiActionSelector();

    await expect(selectAction(createInput())).resolves.toEqual({
      type: "wait",
      durationMs: 250,
      rationale: expect.stringContaining("malformed"),
    });
  });

  it.each([
    ["goto", { type: "goto" }],
    ["click", { type: "click" }],
    ["click_missing_target", { type: "click" }],
    ["type_missing_selector", { type: "type", text: "Maya Torres" }],
    ["type_missing_target", { type: "type", text: "Maya Torres" }],
    ["type_missing_text", { type: "type", selector: "#name" }],
    ["select_missing_selector", { type: "select", value: "express" }],
    ["select_missing_target", { type: "select", value: "express" }],
    ["select_missing_value", { type: "select", selector: "#shipping-speed" }],
  ])("falls back safely when %s is missing required fields", async (_caseName, payload) => {
    mockedGenerateWithModel.mockResolvedValue(mockTextResult(JSON.stringify({
      ...payload,
      rationale: "Try the next step.",
    })));

    const selectAction = createAiActionSelector();

    await expect(selectAction(createInput())).resolves.toEqual({
      type: "wait",
      durationMs: 250,
      rationale: expect.stringContaining("missing"),
    });
  });

  it("falls back to finish when no safe exploratory action is allowed", async () => {
    mockedGenerateWithModel.mockResolvedValue(mockTextResult(JSON.stringify({
      type: "click",
      rationale: "Press the next button.",
    })));

    const selectAction = createAiActionSelector();

    await expect(
      selectAction(
        createInput({
          request: createRequest({
            taskSpec: {
              ...createRequest().taskSpec,
              allowedActions: ["finish"],
            },
          }),
        }),
      ),
    ).resolves.toEqual({
      type: "finish",
      rationale: expect.stringContaining("missing"),
    });
  });
});
