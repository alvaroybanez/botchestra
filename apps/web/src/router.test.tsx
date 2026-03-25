import { act } from "react";
import ReactDOM from "react-dom/client";
import {
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getFunctionName } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { contentRoutePlaceholders } from "@/routes/placeholders";
import {
  createAppRouter,
  getRouterLocationHref,
  resolveRedirectPath,
  type AppAuthState,
} from "@/router";

let mockedAuthState: AppAuthState = {
  isAuthenticated: false,
  isLoading: false,
};

let mockedPackList:
  | Doc<"personaPacks">[]
  | undefined = [];
let mockedPackDetail:
  | Doc<"personaPacks">
  | null
  | undefined = null;
let mockedProtoPersonas:
  | Doc<"protoPersonas">[]
  | undefined = [];
type ReviewStudy = {
  _id: string;
  name: string;
  status: string;
  runBudget: number;
  updatedAt: number;
};

type ReviewData = {
  study: ReviewStudy;
  pack: {
    _id: string;
    name: string;
    status: string;
    sharedAxes: {
      key: string;
      label: string;
      description: string;
      lowAnchor: string;
      midAnchor: string;
      highAnchor: string;
      weight: number;
    }[];
  };
  protoPersonas: {
    _id: string;
    name: string;
    summary: string;
  }[];
  variants: {
    _id: string;
    protoPersonaId: string;
    protoPersonaName: string;
    axisValues: { key: string; value: number }[];
    edgeScore: number;
    coherenceScore: number;
    distinctnessScore: number;
    firstPersonBio: string;
  }[];
};

type PackReviewData = ReviewData & {
  selectedStudy: ReviewStudy | null;
  studies: Array<
    ReviewStudy & {
      acceptedVariantCount: number;
    }
  >;
};

let mockedVariantReview: ReviewData | null | undefined = undefined;
let mockedPackVariantReview: PackReviewData | null | undefined = undefined;
const createDraftMock = vi.fn();
const importJsonMock = vi.fn();
const updateDraftMock = vi.fn();
const createProtoPersonaMock = vi.fn();
const publishMock = vi.fn();
const archiveMock = vi.fn();
const generateVariantsMock = vi.fn();

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => mockedAuthState,
  useMutation: (mutation: unknown) => {
    const mutationName = getFunctionName(mutation as never);

    if (mutationName === "personaPacks:createDraft") {
      return createDraftMock;
    }

    if (mutationName === "personaPacks:updateDraft") {
      return updateDraftMock;
    }

    if (mutationName === "personaPacks:createProtoPersona") {
      return createProtoPersonaMock;
    }

    if (mutationName === "personaPacks:publish") {
      return publishMock;
    }

    if (mutationName === "personaPacks:archive") {
      return archiveMock;
    }

    return vi.fn();
  },
  useAction: (action: unknown) => {
    const actionName = getFunctionName(action as never);

    if (actionName === "personaPacks:importJson") {
      return importJsonMock;
    }

    if (actionName === "personaVariantGeneration:generateVariantsForStudy") {
      return generateVariantsMock;
    }

    return vi.fn();
  },
  useQuery: (query: unknown) => {
    const queryName = getFunctionName(query as never);

    if (queryName === "personaPacks:list") {
      return mockedPackList;
    }

    if (queryName === "personaPacks:get") {
      return mockedPackDetail;
    }

    if (queryName === "personaPacks:listProtoPersonas") {
      return mockedProtoPersonas;
    }

    if (queryName === "personaVariantReview:getStudyVariantReview") {
      return mockedVariantReview;
    }

    if (queryName === "personaVariantReview:getPackVariantReview") {
      return mockedPackVariantReview;
    }

    return undefined;
  },
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
  .IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    act(() => {
      root.unmount();
    });
  }
  document.body.innerHTML = "";
});

