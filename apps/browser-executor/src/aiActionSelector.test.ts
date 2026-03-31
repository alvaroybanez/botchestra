import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import { generateWithModel } from "@botchestra/ai";
import type { ObservationActionHistoryEntry, ObservationBundle } from "./observationBuilder";
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

function createRequest(
  overrides: Partial<ExecuteRunRequest> = {},
): ExecuteRunRequest {
  return {
    runId: "run_123",
    studyId: "study_123",
    personaVariant: {
      id: "variant_123",
      personaConfigId: "config_123",
      syntheticUserId: "user_123",
      axisValues: {
        techSavviness: 0.2,
        patience: 0.7,
      },
      edgeScore: 0.4,
      tensionSeed: "I do not want to get lost or break anything.",
      firstPersonBio: "I am a careful online shopper who prefers obvious UI.",
      behaviorRules: [
        "Prefer visible, clearly labeled actions.",
        "Avoid risky or unclear interactions.",
      ],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    },
    taskSpec: {
      scenario: "Find the checkout page and complete the shipping form.",
      goal: "Advance through checkout without making mistakes.",
      startingUrl: "https://shop.example.com/cart",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["goto", "click", "type", "select", "scroll", "wait", "back", "finish", "abort"],
      forbiddenActions: [],
      successCriteria: [
        "Reach the shipping step",
        "Fill the shipping form with persona details",
        "Stop when the confirmation page is visible",
      ],
      stopConditions: ["Confirmation page is visible"],
      postTaskQuestions: ["What felt confusing?"],
      maxSteps: 8,
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

function createPage(
  overrides: Partial<BrowserPageSnapshot> = {},
): BrowserPageSnapshot {
  return {
    url: "https://shop.example.com/cart",
    title: "Your Cart",
    visibleText: "Your cart is ready. Continue to checkout to enter shipping details.",
    interactiveElements: [
      {
        role: "button",
        label: "Continue to checkout",
        selector: "#checkout",
      },
      {
        role: "link",
        label: "View help",
        selector: "a[href='/help']",
      },
    ],
    pageFingerprint: "cart-page",
    branchOptions: [],
    isMajorBranchDecision: false,
    navigationError: null,
    httpStatus: 200,
    deadEnd: false,
    agentNotes: null,
    ...overrides,
  };
}

function createObservation(
  overrides: Partial<ObservationBundle> = {},
): ObservationBundle {
  return {
    currentUrl: "https://shop.example.com/cart",
    pageTitle: "Your Cart",
    visibleTextExcerpt: "Your cart is ready. Continue to checkout to enter shipping details.",
    interactiveElementSummary:
      'button "Continue to checkout" (#checkout); link "View help" (a[href="/help"])',
    recentActionHistory: "No prior actions recorded.",
    taskProgressSummary:
      "Step 1 of 8. Goal: Advance through checkout without making mistakes. No milestones completed yet.",
    text: [
      "URL: https://shop.example.com/cart",
      "Title: Your Cart",
      "Visible text: Your cart is ready. Continue to checkout to enter shipping details.",
      'Interactive elements: button "Continue to checkout" (#checkout); link "View help" (a[href="/help"])',
      "Recent actions: No prior actions recorded.",
      "Task progress: Step 1 of 8. Goal: Advance through checkout without making mistakes.",
    ].join("\n"),
    tokenCount: 44,
    truncated: false,
    ...overrides,
  };
}

function createActionHistory(
  overrides: Partial<ObservationActionHistoryEntry>[] = [],
): readonly ObservationActionHistoryEntry[] {
  return [
    {
      stepIndex: 0,
      actionType: "click",
      target: "#cart",
      outcome: "Stayed on the cart page.",
      ...overrides[0],
    },
    {
      stepIndex: 1,
      actionType: "scroll",
      target: null,
      outcome: "Revealed the checkout button.",
      ...overrides[1],
    },
  ];
}

function createInput(overrides: Partial<SelectActionInput> = {}): SelectActionInput {
  return {
    request: createRequest(),
    stepIndex: 2,
    page: createPage(),
    observation: createObservation(),
    actionHistory: createActionHistory(),
    ...overrides,
  };
}

describe("aiActionSelector", () => {
  beforeEach(() => {
    mockedGenerateWithModel.mockReset();
  });

  it("builds persona-aware prompts and returns a navigation action", async () => {
    mockedGenerateWithModel.mockResolvedValue({
      text: JSON.stringify({
        type: "click",
        selector: "#checkout",
        rationale: "The checkout button is the clearest way to advance toward the shipping step.",
      }),
    } as unknown as Awaited<ReturnType<typeof generateWithModel>>);

    const selectAction = createAiActionSelector();
    const action = await selectAction(createInput());

    expect(action).toEqual({
      type: "click",
      selector: "#checkout",
      rationale: "The checkout button is the clearest way to advance toward the shipping step.",
    });
    expect(mockedGenerateWithModel).toHaveBeenCalledWith(
      "action",
      expect.objectContaining({
        system: expect.stringContaining("I am a careful online shopper who prefers obvious UI."),
        prompt: expect.stringContaining("Continue to checkout"),
      }),
    );

    const [_, options] = mockedGenerateWithModel.mock.calls[0]!;
    expect(options.system).toContain("techSavviness");
    expect(options.system).toContain("Advance through checkout without making mistakes.");
    expect(options.system).toContain("Reach the shipping step");
    expect(options.prompt).toContain("Recent actions");
    expect(options.prompt).toContain("#1 click #cart");
    expect(options.prompt).toContain("Step 3 of 8");
  });

  it("returns a form-filling action with persona-authentic text", async () => {
    mockedGenerateWithModel.mockResolvedValue(mockTextResult(JSON.stringify({
      type: "type",
      selector: "#shipping-name",
      text: "Maya Torres",
      rationale: "Enter the shopper name exactly as the persona would provide it to continue checkout.",
    })));

    const selectAction = createAiActionSelector();
    const action = await selectAction(createInput({
      page: createPage({
        url: "https://shop.example.com/checkout/shipping",
        title: "Shipping",
        visibleText: "Enter your shipping information.",
        interactiveElements: [
          {
            role: "textbox",
            label: "Full name",
            selector: "#shipping-name",
          },
        ],
      }),
      observation: createObservation({
        currentUrl: "https://shop.example.com/checkout/shipping",
        pageTitle: "Shipping",
        visibleTextExcerpt: "Enter your shipping information.",
      }),
    }));

    expect(action).toEqual({
      type: "type",
      selector: "#shipping-name",
      text: "Maya Torres",
      rationale: "Enter the shopper name exactly as the persona would provide it to continue checkout.",
    });
  });

  it("returns finish when the model recognizes the success criteria are met", async () => {
    mockedGenerateWithModel.mockResolvedValue(mockTextResult(JSON.stringify({
      type: "finish",
      rationale: "The confirmation page is visible, which satisfies the success criteria.",
    })));

    const selectAction = createAiActionSelector();
    const action = await selectAction(createInput({
      page: createPage({
        url: "https://shop.example.com/checkout/confirmation",
        title: "Order confirmed",
        visibleText: "Thank you. Your order is confirmed.",
      }),
      observation: createObservation({
        currentUrl: "https://shop.example.com/checkout/confirmation",
        pageTitle: "Order confirmed",
        visibleTextExcerpt: "Thank you. Your order is confirmed.",
      }),
    }));

    expect(action).toEqual({
      type: "finish",
      rationale: "The confirmation page is visible, which satisfies the success criteria.",
    });
  });

  it("lets persona axis values influence the selected action", async () => {
    mockedGenerateWithModel.mockImplementation(async (_category, options) => {
      if (options.system?.includes('"techSavviness": 0.95')) {
        return {
          text: JSON.stringify({
            type: "click",
            selector: "#express-checkout",
            rationale: "A highly tech-savvy shopper will use the express checkout shortcut.",
          }),
        } as unknown as Awaited<ReturnType<typeof generateWithModel>>;
      }

      return {
        text: JSON.stringify({
          type: "click",
          selector: "#checkout",
          rationale: "A less tech-savvy shopper prefers the clearly labeled standard checkout path.",
        }),
      } as unknown as Awaited<ReturnType<typeof generateWithModel>>;
    });

    const selectAction = createAiActionSelector();

    const cautiousAction = await selectAction(createInput({
      request: createRequest({
        personaVariant: {
          ...createRequest().personaVariant,
          axisValues: { techSavviness: 0.15, patience: 0.8 },
        },
      }),
      page: createPage({
        interactiveElements: [
          { role: "button", label: "Standard checkout", selector: "#checkout" },
          { role: "button", label: "Express checkout", selector: "#express-checkout" },
        ],
      }),
    }));
    const savvyAction = await selectAction(createInput({
      request: createRequest({
        personaVariant: {
          ...createRequest().personaVariant,
          axisValues: { techSavviness: 0.95, patience: 0.3 },
        },
      }),
      page: createPage({
        interactiveElements: [
          { role: "button", label: "Standard checkout", selector: "#checkout" },
          { role: "button", label: "Express checkout", selector: "#express-checkout" },
        ],
      }),
    }));

    expect(cautiousAction.selector).toBe("#checkout");
    expect(savvyAction.selector).toBe("#express-checkout");
    expect(cautiousAction.rationale).not.toEqual(savvyAction.rationale);
  });

  it("returns a safe fallback action when the model response is not valid JSON", async () => {
    mockedGenerateWithModel.mockResolvedValue(mockTextResult(
      "{type: click, selector: #checkout, rationale: definitely not json}",
    ));

    const selectAction = createAiActionSelector();

    await expect(selectAction(createInput())).resolves.toEqual({
      type: "wait",
      durationMs: 250,
      rationale: "Model response was malformed JSON, so a safe fallback wait action was used.",
    });
    expect(mockedGenerateWithModel).toHaveBeenCalledTimes(1);
  });

  it("maps disallowed action types to a safe allowed default", async () => {
    mockedGenerateWithModel.mockResolvedValue(mockTextResult(JSON.stringify({
      type: "type",
      selector: "#shipping-name",
      text: "Maya Torres",
      rationale: "Fill the shipping form immediately.",
    })));

    const selectAction = createAiActionSelector();
    const action = await selectAction(createInput({
      request: createRequest({
        taskSpec: {
          ...createRequest().taskSpec,
          allowedActions: ["click", "finish"],
        },
      }),
    }));

    expect(action).toEqual({
      type: "finish",
      rationale: expect.stringContaining("safe fallback"),
    });
  });
});
