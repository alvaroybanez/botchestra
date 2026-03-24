import { useAuthActions } from "@convex-dev/auth/react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

const navigationItems = [
  {
    label: "Studies",
    to: "/studies",
    exact: false,
  },
  {
    label: "Persona Packs",
    to: "/persona-packs",
    exact: false,
  },
  {
    label: "Settings",
    to: "/settings",
    exact: true,
  },
] as const;

export function AppSidebar() {
  const { signOut } = useAuthActions();

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
