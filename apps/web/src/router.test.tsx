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

type ViewerRole = "researcher" | "reviewer" | "admin";

type ViewerAccess = {
  role: ViewerRole;
  permissions: {
    canAccessAdminDiagnostics: boolean;
    canAccessSettings: boolean;
    canAddNotes: boolean;
    canExportReports: boolean;
    canManagePersonaPacks: boolean;
    canManageStudies: boolean;
  };
};

let mockedViewerAccess: ViewerAccess | null | undefined = null;

let mockedPackList:
  | Doc<"personaPacks">[]
  | undefined = [];
let mockedAxisDefinitions:
  | Doc<"axisDefinitions">[]
  | undefined = [];
let mockedTranscriptList:
  | Doc<"transcripts">[]
  | undefined = [];
let mockedPackDetail:
  | Doc<"personaPacks">
  | null
  | undefined = null;
let mockedTranscriptDetail:
  | Doc<"transcripts">
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
    artifactManifestUrl?: string | null;
    summaryKey?: string;
    summaryUrl?: string | null;
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
    screenshotUrl?: string | null;
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

type DiagnosticsOverview = {
  generatedAt: number;
  liveStudyCounts: Record<string, number>;
  historicalMetrics: {
    dispatchedRuns: number;
    completedRuns: number;
    completedStudies: number;
    totalTokenUsage: number;
    totalBrowserSeconds: number;
    recentInfraErrors: number;
    lastMetricRecordedAt: number | null;
  };
  studyUsage: Array<{
    studyId: string;
    studyName: string;
    status: string;
    runBudget: number;
    updatedAt: number;
    browserSecondsUsed: number;
    tokenUsage: number;
    completedRunCount: number;
    infraErrorCount: number;
    latestInfraErrorCode?: string;
    lastMetricRecordedAt: number | null;
  }>;
  infraErrorCodes: Array<{
    code: string;
    count: number;
  }>;
  recentMetrics: Array<{
    studyId: string;
    studyName: string;
    metricType: string;
    value: number;
    unit: string;
    status?: string;
    errorCode?: string;
    recordedAt: number;
  }>;
};

type AuditEventView = {
  _id: string;
  actorId: string;
  eventType: string;
  createdAt: number;
  studyId?: string;
  resourceType?: string;
  resourceId?: string;
  reason?: string;
};

type CredentialSummary = {
  _id: string;
  ref: string;
  label: string;
  description: string;
  allowedStudyIds: string[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
};

type SettingsView = {
  orgId: string;
  domainAllowlist: string[];
  maxConcurrency: number;
  modelConfig: Array<{
    taskCategory:
      | "expansion"
      | "action"
      | "summarization"
      | "clustering"
      | "recommendation";
    modelId: string;
  }>;
  runBudgetCap: number;
  budgetLimits: {
    maxTokensPerStudy?: number;
    maxBrowserSecPerStudy?: number;
  };
  browserPolicy: {
    blockAnalytics: boolean;
    blockHeavyMedia: boolean;
    screenshotFormat: string;
    screenshotMode: string;
  };
  signedUrlExpirySeconds: number;
  updatedBy: string | null;
  updatedAt: number | null;
  credentials: CredentialSummary[];
};

type TranscriptContent =
  | {
      format: "txt";
      text: string;
    }
  | {
      format: "json";
      turns: Array<{
        speaker: string;
        text: string;
        timestamp?: number;
      }>;
    }
  | null;

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
let mockedAdminDiagnosticsOverview: DiagnosticsOverview | undefined = undefined;
let mockedAuditEvents: AuditEventView[] | undefined = [];
let mockedSettingsView: SettingsView | undefined = undefined;
let mockedTranscriptContentById: Record<string, TranscriptContent | undefined> =
  {};
let mockedPackTranscriptsByPackId: Record<string, Array<{
  _id: string;
  packId: string;
  transcriptId: string;
  createdAt: number;
  transcript: Doc<"transcripts">;
}> | undefined> = {};
let mockedTranscriptPacksByTranscriptId: Record<string, Array<{
  _id: string;
  transcriptId: string;
  packId: string;
  createdAt: number;
  pack: Doc<"personaPacks">;
}> | undefined> = {};
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
const suggestAxesMock = vi.fn();
const uploadTranscriptMock = vi.fn();
const updateTranscriptMetadataMock = vi.fn();
const deleteTranscriptMock = vi.fn();
const attachTranscriptMock = vi.fn();
const detachTranscriptMock = vi.fn();
const getTranscriptContentMock = vi.fn();
const generateVariantsMock = vi.fn();
const exportJsonReportMock = vi.fn();
const exportHtmlReportMock = vi.fn();
const clipboardWriteTextMock = vi.fn();
const createObjectURLMock = vi.fn();
const revokeObjectURLMock = vi.fn();
const clickedDownloads: Array<{ download: string; href: string }> = [];
const downloadedBlobs = new Map<string, Blob>();
const fetchMock = vi.fn();

Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: clipboardWriteTextMock,
  },
});

Object.defineProperty(URL, "createObjectURL", {
  configurable: true,
  writable: true,
  value: createObjectURLMock,
});

Object.defineProperty(URL, "revokeObjectURL", {
  configurable: true,
  writable: true,
  value: revokeObjectURLMock,
});

vi.stubGlobal("fetch", fetchMock);