beforeEach(() => {
  mockedPackList = [];
  mockedPackDetail = null;
  mockedProtoPersonas = [];
  mockedVariantReview = undefined;
  mockedPackVariantReview = undefined;
  createDraftMock.mockReset();
  createDraftMock.mockResolvedValue("new-pack-id" as Id<"personaPacks">);
  importJsonMock.mockReset();
  importJsonMock.mockResolvedValue("imported-pack-id" as Id<"personaPacks">);
  updateDraftMock.mockReset();
  updateDraftMock.mockResolvedValue(undefined);
  createProtoPersonaMock.mockReset();
  createProtoPersonaMock.mockResolvedValue(undefined);
  publishMock.mockReset();
  publishMock.mockResolvedValue(undefined);
  archiveMock.mockReset();
  archiveMock.mockResolvedValue(undefined);
  generateVariantsMock.mockReset();
  generateVariantsMock.mockResolvedValue({
    acceptedCount: 64,
    rejectedCount: 0,
    retryCount: 0,
  });
});

describe("@botchestra/web routing", () => {
  it("renders 10 distinct authenticated placeholders", () => {
    expect(contentRoutePlaceholders).toHaveLength(10);
    expect(
      new Set(contentRoutePlaceholders.map((placeholder) => placeholder.title))
        .size,
    ).toBe(10);
    expect(
      new Set(contentRoutePlaceholders.map((placeholder) => placeholder.detail))
        .size,
    ).toBe(10);
  });

  it("sanitizes redirect targets to local in-app paths", () => {
    expect(resolveRedirectPath("/studies/test-id-123/report")).toBe(
      "/studies/test-id-123/report",
    );
    expect(resolveRedirectPath("https://example.com/settings")).toBe("/studies");
    expect(resolveRedirectPath("//example.com/settings")).toBe("/studies");
  });

  it("redirects authenticated users from root to /studies and renders the app shell", async () => {
    const { container, router } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/"],
    });

    expect(getRouterLocationHref(router)).toBe("/studies");
    expect(container.textContent).toContain("Validation Console");
    expect(container.textContent).toContain("Studies");
    expect(container.textContent).toContain("Browse every validation study");
  });

  it("redirects unauthenticated deep links to login while preserving the target route", async () => {
    const { container, router } = await renderRoute({
      auth: { isAuthenticated: false, isLoading: false },
      initialEntries: ["/studies/test-id-123/report"],
    });

    expect(getRouterLocationHref(router)).toBe(
      "/login?redirect=%2Fstudies%2Ftest-id-123%2Freport",
    );
    expect(container.querySelector("#login-email")).not.toBeNull();
    expect(container.textContent).toContain("Don't have an account? Sign up");
    expect(container.textContent).not.toContain("Validation Console");
  });

  it("shows a loading message while auth state is resolving", async () => {
    const { container } = await renderRoute({
      auth: { isAuthenticated: false, isLoading: true },
      initialEntries: ["/studies"],
    });

    expect(container.textContent).toContain("Loading...");
    expect(container.textContent).not.toContain("Validation Console");
    expect(container.querySelector("#login-email")).toBeNull();
  });

  it("renders an empty state CTA and in-page navigation links on /studies", async () => {
    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies"],
    });

    expect(container.textContent).toContain("Create your first study");
    expect(container.textContent).toContain("Create Study");

    const links = [...container.querySelectorAll("a")].map((link) => ({
      href: link.getAttribute("href"),
      text: link.textContent,
    }));

    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: "/studies/new",
          text: expect.stringContaining("Create Study"),
        }),
        expect.objectContaining({
          href: "/studies/new",
          text: expect.stringContaining("Create your first study"),
        }),
        expect.objectContaining({
          href: "/studies/demo-study/overview",
          text: expect.stringContaining("Checkout usability benchmark"),
        }),
      ]),
    );
  });

  it("renders study tab navigation for the demo study detail routes", async () => {
    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/demo-study/overview"],
    });

    const links = [...container.querySelectorAll("a")].map((link) => ({
      href: link.getAttribute("href"),
      text: link.textContent,
    }));

    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ href: "/studies/demo-study/overview", text: "Overview" }),
        expect.objectContaining({ href: "/studies/demo-study/personas", text: "Personas" }),
        expect.objectContaining({ href: "/studies/demo-study/runs", text: "Runs" }),
        expect.objectContaining({ href: "/studies/demo-study/findings", text: "Findings" }),
        expect.objectContaining({ href: "/studies/demo-study/report", text: "Report" }),
      ]),
    );
  });

  it("renders accepted variants with required review columns", async () => {
    mockedVariantReview = makeVariantReview();

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/personas"],
    });

    expect(container.textContent).toContain("Persona Variant Review");
    expect(container.textContent).toContain("Accepted variants");
    expect(container.textContent).toContain("Proto-persona");
    expect(container.textContent).toContain("Digital confidence");
    expect(container.textContent).toContain("Edge score");
    expect(container.textContent).toContain("Coherence score");
    expect(container.textContent).toContain("Distinctness score");
    expect(container.textContent).toContain("Bio preview");
    expect(getVariantRows(container)).toHaveLength(3);
  });

  it("filters variants by proto-persona and axis range", async () => {
    mockedVariantReview = makeVariantReview();

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/personas"],
    });

    await updateSelect(container, "#proto-persona-filter", "proto-cautious");
    expect(getVariantRows(container)).toHaveLength(2);
    expect(getVariantRows(container).every((row) => row.includes("Cautious checkout shopper"))).toBe(true);

    await updateInput(container, "#minimum-axis-value", "0.5");
    expect(getVariantRows(container)).toHaveLength(0);

    await updateSelect(container, "#proto-persona-filter", "all");
    expect(getVariantRows(container)).toHaveLength(1);
    expect(firstVariantRowText(container)).toContain("Fast-moving repeat buyer");
  });

  it("sorts variants by each score column", async () => {
    mockedVariantReview = makeVariantReview();

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/personas"],
    });

    expect(firstVariantRowText(container)).toContain("Budget-minded parent");

    await clickButton(container, "Coherence score");
    expect(firstVariantRowText(container)).toContain("Fast-moving repeat buyer");

    await clickButton(container, "Distinctness score");
    expect(firstVariantRowText(container)).toContain("Budget-minded parent");

    await clickButton(container, "Edge score");
    await clickButton(container, "Edge score");
    expect(firstVariantRowText(container)).toContain("Fast-moving repeat buyer");
  });

  it("shows a loading indicator and disables generation while variants are generating", async () => {
    mockedVariantReview = makeVariantReview();
    let resolveGeneration: (() => void) | null = null;
    generateVariantsMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveGeneration = () => resolve({
            acceptedCount: 64,
            rejectedCount: 0,
            retryCount: 0,
          });
        }),
    );

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/personas"],
    });

    await clickButton(container, "Generate variants");

    const generateButton = [...container.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Generating variants...",
    );
    expect(generateButton).toBeDefined();
    expect(generateButton).toHaveProperty("disabled", true);
    expect(container.textContent).toContain("Generating variants...");
    expect(generateVariantsMock).toHaveBeenCalledWith({ studyId: "study-live" });

    await act(async () => {
      resolveGeneration?.();
    });

    expect(container.textContent).toContain(
      "Generated 64 accepted variants (0 rejected, 0 retries).",
    );
  });

  it("renders the persona pack empty state when no packs exist", async () => {
    mockedPackList = [];

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs"],
    });

    expect(container.textContent).toContain("No persona packs yet");
    expect(container.textContent).toContain("Create your first pack");
  });

  it("renders active persona packs separately from archived packs", async () => {
    mockedPackList = [
      makePack({
        _id: "pack-draft" as Id<"personaPacks">,
        name: "Checkout Pack",
        status: "draft",
        version: 1,
      }),
      makePack({
        _id: "pack-published" as Id<"personaPacks">,
        name: "Mobile Banking Pack",
        status: "published",
        version: 2,
      }),
      makePack({
        _id: "pack-archived" as Id<"personaPacks">,
        name: "Legacy Support Pack",
        status: "archived",
        version: 3,
      }),
    ];

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs"],
    });

    expect(container.textContent).toContain("Checkout Pack");
    expect(container.textContent).toContain("draft");
    expect(container.textContent).toContain("Mobile Banking Pack");
    expect(container.textContent).toContain("published");
    expect(container.textContent).toContain("Archived packs (1)");

    const archivedSection = container.querySelector("details");
    expect(archivedSection).not.toBeNull();
    expect(archivedSection?.textContent).toContain("Legacy Support Pack");
    expect(archivedSection?.textContent).toContain("archived");

    const links = [...container.querySelectorAll("a")].map((link) =>
      link.getAttribute("href"),
    );
    expect(links).toEqual(
      expect.arrayContaining([
        "/persona-packs/pack-draft",
        "/persona-packs/pack-published",
        "/persona-packs/pack-archived",
      ]),
    );
  });

  it("shows an active-pack empty state when only archived packs remain", async () => {
    mockedPackList = [
      makePack({
        _id: "pack-archived-only" as Id<"personaPacks">,
        name: "Legacy Support Pack",
        status: "archived",
        version: 3,
      }),
    ];

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs"],
    });

    expect(container.textContent).toContain("No active persona packs");
    expect(container.textContent).toContain("Archived packs (1)");
    expect(container.querySelector("details")?.textContent).toContain(
      "Legacy Support Pack",
    );
  });

  it("renders pack detail metadata, shared axes, proto-personas, and audit info", async () => {
    mockedPackDetail = makePack({
      _id: "pack-detail" as Id<"personaPacks">,
      name: "Account Recovery Pack",
      description: "Focused on account recovery and support escalations",
      context: "US fintech support",
      status: "draft",
      updatedBy: "reviewer|org-a",
    });
    mockedProtoPersonas = [
      makeProtoPersona({
        _id: "proto-1" as Id<"protoPersonas">,
        name: "Anxious new customer",
        summary: "Worried about losing access to payroll deposits.",
        sourceType: "json_import",
      }),
    ];
    mockedPackVariantReview = makePackVariantReview();

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs/pack-detail"],
    });

    expect(container.textContent).toContain("Account Recovery Pack");
    expect(container.textContent).toContain("Shared Axes");
    expect(container.textContent).toContain("Digital confidence");
    expect(container.textContent).toContain("Proto-Personas");
    expect(container.textContent).toContain("Anxious new customer");
    expect(container.textContent).toContain("Source: json_import");
    expect(container.textContent).toContain("Audit Trail");
    expect(container.textContent).toContain("researcher|org-a");
    expect(container.textContent).toContain("reviewer|org-a");
    expect(container.textContent).toContain("Last modified by");
    expect(container.textContent).toContain("Variant Review");
    expect(container.textContent).toContain("Linked study");
    expect(container.textContent).toContain("Open study personas page");
    expect(getVariantRows(container)).toHaveLength(3);
  });

  it("imports a pack JSON from the list page and redirects to the imported pack", async () => {
    mockedPackList = [];

    const { container, router } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs"],
    });

    await clickButton(container, "Import Pack");
    await updateTextarea(
      container,
      "#import-pack-json",
      '{"name":"Imported Pack","description":"Loaded from JSON"}',
    );

    const importForm = [...container.querySelectorAll("form")].find((form) =>
      form.querySelector("#import-pack-json"),
    );
    expect(importForm).not.toBeNull();

    await act(async () => {
      importForm!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(importJsonMock).toHaveBeenCalledWith({
      json: '{"name":"Imported Pack","description":"Loaded from JSON"}',
    });
    expect(getRouterLocationHref(router)).toBe("/persona-packs/imported-pack-id");
  });

  it("creates a new pack from the list page and redirects to the detail route", async () => {
    mockedPackList = [];

    const { container, router } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs"],
    });

    await clickButton(container, "Create Pack");
    await updateInput(container, "#create-pack-name", "Storefront Pack");
    await updateTextarea(
      container,
      "#create-pack-description",
      "Pack for storefront and checkout studies",
    );
    await updateInput(container, "#create-pack-context", "US retail");
    await updateInput(container, "#create-pack-axis-0-key", "confidence");
    await updateInput(container, "#create-pack-axis-0-label", "Confidence");
    await updateInput(container, "#create-pack-axis-0-low", "Needs reassurance");
    await updateInput(container, "#create-pack-axis-0-mid", "Can continue alone");
    await updateInput(container, "#create-pack-axis-0-high", "Self-directed");
    await updateInput(container, "#create-pack-axis-0-weight", "1");
    await updateTextarea(
      container,
      "#create-pack-axis-0-description",
      "Comfort with unfamiliar digital tasks.",
    );

    const form = container.querySelector("form");
    expect(form).not.toBeNull();

    await act(async () => {
      form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(createDraftMock).toHaveBeenCalledWith({
      pack: {
        name: "Storefront Pack",
        description: "Pack for storefront and checkout studies",
        context: "US retail",
        sharedAxes: [
          {
            key: "confidence",
            label: "Confidence",
            description: "Comfort with unfamiliar digital tasks.",
            lowAnchor: "Needs reassurance",
            midAnchor: "Can continue alone",
            highAnchor: "Self-directed",
            weight: 1,
          },
        ],
      },
    });
    expect(getRouterLocationHref(router)).toBe("/persona-packs/new-pack-id");
  });

  it("shows publish confirmation and only mutates after confirmation", async () => {
    mockedPackDetail = makePack({
      _id: "pack-publish" as Id<"personaPacks">,
      status: "draft",
    });
    mockedProtoPersonas = [
      makeProtoPersona({ _id: "proto-publish" as Id<"protoPersonas"> }),
    ];

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs/pack-publish"],
    });

    await clickButton(container, "Publish");
    expect(container.textContent).toContain("Publish persona pack?");

    await clickButton(container, "Cancel");
    expect(publishMock).not.toHaveBeenCalled();

    await clickButton(container, "Publish");
    await clickButton(container, "Publish pack");
    expect(publishMock).toHaveBeenCalledWith({ packId: "pack-publish" });
  });

  it("shows archive confirmation before archiving a published pack", async () => {
    mockedPackDetail = makePack({
      _id: "pack-archive" as Id<"personaPacks">,
      status: "published",
    });
    mockedProtoPersonas = [
      makeProtoPersona({ _id: "proto-archive" as Id<"protoPersonas"> }),
    ];

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs/pack-archive"],
    });

    await clickButton(container, "Archive");
    expect(container.textContent).toContain("Archive persona pack?");

    await clickButton(container, "Archive pack");
    expect(archiveMock).toHaveBeenCalledWith({ packId: "pack-archive" });
  });

  it("shows the authenticated fallback route for unknown URLs", async () => {
    const { container, router } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/nonexistent"],
    });

    expect(getRouterLocationHref(router)).toBe("/nonexistent");
    expect(container.textContent).toContain("Page not found");
    expect(container.textContent).toContain("Validation Console");
  });
});

