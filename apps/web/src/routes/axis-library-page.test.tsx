import ReactDOM from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { AxisLibraryPage } from "@/routes/axis-library-page";

type ViewerAccess = {
  role: "researcher" | "reviewer" | "admin";
  permissions: {
    canManagePersonaPacks: boolean;
  };
} | null;

let mockedAxisDefinitions: Doc<"axisDefinitions">[] | undefined = undefined;
let mockedViewerAccess: ViewerAccess | undefined = undefined;

const createAxisDefinitionMock = vi.fn();
const updateAxisDefinitionMock = vi.fn();
const deleteAxisDefinitionMock = vi.fn();

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("convex/react", () => ({
  useQuery: (query: unknown) => {
    const queryName = getFunctionName(query as never);

    if (queryName === "axisLibrary:listAxisDefinitions") {
      return mockedAxisDefinitions;
    }

    if (queryName === "rbac:getViewerAccess") {
      return mockedViewerAccess;
    }

    return undefined;
  },
  useMutation: (mutation: unknown) => {
    const mutationName = getFunctionName(mutation as never);

    if (mutationName === "axisLibrary:createAxisDefinition") {
      return createAxisDefinitionMock;
    }

    if (mutationName === "axisLibrary:updateAxisDefinition") {
      return updateAxisDefinitionMock;
    }

    if (mutationName === "axisLibrary:deleteAxisDefinition") {
      return deleteAxisDefinitionMock;
    }

    return vi.fn();
  },
}));

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
  mockedAxisDefinitions = [makeAxisDefinition()];
  mockedViewerAccess = makeViewerAccess("researcher");

  createAxisDefinitionMock.mockReset();
  createAxisDefinitionMock.mockImplementation(async ({ axis }: { axis: any }) => {
    const created = makeAxisDefinition({
      _id: `axis-${(mockedAxisDefinitions?.length ?? 0) + 1}` as Id<"axisDefinitions">,
      ...axis,
      tags: axis.tags,
      usageCount: 0,
      creationSource: "manual",
    });
    return created._id;
  });

  updateAxisDefinitionMock.mockReset();
  updateAxisDefinitionMock.mockImplementation(
    async ({
      axisDefinitionId,
      patch,
    }: {
      axisDefinitionId: Id<"axisDefinitions">;
      patch: any;
    }) => {
      const current = (mockedAxisDefinitions ?? []).find(
        (axisDefinition) => axisDefinition._id === axisDefinitionId,
      );

      if (!current) {
        throw new Error("Axis definition not found");
      }

      const updated = makeAxisDefinition({
        ...current,
        ...patch,
        _id: current._id,
        key: current.key,
        createdAt: current.createdAt,
        createdBy: current.createdBy,
        creationSource: current.creationSource,
        orgId: current.orgId,
        updatedAt: current.updatedAt + 1,
      });

      return updated;
    },
  );

  deleteAxisDefinitionMock.mockReset();
  deleteAxisDefinitionMock.mockImplementation(
    async ({ axisDefinitionId }: { axisDefinitionId: Id<"axisDefinitions"> }) => ({
      axisDefinitionId,
      deleted: true,
    }),
  );
});

