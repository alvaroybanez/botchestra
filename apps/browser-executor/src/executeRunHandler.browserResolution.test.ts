import type { ExecuteRunRequest } from "@botchestra/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createExecuteRunHandler } from "./executeRunHandler";
import type { BrowserPageSnapshot } from "./runExecutor";

const { launchSpy } = vi.hoisted(() => ({
  launchSpy: vi.fn(),
}));

vi.mock("@cloudflare/puppeteer", () => ({
  default: {
    launch: launchSpy,
  },
}));

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

class MockPuppeteerBrowser {
  readonly createBrowserContext = vi.fn(async () => this.context);
  readonly close = vi.fn(async () => undefined);

  constructor(readonly context: MockBrowserContext) {}
}

class MockAmbiguousCloudflareBrowser {
  readonly newPage = vi.fn(async () => this.page);
  readonly newContext = vi.fn(async () => {
    throw new Error("The RPC receiver does not implement the method newContext");
  });
  readonly close = vi.fn(async () => undefined);

  constructor(readonly page: MockBrowserPage) {}
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
    runId: "run_browser_resolution",
    studyId: "study_browser_resolution",
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
    fetch: vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
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
    stub,
  };
}

function createHandler() {
  return createExecuteRunHandler({
    selectAction: vi.fn(async () => ({ type: "finish", rationale: "The goal is complete." })),
    fetch: vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch,
    generateSelfReport: vi.fn(async () => ({ perceivedSuccess: true, answers: {} })),
  });
}

describe("createExecuteRunHandler browser resolution", () => {
  beforeEach(() => {
    launchSpy.mockReset();
  });

  it("uses the injected browser and resolves the durable-object lease client from env.BROWSER_LEASE", async () => {
    const page = new MockBrowserPage(createPageSnapshot());
    const context = new MockBrowserContext(page);
    const browser = new MockBrowserLike(context);
    const { namespace, stub } = createLeaseNamespace();
    const handler = createExecuteRunHandler({
      browser,
      selectAction: vi.fn(async () => ({ type: "finish", rationale: "Done." })),
      fetch: vi.fn(async () => new Response(null, { status: 204 })) as typeof fetch,
      generateSelfReport: vi.fn(async () => ({ perceivedSuccess: true, answers: {} })),
    });

    const response = await handler(createRequest(), {
      BROWSER_LEASE: namespace,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
    });
    expect(browser.newContext).toHaveBeenCalledWith({
      locale: "en-US",
      viewport: { width: 1280, height: 720 },
    });
    expect(launchSpy).not.toHaveBeenCalled();
    expect(namespace.idFromName).toHaveBeenCalledWith("browser-lease");
    expect(stub.fetch).toHaveBeenCalledTimes(2);
    expect(stub.fetch).toHaveBeenNthCalledWith(
      1,
      "https://browser-lease.internal/acquire",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          runId: "run_browser_resolution",
          leaseTimeoutMs: 60000,
        }),
      }),
    );
    expect(stub.fetch).toHaveBeenNthCalledWith(
      2,
      "https://browser-lease.internal/release",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leaseId: "lease-123" }),
      }),
    );
  });

  it("uses env.BROWSER directly when it already satisfies BrowserLike", async () => {
    const page = new MockBrowserPage(createPageSnapshot());
    const context = new MockBrowserContext(page);
    const browser = new MockBrowserLike(context);
    const { namespace } = createLeaseNamespace();

    const response = await createHandler()(createRequest(), {
      BROWSER: browser,
      BROWSER_LEASE: namespace,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
    });
    expect(browser.newContext).toHaveBeenCalledTimes(1);
    expect(launchSpy).not.toHaveBeenCalled();
  });

  it("launches the Cloudflare browser binding through @cloudflare/puppeteer and wraps it with PuppeteerBrowserAdapter", async () => {
    const page = new MockBrowserPage(createPageSnapshot());
    const context = new MockBrowserContext(page);
    const rawBrowser = new MockPuppeteerBrowser(context);
    const browserBinding = {
      fetch: vi.fn<typeof fetch>(),
    };
    const { namespace } = createLeaseNamespace();
    launchSpy.mockResolvedValue(rawBrowser);

    const response = await createHandler()(createRequest(), {
      BROWSER: browserBinding,
      BROWSER_LEASE: namespace,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
    });
    expect(launchSpy).toHaveBeenCalledWith(browserBinding);
    expect(rawBrowser.createBrowserContext).toHaveBeenCalledTimes(1);
    expect(rawBrowser.close).toHaveBeenCalledTimes(1);
  });

  it("uses env.BROWSER.launch() when provided and closes the launched browser after handling the request", async () => {
    const page = new MockBrowserPage(createPageSnapshot());
    const context = new MockBrowserContext(page);
    const rawBrowser = new MockPuppeteerBrowser(context);
    const bindingLaunch = vi.fn(async () => rawBrowser);
    const { namespace } = createLeaseNamespace();

    const response = await createHandler()(createRequest(), {
      BROWSER: {
        launch: bindingLaunch,
      },
      BROWSER_LEASE: namespace,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
    });
    expect(bindingLaunch).toHaveBeenCalledTimes(1);
    expect(launchSpy).not.toHaveBeenCalled();
    expect(rawBrowser.createBrowserContext).toHaveBeenCalledTimes(1);
    expect(rawBrowser.close).toHaveBeenCalledTimes(1);
  });

  it("prefers wrapping launched browsers with newPage over treating them as BrowserLike when they also expose a broken newContext", async () => {
    const page = new MockBrowserPage(createPageSnapshot());
    const rawBrowser = new MockAmbiguousCloudflareBrowser(page);
    const bindingLaunch = vi.fn(async () => rawBrowser);
    const { namespace } = createLeaseNamespace();

    const response = await createHandler()(createRequest(), {
      BROWSER: {
        launch: bindingLaunch,
      },
      BROWSER_LEASE: namespace,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
    });
    expect(bindingLaunch).toHaveBeenCalledTimes(1);
    expect(rawBrowser.newContext).not.toHaveBeenCalled();
    expect(rawBrowser.newPage).toHaveBeenCalledTimes(1);
    expect(rawBrowser.close).toHaveBeenCalledTimes(1);
  });

  it("prefers the Cloudflare binding path when env.BROWSER satisfies both BrowserLike and Cloudflare binding detection", async () => {
    const page = new MockBrowserPage(createPageSnapshot());
    const rawBrowser = new MockPuppeteerBrowser(new MockBrowserContext(page));
    const browserBinding = {
      fetch: vi.fn<typeof fetch>(),
      newContext: vi.fn(async () => {
        throw new Error("The RPC receiver does not implement the method newContext");
      }),
    };
    const { namespace } = createLeaseNamespace();
    launchSpy.mockResolvedValue(rawBrowser);

    const response = await createHandler()(createRequest(), {
      BROWSER: browserBinding,
      BROWSER_LEASE: namespace,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
    });
    expect(launchSpy).toHaveBeenCalledWith(browserBinding);
    expect(browserBinding.newContext).not.toHaveBeenCalled();
    expect(rawBrowser.createBrowserContext).toHaveBeenCalledTimes(1);
    expect(rawBrowser.close).toHaveBeenCalledTimes(1);
  });

  it("returns a misconfigured worker response when no browser binding is available", async () => {
    const { namespace } = createLeaseNamespace();

    const response = await createHandler()(createRequest(), {
      BROWSER_LEASE: namespace,
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "misconfigured_worker",
      message: "BROWSER binding is required for run execution",
    });
  });
});
