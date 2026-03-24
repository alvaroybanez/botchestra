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
import {
  contentRoutePlaceholders,
  NotFoundPlaceholder,
  RoutePlaceholder,
} from "@/routes/placeholders";
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
  const placeholder = withoutKey(contentRoutePlaceholders[0]);

  return (
    <RoutePlaceholder
      {...placeholder}
      routePath="/studies"
    />
  );
}

function StudiesNewPage() {
  const placeholder = withoutKey(contentRoutePlaceholders[1]);

  return (
    <RoutePlaceholder
      {...placeholder}
      routePath="/studies/new"
    />
  );
}

function StudyOverviewPage() {
  const { studyId } = studyOverviewRoute.useParams();
  const placeholder = withoutKey(contentRoutePlaceholders[2]);

  return (
    <RoutePlaceholder
      {...placeholder}
      params={{ "Study ID": studyId }}
      routePath={`/studies/${studyId}/overview`}
    />
  );
}

function StudyPersonasPage() {
  const { studyId } = studyPersonasRoute.useParams();
  const placeholder = withoutKey(contentRoutePlaceholders[3]);

  return (
    <RoutePlaceholder
      {...placeholder}
      params={{ "Study ID": studyId }}
      routePath={`/studies/${studyId}/personas`}
    />
  );
}

function StudyRunsPage() {
  const { studyId } = studyRunsRoute.useParams();
  const placeholder = withoutKey(contentRoutePlaceholders[4]);

  return (
    <RoutePlaceholder
      {...placeholder}
      params={{ "Study ID": studyId }}
      routePath={`/studies/${studyId}/runs`}
    />
  );
}

function StudyFindingsPage() {
  const { studyId } = studyFindingsRoute.useParams();
  const placeholder = withoutKey(contentRoutePlaceholders[5]);

  return (
    <RoutePlaceholder
      {...placeholder}
      params={{ "Study ID": studyId }}
      routePath={`/studies/${studyId}/findings`}
    />
  );
}

function StudyReportPage() {
  const { studyId } = studyReportRoute.useParams();
  const placeholder = withoutKey(contentRoutePlaceholders[6]);

  return (
    <RoutePlaceholder
      {...placeholder}
      params={{ "Study ID": studyId }}
      routePath={`/studies/${studyId}/report`}
    />
  );
}

function PersonaPacksPage() {
  const placeholder = withoutKey(contentRoutePlaceholders[7]);

  return (
    <RoutePlaceholder
      {...placeholder}
      routePath="/persona-packs"
    />
  );
}

function PersonaPackDetailPage() {
  const { packId } = personaPackDetailRoute.useParams();
  const placeholder = withoutKey(contentRoutePlaceholders[8]);

  return (
    <RoutePlaceholder
      {...placeholder}
      params={{ "Pack ID": packId }}
      routePath={`/persona-packs/${packId}`}
    />
  );
}

function SettingsPage() {
  const placeholder = withoutKey(contentRoutePlaceholders[9]);

  return (
    <RoutePlaceholder
      {...placeholder}
      routePath="/settings"
    />
  );
}

export function getRouterLocationHref(routerInstance: AnyRouter) {
  return routerInstance.state.location.href;
}

function withoutKey({
  key: _key,
  ...placeholder
}: (typeof contentRoutePlaceholders)[number]) {
  return placeholder;
}
