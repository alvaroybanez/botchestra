import { createContext, useContext, useState, type ReactNode } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import {
  BookOpen,
  ChevronLeft,
  Compass,
  FileText,
  FlaskConical,
  LogOut,
  PanelLeft,
  Settings,
  Sliders,
  Stethoscope,
  Users,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { api } from "../../../../convex/_generated/api";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD
 *
 *    0ms   sidebar at rest (expanded or collapsed)
 *  press   toggle fires
 *    0ms   width animates via spring (visualDuration 0.3, bounce 0.15)
 *    0ms   labels fade in/out (opacity 150ms)
 *  300ms   settled
 * ───────────────────────────────────────────────────────── */

export const SIDEBAR_ANIMATION_TIMING = {
  sidebarSpring: { type: "spring" as const, visualDuration: 0.3, bounce: 0.15 },
  labelFade: { duration: 0.15 },
};

export const SIDEBAR_EXPANDED_WIDTH = 256; // 16rem
export const SIDEBAR_COLLAPSED_WIDTH = 68; // icon + padding

// ── Context ──────────────────────────────────────────────

type SidebarContextValue = {
  collapsed: boolean;
  toggle: () => void;
};

const SidebarContext = createContext<SidebarContextValue>({
  collapsed: false,
  toggle: () => {},
});

export function useSidebar() {
  return useContext(SidebarContext);
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <SidebarContext.Provider value={{ collapsed, toggle: () => setCollapsed((c) => !c) }}>
      {children}
    </SidebarContext.Provider>
  );
}

// ── Navigation structure ─────────────────────────────────

type NavItem = {
  label: string;
  to: string;
  icon: typeof FlaskConical;
  exact: boolean;
  permission: string | null;
};

type NavGroup = {
  section: string;
  items: NavItem[];
};

const navigationGroups: NavGroup[] = [
  {
    section: "Orchestrate",
    items: [
      { label: "Studies", to: "/studies", icon: FlaskConical, exact: false, permission: null },
    ],
  },
  {
    section: "Configure",
    items: [
      { label: "Persona Configs", to: "/persona-configs", icon: Users, exact: false, permission: null },
      { label: "Axis Library", to: "/axis-library", icon: Sliders, exact: false, permission: null },
      { label: "Transcripts", to: "/transcripts", icon: FileText, exact: false, permission: null },
    ],
  },
  {
    section: "Analyze",
    items: [
      { label: "Settings", to: "/settings", icon: Settings, exact: true, permission: "canAccessSettings" },
      { label: "Diagnostics", to: "/admin/diagnostics", icon: Stethoscope, exact: true, permission: "canAccessAdminDiagnostics" },
    ],
  },
];

// ── Sidebar ──────────────────────────────────────────────

export function AppSidebar() {
  const { signOut } = useAuthActions();
  const { collapsed, toggle } = useSidebar();
  const viewerAccess = useQuery((api as any).rbac.getViewerAccess, {});

  const visibleGroups = navigationGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.permission === null ? true : viewerAccess?.permissions[item.permission] === true,
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        animate={{ width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH }}
        transition={SIDEBAR_ANIMATION_TIMING.sidebarSpring}
        className="flex flex-col border-r border-border/50 bg-card"
        style={{ minHeight: "100vh", overflow: "hidden" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-4">
          <AnimatePresence mode="wait">
            {collapsed ? (
              <motion.div
                key="icon"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SIDEBAR_ANIMATION_TIMING.labelFade}
                className="flex w-full justify-center"
              >
                <Compass className="size-5 text-foreground" />
              </motion.div>
            ) : (
              <motion.h1
                key="text"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={SIDEBAR_ANIMATION_TIMING.labelFade}
                className="font-label text-sm tracking-widest"
              >
                Botchestra
              </motion.h1>
            )}
          </AnimatePresence>

          {!collapsed && (
            <Button
              variant="ghost"
              size="sm"
              className="size-8 p-0 text-muted-foreground hover:text-foreground"
              onClick={toggle}
              aria-label="Collapse sidebar"
            >
              <ChevronLeft className="size-4" />
            </Button>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-4 p-3">
          {visibleGroups.map((group) => (
            <div key={group.section} className="space-y-1">
              {!collapsed && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={SIDEBAR_ANIMATION_TIMING.labelFade}
                  className="mb-2 px-3 font-label text-[10px] text-muted-foreground"
                >
                  {group.section}
                </motion.p>
              )}

              {group.items.map((item) => (
                <NavLink key={item.to} item={item} collapsed={collapsed} />
              ))}
            </div>
          ))}
        </nav>

        {/* Collapse toggle (collapsed state) */}
        {collapsed && (
          <div className="flex justify-center px-3 pb-2">
            <Button
              variant="ghost"
              size="sm"
              className="size-9 p-0 text-muted-foreground hover:text-foreground"
              onClick={toggle}
              aria-label="Expand sidebar"
            >
              <PanelLeft className="size-4" />
            </Button>
          </div>
        )}

        {/* User footer */}
        <div className="border-t border-border/50 p-3">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="size-9 w-full p-0 text-muted-foreground hover:text-foreground"
                  onClick={() => void signOut()}
                  aria-label="Log out"
                >
                  <LogOut className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Log out</TooltipContent>
            </Tooltip>
          ) : (
            <div className="flex items-center gap-3 rounded-lg px-3 py-2">
              <Avatar className="size-8">
                <AvatarFallback className="bg-accent text-xs font-medium">
                  U
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium">User</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="size-8 shrink-0 p-0 text-muted-foreground hover:text-foreground"
                onClick={() => void signOut()}
                aria-label="Log out"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </motion.aside>
    </TooltipProvider>
  );
}

// ── Nav link ─────────────────────────────────────────────

function NavLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon;

  const linkContent = (
    <Link
      to={item.to}
      activeOptions={{ exact: item.exact }}
      activeProps={{
        className: cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors",
          "border-l-2 border-foreground bg-accent/50",
          collapsed && "justify-center border-l-0 bg-accent/50 px-0",
        ),
      }}
      inactiveProps={{
        className: cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors",
          "border-l-2 border-transparent hover:border-border hover:text-foreground",
          collapsed && "justify-center border-l-0 px-0 hover:border-transparent hover:bg-accent/30",
        ),
      }}
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && (
        <motion.span
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={SIDEBAR_ANIMATION_TIMING.labelFade}
          className="truncate"
        >
          {item.label}
        </motion.span>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return linkContent;
}
