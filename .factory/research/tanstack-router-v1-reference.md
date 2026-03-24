# TanStack Router v1 — Code-Based Routing Reference for Botchestra

> Research date: 2026-03-24
> Package: `@tanstack/react-router@^1.168.3` (listed in `apps/web/package.json`)
> Sources: Official docs (tanstack.com/router/v1), DeepWiki (tanstack/router), example repos

---

## 1. Core APIs for Code-Based Routing

TanStack Router v1 strongly recommends file-based routing, but code-based is fully supported.
The key functions:

| API | Import from | Purpose |
|-----|------------|---------|
| `createRootRoute()` | `@tanstack/react-router` | Create the root of the route tree |
| `createRootRouteWithContext<T>()` | `@tanstack/react-router` | Root route that accepts typed context (needed for auth) |
| `createRoute()` | `@tanstack/react-router` | Create any non-root route |
| `createRouter()` | `@tanstack/react-router` | Instantiate the router with a route tree |
| `RouterProvider` | `@tanstack/react-router` | React component that provides the router |
| `Outlet` | `@tanstack/react-router` | Renders child routes inside a layout |
| `Link` | `@tanstack/react-router` | Type-safe navigation link |
| `redirect()` | `@tanstack/react-router` | Throw from `beforeLoad` to redirect |

---

## 2. Setting Up createRouter with Code-Based Routes

### Step 1: Define the Root Route

```tsx
// src/routes/root.ts
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

// Define what context the router will receive
interface RouterContext {
  auth: {
    isAuthenticated: boolean
    isLoading: boolean
  }
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
})

function RootComponent() {
  return <Outlet />
}
```

### Step 2: Create Routes

```tsx
// src/routes/routes.ts
import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './root'

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => <div>Dashboard</div>,
})

const aboutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'about',
  component: () => <div>About</div>,
})
```

### Step 3: Build the Route Tree

```tsx
const routeTree = rootRoute.addChildren([
  indexRoute,
  aboutRoute,
])
```

### Step 4: Create the Router

```tsx
// src/router.ts
import { createRouter } from '@tanstack/react-router'

export const router = createRouter({
  routeTree,
  context: {
    auth: undefined!, // Will be passed from React component
  },
})

// Register the router for type safety (IMPORTANT)
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

### Step 5: Render with RouterProvider

```tsx
// src/main.tsx
import { RouterProvider } from '@tanstack/react-router'

function App() {
  const auth = useConvexAuth() // or whatever hook provides auth state
  return <RouterProvider router={router} context={{ auth }} />
}
```

---

## 3. Auth Guard with beforeLoad + redirect

The canonical pattern uses a **pathless layout route** (has `id` but no `path`) whose `beforeLoad` runs before any child route loads. If the user isn't authenticated, `throw redirect(...)`.

```tsx
import { createRoute, redirect, Outlet } from '@tanstack/react-router'
import { rootRoute } from './root'

// Pathless layout route — acts as auth guard for all children
export const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({
        to: '/login',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  component: () => <Outlet />,
})
```

**Key points:**
- `beforeLoad` receives `{ context, location, params, search }` — same as loader
- `beforeLoad` runs **before** any child route's `beforeLoad`
- If you `throw` in `beforeLoad`, **no children attempt to load**
- `redirect()` accepts all `navigate()` options (e.g., `replace: true`)
- Use `location.href` (not `router.state.resolvedLocation`) for the redirect search param

### Login Route with Redirect-Back

```tsx
export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: (search.redirect as string) || '/',
  }),
  beforeLoad: ({ context, search }) => {
    // If already authenticated, redirect away from login
    if (context.auth.isAuthenticated) {
      throw redirect({ to: search.redirect })
    }
  },
  component: LoginPage,
})
```

After successful login:
```tsx
// In your login success handler:
const { redirect } = Route.useSearch()
const navigate = Route.useNavigate()
// or use: router.history.push(redirect)
navigate({ to: redirect })
```

---

## 4. Layout Route with Sidebar + Outlet

There are two layout route patterns:

### Pattern A: Path-based Layout Route (e.g., `/app/...`)
The layout route has a `path` and its children are nested under it.

```tsx
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'app',
  component: AppLayout,
})

