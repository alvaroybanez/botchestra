import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import { generateWithModel } from "@botchestra/ai";
import {
  createAiActionSelector,
  createAiActionSelectorWithFallback,
} from "./aiActionSelector";
import { createExecuteRunHandler } from "./executeRunHandler";
import type {
  AgentAction,
  BrowserLike,
  BrowserPageSnapshot,
  SelectActionInput,
} from "./runExecutor";
import { createRunExecutor } from "./runExecutor";

vi.mock("@botchestra/ai", () => ({
  generateWithModel: vi.fn(),
}));

const mockedGenerateWithModel = vi.mocked(generateWithModel);

type MockActionMethod = "goto" | "click" | "type" | "select" | "scroll" | "wait" | "back";

class MockBrowserPage {
  readonly gotoCalls: string[] = [];
  readonly clickCalls: string[] = [];

  private currentState: BrowserPageSnapshot;

  constructor(
    initialState: BrowserPageSnapshot,
    private readonly options: {
      nextStates?: BrowserPageSnapshot[];
      throwOn?: Partial<Record<MockActionMethod, Error>>;
    } = {},
  ) {
    this.currentState = structuredClone(initialState);
  }

  async snapshot() {
    return structuredClone(this.currentState);
  }

  async screenshot(_options?: { type: "jpeg"; quality: number }) {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  }

  async goto(url: string) {
    this.gotoCalls.push(url);
    this.throwIfConfigured("goto");
    this.currentState = {
      ...this.currentState,
      url,
    };
    this.advanceState();
  }

  async click(selector: string) {
    this.clickCalls.push(selector);
    this.throwIfConfigured("click");
    this.advanceState();
  }

  async type(_selector: string, _text: string) {}

  async select(_selector: string, _value: string) {}

  async scroll(_deltaY = 0) {}

  async wait(_durationMs = 0) {}

  async back() {}

  private advanceState() {
    const nextState = this.options.nextStates?.shift();
    if (nextState) {
      this.currentState = structuredClone(nextState);
    }
  }

  private throwIfConfigured(method: MockActionMethod) {
    const error = this.options.throwOn?.[method];
    if (error) {
      throw error;
    }
  }
}

class MockBrowserContext {
  readonly close = vi.fn(async () => undefined);
  readonly newPage = vi.fn(async () => this.page);

  constructor(readonly page: MockBrowserPage) {}
}

function createMockBrowser(page: MockBrowserPage): {
  browser: BrowserLike;
  context: MockBrowserContext;
} {
  const context = new MockBrowserContext(page);

  return {
    browser: {
      newContext: vi.fn(async () => context),
    },
    context,
  };
}

function createLeaseClient() {
  let leaseCounter = 0;

  return {
    acquire: vi.fn(async () => {
      leaseCounter += 1;
      return {
        ok: true as const,
        leaseId: `lease-${leaseCounter}`,
      };
    }),
    release: vi.fn(async () => undefined),
  };
}

