/**
 * Module-first tests for persona config detail workspaces.
 *
 * Covers: shell + tabs, Overview, Users, Transcripts, Generation, Review,
 * URL-state deep-linking, keyboard navigation, and ARIA roles.
 */
import { act } from "react";
import ReactDOM from "react-dom/client";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFunctionName } from "convex/server";
import { api } from "../../../../../convex/_generated/api";
import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import { createAppRouter, type AppAuthState } from "@/router";

// ---------------------------------------------------------------------------
// Shared mock state
// ---------------------------------------------------------------------------

let mockedAuthState: AppAuthState = {
  isAuthenticated: true,
  isLoading: false,
};

type ViewerAccess = {
  role: "researcher" | "reviewer" | "admin";
  permissions: {
    canAccessAdminDiagnostics: boolean;
    canAccessSettings: boolean;
    canAddNotes: boolean;
    canExportReports: boolean;
    canManagePersonaConfigs: boolean;
    canManageStudies: boolean;
  };
};

let mockedViewerAccess: ViewerAccess | null | undefined = null;

let mockedPackDetail: Doc<"personaConfigs"> | null | undefined = null;
let mockedSyntheticUsers: Doc<"syntheticUsers">[] | undefined = [];
let mockedPackList: Doc<"personaConfigs">[] | undefined = [];
let mockedAxisDefinitions: Doc<"axisDefinitions">[] | undefined = [];
let mockedTranscriptList: Doc<"transcripts">[] | undefined = [];

type BatchGenerationRunView = Doc<"batchGenerationRuns"> & {
  remainingCount: number;
  progressPercent: number;
};

let mockedBatchGenerationRun: BatchGenerationRunView | null | undefined = null;

type ReviewStudy = {
  _id: string;
  name: string;
  status: string;
  runBudget: number;
  updatedAt: number;
};