function AppLayout() {
  return (
    <div className="flex h-screen">
      <aside className="w-64 border-r">
        <Sidebar />
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}

// Children will render at /app/dashboard, /app/studies, etc.
const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: 'dashboard',
  component: DashboardPage,
})
```

### Pattern B: Pathless (ID-only) Layout Route
No URL segment added — just wraps children in a shared layout.

```tsx
const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'appLayout',  // no `path`, only `id`
  component: AppLayout,
})

// Children render at /dashboard, /studies — no /app prefix
const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',  // index route
  component: DashboardPage,
})
```

### Combining Auth Guard + Layout

You can use the **same** pathless route for both auth guard and layout:

```tsx
export const authenticatedLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: AuthenticatedLayout,
})

function AuthenticatedLayout() {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}
```

---

## 5. Parameterized Routes

Use `$paramName` prefix for dynamic segments:

```tsx
const studyRoute = createRoute({
  getParentRoute: () => studiesRoute,
  path: '$studyId',
  component: StudyDetailPage,
})

// Access params in component:
function StudyDetailPage() {
  const { studyId } = Route.useParams()
  // studyId is typed as string
  return <div>Study: {studyId}</div>
}

// Nested under study:
const studyOverviewRoute = createRoute({
  getParentRoute: () => studyRoute,
  path: 'overview',
  component: StudyOverviewPage,
})
// This matches: /studies/$studyId/overview
```

### Splat/Catch-all routes

```tsx
const filesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'files/$',  // matches /files/any/path/here
})
```

---

## 6. Integration with ConvexAuthProvider

The existing `main.tsx` wraps the app in `<ConvexAuthProvider>`. The key challenge is getting Convex's auth state into the TanStack Router context.

### Recommended Pattern

```tsx
// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import { ConvexReactClient } from 'convex/react'
import { RouterProvider } from '@tanstack/react-router'
import { router } from './router'

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)

function InnerApp() {
  // useConvexAuth is available inside ConvexAuthProvider
  const auth = useConvexAuth()
  return <RouterProvider router={router} context={{ auth }} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <InnerApp />
    </ConvexAuthProvider>
  </React.StrictMode>,
)
```

**Why this works:**
- `ConvexAuthProvider` wraps `RouterProvider`
- `useConvexAuth()` returns `{ isAuthenticated, isLoading }`
- These are passed as router context
- `beforeLoad` on protected routes can check `context.auth.isAuthenticated`

### Handling the Loading State

`useConvexAuth()` has an `isLoading` phase. During loading, you don't want to redirect to login. Handle it in the root route component or the auth layout:

```tsx
function AuthenticatedLayout() {
  const { auth } = authenticatedLayoutRoute.useRouteContext()
  // Note: beforeLoad already ran, so if we're here, we're authenticated
  // But you might want a loading spinner at the root level
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1"><Outlet /></main>
    </div>
  )
}
```

For the root route, handle isLoading:
```tsx
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => {
    // If you need to show a global loading state while auth initializes:
    // const { auth } = rootRoute.useRouteContext()
    // if (auth.isLoading) return <LoadingSpinner />
    return <Outlet />
  },
})
```

Or better — guard in beforeLoad:
```tsx
beforeLoad: ({ context, location }) => {
  // Don't redirect while still loading auth state
  if (context.auth.isLoading) return
  if (!context.auth.isAuthenticated) {
    throw redirect({ to: '/login', search: { redirect: location.href } })
  }
},
```

---

## 7. Complete Route Tree Example for Botchestra

```tsx
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from '@tanstack/react-router'

// ── Router Context ──────────────────────────────────
interface RouterContext {
  auth: { isAuthenticated: boolean; isLoading: boolean }
}

// ── Root Route ──────────────────────────────────────
const rootRoute = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
})

// ── Public Routes (no auth required) ────────────────
const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'login',
  component: LoginPage,
})

const signupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'signup',
  component: SignupPage,
})

// ── Authenticated Layout (pathless, auth guard + sidebar) ─
const authenticatedRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'authenticated',
  beforeLoad: ({ context, location }) => {
    if (context.auth.isLoading) return  // wait for auth
    if (!context.auth.isAuthenticated) {
      throw redirect({ to: '/login', search: { redirect: location.href } })
    }
  },
  component: AuthenticatedLayout,
})

// ── Dashboard (index of authenticated) ──────────────
const dashboardRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: '/',
  component: DashboardPage,
})

