import type {
  Browser as CloudflarePuppeteerBrowser,
  BrowserContext as CloudflarePuppeteerBrowserContext,
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
  createBrowserContext(): Promise<PuppeteerBrowserContextLike>;
};

type PuppeteerBrowserContextLike = {
  newPage(): Promise<PuppeteerPageLike>;
  close(): Promise<unknown>;
};

type PuppeteerPageLike = {
  click(selector: string): Promise<unknown>;
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
  waitForTimeout?: (durationMs: number) => Promise<unknown>;
};

type _BrowserCompatibility = CloudflarePuppeteerBrowser extends PuppeteerBrowserLike ? true : never;
type _BrowserContextCompatibility = CloudflarePuppeteerBrowserContext extends PuppeteerBrowserContextLike ? true : never;
type _PageCompatibility = CloudflarePuppeteerPage extends PuppeteerPageLike ? true : never;

const DEFAULT_SCREENSHOT_OPTIONS: BrowserScreenshotOptions = {
  type: "jpeg",
  quality: 80,
};

const DEFAULT_SCROLL_DELTA_Y = 640;
const DEFAULT_WAIT_DURATION_MS = 250;

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
        .map((element) => ({
          role: getRole(element),
          label: getLabel(element) || "Unlabeled element",
          selector: buildSelector(element),
          hint: getHint(element),
          disabled: isDisabled(element),
        }));

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
  }

  async type(selector: string, text: string) {
    await this.page.type(selector, text);
  }

  async select(selector: string, value: string) {
    await this.page.select(selector, value);
  }

  async scroll(deltaY = DEFAULT_SCROLL_DELTA_Y) {
    await this.page.evaluate((top) => {
      window.scrollBy({ top, behavior: "auto" });
    }, deltaY);
  }

  async wait(durationMs = DEFAULT_WAIT_DURATION_MS) {
    if (typeof this.page.waitForTimeout === "function") {
      await this.page.waitForTimeout(durationMs);
      return;
    }

    await this.page.evaluate((timeoutMs) => {
      return new Promise<void>((resolve) => {
        window.setTimeout(resolve, timeoutMs);
      });
    }, durationMs);
  }

  async back() {
    await this.page.goBack();
  }
}

class PuppeteerBrowserContextAdapter implements BrowserContext {
  constructor(
    private readonly context: PuppeteerBrowserContextLike,
    private readonly options: BrowserContextOptions,
  ) {}

  async newPage(): Promise<BrowserPage> {
    const page = await this.context.newPage();
    await configurePage(page, this.options);
    return new PuppeteerPageAdapter(page);
  }

  async close() {
    await this.context.close();
  }
}

export class PuppeteerBrowserAdapter implements BrowserLike {
  constructor(private readonly browser: PuppeteerBrowserLike) {}

  async newContext(options: BrowserContextOptions): Promise<BrowserContext> {
    const context = await this.browser.createBrowserContext();
    return new PuppeteerBrowserContextAdapter(context, options);
  }
}
