import { describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import { createArtifactUploader } from "./artifactUploader";
import {
  createRunExecutor,
  type AgentAction,
  type BrowserPageSnapshot,
} from "./runExecutor";

function createJpegWithMetadata() {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe1, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00,
    0xff, 0xdb, 0x00, 0x04, 0x00, 0x00,
    0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
    0x11, 0x22,
    0xff, 0xd9,
  ]);
}

class MockBrowserPage {
  readonly screenshot = vi.fn(async () => createJpegWithMetadata());

  private currentState: BrowserPageSnapshot;

  constructor(initialState: BrowserPageSnapshot) {
    this.currentState = structuredClone(initialState);
  }

  async snapshot() {
    return structuredClone(this.currentState);
  }

  async goto(url: string) {
    this.currentState = {
      ...this.currentState,
      url,
    };
  }

  async click(_selector: string) {}

  async type(_selector: string, _text: string) {}

  async select(_selector: string, _value: string) {}

  async scroll(_deltaY = 0) {}

  async wait(_durationMs = 0) {}

  async back() {}
}

function createExecuteRunRequest(
  overrides: Partial<ExecuteRunRequest> = {},
): ExecuteRunRequest {
  return {
    runId: "run_123",
    studyId: "study_123",
    personaVariant: {
      id: "variant_123",
      personaConfigId: "pack_123",
      syntheticUserId: "proto_123",
      axisValues: { confidence: 0.4 },
      edgeScore: 0.8,
      tensionSeed: "I want to finish checkout quickly.",
      firstPersonBio: "I prefer straightforward flows with obvious next steps.",
      behaviorRules: ["Stay on the primary path"],
      coherenceScore: 0.9,
      distinctnessScore: 0.8,
      accepted: true,
    },
    taskSpec: {
      scenario: "Buy a product",
      goal: "Complete checkout",
      startingUrl: "https://shop.example.com/cart",
      allowedDomains: ["shop.example.com"],
      allowedActions: ["goto", "click", "type", "select", "scroll", "wait", "back", "finish", "abort"],
      forbiddenActions: [],
      successCriteria: ["Checkout completes"],
      stopConditions: ["Order confirmation is visible"],
      postTaskQuestions: ["What was hardest?"],
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

async function runWithArtifacts(options: {
  bucket: {
    put: ReturnType<typeof vi.fn<(key: string, value: unknown, options?: unknown) => Promise<void>>>;
  };
  actions?: AgentAction[];
}) {
  const page = new MockBrowserPage(createPageState());
  const context = {
    newPage: vi.fn(async () => page),
    close: vi.fn(async () => undefined),
  };
  const browser = {
    newContext: vi.fn(async () => context),
  };
  const uploader = createArtifactUploader({
    runId: "run_123",
    bucket: options.bucket,
  });
  const actions = [...(options.actions ?? [{ type: "finish", rationale: "The checkout task is complete." }])];
  const runExecutor = createRunExecutor({
    browser,
    leaseClient: createLeaseClient(),
    selectAction: vi.fn(async () => actions.shift() ?? { type: "finish" }),
    onMilestone: uploader.handleMilestone,
  });

  const result = await runExecutor.execute(createExecuteRunRequest());
  const manifestKey = await uploader.writeManifest(result);

  return {
    page,
    result,
    manifestKey,
  };
}

describe("artifactUploader", () => {
  it("uploads milestone screenshots using the run-scoped R2 key pattern", async () => {
    const bucket = {
      put: vi.fn(async (_key: string, _value: unknown, _options?: unknown) => undefined),
    };

    const { page, result, manifestKey } = await runWithArtifacts({ bucket });

    expect(result).toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
      stepCount: 1,
    });
    expect(page.screenshot).toHaveBeenCalledTimes(2);
    expect(bucket.put).toHaveBeenNthCalledWith(
      1,
      "runs/run_123/milestones/0_start.jpg",
      expect.any(Uint8Array),
      { httpMetadata: { contentType: "image/jpeg" } },
    );
    expect(bucket.put).toHaveBeenNthCalledWith(
      2,
      "runs/run_123/milestones/0_finish.jpg",
      expect.any(Uint8Array),
      { httpMetadata: { contentType: "image/jpeg" } },
    );
    expect(page.screenshot).toHaveBeenNthCalledWith(1, { type: "jpeg", quality: 80 });
    expect(page.screenshot).toHaveBeenNthCalledWith(2, { type: "jpeg", quality: 80 });
    expect(bucket.put.mock.calls[0]?.[1]).toEqual(Uint8Array.from([
      0xff, 0xd8,
      0xff, 0xdb, 0x00, 0x04, 0x00, 0x00,
      0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
      0x11, 0x22,
      0xff, 0xd9,
    ]));
    expect(manifestKey).toBe("runs/run_123/manifest.json");
  });

  it("writes a parseable manifest at run end listing uploaded artifacts", async () => {
    const bucket = {
      put: vi.fn(async (_key: string, _value: unknown, _options?: unknown) => undefined),
    };

    await runWithArtifacts({ bucket });

    expect(bucket.put).toHaveBeenCalledTimes(3);

    expect(bucket.put).toHaveBeenNthCalledWith(
      3,
      "runs/run_123/manifest.json",
      expect.any(String),
      { httpMetadata: { contentType: "application/json" } },
    );

    const manifestBody = bucket.put.mock.calls[2]![1];
    expect(typeof manifestBody).toBe("string");

    const manifest = JSON.parse(manifestBody as string) as {
      runId: string;
      finalOutcome: string;
      artifacts: Array<{ key: string; stepIndex: number; actionType: string }>;
    };

    expect(manifest).toMatchObject({
      runId: "run_123",
      finalOutcome: "SUCCESS",
      artifacts: [
        {
          key: "runs/run_123/milestones/0_start.jpg",
          stepIndex: 0,
          actionType: "start",
        },
        {
          key: "runs/run_123/milestones/0_finish.jpg",
          stepIndex: 0,
          actionType: "finish",
        },
      ],
    });
  });

  it("does not fail the run when R2 uploads throw", async () => {
    const bucket = {
      put: vi.fn(async (_key: string, _value: unknown, _options?: unknown) => {
        throw new Error("R2 unavailable");
      }),
    };

    const { page, result, manifestKey } = await runWithArtifacts({ bucket });

    expect(result).toMatchObject({
      ok: true,
      finalOutcome: "SUCCESS",
      stepCount: 1,
    });
    expect(page.screenshot).toHaveBeenCalledTimes(2);
    expect(bucket.put).toHaveBeenCalledWith(
      "runs/run_123/milestones/0_start.jpg",
      expect.any(Uint8Array),
      { httpMetadata: { contentType: "image/jpeg" } },
    );
    expect(bucket.put).toHaveBeenCalledWith(
      "runs/run_123/milestones/0_finish.jpg",
      expect.any(Uint8Array),
      { httpMetadata: { contentType: "image/jpeg" } },
    );
    expect(manifestKey).toBeUndefined();
  });
});
