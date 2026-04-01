import { describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import {
  createRunExecutor,
  type AgentAction,
  type BrowserPageSnapshot,
} from "./runExecutor";

class MockBrowserPage {
  readonly goto = vi.fn(async (url: string) => {
    this.currentState = {
      ...this.currentState,
      url,
    };
  });

  readonly click = vi.fn(async () => {
    this.advanceState();
  });

  readonly type = vi.fn(async () => {
    this.advanceState();
  });

  readonly select = vi.fn(async () => {
    this.advanceState();
  });

  readonly scroll = vi.fn(async () => undefined);
  readonly wait = vi.fn(async () => undefined);
  readonly back = vi.fn(async () => undefined);

  constructor(
    initialState: BrowserPageSnapshot,
    private readonly nextStates: BrowserPageSnapshot[],
  ) {
    this.currentState = structuredClone(initialState);
  }

  private currentState: BrowserPageSnapshot;

  async snapshot() {
    return structuredClone(this.currentState);
  }

  async screenshot() {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  }

  private advanceState() {
    const nextState = this.nextStates.shift();
    if (nextState) {
      this.currentState = structuredClone(nextState);
    }
  }
}

function createBrowser(page: MockBrowserPage) {
  return {
    browser: {
      newContext: vi.fn(async () => ({
        newPage: vi.fn(async () => page),
        close: vi.fn(async () => undefined),
      })),
    },
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
    runId: "run_outcome_feedback",
    studyId: "study_feedback",
    personaVariant: {
      id: "variant_123",
      personaConfigId: "config_123",
      syntheticUserId: "user_123",
      axisValues: { techSavviness: 0.5 },
      edgeScore: 0.4,
      tensionSeed: "I do not want to get stuck.",
      firstPersonBio: "I am a cautious shopper.",
      behaviorRules: ["Avoid repeating the same failed action."],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    },
    taskSpec: {
      scenario: "Try to progress through checkout.",
      goal: "Reach the next meaningful step.",
      startingUrl: "https://shop.example.com/cart",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["click", "type", "select", "wait", "finish"],
      forbiddenActions: [],
      successCriteria: ["The page advances."],
      stopConditions: [],
      postTaskQuestions: [],
      maxSteps: 3,
      maxDurationSec: 60,
      environmentLabel: "staging",
      locale: "en-US",
      viewport: { width: 1280, height: 720 },
    },
    callbackToken: "unused",
    callbackBaseUrl: "https://convex.example.com",
  };
}

function createPageState(overrides: Partial<BrowserPageSnapshot> = {}): BrowserPageSnapshot {
  return {
    url: "https://shop.example.com/cart",
    title: "Cart",
    visibleText: "Review your cart before checkout",
    interactiveElements: [
      {
        role: "button",
        label: "Checkout",
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

async function runAndCollectHistory(
  nextState: BrowserPageSnapshot,
  firstAction: AgentAction = {
    type: "click",
    selector: "#checkout",
    rationale: "Try the checkout CTA.",
  },
) {
  const page = new MockBrowserPage(createPageState(), [nextState]);
  const { browser } = createBrowser(page);
  const calls: Array<{ actionHistory: readonly { outcome?: string | null }[] }> = [];
  const actions: AgentAction[] = [
    firstAction,
    {
      type: "finish",
      rationale: "Stop after inspecting the outcome.",
    },
  ];
  const runExecutor = createRunExecutor({
    browser,
    leaseClient: createLeaseClient(),
    selectAction: vi.fn(async (input) => {
      calls.push({ actionHistory: structuredClone(input.actionHistory) });
      return actions.shift() ?? { type: "finish", rationale: "Done." };
    }),
  });

  const result = await runExecutor.execute(createRequest());

  expect(result).toMatchObject({
    ok: true,
    finalOutcome: "SUCCESS",
  });

  return calls[1]?.actionHistory[0]?.outcome;
}

describe("runExecutor action outcome feedback", () => {
  it("records URL changes as navigation outcomes", async () => {
    const outcome = await runAndCollectHistory(
      createPageState({
        url: "https://shop.example.com/checkout",
        title: "Checkout",
      }),
    );

    expect(outcome).toBe("navigated to https://shop.example.com/checkout");
  });

  it("records title-only changes as page title updates", async () => {
    const outcome = await runAndCollectHistory(
      createPageState({
        title: "Checkout details",
      }),
    );

    expect(outcome).toBe("page title changed to Checkout details");
  });

  it("records interactive element count changes as page updates", async () => {
    const outcome = await runAndCollectHistory(
      createPageState({
        interactiveElements: [
          {
            role: "button",
            label: "Checkout",
            selector: "#checkout",
          },
          {
            role: "textbox",
            label: "Promo code",
            selector: "#promo",
          },
        ],
      }),
    );

    expect(outcome).toBe("page updated (1 -> 2 interactive elements)");
  });

  it("records unchanged pages as no visible change", async () => {
    const outcome = await runAndCollectHistory(createPageState());

    expect(outcome).toBe("no visible change (same URL, title, and elements)");
  });
});
