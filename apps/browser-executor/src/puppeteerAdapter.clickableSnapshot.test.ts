import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrowserPageSnapshot } from "./runExecutor";
import { PuppeteerPageAdapter } from "./puppeteerAdapter";

type SnapshotPayload = Pick<BrowserPageSnapshot, "url" | "title" | "visibleText" | "interactiveElements">;

type BrowserGlobals = {
  window: typeof globalThis.window;
  document: typeof globalThis.document;
  HTMLElement: typeof globalThis.HTMLElement;
  HTMLAnchorElement: typeof globalThis.HTMLAnchorElement;
  HTMLButtonElement: typeof globalThis.HTMLButtonElement;
  HTMLInputElement: typeof globalThis.HTMLInputElement;
  HTMLSelectElement: typeof globalThis.HTMLSelectElement;
  HTMLTextAreaElement: typeof globalThis.HTMLTextAreaElement;
  CSS: typeof globalThis.CSS;
};

const originalGlobals: BrowserGlobals = {
  window: globalThis.window,
  document: globalThis.document,
  HTMLElement: globalThis.HTMLElement,
  HTMLAnchorElement: globalThis.HTMLAnchorElement,
  HTMLButtonElement: globalThis.HTMLButtonElement,
  HTMLInputElement: globalThis.HTMLInputElement,
  HTMLSelectElement: globalThis.HTMLSelectElement,
  HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
  CSS: globalThis.CSS,
};

type ComputedStyle = {
  display: string;
  visibility: string;
  opacity: string;
  cursor: string;
};

class FakeElement {
  readonly children: FakeElement[] = [];
  parentElement: FakeHTMLElement | null = null;
  private readonly attributes = new Map<string, string>();
  private readonly style: ComputedStyle;

  constructor(
    readonly tagName: string,
    attributes: Record<string, string> = {},
    private readonly ownText = "",
    private readonly rect = { width: 120, height: 32 },
  ) {
    for (const [key, value] of Object.entries(attributes)) {
      this.attributes.set(key, value);
    }

    this.style = {
      display: "block",
      visibility: "visible",
      opacity: "1",
      cursor: "auto",
    };

    const styleAttribute = this.attributes.get("style");
    if (styleAttribute) {
      for (const declaration of styleAttribute.split(";")) {
        const [rawKey, rawValue] = declaration.split(":");
        if (!rawKey || !rawValue) {
          continue;
        }

        const key = rawKey.trim() as keyof ComputedStyle;
        const value = rawValue.trim();
        if (key in this.style) {
          this.style[key] = value;
        }
      }
    }
  }

  append(child: FakeElement) {
    child.parentElement = this instanceof FakeHTMLElement ? this : null;
    this.children.push(child);
    return child;
  }

