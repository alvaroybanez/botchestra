import { describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest, RunProgressUpdate } from "@botchestra/shared";
import { createWorker } from "./index";
import type { AgentAction, BrowserPageSnapshot } from "./runExecutor";

const executionContext = {} as ExecutionContext;
const env = { CALLBACK_SIGNING_SECRET: "test-callback-secret" };

type FetchMock = {
  calls: Array<{ input: RequestInfo | URL; init?: RequestInit }>;
  fetch: typeof fetch;
};

type MockActionMethod = "goto" | "click" | "type" | "select" | "scroll" | "wait" | "back";

class MockBrowserPage {
  readonly gotoCalls: string[] = [];
  readonly clickCalls: string[] = [];
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

function createMockBrowser(page: MockBrowserPage) {
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

function createFetchMock(): FetchMock {
  const calls: FetchMock["calls"] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(null, { status: 204 });
  }) as unknown as typeof globalThis.fetch;

  return { calls, fetch };
}

function getPostedUpdates(fetchMock: FetchMock) {
  return fetchMock.calls.map(({ init }) => {
    if (typeof init?.body !== "string") {
      throw new Error("expected progress callback body to be a JSON string");
    }

    return JSON.parse(init.body) as RunProgressUpdate;
  });
}

function encodeBase64Url(value: string) {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createCallbackToken(runId: string, secret: string, exp = Date.now() + 60_000) {
  const payload = encodeBase64Url(JSON.stringify({ runId, exp }));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );

  return `${payload}.${encodeBase64Url(String.fromCharCode(...new Uint8Array(signature)))}`;
}