Object.defineProperty(HTMLAnchorElement.prototype, "click", {
  configurable: true,
  writable: true,
  value: function click(this: HTMLAnchorElement) {
    clickedDownloads.push({
      download: this.download,
      href: this.href,
    });
  },
});

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

    if (mutationName === "transcripts:uploadTranscript") {
      return uploadTranscriptMock;
    }

    if (mutationName === "transcripts:updateTranscriptMetadata") {
      return updateTranscriptMetadataMock;
    }

    if (mutationName === "transcripts:deleteTranscript") {
      return deleteTranscriptMock;
    }

    if (mutationName === "packTranscripts:attachTranscript") {
      return attachTranscriptMock;
    }

    if (mutationName === "packTranscripts:detachTranscript") {
      return detachTranscriptMock;
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

    if (actionName === "axisGeneration:suggestAxes") {
      return suggestAxesMock;
    }

    if (actionName === "transcripts:getTranscriptContent") {
      return getTranscriptContentMock;
    }

    if (actionName === "reportExports:exportJson") {
      return exportJsonReportMock;
    }

    if (actionName === "reportExports:exportHtml") {
      return exportHtmlReportMock;
    }

    return vi.fn();
  },
  useQuery: (query: unknown, args: Record<string, unknown> | undefined) => {
    const queryName = getFunctionName(query as never);

    if (queryName === "rbac:getViewerAccess") {
      return mockedViewerAccess;
    }

    if (queryName === "settings:getSettings") {
      return mockedSettingsView;
    }

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

    if (queryName === "observability:getAdminDiagnosticsOverview") {
      return mockedAdminDiagnosticsOverview;
    }

    if (queryName === "observability:listAuditEvents") {
      const auditEvents = mockedAuditEvents;

      if (auditEvents === undefined) {
        return undefined;
      }

      return auditEvents.filter((event) => {
        if (
          typeof args?.actorId === "string" &&
          args.actorId.length > 0 &&
          event.actorId !== args.actorId
        ) {
          return false;
        }

        if (
          typeof args?.studyId === "string" &&
          args.studyId.length > 0 &&
          event.studyId !== args.studyId
        ) {
          return false;
        }

        if (
          typeof args?.eventType === "string" &&
          args.eventType.length > 0 &&
          event.eventType !== args.eventType
        ) {
          return false;
        }

        if (
          typeof args?.startAt === "number" &&
          Number.isFinite(args.startAt) &&
          event.createdAt < args.startAt
        ) {
          return false;
        }

        if (
          typeof args?.endAt === "number" &&
          Number.isFinite(args.endAt) &&
          event.createdAt > args.endAt
        ) {
          return false;
        }

        return true;
      });
    }

    if (queryName === "personaPacks:list") {
      return mockedPackList;
    }

    if (queryName === "axisLibrary:listAxisDefinitions") {
      return mockedAxisDefinitions;
    }

    if (queryName === "transcripts:listTranscripts") {
      return mockedTranscriptList;
    }

    if (queryName === "transcripts:normalizeTranscriptId") {
      return mockedTranscriptDetail === null
        ? null
        : (args?.transcriptId as Id<"transcripts">);
    }

    if (queryName === "personaPacks:get") {
      return mockedPackDetail;
    }

    if (queryName === "transcripts:getTranscript") {
      return mockedTranscriptDetail;
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

    if (queryName === "packTranscripts:listPackTranscripts") {
      return mockedPackTranscriptsByPackId[String(args?.packId)] ?? [];
    }

    if (queryName === "packTranscripts:listTranscriptPacks") {
      return mockedTranscriptPacksByTranscriptId[String(args?.transcriptId)] ?? [];
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
  mockedAxisDefinitions = [];
  mockedTranscriptList = [];
  mockedPackDetail = null;
  mockedTranscriptDetail = null;
  mockedProtoPersonas = [];
  mockedViewerAccess = null;
  mockedVariantReview = undefined;
  mockedPackVariantReview = undefined;
  mockedStudyList = [];
  mockedStudyById = {};
  mockedRunSummariesByStudyId = {};
  mockedRunsByStudyId = {};
  mockedRunDetailsById = {};
  mockedFindingsByStudyId = {};
  mockedReportsByStudyId = {};
  mockedAdminDiagnosticsOverview = undefined;
  mockedAuditEvents = [];
  mockedSettingsView = makeSettingsView();
  mockedTranscriptContentById = {};
  mockedPackTranscriptsByPackId = {};
  mockedTranscriptPacksByTranscriptId = {};
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
  suggestAxesMock.mockReset();
  suggestAxesMock.mockResolvedValue([
    {
      key: "escalation_preference",
      label: "Escalation preference",
      description: "How quickly the person wants a human to step in.",
      lowAnchor: "Prefers self-service",
      midAnchor: "Escalates when blocked",
      highAnchor: "Requests human help immediately",
      weight: 1,
    },
    {
      key: "task_confidence",
      label: "Task confidence",
      description: "Confidence in completing unfamiliar account tasks.",
      lowAnchor: "Needs reassurance",
      midAnchor: "Can continue with light guidance",
      highAnchor: "Comfortably self-directed",
      weight: 1,
    },
    {
      key: "issue_urgency",
      label: "Issue urgency",
      description: "How urgent the account problem feels to the person.",
      lowAnchor: "Can wait for a response",
      midAnchor: "Wants updates soon",
      highAnchor: "Needs immediate resolution",
      weight: 1,
    },
  ]);
  uploadTranscriptMock.mockReset();
  uploadTranscriptMock
    .mockImplementationOnce(async ({ originalFilename }: { originalFilename: string }) => ({
      uploadUrl: `https://upload.factory.dev/${encodeURIComponent(originalFilename)}`,
      transcriptId: null,
    }))
    .mockImplementation(async ({
      storageId,
      originalFilename,
    }: {
      storageId?: string;
      originalFilename: string;
    }) => {
      if (storageId === undefined) {
        return {
          uploadUrl: `https://upload.factory.dev/${encodeURIComponent(originalFilename)}`,
          transcriptId: null,
        };
      }

      const transcriptId = `${originalFilename}-id` as Id<"transcripts">;
      mockedTranscriptList = [
        makeTranscript({
          _id: transcriptId,
          originalFilename,
          format: originalFilename.endsWith(".json") ? "json" : "txt",
          processingStatus: "pending",
          characterCount: 0,
          metadata: {
            tags: [],
          },
        }),
        ...(mockedTranscriptList ?? []),
      ];

      return {
        uploadUrl: null,
        transcriptId,
      };
    });
  updateTranscriptMetadataMock.mockReset();
  updateTranscriptMetadataMock.mockResolvedValue(undefined);
  deleteTranscriptMock.mockReset();
  deleteTranscriptMock.mockResolvedValue(undefined);
  attachTranscriptMock.mockReset();
  attachTranscriptMock.mockResolvedValue(undefined);
  detachTranscriptMock.mockReset();
  detachTranscriptMock.mockResolvedValue(undefined);
  getTranscriptContentMock.mockReset();
  getTranscriptContentMock.mockImplementation(
    async ({ transcriptId }: { transcriptId: string }) =>
      mockedTranscriptContentById[transcriptId] ?? null,
  );
  generateVariantsMock.mockReset();
  generateVariantsMock.mockResolvedValue({
    acceptedCount: 64,
    rejectedCount: 0,
    retryCount: 0,
  });
  exportJsonReportMock.mockReset();
  exportJsonReportMock.mockResolvedValue(makeReportJsonExportArtifact());
  exportHtmlReportMock.mockReset();
  exportHtmlReportMock.mockResolvedValue(makeReportHtmlExportArtifact());
  clipboardWriteTextMock.mockReset();
  clipboardWriteTextMock.mockResolvedValue(undefined);
  createObjectURLMock.mockReset();
  createObjectURLMock.mockImplementation((blob: Blob) => {
    const href = `blob:mock-${downloadedBlobs.size + 1}`;
    downloadedBlobs.set(href, blob);
    return href;
  });
  revokeObjectURLMock.mockReset();
  downloadedBlobs.clear();
  clickedDownloads.length = 0;
  fetchMock.mockReset();
  fetchMock.mockImplementation(
    async () =>
      new Response(JSON.stringify({ storageId: "storage-upload-1" }), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      }),
  );
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

  it("redirects unauthenticated shared report links to login while preserving the shared query", async () => {
    const { container, router } = await renderRoute({
      auth: { isAuthenticated: false, isLoading: false },
      initialEntries: ["/studies/test-id-123/report?shared=1"],
    });

    expect(getRouterLocationHref(router)).toBe(
      "/login?redirect=%2Fstudies%2Ftest-id-123%2Freport%3Fshared%3D1",
    );
    expect(container.querySelector("#login-email")).not.toBeNull();
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

  it("denies /settings to researchers and hides the Settings link", async () => {
    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/settings"],
      viewerRole: "researcher",
    });

    expect(container.textContent).toContain("Access denied");
    expect(container.textContent).toContain("Only admins can access workspace settings.");
    expect(container.textContent).not.toContain("Current route");

    const linkLabels = [...container.querySelectorAll("a")].map((link) =>
      link.textContent?.trim(),
    );
    expect(linkLabels).not.toContain("Settings");
  });

  it("allows admins to access /settings and shows the Settings link", async () => {
    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/settings"],
      viewerRole: "admin",
    });

    expect(container.textContent).toContain("Workspace settings");
    expect(container.textContent).toContain("Domain allowlist");
    expect(container.textContent).toContain("Credentials");

    const linkLabels = [...container.querySelectorAll("a")].map((link) =>
      link.textContent?.trim(),
    );
    expect(linkLabels).toContain("Settings");
  });

  it("denies /admin/diagnostics to researchers and hides the Diagnostics link", async () => {
    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/admin/diagnostics"],
      viewerRole: "researcher",
    });

    expect(container.textContent).toContain("Access denied");
    expect(container.textContent).toContain("Only admins can access workspace diagnostics.");

    const linkLabels = [...container.querySelectorAll("a")].map((link) =>
      link.textContent?.trim(),
    );
    expect(linkLabels).not.toContain("Diagnostics");
  });

  it("renders admin diagnostics metrics, study usage, and audit trail filters for admins", async () => {
    mockedAdminDiagnosticsOverview = makeDiagnosticsOverview();
    mockedAuditEvents = makeAuditEvents();

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/admin/diagnostics"],
      viewerRole: "admin",
    });

    expect(container.textContent).toContain("Admin diagnostics");
    expect(container.textContent).toContain("Live study health");
    expect(container.textContent).toContain("Running studies");
    expect(container.textContent).toContain("Recent historical metrics");
    expect(container.textContent).toContain("1,500");
    expect(container.textContent).toContain("Per-study usage");
    expect(container.textContent).toContain("Checkout baseline");
    expect(container.textContent).toContain("1m 15s");
    expect(container.textContent).toContain("NAVIGATION_TIMEOUT");
    expect(container.textContent).toContain("Audit trail");

    const linkLabels = [...container.querySelectorAll("a")].map((link) =>
      link.textContent?.trim(),
    );
    expect(linkLabels).toContain("Diagnostics");

    expect(getAuditRows(container)).toHaveLength(3);

    await updateInput(container, "#audit-actor-filter", "researcher|org-a");
    expect(getAuditRows(container)).toHaveLength(2);
    expect(container.textContent).toContain("report.published");

    await updateSelect(container, "#audit-event-type-filter", "study.cancelled");
    expect(getAuditRows(container)).toHaveLength(1);
    expect(container.textContent).toContain("Manual stop after blocker reproduction.");
    expect(container.textContent).not.toContain("Published ranked report.");
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

  it("renders the demo study overview without crashing", async () => {
    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/demo-study/overview"],
    });

    expect(container.textContent).toContain("Checkout usability benchmark");
    expect(container.textContent).toContain("Task specification");
    expect(container.textContent).toContain("Live monitor");
    expect(container.textContent).toContain("100% complete");
    expect(container.textContent).toContain("Open runs tab");
    expect(container.textContent).not.toContain("Study not found");
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

  it("hides study mutation controls for reviewers on the overview page", async () => {
    mockedStudyById = {
      "study-live": makeStudy({
        _id: "study-live" as Id<"studies">,
        status: "running",
      }),
    };
    mockedRunSummariesByStudyId = {
      "study-live": makeRunSummary("study-live"),
    };
    mockedRunsByStudyId = {
      "study-live": [],
    };

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/overview"],
      viewerRole: "reviewer",
    });

    expect(container.textContent).not.toContain("Edit Study");
    expect(container.textContent).not.toContain("Launch Study");
    expect(container.textContent).not.toContain("Cancel Study");
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

  it("exports JSON and HTML artifacts and copies the internal shared report link", async () => {
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
      "study-live": makeStudyReport(),
    };

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/report"],
    });

    await clickButton(container, "Export JSON");

    expect(exportJsonReportMock).toHaveBeenCalledWith({ studyId: "study-live" });
    expect(clickedDownloads).toHaveLength(1);
    expect(clickedDownloads[0]).toEqual({
      download: "study-report-study-live.json",
      href: "blob:mock-1",
    });
    expect(JSON.parse(await downloadedBlobs.get("blob:mock-1")!.text())).toMatchObject({
      studyId: "study-live",
      issueClusterIds: ["finding-address", "finding-payment"],
    });

    await clickButton(container, "Export HTML");

    expect(exportHtmlReportMock).toHaveBeenCalledWith({ studyId: "study-live" });
    expect(clickedDownloads).toHaveLength(2);
    expect(clickedDownloads[1]).toEqual({
      download: "study-report-study-live.html",
      href: "blob:mock-2",
    });
    expect(await downloadedBlobs.get("blob:mock-2")!.text()).toContain(
      "<!DOCTYPE html>",
    );

    await clickButton(container, "Copy Link");

    expect(clipboardWriteTextMock).toHaveBeenCalledWith(
      "/studies/study-live/report?shared=1",
    );
    expect(container.textContent).toContain("Shared link copied.");
  });

  it("exports demo study artifacts locally without calling Convex report exports", async () => {
    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/demo-study/report"],
    });

    await clickButton(container, "Export JSON");

    expect(exportJsonReportMock).not.toHaveBeenCalled();
    expect(clickedDownloads).toHaveLength(1);
    expect(clickedDownloads[0]).toEqual({
      download: "study-report-demo-study.json",
      href: "blob:mock-1",
    });
    expect(JSON.parse(await downloadedBlobs.get("blob:mock-1")!.text())).toMatchObject({
      studyId: "demo-study",
      issueClusterIds: ["finding-demo-address", "finding-demo-payment"],
    });

    await clickButton(container, "Export HTML");

    expect(exportHtmlReportMock).not.toHaveBeenCalled();
    expect(clickedDownloads).toHaveLength(2);
    expect(clickedDownloads[1]).toEqual({
      download: "study-report-demo-study.html",
      href: "blob:mock-2",
    });
    expect(await downloadedBlobs.get("blob:mock-2")!.text()).toContain(
      "Checkout continue button hidden on the address step",
    );
  });

  it("renders the shared report with minimal chrome after authentication", async () => {
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
      }),
    };

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/study-live/report?shared=1"],
    });

    expect(container.textContent).toContain("Shared report");
    expect(container.textContent).toContain("Study report");
    expect(container.textContent).toContain("Open full report");
    expect(container.textContent).not.toContain("Validation Console");
    expect(container.textContent).not.toContain("Study detail tabs");
    expect(container.textContent).not.toContain("Go to Overview");
    expect(container.textContent).not.toContain("Back to Studies");
  });

  it("renders working Go to Overview links across demo runs, findings, and report tabs", async () => {
    for (const initialEntry of [
      "/studies/demo-study/runs",
      "/studies/demo-study/findings",
      "/studies/demo-study/report",
    ]) {
      const { container } = await renderRoute({
        auth: { isAuthenticated: true, isLoading: false },
        initialEntries: [initialEntry],
      });

      const overviewLink = [...container.querySelectorAll<HTMLAnchorElement>("a")].find(
        (link) => link.textContent?.trim() === "Go to Overview",
      );

      expect(overviewLink?.getAttribute("href")).toBe(
        "/studies/demo-study/overview",
      );
    }

    const { container, router } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/studies/demo-study/report"],
    });

    const overviewLink = [...container.querySelectorAll<HTMLAnchorElement>("a")].find(
      (link) => link.textContent?.trim() === "Go to Overview",
    );

    expect(overviewLink).not.toBeNull();

    await act(async () => {
      overviewLink!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(getRouterLocationHref(router)).toContain("/studies/demo-study/overview");
    expect(container.textContent).toContain("Task specification");
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

  it("renders the axis library route and places its sidebar link after Persona Packs", async () => {
    mockedAxisDefinitions = [
      makeAxisDefinition({
        _id: "axis-library-1" as Id<"axisDefinitions">,
      }),
    ];

    const { container, router } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/axis-library"],
    });

    const linkLabels = [...container.querySelectorAll("a")].map((link) =>
      link.textContent?.trim(),
    );

    expect(linkLabels.indexOf("Axis Library")).toBe(
      linkLabels.indexOf("Persona Packs") + 1,
    );
    expect(getRouterLocationHref(router)).toBe("/axis-library");
    expect(container.textContent).toContain("Axis Library");
    expect(container.textContent).toContain("Browse axes");
    expect(container.textContent).toContain("digital_confidence");
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

  it("shows axis generation controls only on draft packs", async () => {
    mockedPackDetail = makePack({
      _id: "pack-axis-draft" as Id<"personaPacks">,
      status: "draft",
    });

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs/pack-axis-draft"],
    });

    expect(container.textContent).toContain("Suggest axes");
    expect(container.textContent).toContain("Browse library");
  });

  it("hides axis generation controls on published packs", async () => {
    mockedPackDetail = makePack({
      _id: "pack-axis-published" as Id<"personaPacks">,
      status: "published",
    });
    mockedProtoPersonas = [
      makeProtoPersona({ _id: "proto-axis-published" as Id<"protoPersonas"> }),
    ];

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs/pack-axis-published"],
    });

    expect(container.textContent).not.toContain("Suggest axes");
    expect(container.textContent).not.toContain("Browse library");
  });

  it("suggests axes with a loading state, supports keyboard selection, and applies edited cards additively", async () => {
    mockedPackDetail = makePack({
      _id: "pack-axis-suggest" as Id<"personaPacks">,
      name: "  ",
      context: "",
      description: "Support escalation and recovery flows",
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
    });

    const deferred = createDeferred<
      Array<{
        key: string;
        label: string;
        description: string;
        lowAnchor: string;
        midAnchor: string;
        highAnchor: string;
        weight: number;
      }>
    >();
    suggestAxesMock.mockReturnValueOnce(deferred.promise);

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs/pack-axis-suggest"],
    });

    const suggestButton = getButton(container, "Suggest axes");
    expect(suggestButton?.disabled).toBe(true);

    await updateInput(container, "#edit-pack-name", "Account recovery pack");
    await updateInput(container, "#edit-pack-context", "US fintech support");

    expect(getButton(container, "Suggest axes")?.disabled).toBe(false);

    await clickButton(container, "Suggest axes");

    expect(suggestAxesMock).toHaveBeenCalledWith({
      name: "Account recovery pack",
      context: "US fintech support",
      description: "Support escalation and recovery flows",
      existingAxisKeys: ["digital_confidence"],
    });
    expect(container.textContent).toContain(
      "Generating axis suggestions from the current pack metadata...",
    );
    expect(getButton(container, "Suggesting...")?.disabled).toBe(true);

    deferred.resolve([
      {
        key: "escalation_preference",
        label: "Escalation preference",
        description: "How quickly the person wants a human to step in.",
        lowAnchor: "Prefers self-service",
        midAnchor: "Escalates when blocked",
        highAnchor: "Requests human help immediately",
        weight: 1,
      },
      {
        key: "trust_building",
        label: "Trust building",
        description: "How much proof or reassurance the person needs.",
        lowAnchor: "Trusts the first answer",
        midAnchor: "Looks for a little validation",
        highAnchor: "Needs repeated reassurance",
        weight: 1,
      },
      {
        key: "issue_urgency",
        label: "Issue urgency",
        description: "How urgent the account problem feels to the person.",
        lowAnchor: "Can wait for a response",
        midAnchor: "Wants updates soon",
        highAnchor: "Needs immediate resolution",
        weight: 1,
      },
    ]);

    await act(async () => {
      await deferred.promise;
    });

    expect(container.textContent).toContain("Review suggested axes");
    expect(container.textContent).toContain("Escalation preference");
    expect(container.textContent).toContain("Trust building");
    expect(container.textContent).toContain("Issue urgency");

    const suggestionCheckboxes = [
      ...container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
    expect(suggestionCheckboxes).toHaveLength(3);

    await act(async () => {
      suggestionCheckboxes[1]!.dispatchEvent(
        new KeyboardEvent("keydown", { bubbles: true, key: "Enter" }),
      );
    });
    expect(suggestionCheckboxes[1]!.checked).toBe(false);

    await clickButton(container, "Edit axis");
    await updateInput(
      container,
      'input[id^="suggested-axis-"][id$="-label"]',
      "Human escalation preference",
    );

    await clickButton(container, "Apply selected");

    expect(container.textContent).toContain("Human escalation preference");
    expect(container.textContent).toContain("Issue urgency");
    expect(container.textContent).not.toContain("Trust building");
    expect(container.textContent).not.toContain("Review suggested axes");
  });

  it("shows a retryable friendly error when axis suggestion fails", async () => {
    mockedPackDetail = makePack({
      _id: "pack-axis-error" as Id<"personaPacks">,
      name: "Checkout recovery pack",
      context: "US fintech support",
      description: "Password reset and recovery flows",
    });
    suggestAxesMock.mockRejectedValueOnce(
      new Error("Failed to parse suggested axes JSON."),
    );

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs/pack-axis-error"],
    });

    await clickButton(container, "Suggest axes");

    expect(container.textContent).toContain(
      "We couldn't generate axis suggestions right now. Please try again.",
    );
    expect(getButton(container, "Suggest axes")?.disabled).toBe(false);
  });

  it("imports library axes and surfaces duplicate-key conflicts as a toast", async () => {
    mockedPackDetail = makePack({
      _id: "pack-axis-library" as Id<"personaPacks">,
      status: "draft",
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
    });
    mockedAxisDefinitions = [
      makeAxisDefinition({
        _id: "axis-library-duplicate" as Id<"axisDefinitions">,
        key: "digital_confidence",
        label: "Digital confidence",
      }),
      makeAxisDefinition({
        _id: "axis-library-new" as Id<"axisDefinitions">,
        key: "support_channel_preference",
        label: "Support channel preference",
        description: "Whether the person prefers chat, email, or phone support.",
        lowAnchor: "Prefers self-serve articles",
        midAnchor: "Uses chat for quick help",
        highAnchor: "Wants a human conversation",
      }),
    ];

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs/pack-axis-library"],
    });

    await clickButton(container, "Browse library");
    expect(container.textContent).toContain("Browse axis library");
    expect(container.textContent).toContain("Support channel preference");

    const libraryCheckboxes = [
      ...container.querySelectorAll<HTMLInputElement>(
        'input[id^="axis-library-"]',
      ),
    ];
    expect(libraryCheckboxes).toHaveLength(2);

    await act(async () => {
      libraryCheckboxes[0]!.click();
      libraryCheckboxes[1]!.click();
    });

    await clickButton(container, "Import selected");

    expect(container.textContent).toContain("Support channel preference");
    expect(container.textContent).toContain(
      "Skipped duplicate axis key: digital_confidence.",
    );
  });

  it("renders pack detail transcript attachments, filters the picker, and supports attach-detach actions", async () => {
    mockedPackDetail = makePack({
      _id: "pack-with-transcripts" as Id<"personaPacks">,
      name: "Transcript-linked pack",
      status: "draft",
    });
    mockedTranscriptList = [
      makeTranscript({
        _id: "attached-transcript" as Id<"transcripts">,
        originalFilename: "attached-call.txt",
        metadata: {
          participantId: "vip-1",
          tags: ["existing"],
          notes: "Already linked.",
        },
      }),
      makeTranscript({
        _id: "searchable-transcript" as Id<"transcripts">,
        originalFilename: "checkout-vip.txt",
        metadata: {
          participantId: "vip-2",
          tags: ["vip", "checkout"],
          notes: "Search target.",
        },
      }),
      makeTranscript({
        _id: "other-transcript" as Id<"transcripts">,
        originalFilename: "support.json",
        format: "json",
        metadata: {
          participantId: "support-1",
          tags: ["support"],
          notes: "Other transcript.",
        },
      }),
    ];
    mockedPackTranscriptsByPackId["pack-with-transcripts"] = [
      {
        _id: "pack-transcript-1",
        packId: "pack-with-transcripts",
        transcriptId: "attached-transcript",
        createdAt: Date.now(),
        transcript: mockedTranscriptList[0]!,
      },
    ];

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs/pack-with-transcripts"],
    });

    expect(container.textContent).toContain("Attached Transcripts");
    expect(container.textContent).toContain("attached-call.txt");
    expect(container.textContent).toContain("Attach transcripts");

    await clickButton(container, "Attach transcripts");
    expect(document.body.textContent).toContain("Attach selected transcripts");
    const packAttachmentDialog = document.body.querySelector(
      'div[role="dialog"]',
    ) as HTMLDivElement;
    await updateInput(packAttachmentDialog, "#pack-attach-transcripts-search", "vip-2");
    await act(async () => {
      document.body
        .querySelector<HTMLInputElement>(
          "#pack-attach-transcript-searchable-transcript",
        )
        ?.click();
    });
    await clickButton(document.body, "Attach selected transcripts");

    expect(attachTranscriptMock).toHaveBeenCalledWith({
      packId: "pack-with-transcripts",
      transcriptId: "searchable-transcript",
    });

    await clickButton(container, "Detach");
    expect(detachTranscriptMock).toHaveBeenCalledWith({
      packId: "pack-with-transcripts",
      transcriptId: "attached-transcript",
    });
  });

  it("shows attached transcripts on pack detail for reviewers without attachment controls", async () => {
    mockedPackDetail = makePack({
      _id: "pack-reviewer-transcripts" as Id<"personaPacks">,
      name: "Reviewer pack",
      status: "draft",
    });
    mockedTranscriptList = [
      makeTranscript({
        _id: "reviewer-transcript" as Id<"transcripts">,
        originalFilename: "reviewer-visible.txt",
      }),
    ];
    mockedPackTranscriptsByPackId["pack-reviewer-transcripts"] = [
      {
        _id: "pack-transcript-reviewer",
        packId: "pack-reviewer-transcripts",
        transcriptId: "reviewer-transcript",
        createdAt: Date.now(),
        transcript: mockedTranscriptList[0]!,
      },
    ];

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/persona-packs/pack-reviewer-transcripts"],
      viewerRole: "reviewer",
    });

    expect(container.textContent).toContain("Attached Transcripts");
    expect(container.textContent).toContain("reviewer-visible.txt");
    expect(container.textContent).not.toContain("Attach transcripts");
    expect(container.textContent).not.toContain("Detach");
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

  it("renders the transcripts route and places its sidebar link after Axis Library", async () => {
    mockedTranscriptList = [
      makeTranscript({
        _id: "transcript-sidebar" as Id<"transcripts">,
        originalFilename: "checkout-study.txt",
        metadata: {
          participantId: "p-100",
          tags: ["checkout"],
          notes: "Customer support follow-up.",
        },
      }),
    ];

    const { container, router } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/transcripts"],
    });

    const linkLabels = [...container.querySelectorAll("a")].map((link) =>
      link.textContent?.trim(),
    );

    expect(linkLabels.indexOf("Transcripts")).toBe(
      linkLabels.indexOf("Axis Library") + 1,
    );
    expect(getRouterLocationHref(router)).toBe("/transcripts");
    expect(container.textContent).toContain("Transcripts");
    expect(container.textContent).toContain("checkout-study.txt");
  });

  it("shows an empty-state upload CTA, highlights the drop zone, uploads valid files, and rejects unsupported formats", async () => {
    mockedTranscriptList = [];

    let uploadCount = 0;
    uploadTranscriptMock.mockImplementation(
      async ({
        storageId,
        originalFilename,
      }: {
        storageId?: string;
        originalFilename: string;
      }) => {
        if (storageId === undefined) {
          return {
            uploadUrl: `https://upload.factory.dev/${encodeURIComponent(originalFilename)}`,
            transcriptId: null,
          };
        }

        uploadCount += 1;
        const transcriptId = `transcript-upload-${uploadCount}` as Id<"transcripts">;

        return {
          uploadUrl: null,
          transcriptId,
        };
      },
    );
    fetchMock.mockImplementation(
      async () =>
        new Response(JSON.stringify({ storageId: "storage-upload-2" }), {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        }),
    );

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/transcripts"],
    });

    expect(container.textContent).toContain("No transcripts yet");
    expect(container.textContent).toContain("Upload transcripts");

    const uploadZone = container.querySelector<HTMLElement>("#transcript-upload-zone");
    expect(uploadZone?.getAttribute("data-drag-active")).toBe("false");

    await act(async () => {
      uploadZone?.dispatchEvent(new Event("dragover", { bubbles: true }));
    });
    expect(uploadZone?.getAttribute("data-drag-active")).toBe("true");

    await act(async () => {
      uploadZone?.dispatchEvent(new Event("dragleave", { bubbles: true }));
    });
    expect(uploadZone?.getAttribute("data-drag-active")).toBe("false");

    await updateFiles(
      container,
      "#transcript-upload-input",
      [
        new File(["Plain text transcript"], "customer-interview.txt", {
          type: "text/plain",
        }),
        new File(
          [JSON.stringify([{ speaker: "Interviewer", text: "How was it?" }])],
          "customer-interview.json",
          { type: "application/json" },
        ),
        new File(["not supported"], "customer-interview.pdf", {
          type: "application/pdf",
        }),
      ],
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(uploadTranscriptMock).toHaveBeenCalledTimes(4);
    expect(container.textContent).toContain("customer-interview.txt");
    expect(container.textContent).toContain("customer-interview.json");
    expect(container.textContent).toContain(
      "Unsupported files were skipped: customer-interview.pdf.",
    );
  });

  it("filters transcripts by search text, tag, and format using AND logic", async () => {
    mockedTranscriptList = [
      makeTranscript({
        _id: "transcript-filter-1" as Id<"transcripts">,
        originalFilename: "checkout-call.txt",
        metadata: {
          participantId: "vip-1",
          tags: ["checkout", "vip"],
          notes: "Discussed pricing hesitation.",
        },
      }),
      makeTranscript({
        _id: "transcript-filter-2" as Id<"transcripts">,
        originalFilename: "checkout-json.json",
        format: "json",
        metadata: {
          participantId: "vip-2",
          tags: ["checkout"],
          notes: "Structured interview.",
        },
      }),
      makeTranscript({
        _id: "transcript-filter-3" as Id<"transcripts">,
        originalFilename: "support-call.txt",
        metadata: {
          participantId: "support-1",
          tags: ["support"],
          notes: "Escalation request.",
        },
      }),
    ];

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/transcripts"],
    });

    expect(container.textContent).toContain("checkout-call.txt");
    expect(container.textContent).toContain("checkout-json.json");
    expect(container.textContent).toContain("support-call.txt");

    await updateSelect(container, "#transcript-tag-filter", "checkout");
    await updateSelect(container, "#transcript-format-filter", "json");
    await updateInput(container, "#transcript-search", "vip-2");

    expect(container.textContent).toContain("checkout-json.json");
    expect(container.textContent).not.toContain("checkout-call.txt");
    expect(container.textContent).not.toContain("support-call.txt");
    expect(container.textContent).toContain(
      "Showing 1 of 3 transcripts matching tag “checkout”, format “json”, and search “vip-2”.",
    );
  });

  it("renders transcript detail, saves metadata, attaches to a draft pack, and deletes after confirmation", async () => {
    mockedTranscriptDetail = makeTranscript({
      _id: "transcript-detail" as Id<"transcripts">,
      originalFilename: "account-recovery.txt",
      metadata: {
        participantId: "before",
        tags: ["draft"],
        notes: "Before update.",
      },
    });
    mockedTranscriptContentById["transcript-detail"] = {
      format: "txt",
      text: "Customer could not reset their password without support.",
    };
    mockedPackList = [
      makePack({
        _id: "linked-draft-pack" as Id<"personaPacks">,
        name: "Linked draft pack",
        status: "draft",
      }),
      makePack({
        _id: "draft-pack" as Id<"personaPacks">,
        name: "Draft support pack",
        status: "draft",
      }),
      makePack({
        _id: "published-pack" as Id<"personaPacks">,
        name: "Published pack",
        status: "published",
      }),
    ];
    mockedTranscriptPacksByTranscriptId["transcript-detail"] = [
      {
        _id: "pack-link-1",
        transcriptId: "transcript-detail",
        packId: "linked-draft-pack",
        createdAt: Date.now(),
        pack: makePack({
          _id: "linked-draft-pack" as Id<"personaPacks">,
          name: "Linked draft pack",
          status: "draft",
        }),
      },
    ];

    const { container, router } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/transcripts/transcript-detail"],
    });

    expect(container.textContent).toContain("account-recovery.txt");
    expect(container.textContent).toContain(
      "Customer could not reset their password without support.",
    );
    expect(container.textContent).toContain("Linked Packs");
    expect(container.textContent).toContain("Linked draft pack");
    expect(container.textContent).toContain("Attach to pack");

    await updateInput(container, "#transcript-participant-id", "after");
    await updateInput(container, "#transcript-tags", "checkout, returning");
    await updateTextarea(container, "#transcript-notes", "After update.");
    await clickButton(container, "Save metadata");

    expect(updateTranscriptMetadataMock).toHaveBeenCalledWith({
      transcriptId: "transcript-detail",
      metadata: {
        participantId: "after",
        tags: ["checkout", "returning"],
        notes: "After update.",
      },
    });

    await clickButton(container, "Attach to pack");
    expect(document.body.textContent).toContain("Attach selected packs");
    const transcriptAttachDialog = document.body.querySelector(
      'div[role="dialog"]',
    ) as HTMLDivElement;
    await updateInput(
      transcriptAttachDialog,
      "#transcript-attach-pack-search",
      "support",
    );
    await act(async () => {
      document.body
        .querySelector<HTMLInputElement>("#transcript-attach-pack-draft-pack")
        ?.click();
    });
    await clickButton(document.body, "Attach selected packs");

    expect(attachTranscriptMock).toHaveBeenCalledWith({
      packId: "draft-pack",
      transcriptId: "transcript-detail",
    });
    await clickButton(container, "Detach");
    expect(detachTranscriptMock).toHaveBeenCalledWith({
      packId: "linked-draft-pack",
      transcriptId: "transcript-detail",
    });

    await clickButton(container, "Delete transcript");
    expect(document.body.textContent).toContain("Delete transcript?");

    await clickButton(document.body, "Cancel");
    expect(deleteTranscriptMock).not.toHaveBeenCalled();

    await clickButton(container, "Delete transcript");
    await clickButton(document.body, "Confirm delete");

    expect(deleteTranscriptMock).toHaveBeenCalledWith({
      transcriptId: "transcript-detail",
    });
    expect(getRouterLocationHref(router)).toBe("/transcripts");
  });

  it("renders JSON transcript detail for reviewers and hides mutation controls", async () => {
    mockedTranscriptDetail = makeTranscript({
      _id: "transcript-json" as Id<"transcripts">,
      originalFilename: "structured-interview.json",
      format: "json",
      metadata: {
        participantId: "json-participant",
        tags: ["research"],
        notes: "Structured content.",
      },
    });
    mockedTranscriptContentById["transcript-json"] = {
      format: "json",
      turns: [
        {
          speaker: "Interviewer",
          text: "How did checkout feel?",
          timestamp: 1,
        },
        {
          speaker: "Participant",
          text: "I hesitated at the payment step.",
          timestamp: 2,
        },
      ],
    };

    const { container } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/transcripts/transcript-json"],
      viewerRole: "reviewer",
    });

    expect(container.textContent).toContain("structured-interview.json");
    expect(container.textContent).toContain("Interviewer");
    expect(container.textContent).toContain("Participant");
    expect(container.textContent).toContain("I hesitated at the payment step.");
    expect(container.textContent).not.toContain("Save metadata");
    expect(container.textContent).not.toContain("Delete transcript");
    expect(container.textContent).toContain("Linked Packs");
    expect(container.textContent).not.toContain("Attach to pack");
    expect(container.querySelector("#transcript-attach-pack-search")).toBeNull();
  });

  it("shows not-found content for invalid transcript detail links", async () => {
    mockedTranscriptDetail = null;

    const { container, router } = await renderRoute({
      auth: { isAuthenticated: true, isLoading: false },
      initialEntries: ["/transcripts/missing-transcript"],
    });

    expect(getRouterLocationHref(router)).toBe("/transcripts/missing-transcript");
    expect(container.textContent).toContain("Page not found");
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
  viewerRole,
}: {
  auth: AppAuthState;
  initialEntries: string[];
  viewerRole?: ViewerRole;
}) {
  mockedAuthState = auth;
  mockedViewerAccess = auth.isAuthenticated
    ? makeViewerAccess(viewerRole ?? "researcher")
    : null;
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

async function clickButton(root: ParentNode, text: string) {
  const button = getButton(root, text);

  expect(button).toBeDefined();

  await act(async () => {
    button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function getButton(root: ParentNode, text: string) {
  return [...root.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === text,
  );
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

async function updateFiles(
  container: HTMLDivElement,
  selector: string,
  files: File[],
) {
  const input = container.querySelector<HTMLInputElement>(selector);

  expect(input).not.toBeNull();

  await act(async () => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: makeFileList(files),
    });
    input!.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

function getVariantRows(container: HTMLDivElement) {
  return [...container.querySelectorAll<HTMLElement>('[data-testid="variant-row"]')].map(
    (row) => row.textContent ?? "",
  );
}

function getAuditRows(container: HTMLDivElement) {
  return [...container.querySelectorAll<HTMLElement>('[data-testid="audit-row"]')].map(
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

function makeViewerAccess(role: ViewerRole): ViewerAccess {
  return {
    role,
    permissions: {
      canAccessAdminDiagnostics: role === "admin",
      canAccessSettings: role === "admin",
      canAddNotes: true,
      canExportReports: true,
      canManagePersonaPacks: role !== "reviewer",
      canManageStudies: role !== "reviewer",
    },
  };
}

function makeDiagnosticsOverview(): DiagnosticsOverview {
  return {
    generatedAt: 1_710_000_000_000,
    liveStudyCounts: {
      active: 3,
      draft: 0,
      persona_review: 0,
      ready: 1,
      queued: 0,
      running: 2,
      replaying: 0,
      analyzing: 1,
      completed: 4,
      failed: 1,
      cancelled: 1,
    },
    historicalMetrics: {
      dispatchedRuns: 12,
      completedRuns: 9,
      completedStudies: 4,
      totalTokenUsage: 1_500,
      totalBrowserSeconds: 185,
      recentInfraErrors: 1,
      lastMetricRecordedAt: 1_710_000_000_000,
    },
    studyUsage: [
      {
        studyId: "study-checkout",
        studyName: "Checkout baseline",
        status: "running",
        runBudget: 64,
        updatedAt: 1_710_000_000_000,
        browserSecondsUsed: 75,
        tokenUsage: 1_500,
        completedRunCount: 2,
        infraErrorCount: 1,
        latestInfraErrorCode: "NAVIGATION_TIMEOUT",
        lastMetricRecordedAt: 1_710_000_000_000,
      },
      {
        studyId: "study-returns",
        studyName: "Returns friction audit",
        status: "completed",
        runBudget: 32,
        updatedAt: 1_709_999_500_000,
        browserSecondsUsed: 110,
        tokenUsage: 0,
        completedRunCount: 7,
        infraErrorCount: 0,
        lastMetricRecordedAt: 1_709_999_500_000,
      },
    ],
    infraErrorCodes: [
      {
        code: "NAVIGATION_TIMEOUT",
        count: 1,
      },
    ],
    recentMetrics: [
      {
        studyId: "study-checkout",
        studyName: "Checkout baseline",
        metricType: "run.completed",
        value: 1,
        unit: "count",
        status: "infra_error",
        errorCode: "NAVIGATION_TIMEOUT",
        recordedAt: 1_710_000_000_000,
      },
      {
        studyId: "study-checkout",
        studyName: "Checkout baseline",
        metricType: "ai.tokens.input",
        value: 1_200,
        unit: "tokens",
        recordedAt: 1_709_999_900_000,
      },
    ],
  };
}

function makeAuditEvents(): AuditEventView[] {
  return [
    {
      _id: "audit-1",
      actorId: "researcher|org-a",
      eventType: "study.cancelled",
      createdAt: 1_710_000_000_000,
      studyId: "study-checkout",
      reason: "Manual stop after blocker reproduction.",
      resourceId: "study-checkout",
      resourceType: "study",
    },
    {
      _id: "audit-2",
      actorId: "researcher|org-a",
      eventType: "report.published",
      createdAt: 1_709_999_900_000,
      studyId: "study-returns",
      reason: "Published ranked report.",
      resourceId: "study-returns",
      resourceType: "study",
    },
    {
      _id: "audit-3",
      actorId: "admin|org-a",
      eventType: "settings.updated",
      createdAt: 1_709_999_800_000,
      resourceId: "org-a",
      resourceType: "settings",
    },
  ];
}

function makeSettingsView(): SettingsView {
  return {
    orgId: "admin|org-a",
    domainAllowlist: ["checkout.example.com"],
    maxConcurrency: 6,
    modelConfig: [
      { taskCategory: "action", modelId: "gpt-5.4-nano" },
      { taskCategory: "summarization", modelId: "gpt-5.4-mini" },
    ],
    runBudgetCap: 64,
    budgetLimits: {
      maxTokensPerStudy: 1800,
      maxBrowserSecPerStudy: 600,
    },
    browserPolicy: {
      blockAnalytics: false,
      blockHeavyMedia: false,
      screenshotFormat: "jpeg",
      screenshotMode: "milestones",
    },
    signedUrlExpirySeconds: 14_400,
    updatedBy: "admin|org-a",
    updatedAt: 1_710_000_000_000,
    credentials: [
      {
        _id: "credential-checkout",
        ref: "cred_checkout",
        label: "Checkout fixture",
        description: "Shared checkout account",
        allowedStudyIds: ["study-checkout"],
        createdBy: "admin|org-a",
        createdAt: 1_710_000_000_000,
        updatedAt: 1_710_000_000_000,
      },
    ],
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
      artifactManifestUrl:
        `${MOCK_ARTIFACT_BASE_URL}/artifacts/${encodeURIComponent(
          "runs/run-hard-fail/artifacts.json",
        )}`,
      summaryKey: "runs/run-hard-fail/summary.json",
      summaryUrl:
        `${MOCK_ARTIFACT_BASE_URL}/artifacts/${encodeURIComponent(
          "runs/run-hard-fail/summary.json",
        )}`,
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
        screenshotUrl:
          `${MOCK_ARTIFACT_BASE_URL}/artifacts/${encodeURIComponent(
            "runs/run-hard-fail/milestones/1.png",
          )}`,
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

function makeReportJsonExportArtifact() {
  return {
    studyId: "study-live" as Id<"studies">,
    artifactKey: "study-reports/study-live/report.json",
    contentType: "application/json",
    fileName: "study-report-study-live.json",
    content: JSON.stringify({
      studyId: "study-live",
      issueClusterIds: ["finding-address", "finding-payment"],
      limitations: [
        "Findings are synthetic and directional.",
      ],
    }),
  };
}

function makeReportHtmlExportArtifact() {
  return {
    studyId: "study-live" as Id<"studies">,
    artifactKey: "study-reports/study-live/report.html",
    contentType: "text/html; charset=utf-8",
    fileName: "study-report-study-live.html",
    content:
      "<!DOCTYPE html><html><head><title>Study Report</title></head><body><h1>Study report</h1><p>This HTML report is self-contained.</p></body></html>",
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

function makeTranscript(
  overrides: Partial<Doc<"transcripts">> = {},
): Doc<"transcripts"> {
  return {
    _creationTime: 1,
    _id: (overrides._id ?? "transcript-1") as Id<"transcripts">,
    storageId: "storage-1" as Id<"_storage">,
    originalFilename: "checkout-transcript.txt",
    format: "txt",
    metadata: {
      participantId: "participant-1",
      tags: ["checkout"],
      notes: "Transcript notes.",
      ...overrides.metadata,
    },
    processingStatus: "processed",
    processingError: undefined,
    characterCount: 128,
    orgId: "researcher|org-a",
    createdBy: "researcher|org-a",
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  };
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

function makeFileList(files: File[]): FileList {
  const fileList = {
    length: files.length,
    item: (index: number) => files[index] ?? null,
    [Symbol.iterator]: function* iterator() {
      for (const file of files) {
        yield file;
      }
    },
  };

  for (const [index, file] of files.entries()) {
    Object.defineProperty(fileList, index, {
      configurable: true,
      enumerable: true,
      value: file,
    });
  }

  return fileList as FileList;
}
