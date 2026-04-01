import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ExecuteRunRequest } from "@botchestra/shared";
import { createArtifactUploader } from "./artifactUploader";
import { generateSelfReport } from "./selfReport";
import type { RunExecutionResult, RunMilestone } from "./runExecutor";

function parseEvents(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.map(([value]) => JSON.parse(String(value)) as Record<string, unknown>);
}

function createMilestone(): RunMilestone {
  return {
    stepIndex: 0,
    url: "https://shop.example.com/cart",
    title: "Cart",
    actionType: "start",
    rationaleShort: "Loaded the starting page.",
    captureReason: "always",
  };
}

function createRequest(): ExecuteRunRequest {
  return {
    runId: "run_error_logging",
    studyId: "study_error_logging",
    personaVariant: {
      id: "variant_error_logging",
      personaConfigId: "config_error_logging",
      syntheticUserId: "user_error_logging",
      axisValues: { patience: 0.5 },
      edgeScore: 0.5,
      tensionSeed: "I want clarity.",
      firstPersonBio: "I am cautious.",
      behaviorRules: ["Prefer obvious paths"],
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
      successCriteria: ["Confirmation visible"],
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

function createResult(): RunExecutionResult {
  return {
    ok: true,
    finalOutcome: "SUCCESS",
    stepCount: 1,
    durationSec: 2,
    frustrationCount: 0,
    milestones: [createMilestone()],
  };
}

describe("silent catch blocks emit structured errors", () => {
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  beforeEach(() => {
    errorSpy.mockClear();
  });

  afterAll(() => {
    errorSpy.mockRestore();
  });

  it("logs artifact upload failures for milestone screenshots and manifests", async () => {
    const uploader = createArtifactUploader({
      runId: "run_error_logging",
      bucket: {
        put: vi.fn(async () => {
          throw new Error("R2 unavailable");
        }),
      },
    });

    await expect(
      uploader.handleMilestone(createMilestone(), new Uint8Array([0xff, 0xd8, 0xff, 0xd9])),
    ).resolves.toBeUndefined();
    await expect(uploader.writeManifest(createResult())).resolves.toBeUndefined();

    expect(parseEvents(errorSpy)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "artifacts.milestone.error",
        runId: "run_error_logging",
        error: "R2 unavailable",
      }),
      expect.objectContaining({
        event: "artifacts.manifest.error",
        runId: "run_error_logging",
        error: "R2 unavailable",
      }),
    ]));
  });

  it("logs self-report generation failures before falling back", async () => {
    const onResult = vi.fn();

    await expect(generateSelfReport({
      request: createRequest(),
      result: createResult(),
      onResult,
      generateText: vi.fn(async () => {
        throw new Error("LLM offline");
      }),
    })).resolves.toMatchObject({
      perceivedSuccess: true,
      answers: {
        "Did you finish?": "The task reached a successful end state.",
      },
    });

    expect(onResult).toHaveBeenCalledWith({
      success: false,
      fallback: true,
      reason: "exception",
    });
    expect(parseEvents(errorSpy)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "selfReport.error",
        runId: "run_error_logging",
        error: "LLM offline",
      }),
    ]));
  });
});
