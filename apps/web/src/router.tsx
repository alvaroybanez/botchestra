import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Navigate,
  Outlet,
  redirect,
  useLocation,
  type AnyRouter,
  type RouterHistory,
} from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { AppSidebar } from "@/components/app-sidebar";
import { AdminDiagnosticsPage as AdminDiagnosticsRoutePage } from "@/routes/admin-diagnostics-page";
import { AxisLibraryPage as AxisLibraryRoutePage } from "@/routes/axis-library-page";
import { LoginPage } from "@/routes/login";
import { NotFoundPlaceholder } from "@/routes/placeholders";
import {
  PersonaPackDetailPage as PersonaPackDetailRoutePage,
  PersonaPacksPage as PersonaPacksRoutePage,
} from "@/routes/persona-pack-pages";
import {
  StudiesListPage as StudiesRoutePage,
  StudyCreationWizardPage as StudyCreationWizardRoutePage,
  StudyOverviewPage as StudyOverviewRoutePage,
} from "@/routes/study-pages";
import { StudyFindingsPage as StudyFindingsRoutePage } from "@/routes/study-findings-page";
import { StudyPersonasPage as StudyPersonasRoutePage } from "@/routes/study-personas-page";
import { StudyReportPage as StudyReportRoutePage } from "@/routes/study-report-page";
import { StudyRunsPage as StudyRunsRoutePage } from "@/routes/study-runs-page";
import { SettingsPage as SettingsRoutePage } from "@/routes/settings-page";
import {
  validateStudyDetailSearch,
  validateStudyReportSearch,
} from "@/routes/study-shared";
import { SignupPage } from "@/routes/signup";
import {
  TranscriptDetailPage as TranscriptDetailRoutePage,
  TranscriptsPage as TranscriptsRoutePage,
} from "@/routes/transcript-pages";

export type AppAuthState = {
  isAuthenticated: boolean;
  isLoading: boolean;
};

type AppRouterContext = {
  auth: AppAuthState;
};

type RedirectLocation = {
  href?: string;
  pathname: string;
  search?: unknown;
};

const defaultRedirectPath = "/studies";

export function resolveRedirectPath(value: unknown) {
  if (typeof value !== "string") {
    return defaultRedirectPath;
  }

  if (!value.startsWith("/") || value.startsWith("//")) {
    return defaultRedirectPath;
  }

  return value;
}

export function getRedirectPathFromLocation(location: RedirectLocation) {
  if (location.search !== null && typeof location.search === "object") {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(location.search)) {
      if (value === undefined || value === null || value === false) {
        continue;
      }

      if (key === "shared" && value === true) {
        searchParams.set(key, "1");
        continue;
      }

      searchParams.set(key, String(value));
    }

    const searchString = searchParams.toString();
    return resolveRedirectPath(
      searchString.length > 0
        ? `${location.pathname}?${searchString}`
        : location.pathname,
    );
  }

  return resolveRedirectPath(location.href ?? location.pathname);
}

function validateAuthSearch(search: Record<string, unknown>) {
  return {
    redirect: resolveRedirectPath(search.redirect),
  };
}

function isSharedReportLocation(location: {
  href?: string;
  pathname: string;
  search: unknown;
}) {
  if (
    !location.pathname.startsWith("/studies/")
    || !location.pathname.endsWith("/report")
  ) {
    return false;
  }

  if (location.search === null || typeof location.search !== "object") {
    if (typeof location.href !== "string") {
      return false;
    }

    const sharedValue = new URL(location.href, "http://localhost")
      .searchParams
      .get("shared");

    return sharedValue === "1" || sharedValue === "true";
  }

  return (location.search as Record<string, unknown>).shared === true;
}

const rootRoute = createRootRouteWithContext<AppRouterContext>()({
  component: RootComponent,
});

const rootRedirectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: () => {
    throw redirect({
      replace: true,
      to: "/studies",
    });
  },
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "login",
  validateSearch: validateAuthSearch,
  beforeLoad: ({ context }) => {
    if (context.auth.isLoading) {
      return;
    }

    if (context.auth.isAuthenticated) {
      throw redirect({
        replace: true,
        to: "/studies",
      });
    }
  },
  component: LoginRouteComponent,
});

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "signup",
  validateSearch: validateAuthSearch,
  beforeLoad: ({ context }) => {
    if (context.auth.isLoading) {
      return;
    }

    if (context.auth.isAuthenticated) {
      throw redirect({
        replace: true,
        to: "/studies",
      });
    }
  },
  component: SignupRouteComponent,
});

const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "authenticated",
  beforeLoad: ({ context, location }) => {
    if (context.auth.isLoading) {
      return;
    }

    if (!context.auth.isAuthenticated) {
      throw redirect({
        replace: true,
        search: {
          redirect: getRedirectPathFromLocation(location),
        },
        to: "/login",
      });
    }
  },
  component: AuthenticatedLayout,
});

const studiesRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "studies",
  component: StudiesPage,
});

const studiesNewRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "studies/new",
  component: StudiesNewPage,
});

const studyOverviewRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "studies/$studyId/overview",
  validateSearch: validateStudyDetailSearch,
  component: StudyOverviewPage,
});

const studyPersonasRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "studies/$studyId/personas",
  validateSearch: validateStudyDetailSearch,
  component: StudyPersonasPage,
});

const studyRunsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "studies/$studyId/runs",
  validateSearch: validateStudyDetailSearch,
  component: StudyRunsPage,
});

const studyFindingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "studies/$studyId/findings",
  validateSearch: validateStudyDetailSearch,
  component: StudyFindingsPage,
});

const studyReportRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "studies/$studyId/report",
  validateSearch: validateStudyReportSearch,
  component: StudyReportPage,
});

const personaPacksRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "persona-packs",
  component: PersonaPacksPage,
});

const axisLibraryRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "axis-library",
  component: AxisLibraryPage,
});

const transcriptsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "transcripts",
  component: TranscriptsPage,
});

const personaPackDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "persona-packs/$packId",
  component: PersonaPackDetailPage,
});

const transcriptDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "transcripts/$transcriptId",
  component: TranscriptDetailPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "settings",
  component: SettingsPage,
});

const adminDiagnosticsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "admin/diagnostics",
  component: AdminDiagnosticsPage,
});

const authenticatedNotFoundRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "$",
  component: NotFoundPlaceholder,
});

const routeTree = rootRoute.addChildren([
  rootRedirectRoute,
  loginRoute,
  signupRoute,
  authenticatedRoute.addChildren([
    studiesRoute,
    studiesNewRoute,
    studyOverviewRoute,
    studyPersonasRoute,
    studyRunsRoute,
    studyFindingsRoute,
    studyReportRoute,
    personaPacksRoute,
    axisLibraryRoute,
    transcriptsRoute,
    personaPackDetailRoute,
    transcriptDetailRoute,
    settingsRoute,
    adminDiagnosticsRoute,
    authenticatedNotFoundRoute,
  ]),
]);

export function createAppRouter(options?: { history?: RouterHistory }) {
  return createRouter({
    context: {
      auth: {
        isAuthenticated: false,
        isLoading: true,
      },
    },
    history: options?.history,
    routeTree,
  });
}

export const router = createAppRouter();

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function RootComponent() {
  const { auth } = rootRoute.useRouteContext();

  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  return <Outlet />;
}

function AuthenticatedLayout() {
  const { auth } = authenticatedRoute.useRouteContext();
  const location = useLocation();
  const isSharedReportView = isSharedReportLocation(location);

  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <Navigate
        replace
        search={{ redirect: getRedirectPathFromLocation(location) }}
        to="/login"
      />
    );
  }

  if (isSharedReportView) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto w-full max-w-6xl px-6 py-8">
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar />
      <main className="flex-1 p-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function LoginRouteComponent() {
  const { redirect } = loginRoute.useSearch();
  return <LoginPage redirectPath={redirect} />;
}

function SignupRouteComponent() {
  const { redirect } = signupRoute.useSearch();
  return <SignupPage redirectPath={redirect} />;
}

