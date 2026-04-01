import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createProgressReporter } from "./progressReporter";

function parseEvents(spy: ReturnType<typeof vi.spyOn>) {
  return spy.mock.calls.map(([value]) => JSON.parse(String(value)) as Record<string, unknown>);
}

describe("progressReporter structured logging", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
  const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  beforeEach(() => {
    logSpy.mockClear();
    errorSpy.mockClear();
  });

  afterAll(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("logs successful callback delivery", async () => {
    const reporter = createProgressReporter({
      runId: "run_progress_logging",
      callbackBaseUrl: "https://convex.example.com",
      callbackToken: "token",
      fetch: vi.fn(async () => Response.json({ ok: true, shouldStop: false }, { status: 200 })) as typeof fetch,
    });

    await expect(reporter.sendHeartbeat()).resolves.toBe(false);

    expect(parseEvents(logSpy)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "callback.sent",
        runId: "run_progress_logging",
        type: "heartbeat",
        status: 200,
      }),
    ]));
  });

  it("logs callback delivery failures", async () => {
    const reporter = createProgressReporter({
      runId: "run_progress_logging",
      callbackBaseUrl: "https://convex.example.com",
      callbackToken: "token",
      fetch: vi.fn(async () => new Response("nope", { status: 500 })) as typeof fetch,
    });

    await expect(
      reporter.sendMilestone({
        stepIndex: 0,
        url: "https://shop.example.com/cart",
        title: "Cart",
        actionType: "click",
        rationaleShort: "Pressed checkout",
      }),
    ).rejects.toThrow("Run progress callback failed with status 500");

    expect(parseEvents(errorSpy)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "callback.error",
        runId: "run_progress_logging",
        type: "milestone",
        error: "Run progress callback failed with status 500",
      }),
    ]));
  });

  it("logs malformed heartbeat acknowledgements that are ignored", async () => {
    const reporter = createProgressReporter({
      runId: "run_progress_logging",
      callbackBaseUrl: "https://convex.example.com",
      callbackToken: "token",
      fetch: vi.fn(async () => new Response("not json", {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch,
    });

    await expect(reporter.sendHeartbeat()).resolves.toBe(false);

    expect(parseEvents(errorSpy)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "callback.error",
        runId: "run_progress_logging",
        type: "heartbeat",
      }),
    ]));
  });
});
