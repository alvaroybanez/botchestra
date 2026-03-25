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
import { AppSidebar } from "@/components/app-sidebar";
import { LoginPage } from "@/routes/login";
import { NotFoundPlaceholder } from "@/routes/placeholders";
import {
  PersonaPackDetailPage as PersonaPackDetailRoutePage,
  PersonaPacksPage as PersonaPacksRoutePage,
} from "@/routes/persona-pack-pages";
import { StudyPersonasPage as StudyPersonasRoutePage } from "@/routes/study-personas-page";
import {
  SettingsSkeletonPage,
  StudiesNewSkeletonPage,
  StudiesSkeletonPage,
  StudyDetailSkeletonPage,
} from "@/routes/skeleton-pages";
import { SignupPage } from "@/routes/signup";

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
  return resolveRedirectPath(location.href ?? location.pathname);
}

function validateAuthSearch(search: Record<string, unknown>) {
  return {
    redirect: resolveRedirectPath(search.redirect),
  };
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
  component: StudyOverviewPage,
});

const studyPersonasRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "studies/$studyId/personas",
  component: StudyPersonasPage,
});

const studyRunsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "studies/$studyId/runs",
  component: StudyRunsPage,
});

const studyFindingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "studies/$studyId/findings",
  component: StudyFindingsPage,
});

const studyReportRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "studies/$studyId/report",
  component: StudyReportPage,
});

const personaPacksRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "persona-packs",
  component: PersonaPacksPage,
});

const personaPackDetailRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "persona-packs/$packId",
  component: PersonaPackDetailPage,
});

const settingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: "settings",
  component: SettingsPage,
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
    personaPackDetailRoute,
    settingsRoute,
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
  return <StudiesSkeletonPage />;
}

function StudiesNewPage() {
  return <StudiesNewSkeletonPage />;
}

function StudyOverviewPage() {
  const { studyId } = studyOverviewRoute.useParams();
  return (
    <StudyDetailSkeletonPage
      activeTab="overview"
      routePath={`/studies/${studyId}/overview`}
      studyId={studyId}
      tabIndex={2}
    />
  );
}

function StudyPersonasPage() {
  const { studyId } = studyPersonasRoute.useParams();
  return <StudyPersonasRoutePage studyId={studyId} />;
}

function StudyRunsPage() {
  const { studyId } = studyRunsRoute.useParams();
  return (
    <StudyDetailSkeletonPage
      activeTab="runs"
      routePath={`/studies/${studyId}/runs`}
      studyId={studyId}
      tabIndex={4}
    />
  );
}

function StudyFindingsPage() {
  const { studyId } = studyFindingsRoute.useParams();
  return (
    <StudyDetailSkeletonPage
      activeTab="findings"
      routePath={`/studies/${studyId}/findings`}
      studyId={studyId}
      tabIndex={5}
    />
  );
}

function StudyReportPage() {
  const { studyId } = studyReportRoute.useParams();
  return (
    <StudyDetailSkeletonPage
      activeTab="report"
      routePath={`/studies/${studyId}/report`}
      studyId={studyId}
      tabIndex={6}
    />
  );
}

function PersonaPacksPage() {
  return <PersonaPacksRoutePage />;
}

function PersonaPackDetailPage() {
  const { packId } = personaPackDetailRoute.useParams();
  return <PersonaPackDetailRoutePage packId={packId} />;
}

function SettingsPage() {
  return <SettingsSkeletonPage />;
}

export function getRouterLocationHref(routerInstance: AnyRouter) {
  return routerInstance.state.location.href;
}