async function renderRoute({
  auth,
  initialEntries,
}: {
  auth: AppAuthState;
  initialEntries: string[];
}) {
  mockedAuthState = auth;
  const history = createMemoryHistory({ initialEntries });
  const router = createAppRouter({ history });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(<RouterProvider context={{ auth }} router={router} />);
  });

  await act(async () => {
    await router.load();
  });

  return { container, router };
}

async function clickButton(container: HTMLDivElement, text: string) {
  const button = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );

  expect(button).toBeDefined();

  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function updateInput(
  container: HTMLDivElement,
  selector: string,
  value: string,
) {
  const input = container.querySelector<HTMLInputElement>(selector);

  expect(input).not.toBeNull();

  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    input!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function updateSelect(
  container: HTMLDivElement,
  selector: string,
  value: string,
) {
  const select = container.querySelector<HTMLSelectElement>(selector);

  expect(select).not.toBeNull();

  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(select, value);
    select!.dispatchEvent(new Event("input", { bubbles: true }));
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function getVariantRows(container: HTMLDivElement) {
  return [...container.querySelectorAll<HTMLElement>('[data-testid="variant-row"]')].map(
    (row) => row.textContent ?? "",
  );
}

function firstVariantRowText(container: HTMLDivElement) {
  return getVariantRows(container)[0] ?? "";
}

async function updateTextarea(
  container: HTMLDivElement,
  selector: string,
  value: string,
) {
  const textarea = container.querySelector<HTMLTextAreaElement>(selector);

  expect(textarea).not.toBeNull();

  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )?.set;
    valueSetter?.call(textarea, value);
    textarea!.dispatchEvent(new Event("input", { bubbles: true }));
    textarea!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function makePack(overrides: Partial<Doc<"personaPacks">> = {}): Doc<"personaPacks"> {
  return {
    _creationTime: 1,
    _id: (overrides._id ?? "pack-1") as Id<"personaPacks">,
    name: "Checkout Pack",
    description: "Pack for digital checkout studies",
    context: "US e-commerce",
    sharedAxes: [
      {
        key: "digital_confidence",
        label: "Digital confidence",
        description: "Comfort level with unfamiliar digital tasks.",
        lowAnchor: "Needs help often",
        midAnchor: "Can complete familiar flows",
        highAnchor: "Self-directed explorer",
        weight: 1,
      },
    ],
    version: 1,
    status: "draft",
    orgId: "researcher|org-a",
    createdBy: "researcher|org-a",
    updatedBy: "researcher|org-a",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function makeProtoPersona(
  overrides: Partial<Doc<"protoPersonas">> = {},
): Doc<"protoPersonas"> {
  return {
    _creationTime: 1,
    _id: (overrides._id ?? "proto-1") as Id<"protoPersonas">,
    packId: (overrides.packId ?? "pack-1") as Id<"personaPacks">,
    name: "Budget-focused repeat buyer",
    summary: "Wants to finish quickly and compare final totals.",
    axes: [
      {
        key: "digital_confidence",
        label: "Digital confidence",
        description: "Comfort level with unfamiliar digital tasks.",
        lowAnchor: "Needs help often",
        midAnchor: "Can complete familiar flows",
        highAnchor: "Self-directed explorer",
        weight: 1,
      },
    ],
    sourceType: "manual",
    sourceRefs: [],
    evidenceSnippets: ["Checks totals twice before placing an order."],
    notes: "Frequently cross-checks fees.",
    ...overrides,
  };
}

function makeVariantReview() {
  return {
    study: {
      _id: "study-live",
      name: "Checkout usability benchmark",
      status: "persona_review",
      runBudget: 64,
      updatedAt: Date.now(),
    },
    pack: {
      _id: "pack-live",
      name: "Customer Journey Stress Test Pack",
      status: "published",
      sharedAxes: [
        {
          key: "digital_confidence",
          label: "Digital confidence",
          description: "Comfort with unfamiliar digital tasks.",
          lowAnchor: "Needs reassurance",
          midAnchor: "Can continue with light support",
          highAnchor: "Self-directed",
          weight: 1,
        },
        {
          key: "support_needs",
          label: "Support needs",
          description: "How much guidance or escalation the person expects.",
          lowAnchor: "Prefers self-service",
          midAnchor: "Requests help when stuck",
          highAnchor: "Wants a human quickly",
          weight: 1,
        },
      ],
    },
    protoPersonas: [
      {
        _id: "proto-cautious",
        name: "Cautious checkout shopper",
        summary: "Moves carefully and checks totals before submitting.",
      },
      {
        _id: "proto-power",
        name: "Goal-driven power user",
        summary: "Moves fast and expects the flow to stay out of the way.",
      },
    ],
    variants: [
      {
        _id: "variant-cautious-edge",
        protoPersonaId: "proto-cautious",
        protoPersonaName: "Cautious checkout shopper",
        axisValues: [
          { key: "digital_confidence", value: -0.68 },
          { key: "support_needs", value: 0.74 },
        ],
        edgeScore: 0.93,
        coherenceScore: 0.72,
        distinctnessScore: 0.94,
        firstPersonBio:
          "Budget-minded parent who slows down at payment steps, checks totals twice, and looks for fee transparency before deciding whether to continue.",
      },
      {
        _id: "variant-power-balanced",
        protoPersonaId: "proto-power",
        protoPersonaName: "Goal-driven power user",
        axisValues: [
          { key: "digital_confidence", value: 0.82 },
          { key: "support_needs", value: -0.56 },
        ],
        edgeScore: 0.59,
        coherenceScore: 0.96,
        distinctnessScore: 0.62,
        firstPersonBio:
          "Fast-moving repeat buyer who expects autofill, skims familiar screens, and gets impatient when a checkout asks for information that should already be known.",
      },
      {
        _id: "variant-cautious-interior",
        protoPersonaId: "proto-cautious",
        protoPersonaName: "Cautious checkout shopper",
        axisValues: [
          { key: "digital_confidence", value: 0.18 },
          { key: "support_needs", value: 0.33 },
        ],
        edgeScore: 0.77,
        coherenceScore: 0.84,
        distinctnessScore: 0.88,
        firstPersonBio:
          "Methodical shopper who understands checkout basics, still pauses at ambiguous copy, and wants confidence-building cues before sharing payment details.",
      },
    ],
  };
}

function makePackVariantReview() {
  const review = makeVariantReview();

  return {
    ...review,
    selectedStudy: review.study,
    studies: [
      {
        ...review.study,
        acceptedVariantCount: review.variants.length,
      },
    ],
  };
}
