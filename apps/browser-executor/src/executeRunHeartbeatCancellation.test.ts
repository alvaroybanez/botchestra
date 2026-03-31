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

class MockBrowserPage {
  readonly gotoCalls: string[] = [];
  readonly clickCalls: string[] = [];

  private currentState: BrowserPageSnapshot;

  constructor(
    initialState: BrowserPageSnapshot,
    private readonly nextStates: BrowserPageSnapshot[] = [],
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
    this.gotoCalls.push(url);
    this.currentState = {
      ...this.currentState,
      url,
    };
    this.advanceState();
  }

  async click(selector: string) {
    this.clickCalls.push(selector);
    this.advanceState();
  }

  async type(_selector: string, _text: string) {}

  async select(_selector: string, _value: string) {}

  async scroll(_deltaY = 0) {}

  async wait(_durationMs = 0) {}

  async back() {}

  private advanceState() {
    const nextState = this.nextStates.shift();
    if (nextState) {
      this.currentState = structuredClone(nextState);
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
  return {
    acquire: vi.fn(async () => ({
      ok: true as const,
      leaseId: "lease-1",
    })),
    release: vi.fn(async () => undefined),
  };
}

function createHeartbeatFetchMock(
  heartbeatResponses: Array<Response | (() => Response)>,
): FetchMock {
  const calls: FetchMock["calls"] = [];
  let heartbeatIndex = 0;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });

    const body = typeof init?.body === "string"
      ? JSON.parse(init.body) as RunProgressUpdate
      : null;

    if (body?.eventType === "heartbeat") {
      const nextResponse =
        heartbeatResponses[heartbeatIndex]
        ?? Response.json({ ok: true, shouldStop: false }, { status: 200 });
      heartbeatIndex += 1;

      return typeof nextResponse === "function" ? nextResponse() : nextResponse;
    }

    return new Response(null, { status: 204 });
  }) as unknown as typeof globalThis.fetch;

  return { calls, fetch };
}

