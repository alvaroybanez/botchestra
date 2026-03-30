import { describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import {
  createRunExecutor,
  type AgentAction,
  type BrowserPageSnapshot,
} from "./runExecutor";

type MockActionMethod = "goto" | "click" | "type" | "select" | "scroll" | "wait" | "back";

class MockBrowserPage {
  readonly gotoCalls: string[] = [];
  readonly clickCalls: string[] = [];
  readonly typeCalls: Array<{ selector: string; text: string }> = [];
  readonly selectCalls: Array<{ selector: string; value: string }> = [];
  readonly scrollCalls: number[] = [];
  readonly waitCalls: number[] = [];
  readonly backCalls: number[] = [];
  readonly snapshotCalls: number[] = [];
  readonly screenshotCalls: Array<{ type: "jpeg"; quality: number } | undefined> = [];

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
    this.snapshotCalls.push(this.snapshotCalls.length);
    return structuredClone(this.currentState);
  }

  async screenshot(options?: { type: "jpeg"; quality: number }) {
    this.screenshotCalls.push(options);
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

  async type(selector: string, text: string) {
    this.typeCalls.push({ selector, text });
    this.throwIfConfigured("type");
    this.advanceState();
  }

  async select(selector: string, value: string) {
    this.selectCalls.push({ selector, value });
    this.throwIfConfigured("select");
    this.advanceState();
  }

  async scroll(deltaY = 0) {
    this.scrollCalls.push(deltaY);
    this.throwIfConfigured("scroll");
    this.advanceState();
  }

  async wait(durationMs = 0) {
    this.waitCalls.push(durationMs);
    this.throwIfConfigured("wait");
    this.advanceState();
  }

  async back() {
    this.backCalls.push(this.backCalls.length);
    this.throwIfConfigured("back");
    this.advanceState();
  }

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

function createMockBrowser(pages: MockBrowserPage[]) {
  const contexts: MockBrowserContext[] = [];
  const newContext = vi.fn(async (options: unknown) => {
    const page = pages.shift();

    if (!page) {
      throw new Error(`No mock page configured for context options ${JSON.stringify(options)}`);
    }

    const context = new MockBrowserContext(page);
    contexts.push(context);
    return context;
  });

  return {
    browser: { newContext },
    contexts,
    newContext,
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

function createExecuteRunRequest(
  overrides: Partial<ExecuteRunRequest> = {},
): ExecuteRunRequest {
  return {
    runId: "run_123",
    studyId: "study_123",
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
      postTaskQuestions: ["What was confusing?"],
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

function createPageState(overrides: Partial<BrowserPageSnapshot> = {}): BrowserPageSnapshot {
  return {
    url: "https://shop.example.com/cart",
    title: "Cart",
    visibleText: "Review your cart and continue to checkout",
    interactiveElements: [
      {
        role: "button",
        label: "Continue to checkout",
        selector: "#checkout",
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

describe("runExecutor", () => {
  it("completes a two-step task with SUCCESS", async () => {
    const page = new MockBrowserPage(createPageState(), {
      nextStates: [
        createPageState({
          url: "https://shop.example.com/checkout",
          title: "Checkout",
          visibleText: "Confirm your order",
          pageFingerprint: "checkout-page",
        }),
      ],
    });
    const { browser } = createMockBrowser([page]);
    const leaseClient = createLeaseClient();
    const actions: AgentAction[] = [
      {
        type: "click",
        selector: "#checkout",
        rationale: "Proceed to the checkout page.",
      },
      {
        type: "finish",
        rationale: "The confirmation step is ready to submit.",
      },
    ];
    const runExecutor = createRunExecutor({
      browser,
      leaseClient,
      selectAction: vi.fn(async () => actions.shift() ?? { type: "finish" }),
    });

    const result = await runExecutor.execute(createExecuteRunRequest());

    expect(result).toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
      stepCount: 2,
    });
    expect(page.gotoCalls).toEqual(["https://shop.example.com/cart"]);
    expect(page.clickCalls).toEqual(["#checkout"]);
    expect(leaseClient.release).toHaveBeenCalledWith("lease-1");
  });

  it("fails with MAX_STEPS_EXCEEDED when the agent never finishes", async () => {
    const page = new MockBrowserPage(createPageState());
    const { browser } = createMockBrowser([page]);
    const runExecutor = createRunExecutor({
      browser,
      leaseClient: createLeaseClient(),
      selectAction: vi.fn(async () => ({ type: "wait", durationMs: 25 })),
    });

    const result = await runExecutor.execute(
      createExecuteRunRequest({
        taskSpec: {
          ...createExecuteRunRequest().taskSpec,
          maxSteps: 3,
        },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      errorCode: "MAX_STEPS_EXCEEDED",
      stepCount: 3,
    });
    expect(page.waitCalls).toEqual([25, 25, 25]);
  });

  it("returns ABANDONED when frustration reaches the abort threshold", async () => {
    const page = new MockBrowserPage(createPageState());
    const { browser } = createMockBrowser([page]);
    const runExecutor = createRunExecutor({
      browser,
      leaseClient: createLeaseClient(),
      frustrationPolicy: {
        abortThreshold: 1,
      },
      selectAction: vi.fn(async () => ({ type: "wait" })),
    });

    const result = await runExecutor.execute(createExecuteRunRequest());

    expect(result).toMatchObject({
      ok: true,
      finalOutcome: "ABANDONED",
      stepCount: 2,
    });
  });

  it("blocks forbidden actions with GUARDRAIL_VIOLATION before execution", async () => {
    const page = new MockBrowserPage(createPageState());
    const { browser } = createMockBrowser([page]);
    const runExecutor = createRunExecutor({
      browser,
      leaseClient: createLeaseClient(),
      selectAction: vi.fn(async () => ({
        type: "payment_submission",
        rationale: "Try to submit the order directly.",
      })),
    });

    const result = await runExecutor.execute(
      createExecuteRunRequest({
        taskSpec: {
          ...createExecuteRunRequest().taskSpec,
          forbiddenActions: ["payment_submission"],
        },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      errorCode: "GUARDRAIL_VIOLATION",
      guardrailCode: "FORBIDDEN_ACTION",
      stepCount: 0,
    });
    expect(page.clickCalls).toEqual([]);
    expect(page.typeCalls).toEqual([]);
    expect(page.selectCalls).toEqual([]);
    expect(page.waitCalls).toEqual([]);
  });

  it("blocks out-of-domain navigation before page.goto is called", async () => {
    const page = new MockBrowserPage(createPageState());
    const { browser } = createMockBrowser([page]);
    const runExecutor = createRunExecutor({
      browser,
      leaseClient: createLeaseClient(),
      selectAction: vi.fn(async () => ({
        type: "goto",
        url: "https://evil.example.net/phishing",
      })),
    });

    const result = await runExecutor.execute(createExecuteRunRequest());

    expect(result).toMatchObject({
      ok: false,
      errorCode: "GUARDRAIL_VIOLATION",
      guardrailCode: "DOMAIN_BLOCKED",
      stepCount: 0,
    });
    expect(page.gotoCalls).toEqual(["https://shop.example.com/cart"]);
  });

  it("closes the browser context in finally even when the page throws", async () => {
    const page = new MockBrowserPage(createPageState(), {
      throwOn: {
        click: new Error("button detached"),
      },
    });
    const { browser, contexts } = createMockBrowser([page]);
    const runExecutor = createRunExecutor({
      browser,
      leaseClient: createLeaseClient(),
      selectAction: vi.fn(async () => ({
        type: "click",
        selector: "#checkout",
      })),
    });

    const result = await runExecutor.execute(createExecuteRunRequest());

    expect(result).toMatchObject({
      ok: false,
      errorCode: "BROWSER_ERROR",
    });
    expect(contexts).toHaveLength(1);
    expect(contexts[0]?.close).toHaveBeenCalledTimes(1);
  });

  it("releases the lease in finally even when execution fails", async () => {
    const page = new MockBrowserPage(createPageState(), {
      throwOn: {
        click: new Error("browser crashed"),
      },
    });
    const { browser } = createMockBrowser([page]);
    const leaseClient = createLeaseClient();
    const runExecutor = createRunExecutor({
      browser,
      leaseClient,
      selectAction: vi.fn(async () => ({
        type: "click",
        selector: "#checkout",
      })),
    });

    await runExecutor.execute(createExecuteRunRequest());

    expect(leaseClient.acquire).toHaveBeenCalledTimes(1);
    expect(leaseClient.release).toHaveBeenCalledWith("lease-1");
  });

  it("opens a fresh incognito context for each run", async () => {
    const firstPage = new MockBrowserPage(createPageState());
    const secondPage = new MockBrowserPage(
      createPageState({
        url: "https://shop.example.com/account",
        title: "Account",
        pageFingerprint: "account-page",
      }),
    );
    const { browser, contexts, newContext } = createMockBrowser([firstPage, secondPage]);
    const runExecutor = createRunExecutor({
      browser,
      leaseClient: createLeaseClient(),
      selectAction: vi.fn(async () => ({ type: "finish" })),
    });

    const request = createExecuteRunRequest();
    await runExecutor.execute(request);
    await runExecutor.execute({
      ...request,
      runId: "run_456",
    });

    expect(newContext).toHaveBeenCalledTimes(2);
    expect(newContext).toHaveBeenNthCalledWith(1, {
      locale: "en-US",
      viewport: { width: 1280, height: 720 },
    });
    expect(newContext).toHaveBeenNthCalledWith(2, {
      locale: "en-US",
      viewport: { width: 1280, height: 720 },
    });
    expect(contexts).toHaveLength(2);
    expect(contexts[0]).not.toBe(contexts[1]);
  });

  it("captures the initial page as a start milestone with JPEG screenshots", async () => {
    const page = new MockBrowserPage(createPageState());
    const { browser } = createMockBrowser([page]);
    const onMilestone = vi.fn(async () => undefined);
    const runExecutor = createRunExecutor({
      browser,
      leaseClient: createLeaseClient(),
      onMilestone,
      selectAction: vi.fn(async () => ({ type: "finish", rationale: "The task is complete." })),
    });

    const result = await runExecutor.execute(createExecuteRunRequest());

    expect(result).toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
      stepCount: 1,
    });
    expect(onMilestone).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        stepIndex: 0,
        actionType: "start",
        captureReason: "always",
        url: "https://shop.example.com/cart",
        title: "Cart",
      }),
      expect.any(Uint8Array),
    );
    expect(page.screenshotCalls).toEqual([
      { type: "jpeg", quality: 80 },
      { type: "jpeg", quality: 80 },
    ]);
  });

  it("captures a final terminal milestone when a guardrail violation stops the run", async () => {
    const page = new MockBrowserPage(createPageState());
    const { browser } = createMockBrowser([page]);
    const onMilestone = vi.fn(async () => undefined);
    const runExecutor = createRunExecutor({
      browser,
      leaseClient: createLeaseClient(),
      onMilestone,
      selectAction: vi.fn(async () => ({
        type: "payment_submission",
        rationale: "Try to submit the order directly.",
      })),
    });

    const result = await runExecutor.execute(
      createExecuteRunRequest({
        taskSpec: {
          ...createExecuteRunRequest().taskSpec,
          forbiddenActions: ["payment_submission"],
        },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      errorCode: "GUARDRAIL_VIOLATION",
      stepCount: 0,
    });
    expect(onMilestone).toHaveBeenLastCalledWith(
      expect.objectContaining({
        stepIndex: 0,
        actionType: "guardrail_violation",
        captureReason: "always",
      }),
      expect.any(Uint8Array),
    );
  });

  it("captures a final terminal milestone when the run exceeds max steps", async () => {
    const page = new MockBrowserPage(createPageState());
    const { browser } = createMockBrowser([page]);
    const onMilestone = vi.fn(async () => undefined);
    const runExecutor = createRunExecutor({
      browser,
      leaseClient: createLeaseClient(),
      onMilestone,
      selectAction: vi.fn(async () => ({ type: "wait", durationMs: 25 })),
    });

    const result = await runExecutor.execute(
      createExecuteRunRequest({
        taskSpec: {
          ...createExecuteRunRequest().taskSpec,
          maxSteps: 1,
        },
      }),
    );

    expect(result).toMatchObject({
      ok: false,
      errorCode: "MAX_STEPS_EXCEEDED",
      stepCount: 1,
    });
    expect(onMilestone).toHaveBeenLastCalledWith(
      expect.objectContaining({
        stepIndex: 1,
        actionType: "max_steps_exceeded",
        captureReason: "always",
      }),
      expect.any(Uint8Array),
    );
  });

  it("captures a final terminal milestone when browser execution throws", async () => {
    const page = new MockBrowserPage(createPageState(), {
      throwOn: {
        click: new Error("browser crashed"),
      },
    });
    const { browser } = createMockBrowser([page]);
    const onMilestone = vi.fn(async () => undefined);
    const runExecutor = createRunExecutor({
      browser,
      leaseClient: createLeaseClient(),
      onMilestone,
      selectAction: vi.fn(async () => ({
        type: "click",
        selector: "#checkout",
      })),
    });

    const result = await runExecutor.execute(createExecuteRunRequest());

    expect(result).toMatchObject({
      ok: false,
      errorCode: "BROWSER_ERROR",
    });
    expect(onMilestone).toHaveBeenLastCalledWith(
      expect.objectContaining({
        stepIndex: 0,
        actionType: "browser_error",
        captureReason: "always",
      }),
      expect.any(Uint8Array),
    );
  });
});
