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
  readonly screenshot = vi.fn(async () => this.screenshotBytes);

  constructor(
    private readonly state: BrowserPageSnapshot,
    private readonly screenshotBytes: Uint8Array,
  ) {}

  async snapshot() {
    return structuredClone(this.state);
  }

  async goto(_url: string) {}

  async click(_selector: string) {}

  async type(_selector: string, _text: string) {}

  async select(_selector: string, _value: string) {}

  async scroll(_deltaY = 0) {}

  async wait(_durationMs = 0) {}

  async back() {}
}

class MockBrowserContext {
  readonly close = vi.fn(async () => undefined);
  readonly newPage = vi.fn(async () => this.page);

  constructor(private readonly page: MockBrowserPage) {}
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
    acquire: vi.fn(async () => ({ ok: true as const, leaseId: "lease-1" })),
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

async function createCallbackToken(
  runId: string,
  secret: string,
  exp = Date.now() + 60_000,
) {
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
) {
  const base: ExecuteRunRequest = {
    runId: "run_redaction",
    studyId: "study_redaction",
    personaVariant: {
      id: "pv_001",
      personaConfigId: "pp_001",
      syntheticUserId: "proto_001",
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
      allowedActions: [
        "goto",
        "click",
        "type",
        "select",
        "scroll",
        "wait",
        "back",
        "finish",
        "abort",
      ],
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
        label: "Complete checkout",
        selector: "#finish",
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

describe("e2e secret redaction verification", () => {
  it("replaces known secret values with [REDACTED] across callbacks, artifacts, and the worker response", async () => {
    const secretEmail = "alice@example.com";
    const secretPassword = "swordfish";
    const page = new MockBrowserPage(
      createPageState({
        url: `https://${secretEmail}:${secretPassword}@shop.example.com/cart`,
        title: `Cart for ${secretEmail}`,
        agentNotes: `Saw ${secretPassword} in the title`,
      }),
      new TextEncoder().encode(`${secretEmail} ${secretPassword}`),
    );
    const { browser, context } = createMockBrowser(page);
    const leaseClient = createLeaseClient();
    const callbackFetch = createFetchMock();
    const bucket = {
      get: vi.fn(async () => null),
      put: vi.fn(async (_key: string, _value: unknown, _options?: unknown) => undefined),
    };
    const actions: AgentAction[] = [
      {
        type: "finish",
        rationale: `Used ${secretEmail} and ${secretPassword} to complete checkout`,
      },
    ];
    const worker = createWorker({
      runtime: {
        browser,
        leaseClient,
        fetch: callbackFetch.fetch,
        resolveSecrets: vi.fn(async () => [secretEmail, secretPassword]),
        selectAction: vi.fn(async () => actions.shift() ?? { type: "finish" }),
        generateSelfReport: vi.fn(async () => ({
          perceivedSuccess: true,
          hardestPart: `Typing ${secretPassword}`,
          confusion: `${secretEmail} was visible in the header`,
          confidence: 0.7,
          suggestedChange: `Hide ${secretPassword} after login`,
          answers: {
            "Did you complete the task?": `Yes, with ${secretEmail}`,
          },
        })),
      },
    });
    const request = await createValidExecuteRunRequest({
      taskSpec: {
        ...(await createValidExecuteRunRequest()).taskSpec,
        credentialsRef: "cred_checkout",
      },
    });

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
    expect(leaseClient.release).toHaveBeenCalledWith("lease-1");
    expect(context.close).toHaveBeenCalledTimes(1);

    const responseBody = JSON.stringify(await response.json());
    expect(responseBody).toContain("[REDACTED]");
    expect(responseBody).not.toContain(secretEmail);
    expect(responseBody).not.toContain(secretPassword);

    const callbackBodies = getPostedUpdates(callbackFetch).map((update) => JSON.stringify(update));
    expect(callbackBodies).not.toHaveLength(0);
    expect(callbackBodies.every((body) => !body.includes(secretEmail))).toBe(true);
    expect(callbackBodies.every((body) => !body.includes(secretPassword))).toBe(true);
    expect(callbackBodies.some((body) => body.includes("[REDACTED]"))).toBe(true);

    const uploadedBodies = bucket.put.mock.calls.map((call) => call[1]);
    const uploadedTextBodies = uploadedBodies.map((body) =>
      typeof body === "string" ? body : new TextDecoder().decode(body as Uint8Array),
    );

    expect(uploadedTextBodies.every((body) => !body.includes(secretEmail))).toBe(true);
    expect(uploadedTextBodies.every((body) => !body.includes(secretPassword))).toBe(true);
    expect(uploadedTextBodies.some((body) => body.includes("[REDACTED]"))).toBe(true);
  });
});
