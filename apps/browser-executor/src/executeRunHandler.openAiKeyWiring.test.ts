import type { ExecuteRunRequest } from "@botchestra/shared";
import { generateWithModel } from "@botchestra/ai";
import { describe, expect, it, vi } from "vitest";
import { createExecuteRunHandler } from "./executeRunHandler";
import type { BrowserLike, BrowserPageSnapshot } from "./runExecutor";

vi.mock("@botchestra/ai", () => ({
  generateWithModel: vi.fn(),
}));

const mockedGenerateWithModel = vi.mocked(generateWithModel);

class MockBrowserPage {
  readonly setViewport = vi.fn(async (_viewport: { width: number; height: number }) => undefined);
  readonly setExtraHTTPHeaders = vi.fn(async (_headers: Record<string, string>) => undefined);
  readonly goto = vi.fn(async (_url: string) => undefined);
  readonly click = vi.fn(async (_selector: string) => undefined);
  readonly type = vi.fn(async (_selector: string, _text: string) => undefined);
  readonly select = vi.fn(async (_selector: string, _value: string) => undefined);
  readonly goBack = vi.fn(async () => undefined);
  readonly waitForTimeout = vi.fn(async (_durationMs: number) => undefined);
  readonly screenshot = vi.fn(async () => new Uint8Array([1, 2, 3]));

  constructor(private readonly snapshotResult: BrowserPageSnapshot) {}

  async snapshot() {
    return structuredClone(this.snapshotResult);
  }

  async evaluate<T>(pageFunction: unknown, ...args: unknown[]) {
    if (typeof pageFunction === "function" && args.length === 0) {
      return structuredClone(this.snapshotResult) as T;
    }

    return undefined as T;
  }

  async scroll(_deltaY = 0) {}

  async wait(durationMs = 0) {
    await this.waitForTimeout(durationMs);
  }

  async back() {
    await this.goBack();
  }
}

class MockBrowserContext {
  readonly close = vi.fn(async () => undefined);
  readonly newPage = vi.fn(async () => this.page);

  constructor(readonly page: MockBrowserPage) {}
}

class MockBrowserLike {
  readonly newContext = vi.fn(async () => this.context);

  constructor(readonly context: MockBrowserContext) {}
}

function createPageSnapshot(): BrowserPageSnapshot {
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
  };
}

function createRequest(): ExecuteRunRequest {
  return {
    runId: "run_openai_key_wiring",
    studyId: "study_openai_key_wiring",
    personaVariant: {
      id: "pv_001",
      personaConfigId: "pc_001",
      syntheticUserId: "su_001",
      axisValues: { confidence: 0.5 },
      edgeScore: 0.8,
      tensionSeed: "I want to finish quickly.",
      firstPersonBio: "I prefer straightforward flows with clear next steps.",
      behaviorRules: ["Stay on task"],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    },
    taskSpec: {
      scenario: "Complete checkout",
      goal: "Finish a purchase",
      startingUrl: "https://shop.example.com/cart",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["click", "finish", "wait"],
      forbiddenActions: [],
      successCriteria: ["Confirmation is visible"],
      stopConditions: ["Order confirmed"],
      postTaskQuestions: ["Did you complete the task?"],
      maxSteps: 3,
      maxDurationSec: 60,
      environmentLabel: "staging",
      locale: "en-US",
      viewport: { width: 1280, height: 720 },
    },
    callbackToken: "unused-in-direct-handler-tests",
    callbackBaseUrl: "https://convex.example.com",
  };
}

function createLeaseNamespace() {
  const stub = {
    fetch: vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.endsWith("/acquire")) {
        return Response.json({ ok: true, leaseId: "lease-123" });
      }

      if (url.endsWith("/release")) {
        return Response.json({ ok: true });
      }

      return Response.json({ ok: false }, { status: 404 });
    }),
  };

  return {
    namespace: {
      idFromName: vi.fn(() => "browser-lease-id"),
      get: vi.fn(() => stub),
    },
  };
}

function mockTextResult(text: string) {
  return {
    text,
  } as unknown as Awaited<ReturnType<typeof generateWithModel>>;
}

describe("createExecuteRunHandler OPENAI_API_KEY wiring", () => {
  it("passes env.OPENAI_API_KEY through the default AI selector", async () => {
    mockedGenerateWithModel.mockReset();
    mockedGenerateWithModel.mockResolvedValue(mockTextResult(JSON.stringify({
      type: "finish",
      rationale: "The goal is complete.",
    })));

    const page = new MockBrowserPage(createPageSnapshot());
    const browser = new MockBrowserLike(new MockBrowserContext(page)) as BrowserLike;
    const { namespace } = createLeaseNamespace();
    const handler = createExecuteRunHandler({
      browser,
      fetch: vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch,
      generateSelfReport: vi.fn(async () => ({ perceivedSuccess: true, answers: {} })),
    });

    const response = await handler(createRequest(), {
      BROWSER_LEASE: namespace,
      OPENAI_API_KEY: "worker-openai-key",
    });

    expect(response.status).toBe(200);
    expect(mockedGenerateWithModel).toHaveBeenCalledWith(
      "action",
      expect.objectContaining({
        apiKey: "worker-openai-key",
      }),
    );
  });
});