  contains(node: FakeElement | null): boolean {
    if (!node) {
      return false;
    }

    if (this === node) {
      return true;
    }

    return this.children.some((child) => child.contains(node));
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  closest(selector: string) {
    if (selector !== "label") {
      return null;
    }

    let current = this.parentElement;
    while (current) {
      if (current.tagName === "LABEL") {
        return current;
      }

      current = current.parentElement;
    }

    return null;
  }

  getBoundingClientRect() {
    return {
      width: this.rect.width,
      height: this.rect.height,
    };
  }

  get id() {
    return this.getAttribute("id") ?? "";
  }

  get textContent(): string {
    return [this.ownText, ...this.children.map((child) => child.textContent)]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
}

class FakeHTMLElement extends FakeElement {
  get innerText(): string {
    return [this.textContent, ...this.children.map((child) => child instanceof FakeHTMLElement ? child.innerText : child.textContent)]
      .filter(Boolean)
      .join(" ")
      .trim();
  }
}

class FakeHTMLAnchorElement extends FakeHTMLElement {}
class FakeHTMLButtonElement extends FakeHTMLElement {
  readonly disabled = false;
}
class FakeHTMLInputElement extends FakeHTMLElement {
  readonly disabled = false;
  readonly labels: FakeHTMLElement[] = [];
  readonly placeholder = "";
  readonly type = this.getAttribute("type") ?? "text";
}
class FakeHTMLSelectElement extends FakeHTMLElement {
  readonly disabled = false;
  readonly selectedOptions: Array<{ textContent: string }> = [];
}
class FakeHTMLTextAreaElement extends FakeHTMLElement {
  readonly disabled = false;
  readonly labels: FakeHTMLElement[] = [];
  readonly placeholder = "";
}

class FakeDocument {
  readonly body = new FakeHTMLElement("BODY");
  title = "";

  querySelectorAll(selector: string): FakeElement[] {
    const elements = this.getAllElements();

    if (selector === "*") {
      return elements;
    }

    if (selector === "input:not([type='hidden']), textarea, button, a[href], select") {
      return elements.filter((element) => {
        if (element instanceof FakeHTMLInputElement) {
          return element.type !== "hidden";
        }

        return (
          element instanceof FakeHTMLTextAreaElement ||
          element instanceof FakeHTMLButtonElement ||
          (element instanceof FakeHTMLAnchorElement && element.getAttribute("href")) ||
          element instanceof FakeHTMLSelectElement
        );
      });
    }

    return [];
  }

  getElementById(id: string): FakeElement | null {
    return this.getAllElements().find((element) => element.id === id) ?? null;
  }

  private getAllElements(): FakeElement[] {
    const elements: FakeElement[] = [];

    const visit = (element: FakeElement) => {
      for (const child of element.children) {
        elements.push(child);
        visit(child);
      }
    };

    visit(this.body);
    return elements;
  }
}

class FakeWindow {
  readonly location = {
    href: "https://shop.example.com/products",
  };
  readonly HTMLElement = FakeHTMLElement;
  readonly HTMLAnchorElement = FakeHTMLAnchorElement;
  readonly HTMLButtonElement = FakeHTMLButtonElement;
  readonly HTMLInputElement = FakeHTMLInputElement;
  readonly HTMLSelectElement = FakeHTMLSelectElement;
  readonly HTMLTextAreaElement = FakeHTMLTextAreaElement;
  readonly CSS = undefined;

  constructor(readonly document: FakeDocument) {}

  getComputedStyle(element: FakeElement) {
    return {
      display: element.getAttribute("style")?.includes("display:none") ? "none" : "block",
      visibility: element.getAttribute("style")?.includes("visibility:hidden") ? "hidden" : "visible",
      opacity: element.getAttribute("style")?.includes("opacity:0") ? "0" : "1",
      cursor: element.getAttribute("style")?.includes("cursor:pointer") ? "pointer" : "auto",
    };
  }
}

class DomBackedPuppeteerPage {
  readonly click = vi.fn(async () => undefined);
  readonly type = vi.fn(async () => undefined);
  readonly select = vi.fn(async () => undefined);
  readonly goto = vi.fn(async () => undefined);
  readonly goBack = vi.fn(async () => undefined);
  readonly setViewport = vi.fn(async () => undefined);
  readonly setExtraHTTPHeaders = vi.fn(async () => undefined);
  readonly screenshot = vi.fn(async () => new Uint8Array([1, 2, 3]));
  readonly waitForTimeout = vi.fn(async () => undefined);
  readonly evaluateCalls: Array<{ fn: unknown; args: unknown[] }> = [];

  constructor(private readonly window: FakeWindow) {}

  async evaluate<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult | Promise<TResult>,
    ...args: TArgs
  ): Promise<TResult> {
    this.evaluateCalls.push({ fn, args });

    const previousGlobals: BrowserGlobals = {
      window: globalThis.window,
      document: globalThis.document,
      HTMLElement: globalThis.HTMLElement,
      HTMLAnchorElement: globalThis.HTMLAnchorElement,
      HTMLButtonElement: globalThis.HTMLButtonElement,
      HTMLInputElement: globalThis.HTMLInputElement,
      HTMLSelectElement: globalThis.HTMLSelectElement,
      HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
      CSS: globalThis.CSS,
    };

    Object.assign(globalThis, {
      window: this.window,
      document: this.window.document,
      HTMLElement: this.window.HTMLElement,
      HTMLAnchorElement: this.window.HTMLAnchorElement,
      HTMLButtonElement: this.window.HTMLButtonElement,
      HTMLInputElement: this.window.HTMLInputElement,
      HTMLSelectElement: this.window.HTMLSelectElement,
      HTMLTextAreaElement: this.window.HTMLTextAreaElement,
      CSS: this.window.CSS,
    });

    try {
      return await fn(...args);
    } finally {
      Object.assign(globalThis, previousGlobals);
    }
  }
}

function setRect(element: FakeElement | null, width: number, height: number) {
  if (!element) {
    throw new Error("Expected element to exist");
  }

  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      width,
      height,
      top: 0,
      left: 0,
      right: width,
      bottom: height,
      x: 0,
      y: 0,
      toJSON: () => null,
    }),
  });
}

