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

type RunSummary = {
  studyId: string;
  totalRuns: number;
  queuedCount: number;
  runningCount: number;
  terminalCount: number;
  outcomeCounts: Record<string, number>;
};

type RunListItem = {
  _id: string;
  status: string;
  protoPersonaId: string;
  protoPersonaName: string;
  protoPersonaSummary: string;
  firstPersonBio: string;
  axisValues: { key: string; value: number }[];
  finalUrl?: string;
  finalOutcome?: string;
  durationSec?: number;
  stepCount?: number;
};

type RunDetail = {
  run: {
    _id: string;
    status: string;
    finalUrl?: string;
    finalOutcome?: string;
    durationSec?: number;
    stepCount?: number;
    selfReport?: {
      perceivedSuccess: boolean;
      hardestPart?: string;
      confusion?: string;
      confidence?: number;
      suggestedChange?: string;
    };
    artifactManifestKey?: string;
    summaryKey?: string;
  };
  personaVariant: {
    _id: string;
    firstPersonBio: string;
    axisValues: { key: string; value: number }[];
  };
  protoPersona: {
    _id: string;
    name: string;
  };
  milestones: Array<{
    _id: string;
    stepIndex: number;
    timestamp: number;
    url: string;
    title: string;
    actionType: string;
    rationaleShort: string;
    screenshotKey?: string;
  }>;
};

type FindingView = {
  _id: string;
  title: string;
  summary: string;
  severity: "blocker" | "major" | "minor" | "cosmetic";
  affectedRunCount: number;
  affectedRunRate: number;
  affectedAxisRanges: Array<{ key: string; min: number; max: number }>;
  recommendation: string;
  confidenceNote: string;
  replayConfidence: number;
  affectedProtoPersonas: Array<{ _id: string; name: string }>;
  evidence: Array<{
    key: string;
    thumbnailKey: string;
    fullResolutionKey: string;
  }>;
  notes: Array<{
    _id: string;
    authorId: string;
    note: string;
    createdAt: number;
  }>;
  representativeRuns: Array<{
    _id: string;
    protoPersonaId: string;
    protoPersonaName: string | null;
    status: string;
    finalUrl: string | null;
    finalOutcome: string | null;
    representativeQuote: string | null;
    evidence: Array<{
      key: string;
      thumbnailKey: string;
      fullResolutionKey: string;
    }>;
  }>;
};

type StudyReportView = {
  _id: string;
  studyId: string;
  headlineMetrics: {
    completionRate: number;
    abandonmentRate: number;
    medianSteps: number;
    medianDurationSec: number;
  };
  issueClusterIds: string[];
  segmentBreakdownKey: string;
  limitations: string[];
  htmlReportKey?: string;
  jsonReportKey?: string;
  createdAt: number;
};

let mockedVariantReview: ReviewData | null | undefined = undefined;
let mockedPackVariantReview: PackReviewData | null | undefined = undefined;
let mockedStudyList: Doc<"studies">[] | undefined = [];
let mockedStudyById: Record<string, Doc<"studies"> | null | undefined> = {};
let mockedRunSummariesByStudyId: Record<string, RunSummary | undefined> = {};
let mockedRunsByStudyId: Record<string, RunListItem[] | undefined> = {};
let mockedRunDetailsById: Record<string, RunDetail | null | undefined> = {};
let mockedFindingsByStudyId: Record<string, FindingView[] | undefined> = {};
let mockedReportsByStudyId: Record<string, StudyReportView | null | undefined> =
  {};
