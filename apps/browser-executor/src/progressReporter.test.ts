import { describe, expect, it, vi } from "vitest";
import { RunProgressUpdateSchema } from "@botchestra/shared";
import {
  RUN_FAILURE_ERROR_CODES,
  createProgressReporter,
  createProgressReporterFromRequest,
} from "./progressReporter";

const callbackBaseUrl = "https://convex.example.com";
const callbackToken = "callback-token";

type FetchMock = {
  calls: Array<{ input: RequestInfo | URL; init?: RequestInit }>;
  fetch: typeof fetch;
};

function createFetchMock() {
  const calls: FetchMock["calls"] = [];
  const fetch: typeof globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ input, init });
    return new Response(null, { status: 204 });
  }) as unknown as typeof globalThis.fetch;

  return { calls, fetch };
}

function getPostedUpdate(fetchMock: FetchMock) {
  const body = fetchMock.calls[0]?.init?.body;

  if (typeof body !== "string") {
    throw new Error("expected progress callback body to be a JSON string");
  }

  return JSON.parse(body);
}

describe("progressReporter", () => {
  it("sends heartbeat callbacks with bearer auth and schema-valid payloads", async () => {
    const fetchMock = createFetchMock();
    const progressReporter = createProgressReporter({
      runId: "run_heartbeat",
      callbackBaseUrl,
      callbackToken,
      fetch: fetchMock.fetch,
    });

    await progressReporter.sendHeartbeat({ timestamp: 1711234567890 });

    expect(fetchMock.calls).toHaveLength(1);
    expect(fetchMock.calls[0]?.input).toBe("https://convex.example.com/api/run-progress");
    expect(fetchMock.calls[0]?.init).toMatchObject({
      method: "POST",
      headers: {
        authorization: `Bearer ${callbackToken}`,
        "content-type": "application/json",
      },
    });

    const update = getPostedUpdate(fetchMock);
    expect(RunProgressUpdateSchema.safeParse(update).success).toBe(true);
    expect(update).toEqual({
      runId: "run_heartbeat",
      eventType: "heartbeat",
      payload: {
        timestamp: 1711234567890,
      },
    });
  });

  it("sends milestone callbacks with optional screenshot metadata", async () => {
    const fetchMock = createFetchMock();
    const progressReporter = createProgressReporter({
      runId: "run_milestone",
      callbackBaseUrl,
      callbackToken,
      fetch: fetchMock.fetch,
    });

    await progressReporter.sendMilestone({
      stepIndex: 2,
      url: "https://staging.example.com/cart",
      title: "Shopping Cart",
      actionType: "click",
      rationaleShort: "Selected the checkout button",
      screenshotKey: "runs/run_milestone/milestones/2_click.jpg",
    });

    const update = getPostedUpdate(fetchMock);
    expect(RunProgressUpdateSchema.safeParse(update).success).toBe(true);
    expect(update).toEqual({
      runId: "run_milestone",
      eventType: "milestone",
      payload: {
        stepIndex: 2,
        url: "https://staging.example.com/cart",
        title: "Shopping Cart",
        actionType: "click",
        rationaleShort: "Selected the checkout button",
        screenshotKey: "runs/run_milestone/milestones/2_click.jpg",
      },
    });
  });

  it("sends completion callbacks with the required summary metrics", async () => {
    const fetchMock = createFetchMock();
    const progressReporter = createProgressReporter({
      runId: "run_completion",
      callbackBaseUrl,
      callbackToken,
      fetch: fetchMock.fetch,
    });

    await progressReporter.sendCompletion({
      finalOutcome: "SUCCESS",
      stepCount: 2,
      durationSec: 12.5,
      frustrationCount: 1,
      selfReport: {
        perceivedSuccess: true,
        hardestPart: "Finding the checkout CTA",
        confidence: 0.9,
        answers: {
          "Do you think you completed the task?": true,
          "What was the hardest part?": "Finding the checkout CTA",
        },
      },
      artifactManifestKey: "runs/run_completion/manifest.json",
    });

    const update = getPostedUpdate(fetchMock);
    expect(RunProgressUpdateSchema.safeParse(update).success).toBe(true);
    expect(update).toEqual({
      runId: "run_completion",
      eventType: "completion",
      payload: {
        finalOutcome: "SUCCESS",
        stepCount: 2,
        durationSec: 12.5,
        frustrationCount: 1,
        selfReport: {
          perceivedSuccess: true,
          hardestPart: "Finding the checkout CTA",
          confidence: 0.9,
          answers: {
            "Do you think you completed the task?": true,
            "What was the hardest part?": "Finding the checkout CTA",
          },
        },
        artifactManifestKey: "runs/run_completion/manifest.json",
      },
    });
  });

  it.each(RUN_FAILURE_ERROR_CODES)("sends failure callbacks for %s", async (errorCode) => {
    const fetchMock = createFetchMock();
    const progressReporter = createProgressReporter({
      runId: "run_failure",
      callbackBaseUrl,
      callbackToken,
      fetch: fetchMock.fetch,
    });

    await progressReporter.sendFailure({
      errorCode,
      message: `${errorCode} occurred`,
      selfReport: {
        perceivedSuccess: false,
        confidence: 0.2,
        answers: {
          "Did you complete the task?": false,
        },
      },
    });

    const update = getPostedUpdate(fetchMock);
    expect(RunProgressUpdateSchema.safeParse(update).success).toBe(true);
    expect(update).toEqual({
      runId: "run_failure",
      eventType: "failure",
      payload: {
        errorCode,
        message: `${errorCode} occurred`,
        selfReport: {
          perceivedSuccess: false,
          confidence: 0.2,
          answers: {
            "Did you complete the task?": false,
          },
        },
      },
    });
  });

  it("includes an optional guardrail code on failure callbacks", async () => {
    const fetchMock = createFetchMock();
    const progressReporter = createProgressReporter({
      runId: "run_guardrail_failure",
      callbackBaseUrl,
      callbackToken,
      fetch: fetchMock.fetch,
    });

    await progressReporter.sendFailure({
      errorCode: "GUARDRAIL_VIOLATION",
      guardrailCode: "DOMAIN_BLOCKED",
      message: "Navigation left the allowed domains",
    });

    const update = getPostedUpdate(fetchMock);
    expect(RunProgressUpdateSchema.safeParse(update).success).toBe(true);
    expect(update).toEqual({
      runId: "run_guardrail_failure",
      eventType: "failure",
      payload: {
        errorCode: "GUARDRAIL_VIOLATION",
        guardrailCode: "DOMAIN_BLOCKED",
        message: "Navigation left the allowed domains",
      },
    });
  });

  it("rejects invalid payloads before sending them", async () => {
    const fetchMock = createFetchMock();
    const progressReporter = createProgressReporter({
      runId: "run_invalid",
      callbackBaseUrl,
      callbackToken,
      fetch: fetchMock.fetch,
    });

    await expect(
      progressReporter.sendCompletion({
        finalOutcome: "SUCCESS",
        stepCount: -1,
        durationSec: 12.5,
        frustrationCount: 0,
      }),
    ).rejects.toThrow("Invalid run progress update");

    expect(fetchMock.calls).toHaveLength(0);
  });

  it("builds reporters directly from execute-run request fields", async () => {
    const fetchMock = createFetchMock();
    const progressReporter = createProgressReporterFromRequest(
      {
        runId: "run_from_request",
        callbackBaseUrl,
        callbackToken,
      },
      { fetch: fetchMock.fetch },
    );

    await progressReporter.sendHeartbeat({ timestamp: 1 });

    const update = getPostedUpdate(fetchMock);
    expect(update.runId).toBe("run_from_request");
  });
});
