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
const createDraftMock = vi.fn();
const updateDraftMock = vi.fn();
const createProtoPersonaMock = vi.fn();
const publishMock = vi.fn();
const archiveMock = vi.fn();

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
  createDraftMock.mockReset();
  createDraftMock.mockResolvedValue("new-pack-id" as Id<"personaPacks">);
  updateDraftMock.mockReset();
  updateDraftMock.mockResolvedValue(undefined);
  createProtoPersonaMock.mockReset();
  createProtoPersonaMock.mockResolvedValue(undefined);
  publishMock.mockReset();
  publishMock.mockResolvedValue(undefined);
  archiveMock.mockReset();
  archiveMock.mockResolvedValue(undefined);
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

  it("renders the persona pack empty state when no packs exist", async () => {
    mockedPackList = [];

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs"],
    });

    expect(container.textContent).toContain("No persona packs yet");
    expect(container.textContent).toContain("Create your first pack");
  });

  it("renders persona packs with status badges and detail links", async () => {
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
    expect(container.textContent).toContain("Legacy Support Pack");
    expect(container.textContent).toContain("archived");

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

  it("renders pack detail metadata, shared axes, proto-personas, and audit info", async () => {
    mockedPackDetail = makePack({
      _id: "pack-detail" as Id<"personaPacks">,
      name: "Account Recovery Pack",
      description: "Focused on account recovery and support escalations",
      context: "US fintech support",
      status: "draft",
    });
    mockedProtoPersonas = [
      makeProtoPersona({
        _id: "proto-1" as Id<"protoPersonas">,
        name: "Anxious new customer",
        summary: "Worried about losing access to payroll deposits.",
      }),
    ];

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs/pack-detail"],
    });

    expect(container.textContent).toContain("Account Recovery Pack");
    expect(container.textContent).toContain("Shared Axes");
    expect(container.textContent).toContain("Digital confidence");
    expect(container.textContent).toContain("Proto-Personas");
    expect(container.textContent).toContain("Anxious new customer");
    expect(container.textContent).toContain("Audit Trail");
    expect(container.textContent).toContain("researcher|org-a");
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
