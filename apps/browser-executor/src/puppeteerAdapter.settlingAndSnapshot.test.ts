import { describe, expect, it, vi } from "vitest";
import type { BrowserPageSnapshot } from "./runExecutor";
import { PuppeteerPageAdapter } from "./puppeteerAdapter";

type SnapshotPayload = Pick<BrowserPageSnapshot, "url" | "title" | "visibleText" | "interactiveElements">;

class MockPuppeteerPage {
  readonly click = vi.fn(async () => undefined);
  readonly type = vi.fn(async () => undefined);
  readonly select = vi.fn(async () => undefined);
  readonly goto = vi.fn(async () => undefined);
  readonly goBack = vi.fn(async () => undefined);
  readonly setViewport = vi.fn(async () => undefined);
  readonly setExtraHTTPHeaders = vi.fn(async () => undefined);
  readonly screenshot = vi.fn(async () => new Uint8Array([1, 2, 3]));
  readonly waitForTimeout = vi.fn(async () => undefined);
  readonly waitForNavigation = vi.fn(async () => undefined);
  readonly evaluateCalls: Array<{ fn: unknown; args: unknown[] }> = [];

  constructor(private readonly snapshotResult: SnapshotPayload) {}

  async evaluate<T>(fn: unknown, ...args: unknown[]) {
    this.evaluateCalls.push({ fn, args });

    if (args.length === 0) {
      return {
        ...this.snapshotResult,
        pageFingerprint: null,
        branchOptions: null,
        isMajorBranchDecision: false,
        navigationError: null,
        httpStatus: null,
        deadEnd: false,
        agentNotes: null,
      } satisfies BrowserPageSnapshot as T;
    }

    return undefined as T;
  }
}

function createSnapshotResult(): SnapshotPayload {
  return {
    url: "https://shop.example.com/cart",
    title: "Cart",
    visibleText: "Review your cart before checkout",
    interactiveElements: [
      {
        role: "link",
        label: "Help",
        selector: "a[href='/help']",
        href: "/help",
      },
      {
        role: "button",
        label: "Checkout",
        selector: "#checkout",
      },
    ],
  };
}

describe("PuppeteerPageAdapter settling and link snapshots", () => {
  it("captures href metadata for link snapshots", async () => {
    const puppeteerPage = new MockPuppeteerPage(createSnapshotResult());
    const adapter = new PuppeteerPageAdapter(puppeteerPage);

    const snapshot = await adapter.snapshot();

    expect(snapshot.interactiveElements[0]).toMatchObject({
      role: "link",
      label: "Help",
      selector: "a[href='/help']",
      href: "/help",
    });
    expect(String(puppeteerPage.evaluateCalls[0]?.fn)).toContain("getAttribute(\"href\")");
  });

  it("waits for SPA settling after click, type, and select actions", async () => {
    const puppeteerPage = new MockPuppeteerPage(createSnapshotResult());
    const adapter = new PuppeteerPageAdapter(puppeteerPage);

    await adapter.click("#checkout");
    await adapter.type("#email", "hello@example.com");
    await adapter.select("#country", "es");

    expect(puppeteerPage.click).toHaveBeenCalledWith("#checkout");
    expect(puppeteerPage.type).toHaveBeenCalledWith("#email", "hello@example.com");
    expect(puppeteerPage.select).toHaveBeenCalledWith("#country", "es");
    expect(puppeteerPage.waitForNavigation).toHaveBeenNthCalledWith(1, {
      waitUntil: "networkidle0",
      timeout: 2000,
    });
    expect(puppeteerPage.waitForNavigation).toHaveBeenNthCalledWith(2, {
      waitUntil: "networkidle0",
      timeout: 2000,
    });
    expect(puppeteerPage.waitForNavigation).toHaveBeenNthCalledWith(3, {
      waitUntil: "networkidle0",
      timeout: 2000,
    });
    expect(puppeteerPage.waitForTimeout).toHaveBeenCalledTimes(3);
    expect(puppeteerPage.waitForTimeout).toHaveBeenNthCalledWith(1, 2000);
    expect(puppeteerPage.waitForTimeout).toHaveBeenNthCalledWith(2, 2000);
    expect(puppeteerPage.waitForTimeout).toHaveBeenNthCalledWith(3, 2000);
  });
});