function createRequest(overrides: Partial<ExecuteRunRequest> = {}): ExecuteRunRequest {
  return {
    runId: "run_safety",
    studyId: "study_safety",
    personaVariant: {
      id: "variant_123",
      personaConfigId: "config_123",
      syntheticUserId: "user_123",
      axisValues: {
        techSavviness: 0.4,
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
      maxSteps: 4,
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

function createPageState(overrides: Partial<BrowserPageSnapshot> = {}): BrowserPageSnapshot {
  return {
    url: "https://shop.example.com/cart",
    title: "Cart",
    visibleText: "Review your cart and continue to checkout.",
    interactiveElements: [
      {
        role: "button",
        label: "Continue to checkout",
        selector: "#checkout",
      },
      {
        role: "link",
        label: "Need help?",
        selector: "#help",
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

function createInput(overrides: Partial<SelectActionInput> = {}): SelectActionInput {
  const request = overrides.request ?? createRequest();

  return {
    request,
    stepIndex: 0,
    page: createPageState(),
    observation: {
      currentUrl: "https://shop.example.com/cart",
      pageTitle: "Cart",
      visibleTextExcerpt: "Review your cart and continue to checkout.",
      interactiveElementSummary: 'button "Continue to checkout" (#checkout)',
      recentActionHistory: "No prior actions recorded.",
      taskProgressSummary:
        "Step 1 of 4. Goal: Advance through checkout without making mistakes. No milestones completed yet.",
      text: [
        "URL: https://shop.example.com/cart",
        "Title: Cart",
        "Visible text: Review your cart and continue to checkout.",
        'Interactive elements: button "Continue to checkout" (#checkout)',
      ].join("\n"),
      tokenCount: 24,
      truncated: false,
    },
    actionHistory: [],
    ...overrides,
  };
}

describe("aiActionSelector safety wiring", () => {
  beforeEach(() => {
    mockedGenerateWithModel.mockReset();
  });

  it("falls back and completes the run when the default AI selector throws", async () => {
    mockedGenerateWithModel.mockRejectedValue(new Error("LLM unavailable"));

    const page = new MockBrowserPage(createPageState(), {
      nextStates: [
        createPageState({
          url: "https://shop.example.com/checkout",
          title: "Checkout",
          visibleText: "Shipping details",
        }),
      ],
    });
    const { browser, context } = createMockBrowser(page);
    const leaseClient = createLeaseClient();
    const handler = createExecuteRunHandler({
      browser,
      leaseClient,
      fetch: vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch,
      generateSelfReport: vi.fn(async () => ({
        perceivedSuccess: true,
        answers: {},
      })),
    });

    const response = await handler(createRequest(), {});

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
      stepCount: 2,
    });
    expect(page.gotoCalls).toEqual(["https://shop.example.com/cart"]);
    expect(page.clickCalls).toEqual(["#checkout"]);
    expect(mockedGenerateWithModel).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(leaseClient.release).toHaveBeenCalledWith("lease-1");
  });

  it("falls back within the timeout budget when the AI selector stalls", async () => {
    const aborted = vi.fn();
    const selectAction = createAiActionSelectorWithFallback({
      timeoutMs: 5,
      generateAction: ({ abortSignal }) => new Promise((_resolve, reject) => {
        abortSignal?.addEventListener("abort", () => {
          aborted();
          reject(abortSignal.reason ?? new Error("aborted"));
        }, { once: true });
      }),
    });

    const startedAt = Date.now();
    const action = await selectAction(createInput());
    const elapsedMs = Date.now() - startedAt;

    expect(aborted).toHaveBeenCalledTimes(1);
    expect(elapsedMs).toBeLessThan(100);
    expect(action).toEqual({
      type: "click",
      selector: "#checkout",
      rationale: 'Try the prominent "Continue to checkout" control first.',
    });
  });

  it("surfaces FORBIDDEN_ACTION when the AI selector returns a forbidden action", async () => {
    const page = new MockBrowserPage(createPageState());
    const { browser } = createMockBrowser(page);
    const runExecutor = createRunExecutor({
      browser,
      leaseClient: createLeaseClient(),
      selectAction: createAiActionSelector({
        generateAction: async () => ({
          text: JSON.stringify({
            type: "payment_submission",
            rationale: "Submit the payment right away.",
          }),
        }),
      }),
    });

    const result = await runExecutor.execute(createRequest({
      taskSpec: {
        ...createRequest().taskSpec,
        forbiddenActions: ["payment_submission"],
      },
    }));

    expect(result).toMatchObject({
      ok: false,
      errorCode: "GUARDRAIL_VIOLATION",
      guardrailCode: "FORBIDDEN_ACTION",
      stepCount: 0,
    });
    expect(page.clickCalls).toEqual([]);
  });

  it("surfaces DOMAIN_BLOCKED when the AI selector returns goto for a blocked domain", async () => {
    const page = new MockBrowserPage(createPageState());
    const { browser } = createMockBrowser(page);
    const runExecutor = createRunExecutor({
      browser,
      leaseClient: createLeaseClient(),
      selectAction: createAiActionSelector({
        generateAction: async () => ({
          text: JSON.stringify({
            type: "goto",
            url: "https://evil.example.net/phishing",
            rationale: "Navigate directly to the checkout shortcut.",
          }),
        }),
      }),
    });

    const result = await runExecutor.execute(createRequest());

    expect(result).toMatchObject({
      ok: false,
      errorCode: "GUARDRAIL_VIOLATION",
      guardrailCode: "DOMAIN_BLOCKED",
      stepCount: 0,
    });
    expect(page.gotoCalls).toEqual(["https://shop.example.com/cart"]);
  });

  it("never returns an action outside taskSpec.allowedActions", async () => {
    const selectAction = createAiActionSelectorWithFallback({
      generateAction: async () => ({
        text: JSON.stringify({
          type: "goto",
          url: "https://shop.example.com/checkout",
          rationale: "Jump straight to checkout.",
        }),
      }),
    });
    const request = createRequest({
      taskSpec: {
        ...createRequest().taskSpec,
        allowedActions: ["click", "finish"],
      },
    });

    const action = await selectAction(createInput({ request }));

    expect(request.taskSpec.allowedActions).toContain(action.type as AgentAction["type"]);
    expect(action).toEqual({
      type: "finish",
      rationale: expect.stringContaining("safe fallback"),
    });
  });
});