// ── Studies ─────────────────────────────────────────
const studiesRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'studies',
  component: () => <Outlet />,
})

const studiesIndexRoute = createRoute({
  getParentRoute: () => studiesRoute,
  path: '/',
  component: StudiesListPage,
})

const studyRoute = createRoute({
  getParentRoute: () => studiesRoute,
  path: '$studyId',
  component: () => <Outlet />,
})

const studyOverviewRoute = createRoute({
  getParentRoute: () => studyRoute,
  path: 'overview',
  component: StudyOverviewPage,
})

const studySessionsRoute = createRoute({
  getParentRoute: () => studyRoute,
  path: 'sessions',
  component: StudySessionsPage,
})

const studyFindingsRoute = createRoute({
  getParentRoute: () => studyRoute,
  path: 'findings',
  component: StudyFindingsPage,
})

// ── Personas ────────────────────────────────────────
const personasRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'personas',
  component: PersonasPage,
})

// ── Settings ────────────────────────────────────────
const settingsRoute = createRoute({
  getParentRoute: () => authenticatedRoute,
  path: 'settings',
  component: SettingsPage,
})

// ── Route Tree ──────────────────────────────────────
const routeTree = rootRoute.addChildren([
  loginRoute,
  signupRoute,
  authenticatedRoute.addChildren([
    dashboardRoute,
    studiesRoute.addChildren([
      studiesIndexRoute,
      studyRoute.addChildren([
        studyOverviewRoute,
        studySessionsRoute,
        studyFindingsRoute,
      ]),
    ]),
    personasRoute,
    settingsRoute,
  ]),
])

// ── Router ──────────────────────────────────────────
export const router = createRouter({
  routeTree,
  context: {
    auth: undefined!,
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
```

---

## 8. Gotchas & Tips

### ⚠️ `getParentRoute` is required for every non-root route
Every `createRoute()` call must include `getParentRoute: () => parentRoute`. This is how TanStack Router builds the type-safe route tree.

### ⚠️ Register the router for type safety
Without the `declare module` block, you lose type-safe `Link`, `useParams()`, etc.

### ⚠️ `beforeLoad` runs before children — use it as middleware
If you throw in a parent's `beforeLoad`, no child attempts to load. This is the correct place for auth guards.

### ⚠️ Don't redirect while auth is loading
If you use Convex's `useConvexAuth()`, it has `isLoading: true` initially. Check for loading before redirecting, otherwise every page load will redirect to login briefly.

### ⚠️ Pathless routes need `id`, not `path`
If you want a layout that doesn't add a URL segment, use `id: 'someName'` instead of `path`.

### ⚠️ Index routes use `path: '/'`
The index route for a parent is specified with `path: '/'`, not `path: ''`.

### ⚠️ Route components are just React components
No special exports needed. You can use hooks like `useConvex()`, `useQuery()`, etc. inside them.

### ⚠️ `redirect()` is thrown, not returned
Always `throw redirect(...)`, don't `return redirect(...)`.

### ⚠️ `isRedirect()` helper for error handling
If your `beforeLoad` has try/catch, use `isRedirect(error)` to re-throw intentional redirects:
```tsx
import { isRedirect } from '@tanstack/react-router'
// in catch block:
if (isRedirect(error)) throw error
```

### ⚠️ No file-based routing generator needed
For code-based routing, you do NOT need `@tanstack/router-plugin` or any Vite plugin. Just build the tree manually.

---

## 9. Key Documentation Links

- [Code-Based Routing](https://tanstack.com/router/v1/docs/framework/react/routing/code-based-routing)
- [Creating a Router](https://tanstack.com/router/v1/docs/framework/react/guide/creating-a-router)
- [Authenticated Routes Guide](https://tanstack.com/router/v1/docs/framework/react/guide/authenticated-routes)
- [How-To: Setup Authentication](https://tanstack.com/router/v1/docs/framework/react/how-to/setup-authentication)
- [Router Context](https://tanstack.com/router/v1/docs/framework/react/guide/router-context)
- [Outlets](https://tanstack.com/router/v1/docs/framework/react/guide/outlets)
- [createRootRoute API](https://tanstack.com/router/v1/docs/framework/react/api/router/createRootRouteFunction)
- [GitHub: Authenticated Routes Example](https://github.com/TanStack/router/tree/main/examples/react/authenticated-routes)
