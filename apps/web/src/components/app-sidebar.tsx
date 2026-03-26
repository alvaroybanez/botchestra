import { useAuthActions } from "@convex-dev/auth/react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";

const baseNavigationItems = [
  {
    label: "Studies",
    to: "/studies",
    exact: false,
    permission: null,
  },
  {
    label: "Persona Packs",
    to: "/persona-packs",
    exact: false,
    permission: null,
  },
  {
    label: "Settings",
    to: "/settings",
    exact: true,
    permission: "canAccessSettings",
  },
  {
    label: "Diagnostics",
    to: "/admin/diagnostics",
    exact: true,
    permission: "canAccessAdminDiagnostics",
  },
] as const;

export function AppSidebar() {
  const { signOut } = useAuthActions();
  const viewerAccess = useQuery((api as any).rbac.getViewerAccess, {});
  const navigationItems = baseNavigationItems.filter((item) =>
    item.permission === null ? true : viewerAccess?.permissions[item.permission] === true,
  );

  return (
    <aside className="flex w-full max-w-64 flex-col border-r bg-card">
      <div className="border-b px-6 py-5">
        <p className="text-sm font-medium text-muted-foreground">Botchestra</p>
        <h1 className="text-xl font-semibold">Validation Console</h1>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-4">
        {navigationItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            activeOptions={{ exact: item.exact }}
            activeProps={{
              className:
                "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors",
            }}
            inactiveProps={{
              className:
                "rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
            }}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t p-4">
        <Button className="w-full" variant="outline" onClick={() => void signOut()}>
          Log out
        </Button>
      </div>
    </aside>
  );
}