function StudiesPage() {
  return <StudiesRoutePage />;
}

function StudiesNewPage() {
  return <StudyCreationWizardRoutePage />;
}

function StudyOverviewPage() {
  const { studyId } = studyOverviewRoute.useParams();
  const detailSearch = studyOverviewRoute.useSearch();
  return <StudyOverviewRoutePage detailSearch={detailSearch} studyId={studyId} />;
}

function StudyPersonasPage() {
  const { studyId } = studyPersonasRoute.useParams();
  const detailSearch = studyPersonasRoute.useSearch();
  return (
    <StudyPersonasRoutePage
      detailSearch={detailSearch}
      studyId={studyId}
    />
  );
}

function StudyRunsPage() {
  const { studyId } = studyRunsRoute.useParams();
  const detailSearch = studyRunsRoute.useSearch();
  const navigate = studyRunsRoute.useNavigate();
  return (
    <StudyRunsRoutePage
      detailSearch={detailSearch}
      onSearchChange={(patch) =>
        void navigate({
          replace: true,
          search: (previous) => ({
            ...previous,
            ...patch,
          }),
        })
      }
      studyId={studyId}
    />
  );
}

function StudyFindingsPage() {
  const { studyId } = studyFindingsRoute.useParams();
  const detailSearch = studyFindingsRoute.useSearch();
  const navigate = studyFindingsRoute.useNavigate();
  return (
    <StudyFindingsRoutePage
      detailSearch={detailSearch}
      onSearchChange={(patch) =>
        void navigate({
          replace: true,
          search: (previous) => ({
            ...previous,
            ...patch,
          }),
        })
      }
      studyId={studyId}
    />
  );
}

function StudyReportPage() {
  const { studyId } = studyReportRoute.useParams();
  const reportSearch = studyReportRoute.useSearch();
  return (
    <StudyReportRoutePage
      detailSearch={{
        outcome: reportSearch.outcome,
        protoPersonaId: reportSearch.protoPersonaId,
        finalUrlContains: reportSearch.finalUrlContains,
        severity: reportSearch.severity,
        axisKey: reportSearch.axisKey,
        axisMin: reportSearch.axisMin,
        axisMax: reportSearch.axisMax,
        urlPrefix: reportSearch.urlPrefix,
        runId: reportSearch.runId,
      }}
      isSharedView={reportSearch.shared}
      studyId={studyId}
    />
  );
}

function PersonaPacksPage() {
  return <PersonaPacksRoutePage />;
}

function AxisLibraryPage() {
  return <AxisLibraryRoutePage />;
}

function TranscriptsPage() {
  return <TranscriptsRoutePage />;
}

function PersonaPackDetailPage() {
  const { packId } = personaPackDetailRoute.useParams();
  return <PersonaPackDetailRoutePage packId={packId} />;
}

function TranscriptDetailPage() {
  const { transcriptId } = transcriptDetailRoute.useParams();
  return <TranscriptDetailRoutePage transcriptId={transcriptId} />;
}

function SettingsPage() {
  const viewerAccess = useQuery((api as any).rbac.getViewerAccess, {});

  if (viewerAccess === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (viewerAccess?.permissions.canAccessSettings !== true) {
    return (
      <AccessDeniedPage
        description="Only admins can access workspace settings."
        title="Access denied"
      />
    );
  }

  return <SettingsRoutePage />;
}

function AdminDiagnosticsPage() {
  const viewerAccess = useQuery((api as any).rbac.getViewerAccess, {});

  if (viewerAccess === undefined) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (viewerAccess?.permissions.canAccessAdminDiagnostics !== true) {
    return (
      <AccessDeniedPage
        description="Only admins can access workspace diagnostics."
        title="Access denied"
      />
    );
  }

  return <AdminDiagnosticsRoutePage />;
}

function AccessDeniedPage({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Restricted Route
        </p>
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
          <p className="max-w-2xl text-base text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    </section>
  );
}

export function getRouterLocationHref(routerInstance: AnyRouter) {
  return routerInstance.state.location.href;
}