type ReviewData = {
  study: ReviewStudy;
  config: {
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
  syntheticUsers: {
    _id: string;
    name: string;
    summary: string;
  }[];
  variants: {
    _id: string;
    syntheticUserId: string;
    syntheticUserName: string;
    axisValues: { key: string; value: number }[];
    edgeScore: number;
    coherenceScore: number;
    distinctnessScore: number;
    firstPersonBio: string;
  }[];
};

type ConfigReviewData = ReviewData & {
  selectedStudy: ReviewStudy | null;
  studies: Array<
    ReviewStudy & {
      acceptedVariantCount: number;
    }
  >;
};

let mockedPackVariantReview: ConfigReviewData | null | undefined = undefined;

let mockedConfigTranscriptsByPackId: Record<
  string,
  | Array<{
      _id: string;
      configId: string;
      transcriptId: string;
      createdAt: number;
      transcript: Doc<"transcripts">;
    }>
  | undefined
> = {};
let mockedExtractionStatusByPackId: Record<string, unknown> = {};
let mockedExtractionCostByPackId: Record<
  string,
  | {
      totalCharacters: number;
      estimatedTokens: number;
      estimatedCostUsd: number;
    }
  | undefined
> = {};
let mockedStudyList: Doc<"studies">[] | undefined = [];
let mockedSettingsView: unknown | undefined = undefined;

const updateDraftMock = vi.fn();
const createSyntheticUserMock = vi.fn();
const updateSyntheticUserMock = vi.fn();
const deleteSyntheticUserMock = vi.fn();
const startBatchGenerationMock = vi.fn();
const regenerateSyntheticUserMock = vi.fn();
const publishMock = vi.fn();
const archiveMock = vi.fn();
const suggestAxesMock = vi.fn();
const startTranscriptExtractionMock = vi.fn();
const attachTranscriptMock = vi.fn();
const detachTranscriptMock = vi.fn();

// ---------------------------------------------------------------------------
// Convex mocks
// ---------------------------------------------------------------------------

vi.mock("@convex-dev/auth/react", () => ({
  useAuthActions: () => ({
    signIn: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("convex/react", () => ({
  useConvexAuth: () => mockedAuthState,
  useMutation: (mutation: unknown) => {
    const name = getFunctionName(mutation as never);
    if (name === "personaConfigs:updateDraft") return updateDraftMock;
    if (name === "personaConfigs:createSyntheticUser")
      return createSyntheticUserMock;
    if (name === "personaConfigs:updateSyntheticUser")
      return updateSyntheticUserMock;
    if (name === "personaConfigs:deleteSyntheticUser")
      return deleteSyntheticUserMock;
    if (name === "batchGeneration:startBatchGeneration")
      return startBatchGenerationMock;
    if (name === "batchGeneration:regenerateSyntheticUser")
      return regenerateSyntheticUserMock;
    if (name === "personaConfigs:publish") return publishMock;
    if (name === "personaConfigs:archive") return archiveMock;
    if (name === "configTranscripts:attachTranscript")
      return attachTranscriptMock;
    if (name === "configTranscripts:detachTranscript")
      return detachTranscriptMock;
    return vi.fn();
  },
  useAction: (action: unknown) => {
    const name = getFunctionName(action as never);
    if (name === "axisGeneration:suggestAxes") return suggestAxesMock;
    if (name === "transcriptExtraction:startExtraction")
      return startTranscriptExtractionMock;
    return vi.fn();
  },
  useQuery: (query: unknown, args: Record<string, unknown> | undefined) => {
    const name = getFunctionName(query as never);
    if (name === "rbac:getViewerAccess") return mockedViewerAccess;
    if (name === "settings:getSettings") return mockedSettingsView;
    if (name === "studies:listStudies") return mockedStudyList;
    if (name === "personaConfigs:list") return mockedPackList;
    if (name === "axisLibrary:listAxisDefinitions")
      return mockedAxisDefinitions;
    if (name === "transcripts:listTranscripts") return mockedTranscriptList;
    if (name === "personaConfigs:get") return mockedPackDetail;
    if (name === "personaConfigs:listSyntheticUsers")
      return mockedSyntheticUsers;
    if (name === "batchGeneration:getBatchGenerationRun")
      return mockedBatchGenerationRun;
    if (name === "personaVariantReview:getPackVariantReview")
      return mockedPackVariantReview;
    if (name === "configTranscripts:listConfigTranscripts")
      return mockedConfigTranscriptsByPackId[String(args?.configId)] ?? [];
    if (name === "configTranscripts:listTranscriptConfigs") return [];
    if (name === "transcriptExtraction:getExtractionStatus")
      return mockedExtractionStatusByPackId[String(args?.configId)] ?? null;
    if (name === "transcriptExtraction:estimateExtractionCost") {
      const tIds = (args?.transcriptIds as string[] | undefined) ?? [];
      const cId = Object.entries(mockedConfigTranscriptsByPackId).find(
        ([, a]) =>
          tIds.every((tid) => (a ?? []).some((att) => att.transcriptId === tid))
      )?.[0];
      return cId ? mockedExtractionCostByPackId[cId] : undefined;
    }
    return undefined;
  },
}));

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mountedRoots: ReactDOM.Root[] = [];

afterEach(() => {
  for (const root of mountedRoots.splice(0)) {
    act(() => root.unmount());
  }
  document.body.innerHTML = "";
});

function makeViewerAccess(
  role: ViewerAccess["role"] = "researcher"
): ViewerAccess {
  return {
    role,
    permissions: {
      canAccessAdminDiagnostics: role === "admin",
      canAccessSettings: role === "admin",
      canAddNotes: true,
      canExportReports: true,
      canManagePersonaConfigs: role !== "reviewer",
      canManageStudies: role !== "reviewer",
    },
  };
}

function makeSettingsView() {
  return {
    orgId: "researcher|org-a",
    domainAllowlist: [],
    maxConcurrency: 4,
    modelConfig: [],
    runBudgetCap: 100,
    budgetLimits: {},
    browserPolicy: {
      blockAnalytics: false,
      blockHeavyMedia: false,
      screenshotFormat: "png",
      screenshotMode: "viewport",
    },
    signedUrlExpirySeconds: 3600,
    updatedBy: null,
    updatedAt: null,
    credentials: [],
  };
}

beforeEach(() => {
  mockedAuthState = { isAuthenticated: true, isLoading: false };
  mockedViewerAccess = makeViewerAccess("researcher");
  mockedPackDetail = null;
  mockedSyntheticUsers = [];
  mockedBatchGenerationRun = null;
  mockedPackVariantReview = undefined;
  mockedPackList = [];
  mockedAxisDefinitions = [];
  mockedTranscriptList = [];
  mockedConfigTranscriptsByPackId = {};
  mockedExtractionStatusByPackId = {};
  mockedExtractionCostByPackId = {};
  mockedStudyList = [];
  mockedSettingsView = makeSettingsView();

  updateDraftMock.mockReset().mockResolvedValue(undefined);
  createSyntheticUserMock.mockReset().mockResolvedValue(undefined);
  updateSyntheticUserMock.mockReset().mockResolvedValue(undefined);
  deleteSyntheticUserMock.mockReset().mockResolvedValue(undefined);
  startBatchGenerationMock
    .mockReset()
    .mockResolvedValue("run-1" as Id<"batchGenerationRuns">);
  regenerateSyntheticUserMock.mockReset().mockResolvedValue(undefined);
  publishMock.mockReset().mockResolvedValue(undefined);
  archiveMock.mockReset().mockResolvedValue(undefined);
  suggestAxesMock.mockReset().mockResolvedValue([]);
  startTranscriptExtractionMock.mockReset().mockResolvedValue(undefined);
  attachTranscriptMock.mockReset().mockResolvedValue(undefined);
  detachTranscriptMock.mockReset().mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makePack(
  overrides: Partial<Doc<"personaConfigs">> = {}
): Doc<"personaConfigs"> {
  return {
    _creationTime: 1,
    _id: (overrides._id ?? "config-1") as Id<"personaConfigs">,
    name: "Test Config",
    description: "Config for tests",
    context: "Testing context",
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

function makeSyntheticUser(
  overrides: Partial<Doc<"syntheticUsers">> = {}
): Doc<"syntheticUsers"> {
  return {
    _creationTime: 1,
    _id: (overrides._id ?? "user-1") as Id<"syntheticUsers">,
    configId: (overrides.configId ?? "config-1") as Id<"personaConfigs">,
    name: "Test User",
    summary: "A test synthetic user.",
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
    evidenceSnippets: ["Evidence snippet one."],
    notes: "Test notes.",
    ...overrides,
  };
}

function makeTranscript(
  overrides: Partial<Doc<"transcripts">> = {}
): Doc<"transcripts"> {
  return {
    _creationTime: 1,
    _id: (overrides._id ?? "transcript-1") as Id<"transcripts">,
    storageId: "storage-1" as Id<"_storage">,
    originalFilename: "interview.txt",
    format: "txt",
    metadata: {
      participantId: "participant-1",
      tags: ["research"],
      notes: "Interview notes.",
      ...overrides.metadata,
    },
    processingStatus: "processed",
    processingError: undefined,
    characterCount: 500,
    orgId: "researcher|org-a",
    createdBy: "researcher|org-a",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function makePackVariantReview(): ConfigReviewData {
  return {
    study: {
      _id: "study-1",
      name: "Checkout benchmark",
      status: "persona_review",
      runBudget: 64,
      updatedAt: Date.now(),
    },
    config: {
      _id: "config-1",
      name: "Test Config",
      status: "published",
      sharedAxes: [
        {
          key: "digital_confidence",
          label: "Digital confidence",
          description: "Comfort level.",
          lowAnchor: "Low",
          midAnchor: "Mid",
          highAnchor: "High",
          weight: 1,
        },
      ],
    },
    syntheticUsers: [
      { _id: "user-1", name: "Cautious shopper", summary: "Careful buyer." },
      { _id: "user-2", name: "Power user", summary: "Fast buyer." },
    ],
    variants: [
      {
        _id: "variant-1",
        syntheticUserId: "user-1",
        syntheticUserName: "Cautious shopper",
        axisValues: [{ key: "digital_confidence", value: -0.5 }],
        edgeScore: 0.9,
        coherenceScore: 0.8,
        distinctnessScore: 0.85,
        firstPersonBio: "I check totals carefully before purchasing.",
      },
      {
        _id: "variant-2",
        syntheticUserId: "user-2",
        syntheticUserName: "Power user",
        axisValues: [{ key: "digital_confidence", value: 0.7 }],
        edgeScore: 0.6,
        coherenceScore: 0.95,
        distinctnessScore: 0.5,
        firstPersonBio: "I expect checkout to be fast and familiar.",
      },
    ],
    selectedStudy: {
      _id: "study-1",
      name: "Checkout benchmark",
      status: "persona_review",
      runBudget: 64,
      updatedAt: Date.now(),
    },
    studies: [
      {
        _id: "study-1",
        name: "Checkout benchmark",
        status: "persona_review",
        runBudget: 64,
        updatedAt: Date.now(),
        acceptedVariantCount: 2,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Render helper
// ---------------------------------------------------------------------------

async function renderRoute(initialEntries: string[]) {
  const history = createMemoryHistory({ initialEntries });
  const router = createAppRouter({ history });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(
      <RouterProvider context={{ auth: mockedAuthState }} router={router} />
    );
  });

  await act(async () => {
    await router.load();
  });

  return { container, router };
}

async function clickButton(root: ParentNode, text: string) {
  const button = [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text
  );
  expect(button).toBeDefined();
  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function getButton(root: ParentNode, text: string) {
  return [...root.querySelectorAll("button")].find(
    (b) => b.textContent?.trim() === text
  );
}

async function updateInput(
  container: HTMLElement,
  selector: string,
  value: string
) {
  const input = container.querySelector<HTMLInputElement>(selector);
  expect(input).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set;
    setter?.call(input, value);
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    input!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function updateSelect(
  container: HTMLElement,
  selector: string,
  value: string
) {
  const select = container.querySelector<HTMLSelectElement>(selector);
  expect(select).not.toBeNull();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLSelectElement.prototype,
      "value"
    )?.set;
    setter?.call(select, value);
    select!.dispatchEvent(new Event("input", { bubbles: true }));
    select!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function dispatchKeyDown(element: Element, key: string) {
  return act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

// =========================================================================
// Tests
// =========================================================================

describe("persona config detail workspaces", () => {
  // -----------------------------------------------------------------------
  // Shell, Tabs, and Summary Rail
  // -----------------------------------------------------------------------
  describe("shell, tabs, and summary rail", () => {
    it("renders the sticky summary rail with config stats", async () => {
      mockedPackDetail = makePack({ name: "Shell Test Config" });
      mockedSyntheticUsers = [makeSyntheticUser()];
      mockedConfigTranscriptsByPackId["config-1"] = [
        {
          _id: "ct-1",
          configId: "config-1",
          transcriptId: "transcript-1",
          createdAt: 1,
          transcript: makeTranscript(),
        },
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=overview",
      ]);

      expect(container.textContent).toContain("Shell Test Config");
      expect(container.textContent).toContain("draft");
      expect(container.textContent).toContain("v1");
      expect(container.textContent).toContain("1"); // shared axes count
    });

    it("renders all five tab buttons with correct ARIA roles", async () => {
      mockedPackDetail = makePack();

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=overview",
      ]);

      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(5);

      const labels = [...tabs].map((t) => t.textContent?.trim());
      expect(labels).toEqual([
        "Overview",
        "Users",
        "Transcripts",
        "Generation",
        "Review",
      ]);

      const overviewTab = [...tabs].find(
        (t) => t.textContent?.trim() === "Overview"
      );
      expect(overviewTab?.getAttribute("aria-selected")).toBe("true");
    });

    it("marks the active tab via aria-selected", async () => {
      mockedPackDetail = makePack();

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=users",
      ]);

      const tabs = container.querySelectorAll('[role="tab"]');
      const usersTab = [...tabs].find((t) => t.textContent?.trim() === "Users");
      expect(usersTab?.getAttribute("aria-selected")).toBe("true");

      const overviewTab = [...tabs].find(
        (t) => t.textContent?.trim() === "Overview"
      );
      expect(overviewTab?.getAttribute("aria-selected")).toBe("false");
    });

    it("renders a tabpanel with the active workspace label", async () => {
      mockedPackDetail = makePack();

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=generation",
      ]);

      const tabpanel = container.querySelector('[role="tabpanel"]');
      expect(tabpanel).not.toBeNull();
      expect(tabpanel?.getAttribute("aria-label")).toBe("generation workspace");
    });

    it("shows Publish button for drafts, Archive for published", async () => {
      mockedPackDetail = makePack({ status: "draft" });
      mockedSyntheticUsers = [makeSyntheticUser()];

      const { container: draftContainer } = await renderRoute([
        "/persona-configs/config-1?tab=overview",
      ]);

      expect(getButton(draftContainer, "Publish")).toBeDefined();
      expect(getButton(draftContainer, "Archive")).toBeUndefined();

      // Published config
      mockedPackDetail = makePack({
        _id: "config-pub" as Id<"personaConfigs">,
        status: "published",
      });

      const { container: pubContainer } = await renderRoute([
        "/persona-configs/config-pub?tab=overview",
      ]);

      expect(getButton(pubContainer, "Archive")).toBeDefined();
      expect(getButton(pubContainer, "Publish")).toBeUndefined();
    });

    it("disables Publish when no synthetic users exist", async () => {
      mockedPackDetail = makePack({ status: "draft" });
      mockedSyntheticUsers = [];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=overview",
      ]);

      const publishBtn = getButton(container, "Publish");
      expect(publishBtn?.disabled).toBe(true);
    });

    it("shows action error in an alert role", async () => {
      mockedPackDetail = makePack();
      publishMock.mockRejectedValueOnce(new Error("Publish failed"));
      mockedSyntheticUsers = [makeSyntheticUser()];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=overview",
      ]);

      await clickButton(container, "Publish");
      // Confirm the publish dialog
      await clickButton(container, "Publish persona configuration");

      const alert = container.querySelector('[role="alert"]');
      expect(alert?.textContent).toContain("Publish failed");
    });
  });

  // -----------------------------------------------------------------------
  // Overview Workspace
  // -----------------------------------------------------------------------
  describe("overview workspace", () => {
    it("shows orientation summary with status, version, counts, and generation health", async () => {
      mockedPackDetail = makePack({
        name: "Overview Config",
        version: 3,
      });
      mockedSyntheticUsers = [makeSyntheticUser()];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=overview",
      ]);

      expect(container.textContent).toContain("Orientation");
      expect(container.textContent).toContain("draft");
      expect(container.textContent).toContain("v3");
      expect(container.textContent).toContain("Generation health");
    });

    it("shows metadata and shared axes editing form in draft mode", async () => {
      mockedPackDetail = makePack({ status: "draft" });

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=overview",
      ]);

      expect(container.textContent).toContain("Metadata & Shared Axes");
      expect(container.textContent).toContain("Save draft changes");
    });

    it("shows read-only metadata and axes for published config", async () => {
      mockedPackDetail = makePack({
        _id: "config-pub" as Id<"personaConfigs">,
        status: "published",
      });

      const { container } = await renderRoute([
        "/persona-configs/config-pub?tab=overview",
      ]);

      expect(container.textContent).toContain("Metadata");
      expect(container.textContent).toContain("Shared Axes");
      // No edit form
      expect(container.textContent).not.toContain("Save draft changes");
    });

    it("shows read-only content for archived config", async () => {
      mockedPackDetail = makePack({
        _id: "config-arch" as Id<"personaConfigs">,
        status: "archived",
      });

      const { container } = await renderRoute([
        "/persona-configs/config-arch?tab=overview",
      ]);

      expect(container.textContent).not.toContain("Save draft changes");
      expect(container.textContent).toContain("Metadata");
    });

    it("shows audit trail", async () => {
      mockedPackDetail = makePack();

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=overview",
      ]);

      expect(container.textContent).toContain("Audit Trail");
      expect(container.textContent).toContain("Created by");
      expect(container.textContent).toContain("Last modified by");
    });
  });

  // -----------------------------------------------------------------------
  // Users Workspace
  // -----------------------------------------------------------------------
  describe("users workspace", () => {
    it("renders split-pane layout with user list and inspector", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = [
        makeSyntheticUser({
          _id: "user-a" as Id<"syntheticUsers">,
          name: "Alice",
          summary: "First user.",
          sourceType: "manual",
        }),
        makeSyntheticUser({
          _id: "user-b" as Id<"syntheticUsers">,
          name: "Bob",
          summary: "Second user.",
          sourceType: "generated",
        }),
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=users",
      ]);

      const listbox = container.querySelector('[role="listbox"]');
      expect(listbox).not.toBeNull();
      expect(listbox?.getAttribute("aria-label")).toBe("Synthetic users");

      const options = container.querySelectorAll(
        '[data-uidotsh-option]:not([hidden]) [role="option"]'
      );
      expect(options).toHaveLength(2);

      // First user auto-selected
      expect(container.textContent).toContain("2 of 2 users");
    });

    it("auto-selects the first user on load", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = [
        makeSyntheticUser({
          _id: "user-first" as Id<"syntheticUsers">,
          name: "First User",
          summary: "Automatically selected.",
        }),
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=users",
      ]);

      // Inspector shows user details
      expect(container.textContent).toContain("First User");
      expect(container.textContent).toContain("Summary");
      expect(container.textContent).toContain("Automatically selected.");
    });

    it("shows Edit and Delete buttons only in draft mode", async () => {
      mockedPackDetail = makePack({ status: "draft" });
      mockedSyntheticUsers = [makeSyntheticUser()];

      const { container: draftContainer } = await renderRoute([
        "/persona-configs/config-1?tab=users",
      ]);

      expect(getButton(draftContainer, "Edit")).toBeDefined();
      expect(getButton(draftContainer, "Delete")).toBeDefined();

      // Published mode
      mockedPackDetail = makePack({
        _id: "config-pub" as Id<"personaConfigs">,
        status: "published",
      });

      const { container: pubContainer } = await renderRoute([
        "/persona-configs/config-pub?tab=users",
      ]);

      expect(getButton(pubContainer, "Edit")).toBeUndefined();
      expect(getButton(pubContainer, "Delete")).toBeUndefined();
    });

    it("filters users by source type", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = [
        makeSyntheticUser({
          _id: "user-manual" as Id<"syntheticUsers">,
          name: "Manual User",
          sourceType: "manual",
        }),
        makeSyntheticUser({
          _id: "user-gen" as Id<"syntheticUsers">,
          name: "Generated User",
          sourceType: "generated",
        }),
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=users",
      ]);

      await updateSelect(
        container,
        '[aria-label="Filter by source"]',
        "generated"
      );

      expect(container.textContent).toContain("1 of 2 users");
    });

    it("searches users by name", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = [
        makeSyntheticUser({
          _id: "user-a" as Id<"syntheticUsers">,
          name: "Alice the shopper",
        }),
        makeSyntheticUser({
          _id: "user-b" as Id<"syntheticUsers">,
          name: "Bob the browser",
        }),
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=users",
      ]);

      await updateInput(
        container,
        '[aria-label="Search synthetic users"]',
        "Alice"
      );

      expect(container.textContent).toContain("1 of 2 users");
    });

    it("supports keyboard navigation in the user list", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = [
        makeSyntheticUser({
          _id: "user-a" as Id<"syntheticUsers">,
          name: "Alice",
          summary: "First.",
        }),
        makeSyntheticUser({
          _id: "user-b" as Id<"syntheticUsers">,
          name: "Bob",
          summary: "Second.",
        }),
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=users",
      ]);

      const listbox = container.querySelector('[role="listbox"]')!;
      expect(listbox).not.toBeNull();

      // Navigate down to Bob
      await dispatchKeyDown(listbox, "ArrowDown");

      // The inspector should now show Bob
      const selectedOption = container.querySelector(
        '[role="option"][aria-selected="true"]'
      );
      expect(selectedOption?.textContent).toContain("Bob");
    });

    it("shows empty state when no users exist", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = [];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=users",
      ]);

      expect(container.textContent).toContain("No synthetic users yet.");
      expect(container.textContent).toContain(
        "Add a synthetic user to get started."
      );
    });

    it("shows Add user button in draft mode", async () => {
      mockedPackDetail = makePack({ status: "draft" });
      mockedSyntheticUsers = [];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=users",
      ]);

      expect(getButton(container, "Add user")).toBeDefined();
    });

    it("shows evidence and notes in the inspector", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = [
        makeSyntheticUser({
          evidenceSnippets: ["Quote from interview"],
          notes: "Interesting user behavior",
        }),
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=users",
      ]);

      expect(container.textContent).toContain("Evidence");
      expect(container.textContent).toContain("Quote from interview");
      expect(container.textContent).toContain("Notes");
      expect(container.textContent).toContain("Interesting user behavior");
    });
  });

  // -----------------------------------------------------------------------
  // Transcripts Workspace
  // -----------------------------------------------------------------------
  describe("transcripts workspace", () => {
    it("renders split-pane layout with transcript list and inspector", async () => {
      const transcript = makeTranscript({
        _id: "t-1" as Id<"transcripts">,
        originalFilename: "session1.txt",
      });

      mockedPackDetail = makePack();
      mockedConfigTranscriptsByPackId["config-1"] = [
        {
          _id: "ct-1",
          configId: "config-1",
          transcriptId: "t-1",
          createdAt: 1,
          transcript,
        },
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=transcripts",
      ]);

      const listbox = container.querySelector('[role="listbox"]');
      expect(listbox).not.toBeNull();
      expect(listbox?.getAttribute("aria-label")).toBe("Attached transcripts");

      expect(container.textContent).toContain("session1.txt");
      expect(container.textContent).toContain("1 of 1 transcripts");
    });

    it("shows empty state when no transcripts attached", async () => {
      mockedPackDetail = makePack();
      mockedConfigTranscriptsByPackId["config-1"] = [];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=transcripts",
      ]);

      expect(container.textContent).toContain("No transcripts attached yet.");
      expect(container.textContent).toContain(
        "Attach a transcript to get started."
      );
    });

    it("shows Attach button in draft mode with manage permissions", async () => {
      mockedPackDetail = makePack({ status: "draft" });
      mockedViewerAccess = makeViewerAccess("researcher");

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=transcripts",
      ]);

      expect(getButton(container, "Attach")).toBeDefined();
    });

    it("hides Attach button for published configs", async () => {
      mockedPackDetail = makePack({
        _id: "config-pub" as Id<"personaConfigs">,
        status: "published",
      });

      const { container } = await renderRoute([
        "/persona-configs/config-pub?tab=transcripts",
      ]);

      expect(getButton(container, "Attach")).toBeUndefined();
      expect(container.textContent).toContain(
        "Transcript attachments become read-only"
      );
    });

    it("shows Detach button for draft mode transcripts", async () => {
      const transcript = makeTranscript({ _id: "t-1" as Id<"transcripts"> });
      mockedPackDetail = makePack({ status: "draft" });
      mockedViewerAccess = makeViewerAccess("researcher");
      mockedConfigTranscriptsByPackId["config-1"] = [
        {
          _id: "ct-1",
          configId: "config-1",
          transcriptId: "t-1",
          createdAt: 1,
          transcript,
        },
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=transcripts",
      ]);

      expect(getButton(container, "Detach")).toBeDefined();
    });

    it("supports keyboard navigation in transcript list", async () => {
      const t1 = makeTranscript({
        _id: "t-1" as Id<"transcripts">,
        originalFilename: "first.txt",
      });
      const t2 = makeTranscript({
        _id: "t-2" as Id<"transcripts">,
        originalFilename: "second.txt",
      });

      mockedPackDetail = makePack();
      mockedConfigTranscriptsByPackId["config-1"] = [
        {
          _id: "ct-1",
          configId: "config-1",
          transcriptId: "t-1",
          createdAt: 2,
          transcript: t1,
        },
        {
          _id: "ct-2",
          configId: "config-1",
          transcriptId: "t-2",
          createdAt: 1,
          transcript: t2,
        },
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=transcripts",
      ]);

      const listbox = container.querySelector('[role="listbox"]')!;
      await dispatchKeyDown(listbox, "ArrowDown");

      const selectedOption = container.querySelector(
        '[role="option"][aria-selected="true"]'
      );
      expect(selectedOption?.textContent).toContain("second.txt");
    });

    it("shows reviewer restriction message", async () => {
      mockedPackDetail = makePack({ status: "draft" });
      mockedViewerAccess = makeViewerAccess("reviewer");

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=transcripts",
      ]);

      expect(container.textContent).toContain(
        "Reviewers can inspect attached transcripts but cannot attach or detach them."
      );
    });

    it("shows transcript inspector with participant and details", async () => {
      const transcript = makeTranscript({
        _id: "t-detail" as Id<"transcripts">,
        originalFilename: "detailed-session.txt",
        characterCount: 2500,
        metadata: {
          participantId: "P-42",
          tags: ["checkout", "mobile"],
          notes: "Session conducted on mobile device.",
        },
      });

      mockedPackDetail = makePack();
      mockedConfigTranscriptsByPackId["config-1"] = [
        {
          _id: "ct-detail",
          configId: "config-1",
          transcriptId: "t-detail",
          createdAt: 1,
          transcript,
        },
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=transcripts",
      ]);

      expect(container.textContent).toContain("detailed-session.txt");
      expect(container.textContent).toContain("P-42");
      expect(container.textContent).toContain("checkout");
      expect(container.textContent).toContain("mobile");
      expect(container.textContent).toContain("2,500");
      expect(container.textContent).toContain("Open in library");
    });
  });

  // -----------------------------------------------------------------------
  // Generation Workspace
  // -----------------------------------------------------------------------
  describe("generation workspace", () => {
    it("renders three-zone layout: controls, progress, user table", async () => {
      mockedPackDetail = makePack({
        _id: "config-gen" as Id<"personaConfigs">,
        sharedAxes: [
          {
            key: "digital_confidence",
            label: "Digital confidence",
            description: "Comfort level.",
            lowAnchor: "Low",
            midAnchor: "Mid",
            highAnchor: "High",
            weight: 1,
          },
          {
            key: "support_needs",
            label: "Support needs",
            description: "How much guidance.",
            lowAnchor: "Self-service",
            midAnchor: "When blocked",
            highAnchor: "Needs human",
            weight: 1,
          },
        ],
      });

      const { container } = await renderRoute([
        "/persona-configs/config-gen?tab=generation",
      ]);

      expect(container.textContent).toContain("Generation Controls");
      expect(container.textContent).toContain(
        "2 axes x 3 levels = 9 synthetic users"
      );
      expect(container.textContent).toContain("User Status");
    });

    it("shows run progress when a batch generation run exists", async () => {
      mockedPackDetail = makePack({
        _id: "config-gen-run" as Id<"personaConfigs">,
      });
      mockedBatchGenerationRun = {
        _creationTime: 1,
        _id: "run-1" as Id<"batchGenerationRuns">,
        configId: "config-gen-run" as Id<"personaConfigs">,
        orgId: "researcher|org-a",
        status: "running",
        levelsPerAxis: { digital_confidence: 3 },
        totalCount: 3,
        completedCount: 1,
        failedCount: 0,
        startedAt: 1,
        remainingCount: 2,
        progressPercent: 33,
      };

      const { container } = await renderRoute([
        "/persona-configs/config-gen-run?tab=generation",
      ]);

      expect(container.textContent).toContain("Run Progress");
      expect(container.textContent).toContain("Running");
      expect(container.textContent).toContain("1/3 synthetic users generated");
    });

    it("shows empty state for user table when no users exist", async () => {
      mockedPackDetail = makePack({
        _id: "config-gen-empty" as Id<"personaConfigs">,
      });
      mockedSyntheticUsers = [];

      const { container } = await renderRoute([
        "/persona-configs/config-gen-empty?tab=generation",
      ]);

      expect(container.textContent).toContain("No synthetic users yet.");
    });

    it("shows generated users with status badges and axis values", async () => {
      mockedPackDetail = makePack({
        _id: "config-gen-users" as Id<"personaConfigs">,
      });
      mockedSyntheticUsers = [
        makeSyntheticUser({
          _id: "gen-1" as Id<"syntheticUsers">,
          configId: "config-gen-users" as Id<"personaConfigs">,
          name: "Generated Alpha",
          sourceType: "generated",
          generationStatus: "completed",
          firstPersonBio: "I'm Alpha.",
          axisValues: [{ key: "digital_confidence", value: 1 }],
        }),
        makeSyntheticUser({
          _id: "gen-2" as Id<"syntheticUsers">,
          configId: "config-gen-users" as Id<"personaConfigs">,
          name: "Generated Beta",
          sourceType: "generated",
          generationStatus: "failed",
          generationError: "Timed out.",
          axisValues: [{ key: "digital_confidence", value: -1 }],
        }),
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-gen-users?tab=generation",
      ]);

      expect(container.textContent).toContain("Generated Alpha");
      expect(container.textContent).toContain("Completed");
      expect(container.textContent).toContain("Generated Beta");
      expect(container.textContent).toContain("Failed");
      expect(container.textContent).toContain("Timed out.");
    });

    it("hides generation controls for published configs", async () => {
      mockedPackDetail = makePack({
        _id: "config-gen-pub" as Id<"personaConfigs">,
        status: "published",
      });

      const { container } = await renderRoute([
        "/persona-configs/config-gen-pub?tab=generation",
      ]);

      expect(container.textContent).not.toContain("Generation Controls");
      expect(container.textContent).not.toContain("Confirm & Generate");
    });

    it("shows retry failed button when there are failed generated users", async () => {
      mockedPackDetail = makePack({
        _id: "config-gen-retry" as Id<"personaConfigs">,
      });
      mockedSyntheticUsers = [
        makeSyntheticUser({
          _id: "gen-fail" as Id<"syntheticUsers">,
          configId: "config-gen-retry" as Id<"personaConfigs">,
          name: "Failed User",
          sourceType: "generated",
          generationStatus: "failed",
          generationError: "Error.",
        }),
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-gen-retry?tab=generation",
      ]);

      expect(getButton(container, "Retry 1 failed")).toBeDefined();
    });

    it("reports partial success and failure when some retries fail", async () => {
      mockedPackDetail = makePack({
        _id: "config-gen-partial" as Id<"personaConfigs">,
      });
      mockedSyntheticUsers = [
        makeSyntheticUser({
          _id: "gen-ok" as Id<"syntheticUsers">,
          configId: "config-gen-partial" as Id<"personaConfigs">,
          name: "Will Succeed",
          sourceType: "generated",
          generationStatus: "failed",
          generationError: "Timed out.",
        }),
        makeSyntheticUser({
          _id: "gen-bad" as Id<"syntheticUsers">,
          configId: "config-gen-partial" as Id<"personaConfigs">,
          name: "Will Fail",
          sourceType: "generated",
          generationStatus: "failed",
          generationError: "Timed out.",
        }),
      ];

      // First call succeeds, second rejects
      regenerateSyntheticUserMock
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error("Network error"));

      const { container } = await renderRoute([
        "/persona-configs/config-gen-partial?tab=generation",
      ]);

      const retryButton = getButton(container, "Retry 2 failed");
      expect(retryButton).toBeDefined();

      await act(async () => {
        retryButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      // Wait for Promise.allSettled to resolve
      await act(async () => {});

      // Partial success notice
      expect(container.textContent).toContain(
        "Queued regeneration for 1 of 2 synthetic users."
      );
      // Partial failure error
      expect(container.textContent).toContain("Network error");
    });

    it("reports all-failed when every retry attempt rejects", async () => {
      mockedPackDetail = makePack({
        _id: "config-gen-allfail" as Id<"personaConfigs">,
      });
      mockedSyntheticUsers = [
        makeSyntheticUser({
          _id: "gen-f1" as Id<"syntheticUsers">,
          configId: "config-gen-allfail" as Id<"personaConfigs">,
          name: "Fail One",
          sourceType: "generated",
          generationStatus: "failed",
          generationError: "Err.",
        }),
        makeSyntheticUser({
          _id: "gen-f2" as Id<"syntheticUsers">,
          configId: "config-gen-allfail" as Id<"personaConfigs">,
          name: "Fail Two",
          sourceType: "generated",
          generationStatus: "failed",
          generationError: "Err.",
        }),
      ];

      regenerateSyntheticUserMock
        .mockRejectedValueOnce(new Error("Server error"))
        .mockRejectedValueOnce(new Error("Server error"));

      const { container } = await renderRoute([
        "/persona-configs/config-gen-allfail?tab=generation",
      ]);

      const retryButton = getButton(container, "Retry 2 failed");
      expect(retryButton).toBeDefined();

      await act(async () => {
        retryButton!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });

      await act(async () => {});

      // All-failed error
      expect(container.textContent).toContain("Server error");
      // No success notice
      expect(container.textContent).not.toContain("Queued regeneration");
    });

    it("supports keyboard navigation in user status table", async () => {
      mockedPackDetail = makePack({
        _id: "config-gen-kb" as Id<"personaConfigs">,
      });
      mockedSyntheticUsers = [
        makeSyntheticUser({
          _id: "gen-kb-1" as Id<"syntheticUsers">,
          configId: "config-gen-kb" as Id<"personaConfigs">,
          name: "User One",
          sourceType: "generated",
          generationStatus: "completed",
        }),
        makeSyntheticUser({
          _id: "gen-kb-2" as Id<"syntheticUsers">,
          configId: "config-gen-kb" as Id<"personaConfigs">,
          name: "User Two",
          sourceType: "generated",
          generationStatus: "completed",
        }),
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-gen-kb?tab=generation",
      ]);

      const tableBody = container.querySelector('[role="grid"]');
      expect(tableBody).not.toBeNull();

      await dispatchKeyDown(tableBody!, "ArrowDown");

      const selectedRow = container.querySelector("[data-user-row].bg-accent");
      expect(selectedRow?.textContent).toContain("User Two");
    });
  });

  // -----------------------------------------------------------------------
  // Review Workspace
  // -----------------------------------------------------------------------
  describe("review workspace", () => {
    it("renders dense variant table with inspector", async () => {
      mockedPackDetail = makePack({
        _id: "config-review" as Id<"personaConfigs">,
        status: "published",
      });
      mockedPackVariantReview = makePackVariantReview();

      const { container } = await renderRoute([
        "/persona-configs/config-review?tab=review",
      ]);

      const variantRows = container.querySelectorAll(
        '[data-uidotsh-option]:not([hidden]) [data-testid="variant-row"]'
      );
      expect(variantRows).toHaveLength(2);

      expect(container.textContent).toContain("2 of 2 variants");
      expect(container.textContent).toContain("Linked study");
      expect(container.textContent).toContain("Checkout benchmark");
    });

    it("auto-selects first variant and shows inspector", async () => {
      mockedPackDetail = makePack({
        _id: "config-review-auto" as Id<"personaConfigs">,
        status: "published",
      });
      mockedPackVariantReview = makePackVariantReview();

      const { container } = await renderRoute([
        "/persona-configs/config-review-auto?tab=review",
      ]);

      // Inspector should show first variant's bio
      expect(container.textContent).toContain(
        "I check totals carefully before purchasing."
      );
      expect(container.textContent).toContain("Scores");
      expect(container.textContent).toContain("Axis values");
    });

    it("shows empty state when no studies linked", async () => {
      mockedPackDetail = makePack({
        _id: "config-review-empty" as Id<"personaConfigs">,
        status: "published",
      });
      mockedPackVariantReview = {
        ...makePackVariantReview(),
        studies: [],
        variants: [],
      };

      const { container } = await renderRoute([
        "/persona-configs/config-review-empty?tab=review",
      ]);

      expect(container.textContent).toContain(
        "No studies linked to this persona configuration"
      );
    });

    it("shows loading state when review data is undefined", async () => {
      mockedPackDetail = makePack({
        _id: "config-review-loading" as Id<"personaConfigs">,
      });
      mockedPackVariantReview = undefined;

      const { container } = await renderRoute([
        "/persona-configs/config-review-loading?tab=review",
      ]);

      expect(container.textContent).toContain("Loading");
    });

    it("shows unavailable state when review data is null", async () => {
      mockedPackDetail = makePack({
        _id: "config-review-null" as Id<"personaConfigs">,
      });
      mockedPackVariantReview = null;

      const { container } = await renderRoute([
        "/persona-configs/config-review-null?tab=review",
      ]);

      expect(container.textContent).toContain("Variant review unavailable");
    });

    it("supports keyboard navigation through variant rows", async () => {
      mockedPackDetail = makePack({
        _id: "config-review-kb" as Id<"personaConfigs">,
        status: "published",
      });
      mockedPackVariantReview = makePackVariantReview();

      const { container } = await renderRoute([
        "/persona-configs/config-review-kb?tab=review",
      ]);

      const grid = container.querySelector('[role="grid"]');
      expect(grid).not.toBeNull();

      // Navigate down to second variant
      await dispatchKeyDown(grid!, "ArrowDown");

      const selectedRow = container.querySelector(
        '[data-testid="variant-row"][aria-selected="true"]'
      );
      expect(selectedRow?.textContent).toContain("Power user");
    });

    it("renders sortable score headers", async () => {
      mockedPackDetail = makePack({
        _id: "config-review-sort" as Id<"personaConfigs">,
        status: "published",
      });
      mockedPackVariantReview = makePackVariantReview();

      const { container } = await renderRoute([
        "/persona-configs/config-review-sort?tab=review",
      ]);

      const edgeHeader = [...container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Edge")
      );
      expect(edgeHeader).toBeDefined();

      const coherHeader = [...container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Coher.")
      );
      expect(coherHeader).toBeDefined();
    });
  });

  // -----------------------------------------------------------------------
  // ARIA Semantics
  // -----------------------------------------------------------------------
  describe("ARIA semantics", () => {
    it("renders user list items as div[role=option], not button", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = [
        makeSyntheticUser({
          _id: "user-aria" as Id<"syntheticUsers">,
          name: "ARIA User",
          summary: "Testing element.",
        }),
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=users",
      ]);

      const options = container.querySelectorAll('[role="option"]');
      expect(options.length).toBeGreaterThan(0);
      for (const option of options) {
        expect(option.tagName).toBe("DIV");
      }
      // No button elements should have role="option"
      const buttonOptions = container.querySelectorAll('button[role="option"]');
      expect(buttonOptions).toHaveLength(0);
    });

    it("renders transcript list items as div[role=option], not button", async () => {
      const transcript = makeTranscript({
        _id: "t-aria" as Id<"transcripts">,
        originalFilename: "aria-test.txt",
      });

      mockedPackDetail = makePack();
      mockedConfigTranscriptsByPackId["config-1"] = [
        {
          _id: "ct-aria",
          configId: "config-1",
          transcriptId: "t-aria",
          createdAt: 1,
          transcript,
        },
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=transcripts",
      ]);

      const options = container.querySelectorAll('[role="option"]');
      expect(options.length).toBeGreaterThan(0);
      for (const option of options) {
        expect(option.tagName).toBe("DIV");
      }
      const buttonOptions = container.querySelectorAll('button[role="option"]');
      expect(buttonOptions).toHaveLength(0);
    });

    it("places role=grid on the table element in generation workspace", async () => {
      mockedPackDetail = makePack({
        _id: "config-gen-aria" as Id<"personaConfigs">,
      });
      mockedSyntheticUsers = [
        makeSyntheticUser({
          _id: "user-gen-aria" as Id<"syntheticUsers">,
          configId: "config-gen-aria" as Id<"personaConfigs">,
          name: "Gen ARIA User",
          sourceType: "generated",
          generationStatus: "completed",
        }),
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-gen-aria?tab=generation",
      ]);

      const grid = container.querySelector('[role="grid"]');
      expect(grid).not.toBeNull();
      expect(grid!.tagName).toBe("TABLE");
    });

    it("places role=grid on the table element in review workspace", async () => {
      mockedPackDetail = makePack({
        _id: "config-review-aria" as Id<"personaConfigs">,
        status: "published",
      });
      mockedPackVariantReview = makePackVariantReview();

      const { container } = await renderRoute([
        "/persona-configs/config-review-aria?tab=review",
      ]);

      const grid = container.querySelector('[role="grid"]');
      expect(grid).not.toBeNull();
      expect(grid!.tagName).toBe("TABLE");
    });

    it("adds aria-sort to sortable headers in review workspace", async () => {
      mockedPackDetail = makePack({
        _id: "config-review-sort-aria" as Id<"personaConfigs">,
        status: "published",
      });
      mockedPackVariantReview = makePackVariantReview();

      const { container } = await renderRoute([
        "/persona-configs/config-review-sort-aria?tab=review",
      ]);

      // Default sort is edgeScore desc
      const headers = container.querySelectorAll("th[aria-sort]");
      expect(headers.length).toBeGreaterThanOrEqual(3);

      const sortValues = [...headers].map((h) => h.getAttribute("aria-sort"));
      // At least one header should be actively sorted (ascending or descending)
      expect(
        sortValues.some((v) => v === "ascending" || v === "descending")
      ).toBe(true);
      // Non-active headers should have "none"
      expect(sortValues.some((v) => v === "none")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // URL State and Deep-Linking
  // -----------------------------------------------------------------------
  describe("URL state and deep-linking", () => {
    it("defaults to overview tab when no tab specified", async () => {
      mockedPackDetail = makePack({
        _id: "config-url" as Id<"personaConfigs">,
      });

      const { container } = await renderRoute(["/persona-configs/config-url"]);

      const tabs = container.querySelectorAll('[role="tab"]');
      const overviewTab = [...tabs].find(
        (t) => t.textContent?.trim() === "Overview"
      );
      expect(overviewTab?.getAttribute("aria-selected")).toBe("true");
    });

    it("navigates to users tab via deep link", async () => {
      mockedPackDetail = makePack({
        _id: "config-url-users" as Id<"personaConfigs">,
      });
      mockedSyntheticUsers = [makeSyntheticUser()];

      const { container } = await renderRoute([
        "/persona-configs/config-url-users?tab=users",
      ]);

      const tabs = container.querySelectorAll('[role="tab"]');
      const usersTab = [...tabs].find((t) => t.textContent?.trim() === "Users");
      expect(usersTab?.getAttribute("aria-selected")).toBe("true");

      // Users workspace is active — check for user list ARIA landmark
      const listbox = container.querySelector('[aria-label="Synthetic users"]');
      expect(listbox).not.toBeNull();
    });

    it("navigates to review tab via deep link", async () => {
      mockedPackDetail = makePack({
        _id: "config-url-review" as Id<"personaConfigs">,
        status: "published",
      });
      mockedPackVariantReview = makePackVariantReview();

      const { container } = await renderRoute([
        "/persona-configs/config-url-review?tab=review",
      ]);

      const tabs = container.querySelectorAll('[role="tab"]');
      const reviewTab = [...tabs].find(
        (t) => t.textContent?.trim() === "Review"
      );
      expect(reviewTab?.getAttribute("aria-selected")).toBe("true");
    });

    it("preserves selected user from URL search params", async () => {
      mockedPackDetail = makePack({
        _id: "config-url-sel" as Id<"personaConfigs">,
      });
      mockedSyntheticUsers = [
        makeSyntheticUser({
          _id: "user-first" as Id<"syntheticUsers">,
          name: "First",
        }),
        makeSyntheticUser({
          _id: "user-second" as Id<"syntheticUsers">,
          name: "Second",
        }),
      ];

      const { container } = await renderRoute([
        "/persona-configs/config-url-sel?tab=users&selectedUserId=user-second",
      ]);

      // The inspector should show the second user
      const selectedOption = container.querySelector(
        '[role="option"][aria-selected="true"]'
      );
      expect(selectedOption?.textContent).toContain("Second");
    });

    it("navigates between all tab deep links correctly", async () => {
      const tabs = ["overview", "users", "transcripts", "generation", "review"];

      for (const tab of tabs) {
        mockedPackDetail = makePack({
          _id: `config-${tab}` as Id<"personaConfigs">,
        });
        mockedPackVariantReview = makePackVariantReview();
        mockedSyntheticUsers = [makeSyntheticUser()];

        const { container } = await renderRoute([
          `/persona-configs/config-${tab}?tab=${tab}`,
        ]);

        const tabElements = container.querySelectorAll('[role="tab"]');
        const activeTab = [...tabElements].find(
          (t) => t.getAttribute("aria-selected") === "true"
        );

        expect(activeTab?.textContent?.trim().toLowerCase()).toBe(tab);
      }
    });

    it("falls back to overview for invalid tab values", async () => {
      mockedPackDetail = makePack({
        _id: "config-invalid" as Id<"personaConfigs">,
      });

      const { container } = await renderRoute([
        "/persona-configs/config-invalid?tab=nonexistent",
      ]);

      const tabs = container.querySelectorAll('[role="tab"]');
      const overviewTab = [...tabs].find(
        (t) => t.textContent?.trim() === "Overview"
      );
      expect(overviewTab?.getAttribute("aria-selected")).toBe("true");
    });

    it("switches tabs via tab button click and updates URL", async () => {
      mockedPackDetail = makePack({
        _id: "config-click" as Id<"personaConfigs">,
      });
      mockedSyntheticUsers = [makeSyntheticUser()];

      const { container, router } = await renderRoute([
        "/persona-configs/config-click?tab=overview",
      ]);

      // Click Users tab
      await clickButton(container, "Users");

      const tabs = container.querySelectorAll('[role="tab"]');
      const usersTab = [...tabs].find((t) => t.textContent?.trim() === "Users");
      expect(usersTab?.getAttribute("aria-selected")).toBe("true");

      // Verify URL updated
      const href = router.state.location.href;
      expect(href).toContain("tab=users");
    });
  });

  // -----------------------------------------------------------------------
  // Workspace-scoped loading and error boundaries
  // -----------------------------------------------------------------------
  describe("workspace-scoped loading and error states", () => {
    it("shows shell loading card when config data is undefined", async () => {
      mockedPackDetail = undefined;

      const { container } = await renderRoute([
        "/persona-configs/config-loading?tab=overview",
      ]);

      expect(container.textContent).toContain(
        "Loading persona configuration details..."
      );
    });

    it("shows not found when config data is null", async () => {
      mockedPackDetail = null;

      const { container } = await renderRoute([
        "/persona-configs/config-null?tab=overview",
      ]);

      expect(container.textContent).toContain(
        "Persona configuration not found"
      );
    });

    it("renders shell and tabs while users workspace data is still loading", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = undefined; // still loading

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=users",
      ]);

      // Shell renders: config name visible
      expect(container.textContent).toContain("Test Config");
      // Tabs render
      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(5);
      // Workspace shows its own loading card
      expect(container.textContent).toContain("Loading synthetic users...");
    });

    it("renders shell and tabs while transcripts workspace data is still loading", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = [makeSyntheticUser()];
      // configTranscripts left as default (empty {} in mockedConfigTranscriptsByPackId)
      // The mock returns [] for unknown keys, so we need to make it return undefined
      mockedConfigTranscriptsByPackId = {};

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=transcripts",
      ]);

      // Shell renders: config name and tabs visible
      expect(container.textContent).toContain("Test Config");
      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(5);
    });

    it("renders shell and tabs while generation workspace data is still loading", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = undefined; // still loading

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=generation",
      ]);

      // Shell renders
      expect(container.textContent).toContain("Test Config");
      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(5);
      // Generation workspace shows its own loading card
      expect(container.textContent).toContain(
        "Loading synthetic users for generation..."
      );
    });

    it("does not crash overview workspace when workspace data is still loading", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = undefined;

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=overview",
      ]);

      // Shell and overview render (overview uses counts from config, not syntheticUsers directly)
      expect(container.textContent).toContain("Test Config");
      expect(container.textContent).toContain("Orientation");
    });
  });

  describe("error boundary", () => {
    // Build a configVariantReview where parent-level accesses succeed
    // but ReviewWorkspaceInner throws when accessing config.sharedAxes
    function makeCrashingReviewData(): ConfigReviewData {
      const study = {
        _id: "study-1",
        name: "Crash study",
        status: "persona_review",
        runBudget: 64,
        updatedAt: Date.now(),
      };
      return {
        study,
        selectedStudy: study,
        config: {
          _id: "config-1",
          name: "Test Config",
          status: "published",
          get sharedAxes(): never {
            throw new Error("Simulated workspace crash");
          },
        },
        syntheticUsers: [{ _id: "user-1", name: "U", summary: "S" }],
        variants: [],
        studies: [{ ...study, acceptedVariantCount: 0 }],
      } as unknown as ConfigReviewData;
    }

    it("shows error fallback when a workspace throws, without crashing shell", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = [makeSyntheticUser()];
      mockedPackVariantReview = makeCrashingReviewData();

      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=review",
      ]);

      // Shell still renders
      expect(container.textContent).toContain("Test Config");
      const tabs = container.querySelectorAll('[role="tab"]');
      expect(tabs).toHaveLength(5);

      // Error fallback renders inside the tabpanel
      expect(container.textContent).toContain("Something went wrong");
      expect(container.textContent).toContain("Try again");

      spy.mockRestore();
    });

    it("resets error state when clicking Try again", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = [makeSyntheticUser()];
      mockedPackVariantReview = makeCrashingReviewData();

      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=review",
      ]);

      expect(container.textContent).toContain("Something went wrong");

      // Click "Try again" — boundary resets, workspace throws again
      await clickButton(container, "Try again");

      // Still showing error (workspace still throws)
      expect(container.textContent).toContain("Something went wrong");
      // Shell is still intact
      expect(container.textContent).toContain("Test Config");

      spy.mockRestore();
    });

    it("resets error state when switching tabs", async () => {
      mockedPackDetail = makePack();
      mockedSyntheticUsers = [makeSyntheticUser()];
      mockedPackVariantReview = makeCrashingReviewData();

      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      const { container } = await renderRoute([
        "/persona-configs/config-1?tab=review",
      ]);

      expect(container.textContent).toContain("Something went wrong");

      // Switch to overview tab — error resets because resetKey changes
      await clickButton(container, "Overview");

      // Overview renders normally (no error fallback)
      expect(container.textContent).not.toContain("Something went wrong");
      expect(container.textContent).toContain("Orientation");

      spy.mockRestore();
    });
  });
});
