import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  contentRoutePlaceholders,
  RoutePlaceholder,
} from "@/routes/placeholders";

export const DEMO_STUDY_ID = "demo-study" as const;
export const DEMO_PACK_ID = "demo-pack" as const;

const studyTabs = [
  {
    key: "overview",
    label: "Overview",
    to: "/studies/$studyId/overview" as const,
  },
  {
    key: "personas",
    label: "Personas",
    to: "/studies/$studyId/personas" as const,
  },
  {
    key: "runs",
    label: "Runs",
    to: "/studies/$studyId/runs" as const,
  },
  {
    key: "findings",
    label: "Findings",
    to: "/studies/$studyId/findings" as const,
  },
  {
    key: "report",
    label: "Report",
    to: "/studies/$studyId/report" as const,
  },
] as const;

export function StudiesSkeletonPage() {
  const placeholder = withoutKey(contentRoutePlaceholders[0]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Placeholder Route
          </p>
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight">
              {placeholder.title}
            </h2>
            <p className="max-w-2xl text-base text-muted-foreground">
              {placeholder.description}
            </p>
          </div>
        </div>

        <Button asChild>
          <Link to="/studies/new">Create Study</Link>
        </Button>
      </div>

      <RouteDetailsCard detail={placeholder.detail} routePath="/studies" />

      <div className="rounded-xl border border-dashed bg-card/60 p-6 shadow-sm">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold tracking-tight">
              No studies yet
            </h3>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              New workspaces start empty. Create your first study to define the
              task, persona coverage, and replay criteria for your next
              validation run.
            </p>
          </div>

          <Button asChild>
            <Link to="/studies/new">Create your first study</Link>
          </Button>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold tracking-tight">
              Demo study route links
            </h3>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Use the sample study entry below to reach the overview, personas,
              runs, findings, and report placeholders using only visible
              navigation.
            </p>
          </div>

          <Link
            className="block rounded-lg border bg-background p-4 transition-colors hover:border-primary hover:bg-muted/50"
            params={{ studyId: DEMO_STUDY_ID }}
            to="/studies/$studyId/overview"
          >
            <span className="block text-sm font-medium text-muted-foreground">
              Demo study entry
            </span>
            <span className="mt-1 block text-base font-semibold">
              Checkout usability benchmark
            </span>
            <span className="mt-2 block text-sm text-muted-foreground">
              Open the demo study overview, then use the in-page tabs to visit
              Personas, Runs, Findings, and Report.
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

export function StudiesNewSkeletonPage() {
  return (
    <RoutePlaceholder
      {...withoutKey(contentRoutePlaceholders[1])}
      routePath="/studies/new"
    />
  );
}

export function StudyDetailSkeletonPage({
  activeTab,
  routePath,
  studyId,
  tabIndex,
}: {
  activeTab: (typeof studyTabs)[number]["key"];
  routePath: string;
  studyId: string;
  tabIndex: 2 | 3 | 4 | 5 | 6;
}) {
  const placeholder = withoutKey(contentRoutePlaceholders[tabIndex]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Demo Study Route
          </p>
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight">
              {placeholder.title}
            </h2>
            <p className="max-w-2xl text-base text-muted-foreground">
              {placeholder.description}
            </p>
          </div>
        </div>

        <Button asChild variant="outline">
          <Link to="/studies">Back to Studies</Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Study detail tabs
            </p>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Use these links to navigate across the demo study&apos;s Overview,
              Personas, Runs, Findings, and Report routes without typing a URL.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {studyTabs.map((tab) => (
              <Link
                key={tab.key}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  activeTab === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                params={{ studyId }}
                to={tab.to}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <RouteDetailsCard
        detail={placeholder.detail}
        params={{ "Study ID": studyId }}
        routePath={routePath}
      />
    </section>
  );
}

export function PersonaPacksSkeletonPage() {
  const placeholder = withoutKey(contentRoutePlaceholders[7]);

  return (
    <section className="space-y-6">
      <RoutePlaceholder
        {...placeholder}
        routePath="/persona-packs"
      />

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold tracking-tight">
              Sample persona pack route
            </h3>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Open the demo persona pack detail placeholder from this visible
              list entry.
            </p>
          </div>

          <Link
            className="block rounded-lg border bg-background p-4 transition-colors hover:border-primary hover:bg-muted/50"
            params={{ packId: DEMO_PACK_ID }}
            to="/persona-packs/$packId"
          >
            <span className="block text-sm font-medium text-muted-foreground">
              Sample pack entry
            </span>
            <span className="mt-1 block text-base font-semibold">
              Customer Journey Stress Test Pack
            </span>
            <span className="mt-2 block text-sm text-muted-foreground">
              Jump to the demo pack detail route to inspect pack metadata and
              placeholder content.
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}

export function PersonaPackDetailSkeletonPage({ packId }: { packId: string }) {
  return (
    <RoutePlaceholder
      {...withoutKey(contentRoutePlaceholders[8])}
      params={{ "Pack ID": packId }}
      routePath={`/persona-packs/${packId}`}
    />
  );
}

export function SettingsSkeletonPage() {
  return (
    <RoutePlaceholder
      {...withoutKey(contentRoutePlaceholders[9])}
      routePath="/settings"
    />
  );
}

function RouteDetailsCard({
  detail,
  params,
  routePath,
}: {
  detail: string;
  params?: Record<string, string>;
  routePath: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            Current route
          </p>
          <p className="font-mono text-sm">{routePath}</p>
        </div>

        {params ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            {Object.entries(params).map(([label, value]) => (
              <div key={label} className="rounded-lg border bg-background p-4">
                <dt className="text-sm font-medium text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-1 font-mono text-sm">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        <p className="text-sm leading-6 text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function withoutKey({
  key: _key,
  ...placeholder
}: (typeof contentRoutePlaceholders)[number]) {
  return placeholder;
}
