import { describe, expect, it, vi } from "vitest";
import type { BrowserLike, BrowserPage, BrowserPageSnapshot } from "./runExecutor";
import { PuppeteerBrowserAdapter, PuppeteerPageAdapter } from "./puppeteerAdapter";

type SnapshotPayload = Pick<BrowserPageSnapshot, "url" | "title" | "visibleText" | "interactiveElements">;

class MockPuppeteerPage {
  readonly setViewport = vi.fn(async () => undefined);
  readonly setExtraHTTPHeaders = vi.fn(async () => undefined);
  readonly close = vi.fn(async () => undefined);
  readonly goto = vi.fn(async () => undefined);
  readonly click = vi.fn(async () => undefined);
  readonly type = vi.fn(async () => undefined);
  readonly select = vi.fn(async () => ["selected"]);
  readonly goBack = vi.fn(async () => null);
  readonly waitForTimeout = vi.fn(async () => undefined);
  readonly screenshot = vi.fn(async () => Buffer.from([1, 2, 3]));
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

class MockPuppeteerBrowser {
  private pageIndex = 0;
  readonly newPage = vi.fn(async () => {
    const page = this.pages.at(this.pageIndex) ?? this.pages.at(-1);
    this.pageIndex += 1;

    if (!page) {
      throw new Error("No mock page configured");
    }

    return page;
  });

  constructor(private readonly pages: MockPuppeteerPage[]) {}
}

function createSnapshotResult(): SnapshotPayload {
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
      {
        role: "textbox",
        label: "Email",
        selector: "#email",
      },
    ],
  };
}

function expectBrowserLike(browser: BrowserLike) {
  return browser;
}

function expectBrowserPage(page: BrowserPage) {
  return page;
}

describe("puppeteerAdapter", () => {
  it("implements BrowserLike using browser.newPage() and closes tracked pages", async () => {
    const firstPage = new MockPuppeteerPage(createSnapshotResult());
    const secondPage = new MockPuppeteerPage(createSnapshotResult());
    const puppeteerBrowser = new MockPuppeteerBrowser([firstPage, secondPage]);
    const adapter = expectBrowserLike(new PuppeteerBrowserAdapter(puppeteerBrowser));

    const context = await adapter.newContext({
      locale: "en-US",
      viewport: { width: 1280, height: 720 },
    });
    const firstAdapterPage = expectBrowserPage(await context.newPage());
    const secondAdapterPage = expectBrowserPage(await context.newPage());

    expect(firstAdapterPage).toBeInstanceOf(PuppeteerPageAdapter);
    expect(secondAdapterPage).toBeInstanceOf(PuppeteerPageAdapter);
    expect(puppeteerBrowser.newPage).toHaveBeenCalledTimes(2);
    expect(firstPage.setViewport).toHaveBeenCalledWith({ width: 1280, height: 720 });
    expect(firstPage.setExtraHTTPHeaders).toHaveBeenCalledWith({ "Accept-Language": "en-US" });
    expect(secondPage.setViewport).toHaveBeenCalledWith({ width: 1280, height: 720 });
    expect(secondPage.setExtraHTTPHeaders).toHaveBeenCalledWith({ "Accept-Language": "en-US" });

    await expect(context.close()).resolves.toBeUndefined();
    expect(firstPage.close).toHaveBeenCalledTimes(1);
    expect(secondPage.close).toHaveBeenCalledTimes(1);
  });

  it("implements BrowserPage methods and returns snapshot + screenshot data", async () => {
    const puppeteerPage = new MockPuppeteerPage(createSnapshotResult());
    const adapter = expectBrowserPage(new PuppeteerPageAdapter(puppeteerPage));

    const snapshot = await adapter.snapshot();
    const screenshot = await adapter.screenshot({ type: "jpeg", quality: 70 });

    expect(snapshot).toEqual({
      url: "https://shop.example.com/cart",
      title: "Cart",
      visibleText: "Review your cart before checkout",
      interactiveElements: [
        {
          role: "button",
          label: "Checkout",
          selector: "#checkout",
        },
        {
          role: "textbox",
          label: "Email",
          selector: "#email",
        },
      ],
      pageFingerprint: null,
      branchOptions: null,
      isMajorBranchDecision: false,
      navigationError: null,
      httpStatus: null,
      deadEnd: false,
      agentNotes: null,
    });
    expect(screenshot).toBeInstanceOf(Uint8Array);
    expect(Array.from(screenshot)).toEqual([1, 2, 3]);
    expect(puppeteerPage.screenshot).toHaveBeenCalledWith({ type: "jpeg", quality: 70 });
  });

  it("delegates navigation and interaction methods to the puppeteer page", async () => {
    const puppeteerPage = new MockPuppeteerPage(createSnapshotResult());
    const adapter = new PuppeteerPageAdapter(puppeteerPage);

    await adapter.goto("https://shop.example.com/checkout");
    await adapter.click("#checkout");
    await adapter.type("#email", "hello@example.com");
    await adapter.select("#country", "es");
    await adapter.scroll(320);
    await adapter.wait(450);
    await adapter.back();

    expect(puppeteerPage.goto).toHaveBeenCalledWith("https://shop.example.com/checkout");
    expect(puppeteerPage.click).toHaveBeenCalledWith("#checkout");
    expect(puppeteerPage.type).toHaveBeenCalledWith("#email", "hello@example.com");
    expect(puppeteerPage.select).toHaveBeenCalledWith("#country", "es");
    expect(puppeteerPage.waitForTimeout).toHaveBeenCalledWith(450);
    expect(puppeteerPage.goBack).toHaveBeenCalledTimes(1);

    const scrollCall = puppeteerPage.evaluateCalls.at(-1);
    expect(scrollCall?.args).toEqual([320]);
    expect(String(scrollCall?.fn)).toContain("window.scrollBy");
  });
});
