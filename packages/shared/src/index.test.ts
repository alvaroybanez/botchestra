import { describe, it, expect } from "vitest";
import {
  ExecuteRunRequestSchema,
  RunProgressUpdateSchema,
  type ExecuteRunRequest,
  type RunProgressUpdate,
} from "./index";

describe("ExecuteRunRequestSchema", () => {
  it("parses a valid payload", () => {
    const input: ExecuteRunRequest = {
      runId: "run_abc123",
      studyId: "study_xyz789",
      personaVariant: {
        id: "pv_001",
        personaPackId: "pp_001",
        protoPersonaId: "proto_001",
        axisValues: { techSavviness: 0.8, patience: -0.3 },
        edgeScore: 0.75,
        tensionSeed: "Frustrated by slow loading times",
        firstPersonBio:
          "I'm a 34-year-old software engineer who hates waiting for pages to load.",
        behaviorRules: [
          "Always try keyboard shortcuts first",
          "Abandon after 3 failed attempts",
        ],
        coherenceScore: 0.92,
        distinctnessScore: 0.85,
        accepted: true,
      },
      taskSpec: {
        scenario: "Complete a checkout flow",
        goal: "Purchase a single item using saved payment method",
        startingUrl: "https://staging.example.com/shop",
        allowedDomains: ["staging.example.com"],
        allowedActions: ["goto", "click", "type", "scroll", "finish"],
        forbiddenActions: ["payment_submission", "email_send"],
        successCriteria: ["Order confirmation page displayed"],
        stopConditions: ["Order confirmed", "Cart empty after checkout attempt"],
        postTaskQuestions: [
          "Did you feel the checkout was straightforward?",
          "What was the hardest part?",
        ],
        maxSteps: 50,
        maxDurationSec: 300,
        environmentLabel: "staging",
        locale: "en-US",
        viewport: { width: 1280, height: 720 },
      },
      callbackToken: "signed-token-abc",
      callbackBaseUrl: "https://convex.example.com",
    };

    const result = ExecuteRunRequestSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.runId).toBe("run_abc123");
      expect(result.data.personaVariant.axisValues).toEqual({
        techSavviness: 0.8,
        patience: -0.3,
      });
      expect(result.data.taskSpec.allowedActions).toContain("click");
    }
  });
});

describe("RunProgressUpdateSchema", () => {
  it("parses a milestone event", () => {
    const input: RunProgressUpdate = {
      runId: "run_abc123",
      eventType: "milestone",
      payload: {
        stepIndex: 3,
        url: "https://staging.example.com/cart",
        title: "Shopping Cart",
        actionType: "click",
        rationaleShort: "Clicked 'Add to Cart' button",
        screenshotKey: "runs/run_abc123/milestones/3_click.jpg",
      },
    };

    const result = RunProgressUpdateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success && result.data.eventType === "milestone") {
      expect(result.data.payload.stepIndex).toBe(3);
    }
  });

  it("parses a completion event", () => {
    const input: RunProgressUpdate = {
      runId: "run_abc123",
      eventType: "completion",
      payload: {
        finalOutcome: "SUCCESS",
        stepCount: 12,
        durationSec: 45.3,
        frustrationCount: 1,
        selfReport: {
          perceivedSuccess: true,
          hardestPart: "Finding the checkout button",
          confidence: 0.9,
          answers: {
            "Did you feel the checkout was straightforward?": true,
            "What was the hardest part?": "Finding the checkout button",
            "How confident are you that you did the right thing?": 0.9,
          },
        },
        artifactManifestKey: "runs/run_abc123/manifest.json",
      },
    };

    const result = RunProgressUpdateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success && result.data.eventType === "completion") {
      expect(result.data.payload.finalOutcome).toBe("SUCCESS");
      expect(result.data.payload.selfReport?.answers).toEqual({
        "Did you feel the checkout was straightforward?": true,
        "What was the hardest part?": "Finding the checkout button",
        "How confident are you that you did the right thing?": 0.9,
      });
    }
  });

  it("parses a heartbeat event", () => {
    const input: RunProgressUpdate = {
      runId: "run_abc123",
      eventType: "heartbeat",
      payload: { timestamp: 1711234567890 },
    };

    const result = RunProgressUpdateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success && result.data.eventType === "heartbeat") {
      expect(result.data.payload.timestamp).toBe(1711234567890);
    }
  });

  it("rejects an invalid payload with correct error path", () => {
    const input = {
      runId: "run_abc123",
      eventType: "completion",
      payload: {
        // missing required: finalOutcome, stepCount, durationSec, frustrationCount
        artifactManifestKey: "runs/run_abc123/manifest.json",
      },
    };

    const result = RunProgressUpdateSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("payload.finalOutcome");
      expect(paths).toContain("payload.stepCount");
      expect(paths).toContain("payload.durationSec");
      expect(paths).toContain("payload.frustrationCount");
    }
  });

  it("rejects ExecuteRunRequest missing required fields", () => {
    const input = {
      runId: "run_abc123",
      // missing: studyId, personaVariant, taskSpec, callbackToken, callbackBaseUrl
    };

    const result = ExecuteRunRequestSchema.safeParse(input);
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("studyId");
      expect(paths).toContain("personaVariant");
      expect(paths).toContain("taskSpec");
      expect(paths).toContain("callbackToken");
      expect(paths).toContain("callbackBaseUrl");
    }
  });

  it("parses a failure event", () => {
    const input: RunProgressUpdate = {
      runId: "run_abc123",
      eventType: "failure",
      payload: {
        errorCode: "MAX_STEPS_EXCEEDED",
        guardrailCode: "DOMAIN_BLOCKED",
        message: "Run exceeded 50 step limit",
        selfReport: {
          perceivedSuccess: false,
          confidence: 0.1,
          answers: {
            "Did you complete the task?": false,
          },
        },
      },
    };

    const result = RunProgressUpdateSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success && result.data.eventType === "failure") {
      expect(result.data.payload.errorCode).toBe("MAX_STEPS_EXCEEDED");
      expect(result.data.payload.guardrailCode).toBe("DOMAIN_BLOCKED");
      expect(result.data.payload.selfReport?.answers).toEqual({
        "Did you complete the task?": false,
      });
    }
  });
});