function createDomSnapshotPage() {
  const document = new FakeDocument();
  document.title = "Products";
  const checkoutButton = document.body.append(
    new FakeHTMLButtonElement("BUTTON", { id: "checkout", style: "cursor:pointer" }, "Checkout"),
  );
  checkoutButton.append(
    new FakeHTMLElement("SPAN", { id: "checkout-label", style: "cursor:pointer" }, "Now", { width: 50, height: 18 }),
  );

  document.body.append(
    new FakeHTMLAnchorElement("A", { id: "help-link", href: "/help", style: "cursor:pointer" }, "Help", {
      width: 64,
      height: 20,
    }),
  );

  const clickableCard = document.body.append(
    new FakeHTMLElement("DIV", { id: "product-card", style: "cursor:pointer" }, "Premium plan", {
      width: 240,
      height: 120,
    }),
  );
  clickableCard.append(
    new FakeHTMLElement("SPAN", { id: "product-card-label", style: "cursor:pointer" }, "View details", {
      width: 100,
      height: 20,
    }),
  );

  document.body.append(
    new FakeHTMLElement("DIV", { id: "tiny-click-target", style: "cursor:pointer" }, "tiny", {
      width: 5,
      height: 5,
    }),
  );
  document.body.append(
    new FakeHTMLElement("DIV", { id: "hidden-click-target", style: "cursor:pointer; display:none" }, "hidden", {
      width: 200,
      height: 60,
    }),
  );

  setRect(document.getElementById("checkout"), 120, 36);

  return new DomBackedPuppeteerPage(new FakeWindow(document));
}

afterEach(() => {
  Object.assign(globalThis, originalGlobals);
});

describe("PuppeteerPageAdapter clickable snapshot detection", () => {
  it("detects cursor-pointer containers after standard interactive elements without duplicates", async () => {
    const puppeteerPage = createDomSnapshotPage();
    const adapter = new PuppeteerPageAdapter(puppeteerPage);

    const snapshot = await adapter.snapshot();

    expect(snapshot).toMatchObject({
      url: "https://shop.example.com/products",
      title: "Products",
    });
    expect(snapshot.visibleText).toContain("Premium plan");
    expect(snapshot.interactiveElements).toEqual([
      {
        ref: "@e1",
        role: "button",
        label: "Checkout Now",
        selector: "#checkout",
        hint: null,
        disabled: false,
      },
      {
        ref: "@e2",
        role: "link",
        label: "Help",
        selector: "#help-link",
        href: "/help",
        hint: null,
        disabled: false,
      },
      {
        ref: "@e3",
        role: "clickable",
        label: "Premium plan View details",
        selector: "#product-card",
        hint: null,
        disabled: false,
      },
    ] satisfies SnapshotPayload["interactiveElements"]);
    expect(String(puppeteerPage.evaluateCalls[0]?.fn)).toContain("querySelectorAll(\"*\")");
    expect(snapshot.interactiveElements.some((element) => element.selector === "#product-card-label")).toBe(false);
    expect(snapshot.interactiveElements.some((element) => element.selector === "#tiny-click-target")).toBe(false);
    expect(snapshot.interactiveElements.some((element) => element.selector === "#hidden-click-target")).toBe(false);
  });
});
