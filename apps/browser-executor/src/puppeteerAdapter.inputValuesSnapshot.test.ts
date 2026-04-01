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
    url: "https://shop.example.com/contact",
    title: "Contact us",
    visibleText: "Get in touch with our team.",
    interactiveElements: [
      {
        role: "textbox",
        label: "Full name",
        selector: "#full-name",
        value: "",
        placeholder: "Jane Smith",
      } as SnapshotPayload["interactiveElements"][number],
      {
        role: "textbox",
        label: "Email",
        selector: "#email",
        value: "alex@example.com",
        placeholder: "jane@example.com",
      } as SnapshotPayload["interactiveElements"][number],
      {
        role: "select",
        label: "Topic",
        selector: "#topic",
        value: "support",
        placeholder: "",
      } as SnapshotPayload["interactiveElements"][number],
    ],
  };
}

describe("PuppeteerPageAdapter input value snapshots", () => {
  it("captures value and placeholder metadata for form controls", async () => {
    const puppeteerPage = new MockPuppeteerPage(createSnapshotResult());
    const adapter = new PuppeteerPageAdapter(puppeteerPage);

    const snapshot = await adapter.snapshot();

    expect(snapshot.interactiveElements).toMatchObject([
      {
        role: "textbox",
        label: "Full name",
        selector: "#full-name",
        value: "",
        placeholder: "Jane Smith",
      },
      {
        role: "textbox",
        label: "Email",
        selector: "#email",
        value: "alex@example.com",
        placeholder: "jane@example.com",
      },
      {
        role: "select",
        label: "Topic",
        selector: "#topic",
        value: "support",
        placeholder: "",
      },
    ]);

    const snapshotExtractor = String(puppeteerPage.evaluateCalls[0]?.fn);
    expect(snapshotExtractor).toContain("element.value");
    expect(snapshotExtractor).toContain("element.placeholder");
  });
});