describe("AxisLibraryPage", () => {
  it("renders metadata columns and applies tag and text filters together", async () => {
    mockedAxisDefinitions = [
      makeAxisDefinition({
        _id: "axis-support-sentiment" as Id<"axisDefinitions">,
        key: "support_sentiment",
        label: "Support sentiment",
        description: "Confidence when working through a support request.",
        tags: ["support", "fintech"],
      }),
      makeAxisDefinition({
        _id: "axis-support-queue" as Id<"axisDefinitions">,
        key: "support_queue_tolerance",
        label: "Support queue tolerance",
        description: "Patience while waiting for a support response.",
        tags: ["support"],
      }),
      makeAxisDefinition({
        _id: "axis-checkout" as Id<"axisDefinitions">,
        key: "checkout_confidence",
        label: "Checkout confidence",
        description: "Comfort level with unfamiliar checkout tasks.",
        tags: ["checkout"],
      }),
    ];

    const { container } = await renderPage();

    expect(container.textContent).toContain("Key");
    expect(container.textContent).toContain("Label");
    expect(container.textContent).toContain("Description");
    expect(container.textContent).toContain("Low Anchor");
    expect(container.textContent).toContain("Mid Anchor");
    expect(container.textContent).toContain("High Anchor");
    expect(container.textContent).toContain("Weight");
    expect(container.textContent).toContain("Tags");
    expect(container.textContent).toContain("Usage Count");
    expect(container.textContent).toContain("Creation Source");

    await updateSelect("#axis-library-tag-filter", "support");
    expect(document.body.textContent).toContain("Support sentiment");
    expect(document.body.textContent).toContain("Support queue tolerance");
    expect(document.body.textContent).not.toContain("Checkout confidence");

    await updateInput("#axis-library-search", "sentiment");
    expect(document.body.textContent).toContain("Support sentiment");
    expect(document.body.textContent).not.toContain("Support queue tolerance");
    expect(document.body.textContent).toContain(
      "Showing 1 of 3 axis definitions matching tag “support” and search “sentiment”.",
    );
  });

  it("shows a visible loading skeleton before settled content renders", async () => {
    vi.useFakeTimers();
    mockedAxisDefinitions = undefined;
    mockedViewerAccess = undefined;

    const { rerender } = await renderPage();

    expect(document.body.textContent).toContain("Loading axis library...");

    mockedAxisDefinitions = [makeAxisDefinition()];
    mockedViewerAccess = makeViewerAccess("researcher");

    await rerender();
    expect(document.body.textContent).toContain("Loading axis library...");

    await act(async () => {
      vi.advanceTimersByTime(350);
    });

    expect(document.body.textContent).toContain("Axis Library");
    expect(document.body.textContent).not.toContain("Loading axis library...");
    vi.useRealTimers();
  });

  it("shows inline validation errors and prevents empty create submissions", async () => {
    mockedAxisDefinitions = [];

    await renderPage();

    await clickButton("Create axis");
    await updateInput("#axis-form-weight", "0");
    await submitCurrentForm();

    expect(createAxisDefinitionMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Axis key is required.");
    expect(document.body.textContent).toContain("Axis label is required.");
    expect(document.body.textContent).toContain("Axis description is required.");
    expect(document.body.textContent).toContain("Axis weight must be a positive number.");
  });

  it("creates, edits, and deletes axis definitions with the expected controls", async () => {
    mockedAxisDefinitions = [
      makeAxisDefinition({
        _id: "axis-editable" as Id<"axisDefinitions">,
        key: "legacy_support",
        label: "Legacy support",
        usageCount: 3,
      }),
    ];

    await renderPage();

    await clickButton("Create axis");
    await updateInput("#axis-form-key", "checkout_confidence");
    await updateInput("#axis-form-label", "Checkout confidence");
    await updateTextarea(
      "#axis-form-description",
      "Comfort level while completing checkout without reassurance.",
    );
    await updateInput("#axis-form-low-anchor", "Needs reassurance");
    await updateInput("#axis-form-mid-anchor", "Can continue alone");
    await updateInput("#axis-form-high-anchor", "Self-directed");
    await updateInput("#axis-form-weight", "1.5");
    await updateInput("#axis-form-tags", "checkout, finance");
    await submitCurrentForm();

    expect(createAxisDefinitionMock).toHaveBeenCalledWith({
      axis: {
        key: "checkout_confidence",
        label: "Checkout confidence",
        description: "Comfort level while completing checkout without reassurance.",
        lowAnchor: "Needs reassurance",
        midAnchor: "Can continue alone",
        highAnchor: "Self-directed",
        weight: 1.5,
        tags: ["checkout", "finance"],
      },
    });
    expect(document.body.textContent).toContain("Checkout confidence");

    await clickButton("Edit", 1);
    const keyInput = document.querySelector<HTMLInputElement>("#axis-form-key");
    expect(keyInput?.disabled).toBe(true);
    await updateInput("#axis-form-label", "Updated support label");
    await submitCurrentForm();

    expect(updateAxisDefinitionMock).toHaveBeenCalledWith({
      axisDefinitionId: "axis-editable",
      patch: {
        label: "Updated support label",
        description: "Comfort level with unfamiliar digital tasks.",
        lowAnchor: "Needs help often",
        midAnchor: "Can complete familiar flows",
        highAnchor: "Self-directed explorer",
        weight: 1,
        tags: ["checkout", "fintech"],
      },
    });
    expect(document.body.textContent).toContain("Updated support label");

    await clickButton("Delete", 1);
    expect(document.body.textContent).toContain("Warning: this axis is currently in use 3 times");
    await clickButton("Delete axis");

    expect(deleteAxisDefinitionMock).toHaveBeenCalledWith({
      axisDefinitionId: "axis-editable",
    });
    expect(document.body.textContent).not.toContain("Updated support label");
  });

  it("maps duplicate key failures to a concise user-facing message", async () => {
    createAxisDefinitionMock.mockRejectedValueOnce(
      new Error(`Server Error
Uncaught ConvexError: Axis definition with key "digital_confidence" already exists.
    at handler (../convex/axisLibrary.ts:94:13)`),
    );

    await renderPage();

    await clickButton("Create axis");
    await updateInput("#axis-form-key", "digital_confidence");
    await updateInput("#axis-form-label", "Digital confidence");
    await updateTextarea(
      "#axis-form-description",
      "Comfort level with unfamiliar digital tasks.",
    );
    await updateInput("#axis-form-low-anchor", "Needs help often");
    await updateInput("#axis-form-mid-anchor", "Can complete familiar flows");
    await updateInput("#axis-form-high-anchor", "Self-directed explorer");
    await updateInput("#axis-form-weight", "1");
    await submitCurrentForm();

    expect(document.body.textContent).toContain("An axis with this key already exists.");
    expect(document.body.textContent).not.toContain("ConvexError");
  });

  it("hides mutation controls for reviewers", async () => {
    mockedViewerAccess = makeViewerAccess("reviewer");

    await renderPage();

    expect(document.body.textContent).not.toContain("Create axis");
    expect(document.body.textContent).not.toContain("Edit");
    expect(document.body.textContent).not.toContain("Delete");
  });
});

async function renderPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(<AxisLibraryPage />);
  });

  return {
    container,
    rerender: async () => {
      await act(async () => {
        root.render(<AxisLibraryPage />);
      });
    },
  };
}

