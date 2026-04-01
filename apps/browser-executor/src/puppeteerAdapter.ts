import type {
  Browser as CloudflarePuppeteerBrowser,
  Page as CloudflarePuppeteerPage,
} from "@cloudflare/puppeteer";
import type {
  BrowserContext,
  BrowserContextOptions,
  BrowserLike,
  BrowserPage,
  BrowserPageSnapshot,
  BrowserScreenshotOptions,
} from "./runExecutor";

type PuppeteerBrowserLike = {
  newPage(): Promise<PuppeteerPageLike>;
};

type LegacyPuppeteerBrowserLike = {
  createBrowserContext(): Promise<PuppeteerBrowserContextLike>;
};

type PuppeteerBrowserSource = PuppeteerBrowserLike | LegacyPuppeteerBrowserLike;

type PuppeteerBrowserContextLike = {
  newPage(): Promise<PuppeteerPageLike>;
};

type PuppeteerPageLike = {
  click(selector: string): Promise<unknown>;
  close?: () => Promise<unknown>;
  evaluate<TArgs extends unknown[], TResult>(
    pageFunction: (...args: TArgs) => TResult | Promise<TResult>,
    ...args: TArgs
  ): Promise<TResult>;
  goBack(): Promise<unknown>;
  goto(url: string): Promise<unknown>;
  screenshot(options?: BrowserScreenshotOptions): Promise<Uint8Array | ArrayBuffer | string>;
  select(selector: string, value: string): Promise<unknown>;
  setExtraHTTPHeaders(headers: Record<string, string>): Promise<unknown>;
  setViewport(viewport: BrowserContextOptions["viewport"]): Promise<unknown>;
  type(selector: string, text: string): Promise<unknown>;
  waitForNavigation?: (options: { waitUntil: "networkidle0"; timeout: number }) => Promise<unknown>;
  waitForTimeout?: (durationMs: number) => Promise<unknown>;
};

type _BrowserCompatibility = CloudflarePuppeteerBrowser extends PuppeteerBrowserLike ? true : never;
type _PageCompatibility = CloudflarePuppeteerPage extends PuppeteerPageLike ? true : never;

const DEFAULT_SCREENSHOT_OPTIONS: BrowserScreenshotOptions = {
  type: "jpeg",
  quality: 80,
};

const DEFAULT_SCROLL_DELTA_Y = 640;
const DEFAULT_WAIT_DURATION_MS = 250;
const POST_ACTION_SETTLE_TIMEOUT_MS = 2000;

async function configurePage(page: PuppeteerPageLike, options: BrowserContextOptions) {
  await page.setViewport(options.viewport);
  await page.setExtraHTTPHeaders({
    "Accept-Language": options.locale,
  });
}

function toUint8Array(value: Uint8Array | ArrayBuffer | string) {
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }

  return value instanceof Uint8Array ? new Uint8Array(value) : new Uint8Array(value);
}

function isModernPuppeteerBrowser(browser: PuppeteerBrowserSource): browser is PuppeteerBrowserLike {
  return "newPage" in browser && typeof browser.newPage === "function";
}

async function waitForTimeout(page: PuppeteerPageLike, durationMs: number) {
  if (typeof page.waitForTimeout === "function") {
    await page.waitForTimeout(durationMs);
    return;
  }

  await page.evaluate((timeoutMs) => {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    });
  }, durationMs);
}

async function waitForActionToSettle(page: PuppeteerPageLike) {
  const navigationWait =
    typeof page.waitForNavigation === "function"
      ? page.waitForNavigation({
          waitUntil: "networkidle0",
          timeout: POST_ACTION_SETTLE_TIMEOUT_MS,
        }).catch(() => undefined)
      : Promise.resolve(undefined);

  await Promise.race([
    navigationWait,
    waitForTimeout(page, POST_ACTION_SETTLE_TIMEOUT_MS),
  ]);
}

export class PuppeteerPageAdapter implements BrowserPage {
  constructor(private readonly page: PuppeteerPageLike) {}