const MOCK_ARTIFACT_BASE_URL = "http://localhost:8787";
const createDraftMock = vi.fn();
const createStudyMock = vi.fn();
const updateStudyMock = vi.fn();
const launchStudyMock = vi.fn();
const cancelStudyMock = vi.fn();
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

    if (mutationName === "studies:createStudy") {
      return createStudyMock;
    }

    if (mutationName === "studies:updateStudy") {
      return updateStudyMock;
    }

    if (mutationName === "studies:launchStudy") {
      return launchStudyMock;
    }

    if (mutationName === "studies:cancelStudy") {
      return cancelStudyMock;
    }

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
  useQuery: (query: unknown, args: Record<string, unknown> | undefined) => {
    const queryName = getFunctionName(query as never);

    if (queryName === "studies:listStudies") {
      return mockedStudyList;
    }

    if (queryName === "studies:getStudy") {
      return mockedStudyById[String(args?.studyId)];
    }

    if (queryName === "runs:getRunSummary") {
      return mockedRunSummariesByStudyId[String(args?.studyId)];
    }

    if (queryName === "runs:listRuns") {
      const studyRuns = mockedRunsByStudyId[String(args?.studyId)];

      if (studyRuns === undefined) {
        return undefined;
      }

      return studyRuns.filter((run) => {
        if (
          typeof args?.outcome === "string" &&
          run.status !== args.outcome
        ) {
          return false;
        }

        if (
          typeof args?.protoPersonaId === "string" &&
          run.protoPersonaId !== args.protoPersonaId
        ) {
          return false;
        }

        if (
          typeof args?.finalUrlContains === "string" &&
          !(run.finalUrl?.includes(args.finalUrlContains) ?? false)
        ) {
          return false;
        }

        return true;
      });
    }

    if (queryName === "runs:getRun") {
      return mockedRunDetailsById[String(args?.runId)];
    }

    if (queryName === "analysisQueries:listFindings") {
      return mockedFindingsByStudyId[String(args?.studyId)];
    }

    if (queryName === "analysisQueries:getReport") {
      return mockedReportsByStudyId[String(args?.studyId)];
    }

    if (queryName === "analysisQueries:resolveArtifactUrls") {
      return Object.fromEntries(
        ((args?.keys as string[] | undefined) ?? []).map((key) => [
          key,
          key.startsWith("data:")
            ? key
            : `${MOCK_ARTIFACT_BASE_URL}/artifacts/${encodeURIComponent(key)}`,
        ]),
      );
    }

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
  mockedStudyList = [];
  mockedStudyById = {};
  mockedRunSummariesByStudyId = {};
  mockedRunsByStudyId = {};
  mockedRunDetailsById = {};
  mockedFindingsByStudyId = {};
  mockedReportsByStudyId = {};
  createDraftMock.mockReset();
  createDraftMock.mockResolvedValue("new-pack-id" as Id<"personaPacks">);
  createStudyMock.mockReset();
  createStudyMock.mockResolvedValue(
    makeStudy({ _id: "study-created" as Id<"studies"> }),
  );
  updateStudyMock.mockReset();
  updateStudyMock.mockResolvedValue(undefined);
  launchStudyMock.mockReset();
  launchStudyMock.mockResolvedValue(undefined);
  cancelStudyMock.mockReset();
  cancelStudyMock.mockResolvedValue(undefined);
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

  it("renders an empty state CTA on /studies when no studies exist", async () => {
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
      ]),
    );
  });

  it("renders studies with status chips, run progress, and last updated details", async () => {
    mockedStudyList = [
      makeStudy({
        _id: "study-ready" as Id<"studies">,
        name: "Checkout baseline",
        status: "ready",
        updatedAt: 1_700_000_000_000,
      }),
      makeStudy({
        _id: "study-running" as Id<"studies">,
        name: "Returns friction audit",
        status: "running",
        updatedAt: 1_700_000_000_500,
      }),
    ];
    mockedRunSummariesByStudyId = {
      "study-ready": makeRunSummary("study-ready", {
        totalRuns: 12,
        terminalCount: 5,
        runningCount: 4,
        queuedCount: 3,
      }),
      "study-running": makeRunSummary("study-running", {
        totalRuns: 8,
        terminalCount: 6,
        runningCount: 1,
        queuedCount: 1,
      }),
    };

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies"],
    });

    expect(container.textContent).toContain("Checkout baseline");
    expect(container.textContent).toContain("Returns friction audit");
    expect(container.textContent).toContain("ready");
    expect(container.textContent).toContain("running");
    expect(container.textContent).toContain("5/12 terminal");
    expect(container.textContent).toContain("6/8 terminal");
    expect(container.textContent).toContain("Nov");
  });

  it("renders the study creation wizard and submits a new study", async () => {
    mockedPackList = [
      makePack({
        _id: "pack-published" as Id<"personaPacks">,
        name: "Checkout Pack",
        status: "published",
      }),
    ];

    const { container, router } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/new"],
    });

    expect(container.textContent).toContain("Create a new study");
    expect(container.textContent).toContain("Persona pack selector");
    expect(container.textContent).toContain("Guardrail review");

    await updateInput(container, "#study-name", "New Checkout Study");
    await updateTextarea(
      container,
      "#study-description",
      "Evaluates the purchase flow for first-time shoppers.",
    );
    await updateTextarea(
      container,
      "#study-scenario",
      "A shopper needs to buy a pair of shoes before a weekend trip.",
    );
    await updateTextarea(
      container,
      "#study-goal",
      "Reach order confirmation.",
    );
    await updateInput(
      container,
      "#study-starting-url",
      "https://example.com/products/shoes",
    );
    await updateTextarea(
      container,
      "#study-allowed-domains",
      "example.com\ncheckout.example.com",
    );
    await updateInput(container, "#study-run-budget", "32");
    await updateInput(container, "#study-active-concurrency", "6");
    await updateSelect(container, "#study-environment-label", "qa");
    await updateTextarea(
      container,
      "#study-success-criteria",
      "See order confirmation",
    );
    await updateTextarea(
      container,
      "#study-stop-conditions",
      "Leave the allowlisted domain",
    );
    await updateTextarea(
      container,
      "#study-post-task-questions",
      "Did you finish?",
    );
    await updateInput(container, "#study-max-steps", "18");
    await updateInput(container, "#study-max-duration", "360");

    const form = container.querySelector("form");
    expect(form).not.toBeNull();

    await act(async () => {
      form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(createStudyMock).toHaveBeenCalledWith({
      study: {
        personaPackId: "pack-published",
        name: "New Checkout Study",
        description: "Evaluates the purchase flow for first-time shoppers.",
        taskSpec: {
          scenario:
            "A shopper needs to buy a pair of shoes before a weekend trip.",
          goal: "Reach order confirmation.",
          startingUrl: "https://example.com/products/shoes",
          allowedDomains: ["example.com", "checkout.example.com"],
          allowedActions: [
            "goto",
            "click",
            "type",
            "select",
            "scroll",
            "wait",
            "back",
            "finish",
          ],
          forbiddenActions: ["payment_submission", "external_download"],
          successCriteria: ["See order confirmation"],
          stopConditions: ["Leave the allowlisted domain"],
          postTaskQuestions: ["Did you finish?"],
          maxSteps: 18,
          maxDurationSec: 360,
          environmentLabel: "qa",
          locale: "en-US",
          viewport: { width: 1440, height: 900 },
        },
        runBudget: 32,
        activeConcurrency: 6,
      },
    });
    expect(getRouterLocationHref(router)).toBe("/studies/study-created/overview");
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

  it("renders overview tabs and study task details", async () => {
    mockedStudyById = {
      "study-live": makeStudy({
        _id: "study-live" as Id<"studies">,
        name: "Checkout usability benchmark",
        description: "Investigates friction in the core checkout funnel.",
        status: "persona_review",
      }),
    };
    mockedRunSummariesByStudyId = {
      "study-live": makeRunSummary("study-live"),
    };

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/overview"],
    });

    expect(container.textContent).toContain("Checkout usability benchmark");
    expect(container.textContent).toContain("Task specification");
    expect(container.textContent).toContain("A shopper wants to complete checkout.");
    expect(container.textContent).toContain("Live monitor");

    const links = [...container.querySelectorAll("a")].map((link) => ({
      href: link.getAttribute("href"),
      text: link.textContent,
    }));

    expect(links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          href: "/studies/study-live/overview",
          text: "Overview",
        }),
        expect.objectContaining({
          href: "/studies/study-live/personas",
          text: "Personas",
        }),
        expect.objectContaining({
          href: "/studies/study-live/runs",
          text: "Runs",
        }),
        expect.objectContaining({
          href: "/studies/study-live/findings",
          text: "Findings",
        }),
        expect.objectContaining({
          href: "/studies/study-live/report",
          text: "Report",
        }),
      ]),
    );
  });

  it("lets researchers edit draft studies from the overview page", async () => {
    mockedStudyById = {
      "study-live": makeStudy({
        _id: "study-live" as Id<"studies">,
        status: "draft",
      }),
    };
    mockedRunSummariesByStudyId = {
      "study-live": makeRunSummary("study-live"),
    };

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/overview"],
    });

    await clickButton(container, "Edit Study");
    await updateInput(container, "#study-name", "Updated study name");
    await updateInput(container, "#study-starting-url", "https://example.com/new-start");
    await updateInput(container, "#study-run-budget", "48");
    await updateInput(container, "#study-active-concurrency", "5");
    await updateSelect(container, "#study-environment-label", "qa");
    await updateTextarea(container, "#study-post-task-questions", "Did you finish?\nWhat slowed you down?");

    const form = container.querySelector("form");
    expect(form).not.toBeNull();

    await act(async () => {
      form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
    });

    expect(updateStudyMock).toHaveBeenCalledWith({
      studyId: "study-live",
      patch: {
        name: "Updated study name",
        description: "Evaluates friction in the checkout flow.",
        taskSpec: {
          scenario: "A shopper wants to complete checkout.",
          goal: "Reach order confirmation.",
          startingUrl: "https://example.com/new-start",
          allowedDomains: ["example.com"],
          allowedActions: ["goto", "click", "type", "select", "scroll", "wait", "back", "finish"],
          forbiddenActions: ["payment_submission", "external_download"],
          successCriteria: ["Order confirmation is visible"],
          stopConditions: ["Leave the allowlisted domain"],
          postTaskQuestions: ["Did you finish?", "What slowed you down?"],
          maxSteps: 25,
          maxDurationSec: 420,
          environmentLabel: "qa",
          locale: "en-US",
          viewport: { width: 1440, height: 900 },
        },
        runBudget: 48,
        activeConcurrency: 5,
      },
    });
    expect(container.textContent).toContain("Study draft saved.");
  });

  it("shows launch confirmation and launches studies from the overview page", async () => {
    mockedStudyById = {
      "study-live": makeStudy({
        _id: "study-live" as Id<"studies">,
        status: "draft",
      }),
    };
    mockedRunSummariesByStudyId = {
      "study-live": makeRunSummary("study-live"),
    };

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/overview"],
    });

    await clickButton(container, "Launch Study");
    expect(container.textContent).toContain("Launch study?");

    await clickButton(container, "Confirm Launch");

    expect(launchStudyMock).toHaveBeenCalledWith({ studyId: "study-live" });
    expect(container.textContent).toContain("Study launch started.");
  });

  it("shows cancel confirmation and requests cancellation for running studies", async () => {
    mockedStudyById = {
      "study-live": makeStudy({
        _id: "study-live" as Id<"studies">,
        status: "running",
      }),
    };
    mockedRunSummariesByStudyId = {
      "study-live": makeRunSummary("study-live", {
        totalRuns: 4,
        terminalCount: 1,
        runningCount: 2,
        queuedCount: 1,
      }),
    };
    mockedRunsByStudyId = {
      "study-live": [],
    };

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/overview"],
    });

    await clickButton(container, "Cancel Study");
    expect(container.textContent).toContain("Cancel study?");

    await clickButton(container, "Confirm Cancellation");

    expect(cancelStudyMock).toHaveBeenCalledWith({ studyId: "study-live" });
    expect(container.textContent).toContain("Study cancellation requested.");
  });

  it("renders the live monitor with outcome breakdown, active variants, and progress details", async () => {
    mockedStudyById = {
      "study-live": makeStudy({
        _id: "study-live" as Id<"studies">,
        status: "running",
        taskSpec: {
          ...makeStudy().taskSpec,
          maxSteps: 20,
        },
      }),
    };
    mockedRunSummariesByStudyId = {
      "study-live": makeRunSummary("study-live", {
        totalRuns: 8,
        terminalCount: 4,
        runningCount: 1,
        queuedCount: 2,
        outcomeCounts: {
          success: 3,
          hard_fail: 1,
          soft_fail: 0,
          gave_up: 0,
          timeout: 0,
          blocked_by_guardrail: 0,
          infra_error: 0,
          cancelled: 0,
        },
      }),
    };
    mockedRunsByStudyId = {
      "study-live": [
        {
          _id: "run-careful",
          status: "running",
          protoPersonaId: "proto-careful",
          protoPersonaName: "Careful shopper",
          protoPersonaSummary: "Moves slowly and checks every total.",
          firstPersonBio:
            "A careful shopper is currently validating the address step and comparing every number before continuing.",
          axisValues: [{ key: "digital_confidence", value: -0.42 }],
          stepCount: 6,
        },
        {
          _id: "run-speedy",
          status: "dispatching",
          protoPersonaId: "proto-speedy",
          protoPersonaName: "Speedy repeat buyer",
          protoPersonaSummary: "Moves quickly and expects autofill to work.",
          firstPersonBio:
            "A speedy repeat buyer is dispatching into the flow and expects most of checkout to be familiar.",
          axisValues: [{ key: "digital_confidence", value: 0.78 }],
          stepCount: 1,
        },
        {
          _id: "run-success",
          status: "success",
          protoPersonaId: "proto-complete",
          protoPersonaName: "Completed run",
          protoPersonaSummary: "Already finished.",
          firstPersonBio: "Completed successfully.",
          axisValues: [{ key: "digital_confidence", value: 0.2 }],
          stepCount: 5,
        },
      ],
    };

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/overview"],
    });

    expect(container.textContent).toContain("Live monitor");
    expect(container.textContent).toContain("50% complete");
    expect(container.textContent).toContain("Outcome breakdown");
    expect(container.textContent).toContain("Success");
    expect(container.textContent).toContain("Hard fail");
    expect(container.textContent).toContain("Queued / dispatching");
    expect(container.textContent).toContain("Active persona variants");
    expect(container.textContent).toContain("Careful shopper");
    expect(container.textContent).toContain("Speedy repeat buyer");
    expect(container.textContent).toContain("Step 6");
    expect(container.textContent).toContain("30% of step budget");
    expect(
      container.querySelector('[aria-label="Replay: Waiting"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Analysis: Waiting"]'),
    ).not.toBeNull();
  });

  it("updates replay and analysis chips on the overview monitor", async () => {
    mockedRunSummariesByStudyId = {
      "study-live": makeRunSummary("study-live"),
    };
    mockedRunsByStudyId = {
      "study-live": [],
    };

    mockedStudyById = {
      "study-live": makeStudy({
        _id: "study-live" as Id<"studies">,
        status: "replaying",
      }),
    };

    const replayingView = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/overview"],
    });

    expect(
      replayingView.container.querySelector('[aria-label="Replay: Replaying"]'),
    ).not.toBeNull();
    expect(
      replayingView.container.querySelector('[aria-label="Analysis: Waiting"]'),
    ).not.toBeNull();

    mockedStudyById = {
      "study-live": makeStudy({
        _id: "study-live" as Id<"studies">,
        status: "analyzing",
      }),
    };

    const analyzingView = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/overview"],
    });

    expect(
      analyzingView.container.querySelector('[aria-label="Replay: Complete"]'),
    ).not.toBeNull();
    expect(
      analyzingView.container.querySelector('[aria-label="Analysis: Analyzing"]'),
    ).not.toBeNull();
  });

  it("renders run detail content and filters runs by outcome, persona, and URL", async () => {
    mockedRunsByStudyId = {
      "study-live": makeRunList(),
    };
    mockedRunDetailsById = {
      "run-hard-fail": makeRunDetail(),
      "run-success": makeRunDetail({
        run: {
          _id: "run-success",
          status: "success",
          finalUrl: "https://example.com/checkout/confirmation",
          finalOutcome: "order_confirmed",
        },
      }),
    };

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/runs"],
    });

    expect(container.textContent).toContain("Run detail");
    expect(container.textContent).toContain("Persona summary");
    expect(container.textContent).toContain("Careful shopper");
    expect(container.textContent).toContain("Milestone timeline");
    expect(container.textContent).toContain("Open artifact manifest");
    expect(container.innerHTML).not.toContain("r2://");

    await updateSelect(container, "#run-outcome-filter", "hard_fail");
    expect(container.textContent).toContain("Filtered runs (1)");
    expect(container.textContent).toContain("Checkout failed at address");

    await updateSelect(container, "#run-persona-filter", "proto-careful");
    expect(container.textContent).toContain("Filtered runs (1)");

    await updateInput(container, "#run-url-filter", "confirmation");
    expect(container.textContent).toContain("Filtered runs (0)");
  });

  it("preserves run filter state when switching between study detail tabs", async () => {
    mockedStudyById = {
      "study-live": makeStudy({ _id: "study-live" as Id<"studies"> }),
    };
    mockedRunsByStudyId = {
      "study-live": makeRunList(),
    };
    mockedRunDetailsById = {
      "run-hard-fail": makeRunDetail(),
    };
    mockedFindingsByStudyId = {
      "study-live": makeFindings(),
    };

    const { container, router } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/runs"],
    });

    await updateSelect(container, "#run-outcome-filter", "hard_fail");
    await updateSelect(container, "#run-persona-filter", "proto-careful");
    await updateInput(container, "#run-url-filter", "address");

    const findingsLink = [...container.querySelectorAll("a")].find(
      (link) => link.textContent === "Findings",
    );
    expect(findingsLink).not.toBeNull();

    await act(async () => {
      findingsLink!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(getRouterLocationHref(router)).toContain(
      "/studies/study-live/findings",
    );
    expect(getRouterLocationHref(router)).toContain("outcome=hard_fail");
    expect(getRouterLocationHref(router)).toContain("protoPersonaId=proto-careful");
    expect(getRouterLocationHref(router)).toContain("finalUrlContains=address");

    const runsLink = [...container.querySelectorAll("a")].find(
      (link) => link.textContent === "Runs",
    );
    expect(runsLink).not.toBeNull();

    await act(async () => {
      runsLink!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const outcomeSelect = container.querySelector<HTMLSelectElement>(
      "#run-outcome-filter",
    );
    const personaSelect = container.querySelector<HTMLSelectElement>(
      "#run-persona-filter",
    );
    const urlInput = container.querySelector<HTMLInputElement>("#run-url-filter");

    expect(outcomeSelect?.value).toBe("hard_fail");
    expect(personaSelect?.value).toBe("proto-careful");
    expect(urlInput?.value).toBe("address");
  });

  it("renders findings cards with filters, evidence links, and analyst notes", async () => {
    mockedStudyById = {
      "study-live": makeStudy({
        _id: "study-live" as Id<"studies">,
        status: "completed",
      }),
    };
    mockedFindingsByStudyId = {
      "study-live": makeFindings(),
    };

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/findings"],
    });

    expect(container.textContent).toContain("Findings Explorer");
    expect(container.textContent).toContain(
      "Checkout continue button hidden on the address step",
    );
    expect(container.textContent).toContain(
      "Replay evidence confirms the continue button is clipped below the fold.",
    );

    const evidenceLinks = [...container.querySelectorAll<HTMLAnchorElement>("a")]
      .filter((link) => link.textContent?.includes("Open evidence"));
    expect(evidenceLinks).toHaveLength(2);
    expect(evidenceLinks[0]?.getAttribute("href")).toBe(
      "http://localhost:8787/artifacts/runs%2Frun-hard-fail%2Fmilestones%2F2.jpg",
    );

    await updateSelect(container, "#finding-severity-filter", "blocker");
    expect(container.textContent).toContain("Showing 1 of 2 clusters");
    expect(container.textContent).not.toContain("Payment totals shift late in checkout");

    await updateSelect(container, "#finding-persona-filter", "proto-speedy");
    expect(container.textContent).toContain("No matching findings");

    await updateSelect(container, "#finding-severity-filter", "");
    await updateSelect(container, "#finding-persona-filter", "proto-careful");
    await updateSelect(container, "#finding-axis-key-filter", "digital_confidence");
    await updateInput(container, "#finding-axis-min-filter", "-0.8");
    await updateInput(container, "#finding-axis-max-filter", "-0.2");
    await updateSelect(container, "#finding-outcome-filter", "hard_fail");
    await updateInput(
      container,
      "#finding-url-prefix-filter",
      "https://example.com/checkout/address",
    );

    expect(container.textContent).toContain("Showing 1 of 2 clusters");
    expect(container.textContent).toContain(
      "Checkout continue button hidden on the address step",
    );
    expect(container.textContent).not.toContain("Payment totals shift late in checkout");
  });

  it("opens the linked representative run detail from a findings card", async () => {
    mockedStudyById = {
      "study-live": makeStudy({
        _id: "study-live" as Id<"studies">,
        status: "completed",
      }),
    };
    mockedFindingsByStudyId = {
      "study-live": makeFindings(),
    };
    mockedRunsByStudyId = {
      "study-live": makeRunList(),
    };
    mockedRunDetailsById = {
      "run-hard-fail": makeRunDetail(),
      "run-success": makeRunDetail({
        run: {
          _id: "run-success",
          status: "success",
          finalUrl: "https://example.com/checkout/confirmation",
          finalOutcome: "order_confirmed",
        },
      }),
    };

    const { container, router } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/findings"],
    });

    const runLink = [...container.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent?.includes("Open run detail"),
    );

    expect(runLink).not.toBeNull();

    await act(async () => {
      runLink!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(getRouterLocationHref(router)).toContain("/studies/study-live/runs");
    expect(getRouterLocationHref(router)).toContain("runId=run-hard-fail");
    expect(container.textContent).toContain("Run detail");
    expect(container.textContent).toContain("Checkout failed at address");
    expect(container.textContent).toContain("The shipping address step");
  });

  it("renders the report page with headline metrics, ranked issue cards, evidence thumbnails, and analyst notes", async () => {
    mockedStudyById = {
      "study-live": makeStudy({
        _id: "study-live" as Id<"studies">,
        status: "completed",
      }),
    };
    mockedRunSummariesByStudyId = {
      "study-live": makeRunSummary("study-live", {
        totalRuns: 12,
        terminalCount: 12,
        runningCount: 0,
        queuedCount: 0,
      }),
    };
    mockedFindingsByStudyId = {
      "study-live": makeFindings(),
    };
    mockedReportsByStudyId = {
      "study-live": makeStudyReport({
        issueClusterIds: ["finding-payment", "finding-address"],
        headlineMetrics: {
          completionRate: 0.68,
          abandonmentRate: 0.19,
          medianSteps: 7,
          medianDurationSec: 188,
        },
      }),
    };

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/report"],
    });

    expect(container.textContent).toContain("Study report");
    expect(container.textContent).toContain("Completion rate");
    expect(container.textContent).toContain("68%");
    expect(container.textContent).toContain("Abandonment rate");
    expect(container.textContent).toContain("19%");
    expect(container.textContent).toContain("Median steps");
    expect(container.textContent).toContain("Median duration");
    expect(container.textContent).toContain("188 sec");
    expect(container.textContent).toContain("12/12 terminal");

    const issueCards = [
      ...container.querySelectorAll<HTMLElement>('[data-testid="report-issue-card"]'),
    ];
    expect(issueCards).toHaveLength(2);
    expect(issueCards[0]?.textContent).toContain(
      "Payment totals shift late in checkout",
    );
    expect(issueCards[1]?.textContent).toContain(
      "Checkout continue button hidden on the address step",
    );
    expect(issueCards[0]?.textContent).toContain("What broke");
    expect(issueCards[0]?.textContent).toContain("Where");
    expect(issueCards[0]?.textContent).toContain("Affected segments");
    expect(issueCards[0]?.textContent).toContain("Representative quotes");
    expect(issueCards[0]?.textContent).toContain("Recommendation");
    expect(issueCards[0]?.textContent).toContain("Confidence note");

    const evidenceLinks = [
      ...container.querySelectorAll<HTMLAnchorElement>(
        '[data-testid="report-evidence-link"]',
      ),
    ];
    expect(evidenceLinks).toHaveLength(2);
    expect(evidenceLinks[0]?.getAttribute("href")).toBe(
      "http://localhost:8787/artifacts/runs%2Frun-success%2Fmilestones%2F4.jpg",
    );
    expect(evidenceLinks[0]?.querySelector("img")?.getAttribute("src")).toBe(
      "http://localhost:8787/artifacts/runs%2Frun-success%2Fmilestones%2F4.jpg",
    );
    expect(container.textContent).toContain(
      "Replay evidence confirms the continue button is clipped below the fold.",
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

function makeStudy(overrides: Partial<Doc<"studies">> = {}): Doc<"studies"> {
  return {
    _creationTime: 1,
    _id: (overrides._id ?? "study-1") as Id<"studies">,
    orgId: "researcher|org-a",
    personaPackId: "pack-1" as Id<"personaPacks">,
    name: "Checkout usability benchmark",
    description: "Evaluates friction in the checkout flow.",
    taskSpec: {
      scenario: "A shopper wants to complete checkout.",
      goal: "Reach order confirmation.",
      startingUrl: "https://example.com/checkout",
      allowedDomains: ["example.com"],
      allowedActions: ["goto", "click", "type", "finish"],
      forbiddenActions: ["payment_submission"],
      successCriteria: ["Order confirmation is visible"],
      stopConditions: ["Leave the allowlisted domain"],
      postTaskQuestions: ["Did you complete the task?"],
      maxSteps: 25,
      maxDurationSec: 420,
      environmentLabel: "staging",
      locale: "en-US",
      viewport: { width: 1440, height: 900 },
    },
    runBudget: 64,
    activeConcurrency: 8,
    status: "draft",
    createdBy: "researcher|org-a",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
}

function makeRunSummary(
  studyId: string,
  overrides: Partial<RunSummary> = {},
): RunSummary {
  return {
    studyId,
    totalRuns: 10,
    queuedCount: 2,
    runningCount: 3,
    terminalCount: 5,
    outcomeCounts: {
      success: 3,
      hard_fail: 1,
      soft_fail: 0,
      gave_up: 1,
      timeout: 0,
      blocked_by_guardrail: 0,
      infra_error: 0,
      cancelled: 0,
    },
    ...overrides,
  };
}

function makeRunList(): RunListItem[] {
  return [
    {
      _id: "run-hard-fail",
      status: "hard_fail",
      protoPersonaId: "proto-careful",
      protoPersonaName: "Careful shopper",
      protoPersonaSummary: "Moves slowly and checks every total.",
      firstPersonBio: "Checkout failed at address entry after the shipping form became confusing.",
      axisValues: [{ key: "digital_confidence", value: -0.42 }],
      finalUrl: "https://example.com/checkout/address",
      finalOutcome: "address_validation_failed",
      durationSec: 185,
      stepCount: 7,
    },
    {
      _id: "run-success",
      status: "success",
      protoPersonaId: "proto-speedy",
      protoPersonaName: "Speedy repeat buyer",
      protoPersonaSummary: "Moves quickly and expects autofill to work.",
      firstPersonBio: "Fast repeat buyer who completed the flow without friction.",
      axisValues: [{ key: "digital_confidence", value: 0.78 }],
      finalUrl: "https://example.com/checkout/confirmation",
      finalOutcome: "order_confirmed",
      durationSec: 92,
      stepCount: 5,
    },
  ];
}

function makeRunDetail(overrides: Partial<RunDetail> = {}): RunDetail {
  return {
    run: {
      _id: "run-hard-fail",
      status: "hard_fail",
      finalUrl: "https://example.com/checkout/address",
      finalOutcome: "address_validation_failed",
      durationSec: 185,
      stepCount: 7,
      selfReport: {
        perceivedSuccess: false,
        hardestPart: "The shipping address step",
        confusion: "I could not tell which field was invalid.",
        confidence: 0.32,
        suggestedChange: "Explain which fields need to change.",
      },
      artifactManifestKey: "runs/run-hard-fail/artifacts.json",
      summaryKey: "runs/run-hard-fail/summary.json",
      ...overrides.run,
    },
    personaVariant: {
      _id: "variant-careful",
      firstPersonBio:
        "I move carefully through checkout and need reassurance before I commit to payment.",
      axisValues: [{ key: "digital_confidence", value: -0.42 }],
      ...overrides.personaVariant,
    },
    protoPersona: {
      _id: "proto-careful",
      name: "Careful shopper",
      ...overrides.protoPersona,
    },
    milestones: [
      {
        _id: "milestone-1",
        stepIndex: 1,
        timestamp: 1_700_000_000_000,
        url: "https://example.com/checkout/cart",
        title: "Cart",
        actionType: "click",
        rationaleShort: "Started checkout from the cart page.",
        screenshotKey: "runs/run-hard-fail/milestones/1.png",
      },
      {
        _id: "milestone-2",
        stepIndex: 2,
        timestamp: 1_700_000_000_500,
        url: "https://example.com/checkout/address",
        title: "Address",
        actionType: "type",
        rationaleShort: "Entered the shipping address and hit a validation issue.",
      },
      ...(overrides.milestones ?? []),
    ],
  };
}

function makeFindings(): FindingView[] {
  return [
    {
      _id: "finding-address",
      title: "Checkout continue button hidden on the address step",
      summary:
        "A blocker cluster where the primary continue action disappears after address validation.",
      severity: "blocker",
      affectedRunCount: 3,
      affectedRunRate: 0.5,
      affectedAxisRanges: [
        { key: "digital_confidence", min: -0.9, max: -0.3 },
      ],
      recommendation:
        "Pin the continue action below the form and keep it visible after validation messages appear.",
      confidenceNote: "Replay reproduced the missing button twice.",
      replayConfidence: 0.82,
      affectedProtoPersonas: [
        { _id: "proto-careful", name: "Careful shopper" },
      ],
      evidence: [
        {
          key: "runs/run-hard-fail/milestones/2.jpg",
          thumbnailKey: "runs/run-hard-fail/milestones/2.jpg",
          fullResolutionKey: "runs/run-hard-fail/milestones/2.jpg",
        },
      ],
      notes: [
        {
          _id: "note-address",
          authorId: "analyst-a",
          note: "Replay evidence confirms the continue button is clipped below the fold.",
          createdAt: 1_700_000_000_000,
        },
      ],
      representativeRuns: [
        {
          _id: "run-hard-fail",
          protoPersonaId: "proto-careful",
          protoPersonaName: "Careful shopper",
          status: "hard_fail",
          finalUrl: "https://example.com/checkout/address",
          finalOutcome: "address_validation_failed",
          representativeQuote:
            "I could not figure out how to continue from the address step.",
          evidence: [
            {
              key: "runs/run-hard-fail/milestones/2.jpg",
              thumbnailKey: "runs/run-hard-fail/milestones/2.jpg",
              fullResolutionKey: "runs/run-hard-fail/milestones/2.jpg",
            },
          ],
        },
      ],
    },
    {
      _id: "finding-payment",
      title: "Payment totals shift late in checkout",
      summary:
        "A minor cluster where the total changes at payment and creates hesitation.",
      severity: "minor",
      affectedRunCount: 2,
      affectedRunRate: 0.33,
      affectedAxisRanges: [
        { key: "digital_confidence", min: 0.2, max: 0.8 },
      ],
      recommendation:
        "Explain taxes and shipping earlier so totals stay predictable by the time payment loads.",
      confidenceNote: "Observed in one replay and one primary run.",
      replayConfidence: 0.44,
      affectedProtoPersonas: [
        { _id: "proto-speedy", name: "Speedy repeat buyer" },
      ],
      evidence: [
        {
          key: "runs/run-success/milestones/4.jpg",
          thumbnailKey: "runs/run-success/milestones/4.jpg",
          fullResolutionKey: "runs/run-success/milestones/4.jpg",
        },
      ],
      notes: [],
      representativeRuns: [
        {
          _id: "run-success",
          protoPersonaId: "proto-speedy",
          protoPersonaName: "Speedy repeat buyer",
          status: "soft_fail",
          finalUrl: "https://example.com/checkout/payment",
          finalOutcome: "payment_total_unclear",
          representativeQuote:
            "I was not sure why the total changed once I reached payment.",
          evidence: [
            {
              key: "runs/run-success/milestones/4.jpg",
              thumbnailKey: "runs/run-success/milestones/4.jpg",
              fullResolutionKey: "runs/run-success/milestones/4.jpg",
            },
          ],
        },
      ],
    },
  ];
}

function makeStudyReport(
  overrides: Partial<StudyReportView> = {},
): StudyReportView {
  return {
    _id: "report-study-live",
    studyId: "study-live",
    headlineMetrics: {
      completionRate: 0.5,
      abandonmentRate: 0.25,
      medianSteps: 6,
      medianDurationSec: 180,
    },
    issueClusterIds: ["finding-address", "finding-payment"],
    segmentBreakdownKey: "study-reports/study-live/segment-breakdown.json",
    limitations: [
      "Findings are synthetic and directional.",
      "Human follow-up is recommended for high-stakes decisions.",
    ],
    htmlReportKey: "study-reports/study-live/report.html",
    jsonReportKey: "study-reports/study-live/report.json",
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
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