async function clickButton(text: string, occurrence = 0) {
  const buttons = [...document.querySelectorAll("button")].filter(
    (candidate) => candidate.textContent?.trim() === text,
  );

  expect(buttons[occurrence]).toBeDefined();

  await act(async () => {
    buttons[occurrence]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function submitCurrentForm() {
  const form = [...document.querySelectorAll("form")].at(-1);

  expect(form).not.toBeNull();

  await act(async () => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function updateInput(selector: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(selector);

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

async function updateTextarea(selector: string, value: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>(selector);

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

async function updateSelect(selector: string, value: string) {
  const select = document.querySelector<HTMLSelectElement>(selector);

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

function makeAxisDefinition(
  overrides: Partial<Doc<"axisDefinitions">> = {},
): Doc<"axisDefinitions"> {
  return {
    _creationTime: 1,
    _id: (overrides._id ?? "axis-1") as Id<"axisDefinitions">,
    key: "digital_confidence",
    label: "Digital confidence",
    description: "Comfort level with unfamiliar digital tasks.",
    lowAnchor: "Needs help often",
    midAnchor: "Can complete familiar flows",
    highAnchor: "Self-directed explorer",
    weight: 1,
    tags: ["checkout", "fintech"],
    usageCount: 2,
    creationSource: "manual",
    orgId: "researcher|org-a",
    createdBy: "researcher|org-a",
    updatedBy: "researcher|org-a",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function makeViewerAccess(
  role: "researcher" | "reviewer" | "admin",
): ViewerAccess {
  return {
    role,
    permissions: {
      canManagePersonaPacks: role !== "reviewer",
    },
  };
}