  async snapshot(): Promise<BrowserPageSnapshot> {
    return this.page.evaluate(() => {
      const normalizeWhitespace = (value: string | null | undefined) => value?.replace(/\s+/g, " ").trim() ?? "";
      const cssEscape =
        typeof CSS !== "undefined" && typeof CSS.escape === "function"
          ? CSS.escape.bind(CSS)
          : (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");

      const isVisible = (element: Element) => {
        if (!(element instanceof HTMLElement)) {
          return false;
        }

        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
          return false;
        }

        const rect = element.getBoundingClientRect();
        return rect.width > 0 || rect.height > 0;
      };

      const buildSelector = (element: Element) => {
        if (!(element instanceof HTMLElement)) {
          return null;
        }

        if (element.id) {
          return `#${cssEscape(element.id)}`;
        }

        const attrCandidates = ["data-testid", "name", "aria-label"] as const;
        for (const attr of attrCandidates) {
          const value = element.getAttribute(attr);
          if (value) {
            return `${element.tagName.toLowerCase()}[${attr}="${cssEscape(value)}"]`;
          }
        }

        const segments: string[] = [];
        let current: HTMLElement | null = element;

        while (current && current !== document.body) {
          let segment = current.tagName.toLowerCase();

          if (current.id) {
            segment += `#${cssEscape(current.id)}`;
            segments.unshift(segment);
            break;
          }

          const currentElement: HTMLElement = current;
          const siblings = currentElement.parentElement
            ? Array.from<Element>(currentElement.parentElement.children).filter(
              (child) => child.tagName === currentElement.tagName,
            )
            : [];

          if (siblings.length > 1) {
            segment += `:nth-of-type(${siblings.indexOf(currentElement) + 1})`;
          }

          segments.unshift(segment);
          current = currentElement.parentElement;
        }

        return segments.join(" > ") || element.tagName.toLowerCase();
      };

      const getLabelFromReferences = (value: string | null) => {
        if (!value) {
          return "";
        }

        return normalizeWhitespace(
          value
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" "),
        );
      };

      const getLabel = (element: Element) => {
        const ariaLabel = normalizeWhitespace(element.getAttribute("aria-label"));
        if (ariaLabel) {
          return ariaLabel;
        }

        const labelledBy = getLabelFromReferences(element.getAttribute("aria-labelledby"));
        if (labelledBy) {
          return labelledBy;
        }

        if (
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
        ) {
          const explicitLabel = normalizeWhitespace(
            Array.from(element.labels ?? [])
              .map((label) => label.textContent ?? "")
              .join(" "),
          );
          if (explicitLabel) {
            return explicitLabel;
          }
        }

        const closestLabel = normalizeWhitespace(element.closest("label")?.textContent);
        if (closestLabel) {
          return closestLabel;
        }

        if (element instanceof HTMLSelectElement) {
          const selectedOption = normalizeWhitespace(element.selectedOptions[0]?.textContent);
          if (selectedOption) {
            return selectedOption;
          }
        }

        const textContent = normalizeWhitespace(element.textContent);
        if (textContent) {
          return textContent;
        }

        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          const placeholder = normalizeWhitespace(element.placeholder);
          if (placeholder) {
            return placeholder;
          }
        }

        return normalizeWhitespace(element.getAttribute("name")) || normalizeWhitespace(element.getAttribute("type"));
      };

      const getRole = (element: Element) => {
        if (element instanceof HTMLAnchorElement) {
          return "link";
        }

        if (element instanceof HTMLButtonElement) {
          return "button";
        }

        if (element instanceof HTMLSelectElement) {
          return "select";
        }

        if (element instanceof HTMLTextAreaElement) {
          return "textbox";
        }

        if (element instanceof HTMLInputElement) {
          const inputType = normalizeWhitespace(element.type).toLowerCase();
          if (inputType === "checkbox" || inputType === "radio") {
            return inputType;
          }

          if (inputType === "submit" || inputType === "button" || inputType === "reset") {
            return "button";
          }

          return "textbox";
        }

        return normalizeWhitespace(element.getAttribute("role")) || element.tagName.toLowerCase();
      };

      const getHint = (element: Element) => {
        if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
          return normalizeWhitespace(element.placeholder) || null;
        }

        return normalizeWhitespace(element.getAttribute("title")) || null;
      };

