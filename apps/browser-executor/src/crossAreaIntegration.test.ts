import { describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest, RunProgressUpdate } from "@botchestra/shared";

import { createWorker } from "./index";
import type { BrowserPageSnapshot } from "./runExecutor";

const executionContext = {} as ExecutionContext;
const env = { CALLBACK_SIGNING_SECRET: "test-callback-secret" };

type FetchMock = {
  calls: Array<{ input: RequestInfo | URL; init?: RequestInit }>;
  fetch: typeof fetch;
};

class MockBrowserPage {
  readonly clickCalls: string[] = [];

  constructor(private readonly state: BrowserPageSnapshot) {}

  async snapshot() {
    return structuredClone(this.state);
  }

  async screenshot() {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  }

  async goto(_url: string) {}

  async click(selector: string) {
    this.clickCalls.push(selector);
  }

  async type(_selector: string, _text: string) {}

  async select(_selector: string, _value: string) {}

  async scroll(_deltaY = 0) {}

  async wait(_durationMs = 0) {}

  async back() {}
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
      throw new Error("expected callback body to be a JSON string");
    }

    return JSON.parse(init.body) as RunProgressUpdate;
  });
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
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
    runId: "run_cross_area",
    studyId: "study_cross_area",
    personaVariant: {
      id: "pv_001",
      personaConfigId: "pc_001",
      syntheticUserId: "su_001",
      axisValues: { techSavviness: 0.2 },
      edgeScore: 0.8,
      tensionSeed: "Unexpected loops make me want to quit.",
      firstPersonBio: "I slow down when a page keeps behaving the same way.",
      behaviorRules: ["Retry once, then reevaluate."],
      coherenceScore: 0.91,
      distinctnessScore: 0.84,
      accepted: true,
    },
    taskSpec: {
      scenario: "Complete checkout",
      goal: "Finish a purchase",
      startingUrl: "https://shop.example.com/cart",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["click", "finish", "abort", "wait", "scroll", "back", "goto", "type", "select"],
      forbiddenActions: [],
      successCriteria: ["Confirmation is visible"],
      stopConditions: ["Order confirmed"],
      postTaskQuestions: ["Did you complete the task?"],
      maxSteps: 10,
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

function createPageState(
  overrides: Partial<BrowserPageSnapshot> = {},
): BrowserPageSnapshot {
  return {
    url: "https://shop.example.com/cart",
    title: "Cart",
    visibleText: "Your cart is ready. Continue to checkout.",
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

describe("cross-area integration", () => {
  it("abandons early after repeated friction and returns a manifest key plus self-report", async () => {
    const page = new MockBrowserPage(createPageState());
    const { browser, context } = createMockBrowser(page);
    const leaseClient = createLeaseClient();
    const callbackFetch = createFetchMock();
    const uploads = new Map<string, string | Uint8Array>();
    const bucket = {
      get: vi.fn(async (key: string) => {
        const value = uploads.get(key);
        if (value === undefined) {
          return null;
        }

        const bytes =
          typeof value === "string" ? new TextEncoder().encode(value) : value;

        return {
          arrayBuffer: async () => toArrayBuffer(bytes),
          httpMetadata: {
            contentType: key.endsWith(".json") ? "application/json" : "image/jpeg",
          },
        };
      }),
      put: vi.fn(async (key: string, value: string | ArrayBuffer | ArrayBufferView | Blob) => {
        if (typeof value === "string") {
          uploads.set(key, value);
          return;
        }

        if (value instanceof Uint8Array) {
          uploads.set(key, value);
          return;
        }

        if (ArrayBuffer.isView(value)) {
          uploads.set(key, new Uint8Array(value.buffer.slice(0)));
          return;
        }

        if (value instanceof ArrayBuffer) {
          uploads.set(key, new Uint8Array(value.slice(0)));
          return;
        }

        uploads.set(key, new Uint8Array(await value.arrayBuffer()));
      }),
    };
    const selfReport = {
      perceivedSuccess: false,
      hardestPart: "The page kept behaving the same way after every click.",
      confidence: 0.2,
      answers: {
        "Did you complete the task?": false,
      },
    };
    const worker = createWorker({
      runtime: {
        browser,
        leaseClient,
        selectAction: vi.fn(async () => ({
          type: "click",
          selector: "#checkout",
          rationale: "Try the primary checkout action again.",
        })),
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

    const responseBody = (await response.json()) as {
      ok: boolean;
      finalOutcome: string;
      stepCount: number;
      frustrationCount: number;
      artifactManifestKey?: string;
      selfReport?: typeof selfReport;
    };

    expect(responseBody).toMatchObject({
      ok: true,
      finalOutcome: "ABANDONED",
      selfReport,
    });
    expect(responseBody.stepCount).toBeLessThan(request.taskSpec.maxSteps);
    expect(responseBody.frustrationCount).toBeGreaterThanOrEqual(3);
    expect(responseBody.artifactManifestKey).toBe(`runs/${request.runId}/manifest.json`);
    expect(leaseClient.acquire).toHaveBeenCalledTimes(1);
    expect(leaseClient.release).toHaveBeenCalledWith("lease-1");
    expect(context.close).toHaveBeenCalledTimes(1);

    const manifestText = uploads.get(`runs/${request.runId}/manifest.json`);
    expect(typeof manifestText).toBe("string");
    expect(JSON.parse(String(manifestText))).toMatchObject({
      runId: request.runId,
      finalOutcome: "ABANDONED",
      stepCount: responseBody.stepCount,
      frustrationCount: responseBody.frustrationCount,
      artifacts: expect.arrayContaining([
        expect.objectContaining({
          kind: "milestone_screenshot",
        }),
      ]),
    });

    const updates = getPostedUpdates(callbackFetch);
    expect(updates.at(-1)).toMatchObject({
      runId: request.runId,
      eventType: "completion",
      payload: {
        finalOutcome: "ABANDONED",
        artifactManifestKey: `runs/${request.runId}/manifest.json`,
        selfReport,
      },
    });
  });
});
