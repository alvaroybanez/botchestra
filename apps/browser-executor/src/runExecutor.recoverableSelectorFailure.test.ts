import { describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import {
  createRunExecutor,
  type AgentAction,
  type BrowserPageSnapshot,
} from "./runExecutor";

class MockBrowserPage {
  readonly gotoCalls: string[] = [];
  readonly clickCalls: string[] = [];

  constructor(private readonly state: BrowserPageSnapshot) {}

  async snapshot() {
    return structuredClone(this.state);
  }

  async screenshot() {
    return new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  }

  async goto(url: string) {
    this.gotoCalls.push(url);
  }

  async click(selector: string) {
    this.clickCalls.push(selector);

    if (selector === "#missing") {
      throw new Error("No element found for selector: #missing");
    }
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

function createExecuteRunRequest(
  overrides: Partial<ExecuteRunRequest> = {},
): ExecuteRunRequest {
  return {
    runId: "run_selector_recovery",
    studyId: "study_selector_recovery",
    personaVariant: {
      id: "variant_123",
      personaConfigId: "pack_123",
      syntheticUserId: "proto_123",
      axisValues: { confidence: 0.2 },
      edgeScore: 0.4,
      tensionSeed: "I expect to recover if something fails.",
      firstPersonBio: "I keep trying until I find the right control.",
      behaviorRules: ["Recover from errors by trying a different path"],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    },
    taskSpec: {
      scenario: "Submit a contact form",
      goal: "Send the contact form successfully",
      startingUrl: "https://shop.example.com/contact",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["goto", "click", "type", "select", "scroll", "wait", "back", "finish", "abort"],
      forbiddenActions: [],
      successCriteria: ["Confirmation is visible"],
      stopConditions: ["Form submitted"],
      postTaskQuestions: ["Did the form submit?"],
      maxSteps: 3,
      maxDurationSec: 60,
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
    url: "https://shop.example.com/contact",
    title: "Contact",
    visibleText: "Fill out the contact form",
    interactiveElements: [
      {
        role: "button",
        label: "Submit",
        selector: "#submit",
      },
    ],
    pageFingerprint: "contact-page",
    branchOptions: [],
    isMajorBranchDecision: false,
    navigationError: null,
    httpStatus: 200,
    deadEnd: false,
    agentNotes: null,
    ...overrides,
  };
}

describe("runExecutor recoverable selector failures", () => {
  it("lets the run continue after a missing click selector and surfaces the failure in action history", async () => {
    const page = new MockBrowserPage(createPageState());
    const { browser, context } = createMockBrowser(page);
    const leaseClient = createLeaseClient();
    const selectAction = vi.fn(async ({ actionHistory }) => {
      if (actionHistory.length === 0) {
        return {
          type: "click",
          selector: "#missing",
          rationale: "Try the primary submit button first.",
        } satisfies AgentAction;
      }

      expect(actionHistory).toEqual([
        {
          stepIndex: 0,
          actionType: "click",
          target: "#missing",
          outcome: "action failed: No element found for selector: #missing",
        },
      ]);

      return {
        type: "finish",
        rationale: "The previous selector failed, so stop and let the agent choose a different action next.",
      } satisfies AgentAction;
    });
    const runExecutor = createRunExecutor({
      browser,
      leaseClient,
      selectAction,
    });

    const result = await runExecutor.execute(createExecuteRunRequest());

    expect(result).toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
      stepCount: 2,
    });
    expect(page.gotoCalls).toEqual(["https://shop.example.com/contact"]);
    expect(page.clickCalls).toEqual(["#missing"]);
    expect(selectAction).toHaveBeenCalledTimes(2);
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(leaseClient.release).toHaveBeenCalledWith("lease-1");
  });
});
