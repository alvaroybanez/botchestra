import { describe, expect, it, vi } from "vitest";

import { createProgressReporter } from "./progressReporter";

const callbackBaseUrl = "https://convex.example.com";
const callbackToken = "callback-token";

function createFetchMock(response: Response) {
  return vi.fn(async () => response) as unknown as typeof fetch;
}

describe("progressReporter heartbeat acknowledgements", () => {
  it("returns shouldStop=true when the callback acknowledges cancellation", async () => {
    const progressReporter = createProgressReporter({
      runId: "run_cancelled",
      callbackBaseUrl,
      callbackToken,
      fetch: createFetchMock(
        Response.json({ ok: true, shouldStop: true }, { status: 200 }),
      ),
    });

    await expect(progressReporter.sendHeartbeat()).resolves.toBe(true);
  });

  it("returns shouldStop=false when the callback allows the run to continue", async () => {
    const progressReporter = createProgressReporter({
      runId: "run_continues",
      callbackBaseUrl,
      callbackToken,
      fetch: createFetchMock(
        Response.json({ ok: true, shouldStop: false }, { status: 200 }),
      ),
    });

    await expect(progressReporter.sendHeartbeat()).resolves.toBe(false);
  });

  it("returns shouldStop=false when the callback body cannot be parsed", async () => {
    const progressReporter = createProgressReporter({
      runId: "run_malformed_ack",
      callbackBaseUrl,
      callbackToken,
      fetch: createFetchMock(
        new Response("not-json", {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      ),
    });

    await expect(progressReporter.sendHeartbeat()).resolves.toBe(false);
  });
});
