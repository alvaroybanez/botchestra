# Frontend Patterns (apps/web)

## Stack

React 19 + Vite 6.3 + TanStack Router v1 + Tailwind CSS v4.2 + shadcn/ui + Convex client.

## Entry & Auth

- `main.tsx`: Creates `ConvexReactClient`, wraps in `<ConvexAuthProvider>`
- `App.tsx`: Bridges `useConvexAuth()` into router context; invalidates router on auth changes

## Routing

Single `router.tsx` defines the entire route tree manually (no file-based routing).

- Root route uses `createRootRouteWithContext<AppRouterContext>()`
- Auth-gated layout route (`id: "authenticated"`) wraps protected pages; redirects to `/login`
- RBAC at route level: queries `rbac.getViewerAccess`, renders `AccessDeniedPage` inline
- Search params validated via `validateSearch` functions

## Component Organization

```
src/
  components/ui/   # 18 shadcn/ui primitives (button, card, dialog, tabs, etc.)
  components/      # App-level components (sidebar, persona sections)
  routes/          # Page-level modules (one file per page or group)
  lib/utils.ts     # cn() helper (clsx + tailwind-merge)
```

- Page files are large and self-contained — helper components defined within the page file
- No barrel/index files — imports use direct paths with `@/` alias

## State Management

- **Server state**: Convex hooks (`useQuery`, `useMutation`, `useAction`) — no TanStack Query or SWR
- **Local state**: `useState` + `useEffect` for forms, feedback, loading
- **No global client store** (no Redux, Zustand, Jotai)
- Optimistic updates done manually with local state

## UI Conventions

- Page structure: `<section className="space-y-6">` → header → content cards
- Forms: Native `<form onSubmit>` with `event.preventDefault()`, async mutation, local error/success state
- Feedback: colored `<p>` elements (destructive red / emerald green)
- Icons: `lucide-react`
- Animations: `motion` (framer-motion v12) used sparingly

## Styling (Tailwind v4)

- Design tokens in `@theme inline` block in `index.css`
- Custom utilities: `font-heading`, `font-body`, `font-label`, `shadow-card`, etc.
- Typography: `Geist` (heading/body), `Geist Mono` (labels)
- Light mode only