      const isDisabled = (element: Element) => {
        if (
          element instanceof HTMLButtonElement ||
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
        ) {
          return element.disabled;
        }

        return element.getAttribute("aria-disabled") === "true";
      };

      const interactiveElements = Array.from(
        document.querySelectorAll("input:not([type='hidden']), textarea, button, a[href], select"),
      )
        .filter(isVisible)
        .map((element) => {
          const role = getRole(element);
          const href =
            role === "link" && element instanceof HTMLAnchorElement
              ? normalizeWhitespace(element.getAttribute("href"))
              : "";

          return {
            role,
            label: getLabel(element) || "Unlabeled element",
            selector: buildSelector(element),
            ...(href ? { href } : {}),
            hint: getHint(element),
            disabled: isDisabled(element),
          };
        });

      return {
        url: window.location.href,
        title: document.title,
        visibleText: normalizeWhitespace(document.body?.innerText ?? ""),
        interactiveElements,
        pageFingerprint: null,
        branchOptions: null,
        isMajorBranchDecision: false,
        navigationError: null,
        httpStatus: null,
        deadEnd: false,
        agentNotes: null,
      };
    });
  }

  async screenshot(options: BrowserScreenshotOptions = DEFAULT_SCREENSHOT_OPTIONS): Promise<Uint8Array> {
    const screenshot = await this.page.screenshot(options);
    return toUint8Array(screenshot);
  }

  async goto(url: string) {
    await this.page.goto(url);
  }

  async click(selector: string) {
    await this.page.click(selector);
    await waitForActionToSettle(this.page);
  }

  async type(selector: string, text: string) {
    await this.page.type(selector, text);
    await waitForActionToSettle(this.page);
  }

  async select(selector: string, value: string) {
    await this.page.select(selector, value);
    await waitForActionToSettle(this.page);
  }

  async scroll(deltaY = DEFAULT_SCROLL_DELTA_Y) {
    await this.page.evaluate((top) => {
      window.scrollBy({ top, behavior: "auto" });
    }, deltaY);
  }

  async wait(durationMs = DEFAULT_WAIT_DURATION_MS) {
    await waitForTimeout(this.page, durationMs);
  }

  async back() {
    await this.page.goBack();
  }
}

class PuppeteerBrowserContextAdapter implements BrowserContext {
  private readonly openPages = new Set<PuppeteerPageLike>();
  private isClosed = false;

  constructor(
    private readonly createPage: () => Promise<PuppeteerPageLike>,
    private readonly options: BrowserContextOptions,
  ) {}

  async newPage(): Promise<BrowserPage> {
    if (this.isClosed) {
      throw new Error("Puppeteer browser context is already closed");
    }

    const page = await this.createPage();
    this.openPages.add(page);

    try {
      await configurePage(page, this.options);
      return new PuppeteerPageAdapter(page);
    } catch (error) {
      this.openPages.delete(page);
      await page.close?.();
      throw error;
    }
  }

  async close() {
    this.isClosed = true;

    const pages = Array.from(this.openPages);
    this.openPages.clear();

    await Promise.allSettled(
      pages.map(async (page) => {
        await page.close?.();
      }),
    );
  }
}

export class PuppeteerBrowserAdapter implements BrowserLike {
  constructor(private readonly browser: PuppeteerBrowserSource) {}

  async newContext(options: BrowserContextOptions): Promise<BrowserContext> {
    const browser = this.browser;

    if (isModernPuppeteerBrowser(browser)) {
      return new PuppeteerBrowserContextAdapter(() => browser.newPage(), options);
    }

    const context = await browser.createBrowserContext();
    return new PuppeteerBrowserContextAdapter(() => context.newPage(), options);
  }
}