function getPostedUpdates(fetchMock: FetchMock) {
  return fetchMock.calls.map(({ init }) => {
    if (typeof init?.body !== "string") {
      throw new Error("expected callback body to be a JSON string");
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

async function createValidExecuteRunRequest(
  overrides: Partial<ExecuteRunRequest> = {},
): Promise<ExecuteRunRequest> {
  const base: ExecuteRunRequest = {
    runId: "run_heartbeat_cancel",
    studyId: "study_heartbeat_cancel",
    personaVariant: {
      id: "pv_001",
      personaConfigId: "pc_001",
      syntheticUserId: "su_001",
      axisValues: { confidence: 0.4 },
      edgeScore: 0.8,
      tensionSeed: "I do not want to keep going if the run was cancelled.",
      firstPersonBio: "I stop promptly when the system tells me to.",
      behaviorRules: ["Honor explicit stop conditions immediately."],
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

describe("execute-run heartbeat cancellation", () => {
  it("terminates the run with ABANDONED when a heartbeat ack returns shouldStop=true", async () => {
    const page = new MockBrowserPage(createPageState());
    const { browser, context } = createMockBrowser(page);
    const leaseClient = createLeaseClient();
    const callbackFetch = createHeartbeatFetchMock([
      Response.json({ ok: true, shouldStop: true }, { status: 200 }),
    ]);
    const selectAction = vi.fn(async () => ({ type: "finish", rationale: "Should never run." }));
    const worker = createWorker({
      runtime: {
        browser,
        leaseClient,
        selectAction,
        fetch: callbackFetch.fetch,
        generateSelfReport: vi.fn(async () => ({
          perceivedSuccess: false,
          confidence: 0,
          answers: { "Did you complete the task?": false },
        })),
      },
    });
    const request = await createValidExecuteRunRequest();

    const response = await worker.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      }),
      env,
      executionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      finalOutcome: "ABANDONED",
      stepCount: 0,
    });
    expect(selectAction).not.toHaveBeenCalled();
    expect(leaseClient.release).toHaveBeenCalledWith("lease-1");
    expect(context.close).toHaveBeenCalledTimes(1);

    const updates = getPostedUpdates(callbackFetch);
    expect(updates).toContainEqual(expect.objectContaining({
      eventType: "completion",
      payload: expect.objectContaining({ finalOutcome: "ABANDONED" }),
    }));
    expect(updates).toContainEqual(expect.objectContaining({
      eventType: "milestone",
      payload: expect.objectContaining({
        actionType: "cancel",
        rationaleShort: "Run cancelled via heartbeat stop signal",
      }),
    }));
  });

  it("continues normally when heartbeat acks return shouldStop=false", async () => {
    const page = new MockBrowserPage(createPageState(), [
      createPageState({
        url: "https://shop.example.com/checkout",
        title: "Checkout",
        visibleText: "Submit your order",
        pageFingerprint: "checkout-page",
      }),
    ]);
    const { browser, context } = createMockBrowser(page);
    const leaseClient = createLeaseClient();
    const callbackFetch = createHeartbeatFetchMock([
      Response.json({ ok: true, shouldStop: false }, { status: 200 }),
      Response.json({ ok: true, shouldStop: false }, { status: 200 }),
    ]);
    const actions: AgentAction[] = [
      { type: "click", selector: "#checkout", rationale: "Continue to checkout." },
      { type: "finish", rationale: "The goal is complete." },
    ];
    const selectAction = vi.fn(async () => actions.shift() ?? { type: "finish" });
    const worker = createWorker({
      runtime: {
        browser,
        leaseClient,
        selectAction,
        fetch: callbackFetch.fetch,
        generateSelfReport: vi.fn(async () => ({
          perceivedSuccess: true,
          confidence: 0.9,
          answers: { "Did you complete the task?": true },
        })),
      },
    });
    const request = await createValidExecuteRunRequest();

    const response = await worker.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      }),
      env,
      executionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
      stepCount: 2,
    });
    expect(selectAction).toHaveBeenCalledTimes(2);
    expect(page.clickCalls).toEqual(["#checkout"]);
    expect(leaseClient.release).toHaveBeenCalledWith("lease-1");
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(
      getPostedUpdates(callbackFetch).filter((update) => update.eventType === "heartbeat"),
    ).toHaveLength(2);
  });

  it("continues normally when a heartbeat ack body is malformed", async () => {
    const page = new MockBrowserPage(createPageState(), [
      createPageState({
        url: "https://shop.example.com/checkout",
        title: "Checkout",
        visibleText: "Submit your order",
        pageFingerprint: "checkout-page",
      }),
    ]);
    const { browser } = createMockBrowser(page);
    const leaseClient = createLeaseClient();
    const callbackFetch = createHeartbeatFetchMock([
      () =>
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      Response.json({ ok: true, shouldStop: false }, { status: 200 }),
    ]);
    const actions: AgentAction[] = [
      { type: "click", selector: "#checkout", rationale: "Continue to checkout." },
      { type: "finish", rationale: "The goal is complete." },
    ];
    const selectAction = vi.fn(async () => actions.shift() ?? { type: "finish" });
    const worker = createWorker({
      runtime: {
        browser,
        leaseClient,
        selectAction,
        fetch: callbackFetch.fetch,
        generateSelfReport: vi.fn(async () => ({
          perceivedSuccess: true,
          confidence: 0.9,
          answers: { "Did you complete the task?": true },
        })),
      },
    });
    const request = await createValidExecuteRunRequest();

    const response = await worker.fetch(
      new Request("https://example.com/execute-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
      }),
      env,
      executionContext,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
      stepCount: 2,
    });
    expect(selectAction).toHaveBeenCalledTimes(2);
    expect(
      getPostedUpdates(callbackFetch).filter((update) => update.eventType === "heartbeat"),
    ).toHaveLength(2);
  });
});
