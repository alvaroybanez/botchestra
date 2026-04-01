import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import { createExecuteRunHandler } from "./executeRunHandler";
import type { BrowserPageSnapshot } from "./runExecutor";

class MockBrowserPage {
  constructor(private readonly state: BrowserPageSnapshot) {}

  async snapshot() {
    return structuredClone(this.state);
  }

  async screenshot() {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  }

  async goto(_url: string) {}

  async click(_selector: string) {}

  async type(_selector: string, _text: string) {}

  async select(_selector: string, _value: string) {}

  async scroll(_deltaY = 0) {}

  async wait(_durationMs = 0) {}

  async back() {}
}

function createRequest(): ExecuteRunRequest {
  return {
    runId: "run_handler_logging",
    studyId: "study_handler_logging",
    personaVariant: {
      id: "variant_handler_logging",
      personaConfigId: "config_handler_logging",
      syntheticUserId: "user_handler_logging",
      axisValues: { patience: 0.5 },
      edgeScore: 0.5,
      tensionSeed: "I want to stay on track.",
      firstPersonBio: "I am decisive.",
      behaviorRules: ["Choose the obvious next step"],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    },
    taskSpec: {
      scenario: "Complete checkout",
      goal: "Finish the purchase",
      startingUrl: "https://shop.example.com/cart",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["click", "finish", "abort", "goto", "type", "select", "scroll", "wait", "back"],
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

function createPage(): BrowserPageSnapshot {
  return {
    url: "https://shop.example.com/cart",
    title: "Cart",
    visibleText: "Continue to checkout",
    interactiveElements: [{ role: "button", label: "Checkout", selector: "#checkout" }],
    pageFingerprint: "cart",
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

describe("executeRunHandler structured logging", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  beforeEach(() => {
    logSpy.mockClear();
  });

  afterAll(() => {
    logSpy.mockRestore();
  });

  it("logs request, artifact, self-report, browser resolution, and response events", async () => {
    const page = new MockBrowserPage(createPage());
    const handler = createExecuteRunHandler({
      browser: {
        newContext: vi.fn(async () => ({
          newPage: vi.fn(async () => page),
          close: vi.fn(async () => undefined),
        })),
      },
      leaseClient: {
        acquire: vi.fn(async () => ({ ok: true as const, leaseId: "lease-1" })),
        release: vi.fn(async () => undefined),
      },
      selectAction: vi.fn(async () => ({
        type: "finish",
        rationale: "The task is already complete.",
      })),
      fetch: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) as { eventType: string } : null;
        if (body?.eventType === "heartbeat") {
          return Response.json({ ok: true, shouldStop: false }, { status: 200 });
        }

        return new Response(null, { status: 204 });
      }) as typeof fetch,
      generateSelfReport: vi.fn(async ({ onResult }) => {
        onResult?.({ success: false, fallback: true, reason: "deterministic_fallback" });
        return {
          perceivedSuccess: true,
          answers: {
            "Did you finish?": true,
          },
        };
      }),
    });

    const bucket = {
      get: vi.fn(async () => null),
      put: vi.fn(async () => undefined),
    };

    const response = await handler(createRequest(), {
      ARTIFACTS: bucket,
    });

    expect(response.status).toBe(200);
    const events = parseEvents(logSpy);

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "handler.request",
        runId: "run_handler_logging",
        studyId: "study_handler_logging",
        goal: "Finish the purchase",
      }),
      expect.objectContaining({
        event: "handler.browser",
        runId: "run_handler_logging",
        branch: "options.browser",
      }),
      expect.objectContaining({
        event: "handler.artifacts",
        runId: "run_handler_logging",
        milestoneCount: 2,
        manifestKey: "runs/run_handler_logging/manifest.json",
      }),
      expect.objectContaining({
        event: "handler.selfReport",
        runId: "run_handler_logging",
        success: false,
        fallback: true,
      }),
      expect.objectContaining({
        event: "handler.response",
        runId: "run_handler_logging",
        status: 200,
        outcome: "SUCCESS",
      }),
    ]));
  });
});
