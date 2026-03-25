import { act } from "react";
import ReactDOM from "react-dom/client";
import {
  createMemoryHistory,
  RouterProvider,
} from "@tanstack/react-router";
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => mockedAuthState,
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

  it("renders a visible sample pack link on /persona-packs", async () => {
    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs"],
    });

    const links = [...container.querySelectorAll("a")].map((link) => ({
      href: link.getAttribute("href"),
      text: link.textContent,
    }));

    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: "/persona-packs/demo-pack",
          text: expect.stringContaining("Customer Journey Stress Test Pack"),
        }),
      ]),
    );
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
