type RoutePlaceholderProps = {
  title: string;
  routePath: string;
  description: string;
  detail: string;
  params?: Record<string, string>;
};

export const contentRoutePlaceholders = [
  {
    key: "studies",
    title: "Studies",
    description: "Browse every validation study from the shared studies index.",
    detail:
      "This placeholder marks the future studies list where researchers will launch and monitor study runs.",
  },
  {
    key: "studies-new",
    title: "Create Study",
    description: "Start a brand new study from the study creation flow.",
    detail:
      "This placeholder reserves the study setup wizard for task specs, run budgets, and guardrails.",
  },
  {
    key: "study-overview",
    title: "Study Overview",
    description: "Review the high-level status and summary for a single study.",
    detail:
      "This placeholder represents the study overview tab that will surface lifecycle progress and metadata.",
  },
  {
    key: "study-personas",
    title: "Study Personas",
    description: "Inspect the persona coverage selected for an individual study.",
    detail:
      "This placeholder stands in for the personas tab where generated participants and coverage will appear.",
  },
  {
    key: "study-runs",
    title: "Study Runs",
    description: "Track run execution details and outcomes for a specific study.",
    detail:
      "This placeholder identifies the runs tab where live execution progress and replay evidence will live.",
  },
  {
    key: "study-findings",
    title: "Study Findings",
    description: "Explore synthesized issues discovered for the selected study.",
    detail:
      "This placeholder marks the findings explorer that will group evidence-backed usability issues.",
  },
  {
    key: "study-report",
    title: "Study Report",
    description: "Read the ranked research summary for a completed study.",
    detail:
      "This placeholder is reserved for the final report page with headline metrics and prioritized findings.",
  },
  {
    key: "persona-configs",
    title: "Persona Configurations",
    description: "Manage reusable persona configurations from the persona configuration library.",
    detail:
      "This placeholder reserves the persona configuration list that will organize draft, published, and archived persona configurations.",
  },
  {
    key: "persona-config-detail",
    title: "Persona Configuration Detail",
    description: "Inspect the details for one selected persona configuration.",
    detail:
      "This placeholder stands in for the persona configuration detail page that will show persona configuration metadata and variants.",
  },
  {
    key: "settings",
    title: "Settings",
    description: "Configure workspace-level behavior and credentials from settings.",
    detail:
      "This placeholder marks the settings surface for environment controls, secrets, and future admin tools.",
  },
] as const;

export function RoutePlaceholder({
  title,
  routePath,
  description,
  detail,
  params,
}: RoutePlaceholderProps) {
  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Placeholder Route
        </p>
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight">{title}</h2>
          <p className="max-w-2xl text-base text-muted-foreground">
            {description}
          </p>
        </div>
      </div>

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
    </section>
  );
}

export function NotFoundPlaceholder() {
  return (
    <section className="space-y-3">
      <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Route Fallback
      </p>
      <h2 className="text-3xl font-semibold tracking-tight">Page not found</h2>
      <p className="max-w-2xl text-muted-foreground">
        The route you requested is not defined in the Botchestra app shell yet.
      </p>
    </section>
  );
}
