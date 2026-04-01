import { describe, expect, it, vi, beforeEach, afterAll } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import {
  createRunExecutor,
  type AgentAction,
  type BrowserPageSnapshot,
} from "./runExecutor";

class MockBrowserPage {
  private currentState: BrowserPageSnapshot;

  constructor(
    initialState: BrowserPageSnapshot,
    private readonly options: {
      throwOnClick?: Error;
    } = {},
  ) {
    this.currentState = structuredClone(initialState);
  }

  async snapshot() {
    return structuredClone(this.currentState);
  }

  async screenshot() {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  }

  async goto(url: string) {
    this.currentState = {
      ...this.currentState,
      url,
    };
  }

  async click(_selector: string) {
    if (this.options.throwOnClick) {
      throw this.options.throwOnClick;
    }
  }

  async type(_selector: string, _text: string) {}

  async select(_selector: string, _value: string) {}

  async scroll(_deltaY = 0) {}

  async wait(_durationMs = 0) {}

  async back() {}
}

function createBrowser(page: MockBrowserPage) {
  return {
    newContext: vi.fn(async () => ({
      newPage: vi.fn(async () => page),
      close: vi.fn(async () => undefined),
    })),
  };
}

function createLeaseClient() {
  return {
    acquire: vi.fn(async () => ({ ok: true as const, leaseId: "lease-1" })),
    release: vi.fn(async () => undefined),
  };
}

function createRequest(): ExecuteRunRequest {
  return {
    runId: "run_logging",
    studyId: "study_logging",
    personaVariant: {
      id: "variant_logging",
      personaConfigId: "config_logging",
      syntheticUserId: "user_logging",
      axisValues: { patience: 0.5 },
      edgeScore: 0.5,
      tensionSeed: "I do not want to make mistakes.",
      firstPersonBio: "I am careful and slow.",
      behaviorRules: ["Prefer obvious choices"],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    },
    taskSpec: {
      scenario: "Complete checkout",
      goal: "Finish the flow",
      startingUrl: "https://shop.example.com/cart",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["click", "wait", "finish", "abort", "goto", "type", "select", "scroll", "back"],
      forbiddenActions: [],
      successCriteria: ["Confirmation page visible"],
      stopConditions: ["Task complete"],
      postTaskQuestions: ["Did you finish?"],
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

function createPageState(): BrowserPageSnapshot {
  return {
    url: "https://shop.example.com/cart",
    title: "Cart",
    visibleText: "Review your cart",
    interactiveElements: [{ role: "button", label: "Checkout", selector: "#checkout" }],
    pageFingerprint: "cart-page",
    branchOptions: [],
    isMajorBranchDecision: false,
    navigationError: null,
    httpStatus: 200,
    deadEnd: false,
    agentNotes: null,
  };
}

function parseEvents(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.map(([value]) => JSON.parse(String(value)) as Record<string, unknown>);
}

describe("runExecutor structured logging", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  beforeEach(() => {
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  afterAll(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("logs run lifecycle, step decisions, heartbeat acknowledgements, and frustration events", async () => {
    const page = new MockBrowserPage(createPageState());
    const runExecutor = createRunExecutor({
      browser: createBrowser(page),
      leaseClient: createLeaseClient(),
      sendHeartbeat: vi.fn(async () => false),
      frustrationPolicy: { abortThreshold: 1 },
      selectAction: vi.fn(async () => ({ type: "wait", durationMs: 100, rationale: "Pause and reassess." })),
    });

    const result = await runExecutor.execute(createRequest());
    const events = parseEvents(logSpy);

    expect(result).toMatchObject({
      ok: true,
      finalOutcome: "ABANDONED",
      stepCount: 2,
    });
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "run.start",
        runId: "run_logging",
        personaVariantId: "variant_logging",
      }),
      expect.objectContaining({
        event: "run.lease",
        runId: "run_logging",
        success: true,
        leaseId: "lease-1",
      }),
      expect.objectContaining({
        event: "run.heartbeat",
        runId: "run_logging",
        shouldStop: false,
      }),
      expect.objectContaining({
        event: "step.begin",
        runId: "run_logging",
        step: 0,
        interactiveElementCount: 1,
      }),
      expect.objectContaining({
        event: "step.action",
        runId: "run_logging",
        step: 0,
        actionType: "wait",
      }),
      expect.objectContaining({
        event: "step.result",
        runId: "run_logging",
        step: 0,
        newUrl: "https://shop.example.com/cart",
        newTitle: "Cart",
      }),
      expect.objectContaining({
        event: "step.frustration",
        runId: "run_logging",
        step: 1,
      }),
      expect.objectContaining({
        event: "run.end",
        runId: "run_logging",
        outcome: "ABANDONED",
        exitReason: "frustration_abort",
      }),
    ]));
    expect((events.find((event) => event.event === "step.frustration")?.events as unknown[]).length).toBeGreaterThan(0);
  });

  it("logs step execution failures and the top-level browser error", async () => {
    const page = new MockBrowserPage(createPageState(), {
      throwOnClick: new Error("button detached"),
    });
    const runExecutor = createRunExecutor({
      browser: createBrowser(page),
      leaseClient: createLeaseClient(),
      selectAction: vi.fn(async (): Promise<AgentAction> => ({
        type: "click",
        selector: "#checkout",
        rationale: "Try the checkout button.",
      })),
    });

    const result = await runExecutor.execute(createRequest());
    const logEvents = parseEvents(logSpy);
    const errorEvents = parseEvents(errorSpy);

    expect(result).toMatchObject({
      ok: false,
      errorCode: "BROWSER_ERROR",
    });
    expect(logEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "step.result",
        runId: "run_logging",
        step: 0,
        error: "button detached",
      }),
      expect.objectContaining({
        event: "run.end",
        runId: "run_logging",
        outcome: "FAILED",
        exitReason: "browser_error",
      }),
    ]));
    expect(errorEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "run.error",
        runId: "run_logging",
        error: "button detached",
      }),
    ]));
  });
});