async function createValidExecuteRunRequest(overrides: Partial<ExecuteRunRequest> = {}) {
  const base: ExecuteRunRequest = {
    runId: "run_integration",
    studyId: "study_integration",
    personaVariant: {
      id: "pv_001",
      personaPackId: "pp_001",
      protoPersonaId: "proto_001",
      axisValues: { confidence: 0.4 },
      edgeScore: 0.8,
      tensionSeed: "I want to finish checkout quickly.",
      firstPersonBio: "I prefer straightforward flows with obvious next steps.",
      behaviorRules: ["Stay on the primary path"],
      coherenceScore: 0.91,
      distinctnessScore: 0.84,
      accepted: true,
    },
    taskSpec: {
      scenario: "Complete checkout",
      goal: "Finish a purchase",
      startingUrl: "https://shop.example.com/cart",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["goto", "click", "type", "select", "scroll", "wait", "back", "finish", "abort"],
      forbiddenActions: [],
      successCriteria: ["Confirmation is visible"],
      stopConditions: ["Order confirmed"],
      postTaskQuestions: ["Did you complete the task?"],
      maxSteps: 4,
      maxDurationSec: 60,
      environmentLabel: "staging",
      locale: "en-US",
      viewport: { width: 1280, height: 720 },
    },
    callbackToken: "",
    callbackBaseUrl: "https://convex.example.com",
  };

  const runId = overrides.runId ?? base.runId;

  return {
    ...base,
    ...overrides,
    callbackToken:
      overrides.callbackToken ?? (await createCallbackToken(runId, env.CALLBACK_SIGNING_SECRET)),
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

describe("execute-run integration", () => {
  it("runs the full success lifecycle and sends callbacks in order", async () => {
    const page = new MockBrowserPage(createPageState(), {
      nextStates: [
        createPageState({
          url: "https://shop.example.com/checkout",
          title: "Checkout",
          visibleText: "Submit your order",
          pageFingerprint: "checkout-page",
        }),
      ],
    });
    const { browser, context } = createMockBrowser(page);
    const leaseClient = createLeaseClient();
    const callbackFetch = createFetchMock();
    const bucket = {
      put: vi.fn(async (_key: string, _value: unknown, _options?: unknown) => undefined),
    };
    const selfReport = {
      perceivedSuccess: true,
      confidence: 0.9,
      answers: {
        "Did you complete the task?": true,
      },
    };
    const actions: AgentAction[] = [
      { type: "click", selector: "#checkout", rationale: "Continue to checkout." },
      { type: "finish", rationale: "The goal is complete." },
    ];
    const worker = createWorker({
      runtime: {
        browser,
        leaseClient,
        selectAction: vi.fn(async () => actions.shift() ?? { type: "finish" }),
        fetch: callbackFetch.fetch,
        generateSelfReport: vi.fn(async () => selfReport),
      },
    });
    const request = await createValidExecuteRunRequest();

    const response = await worker.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      }),
      {
        ...env,
        ARTIFACTS: bucket,
      },
      executionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
      stepCount: 2,
      selfReport,
      artifactManifestKey: `runs/${request.runId}/manifest.json`,
    });
    expect(leaseClient.acquire).toHaveBeenCalledTimes(1);
    expect(leaseClient.release).toHaveBeenCalledWith("lease-1");
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(bucket.put.mock.calls.slice(0, 3).map((call) => call[0])).toEqual([
      `runs/${request.runId}/milestones/0_start.jpg`,
      `runs/${request.runId}/milestones/0_click.jpg`,
      `runs/${request.runId}/milestones/1_finish.jpg`,
    ]);
    expect(bucket.put.mock.calls[0]?.[1]).toBeInstanceOf(Uint8Array);
    expect(bucket.put.mock.calls[1]?.[1]).toBeInstanceOf(Uint8Array);
    expect(bucket.put.mock.calls[2]?.[1]).toBeInstanceOf(Uint8Array);
    expect(bucket.put.mock.calls[0]?.[2]).toEqual({
      httpMetadata: { contentType: "image/jpeg" },
    });
    expect(bucket.put.mock.calls[1]?.[2]).toEqual({
      httpMetadata: { contentType: "image/jpeg" },
    });
    expect(bucket.put.mock.calls[2]?.[2]).toEqual({
      httpMetadata: { contentType: "image/jpeg" },
    });
    expect(bucket.put).toHaveBeenNthCalledWith(
      4,
      `runs/${request.runId}/manifest.json`,
      expect.any(String),
      { httpMetadata: { contentType: "application/json" } },
    );
    expect(page.screenshotCalls).toEqual([
      { type: "jpeg", quality: 80 },
      { type: "jpeg", quality: 80 },
      { type: "jpeg", quality: 80 },
    ]);

    const updates = getPostedUpdates(callbackFetch);
    expect(updates.map((update) => update.eventType)).toEqual([
      "heartbeat",
      "milestone",
      "milestone",
      "milestone",
      "completion",
    ]);
    expect(updates[1]).toMatchObject({
      runId: request.runId,
      eventType: "milestone",
      payload: {
        stepIndex: 0,
        actionType: "start",
        screenshotKey: `runs/${request.runId}/milestones/0_start.jpg`,
      },
    });
    expect(updates[2]).toMatchObject({
      runId: request.runId,
      eventType: "milestone",
      payload: {
        stepIndex: 0,
        actionType: "click",
        screenshotKey: `runs/${request.runId}/milestones/0_click.jpg`,
      },
    });
    expect(updates[3]).toMatchObject({
      runId: request.runId,
      eventType: "milestone",
      payload: {
        stepIndex: 1,
        actionType: "finish",
        screenshotKey: `runs/${request.runId}/milestones/1_finish.jpg`,
      },
    });
    expect(updates[4]).toMatchObject({
      runId: request.runId,
      eventType: "completion",
      payload: {
        finalOutcome: "SUCCESS",
        artifactManifestKey: `runs/${request.runId}/manifest.json`,
        selfReport,
      },
    });
  });

  it("sends a failure callback and still releases resources when execution throws", async () => {
    const page = new MockBrowserPage(createPageState(), {
      throwOn: {
        click: new Error("browser crashed"),
      },
    });
    const { browser, context } = createMockBrowser(page);
    const leaseClient = createLeaseClient();
    const callbackFetch = createFetchMock();
    const bucket = {
      put: vi.fn(async (_key: string, _value: unknown, _options?: unknown) => undefined),
    };
    const selfReport = {
      perceivedSuccess: false,
      confidence: 0.15,
      answers: {
        "Did you complete the task?": false,
      },
    };
    const worker = createWorker({
      runtime: {
        browser,
        leaseClient,
        selectAction: vi.fn(async () => ({ type: "click", selector: "#checkout" })),
        fetch: callbackFetch.fetch,
        generateSelfReport: vi.fn(async () => selfReport),
      },
    });
    const request = await createValidExecuteRunRequest();

    const response = await worker.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      }),
      {
        ...env,
        ARTIFACTS: bucket,
      },
      executionContext,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      errorCode: "BROWSER_ERROR",
      selfReport,
      artifactManifestKey: `runs/${request.runId}/manifest.json`,
    });
    expect(leaseClient.acquire).toHaveBeenCalledTimes(1);
    expect(leaseClient.release).toHaveBeenCalledWith("lease-1");
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(bucket.put).toHaveBeenCalledTimes(3);
    expect(bucket.put.mock.calls.slice(0, 2).map((call) => call[0])).toEqual([
      `runs/${request.runId}/milestones/0_start.jpg`,
      `runs/${request.runId}/milestones/0_browser_error.jpg`,
    ]);
    expect(bucket.put).toHaveBeenLastCalledWith(
      `runs/${request.runId}/manifest.json`,
      expect.any(String),
      { httpMetadata: { contentType: "application/json" } },
    );

    const updates = getPostedUpdates(callbackFetch);
    expect(updates.map((update) => update.eventType)).toEqual([
      "heartbeat",
      "milestone",
      "milestone",
      "failure",
    ]);
    expect(updates[3]).toMatchObject({
      runId: request.runId,
      eventType: "failure",
      payload: {
        errorCode: "BROWSER_ERROR",
        message: "browser crashed",
        selfReport,
      },
    });
  });

  it("sends a completion callback with self-report for abandoned runs", async () => {
    const page = new MockBrowserPage(createPageState());
    const { browser, context } = createMockBrowser(page);
    const leaseClient = createLeaseClient();
    const callbackFetch = createFetchMock();
    const bucket = {
      put: vi.fn(async (_key: string, _value: unknown, _options?: unknown) => undefined),
    };
    const selfReport = {
      perceivedSuccess: false,
      confidence: 0.22,
      answers: {
        "Did you complete the task?": false,
      },
    };
    const worker = createWorker({
      runtime: {
        browser,
        leaseClient,
        selectAction: vi.fn(async () => ({ type: "abort", rationale: "The flow became too confusing." })),
        fetch: callbackFetch.fetch,
        generateSelfReport: vi.fn(async () => selfReport),
      },
    });
    const request = await createValidExecuteRunRequest();

    const response = await worker.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      }),
      {
        ...env,
        ARTIFACTS: bucket,
      },
      executionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      finalOutcome: "ABANDONED",
      selfReport,
    });
    expect(leaseClient.release).toHaveBeenCalledWith("lease-1");
    expect(context.close).toHaveBeenCalledTimes(1);

    const updates = getPostedUpdates(callbackFetch);
    expect(updates.map((update) => update.eventType)).toEqual([
      "heartbeat",
      "milestone",
      "milestone",
      "completion",
    ]);
    expect(updates[3]).toMatchObject({
      runId: request.runId,
      eventType: "completion",
      payload: {
        finalOutcome: "ABANDONED",
        selfReport,
      },
    });
  });
});
