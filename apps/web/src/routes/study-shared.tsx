import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type StudyDetailSearch = {
  outcome: string | undefined;
  protoPersonaId: string | undefined;
  finalUrlContains: string | undefined;
  severity: string | undefined;
  axisKey: string | undefined;
  axisMin: number | undefined;
  axisMax: number | undefined;
  urlPrefix: string | undefined;
  runId: string | undefined;
};

export const emptyStudyDetailSearch: StudyDetailSearch = {
  outcome: undefined,
  protoPersonaId: undefined,
  finalUrlContains: undefined,
  severity: undefined,
  axisKey: undefined,
  axisMin: undefined,
  axisMax: undefined,
  urlPrefix: undefined,
  runId: undefined,
};

export const studyTabs = [
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

export function validateStudyDetailSearch(search: Record<string, unknown>) {
  return {
    outcome: normalizeOptionalString(search.outcome),
    protoPersonaId: normalizeOptionalString(search.protoPersonaId),
    finalUrlContains: normalizeOptionalString(search.finalUrlContains),
    severity: normalizeOptionalString(search.severity),
    axisKey: normalizeOptionalString(search.axisKey),
    axisMin: normalizeOptionalNumber(search.axisMin),
    axisMax: normalizeOptionalNumber(search.axisMax),
    urlPrefix: normalizeOptionalString(search.urlPrefix),
    runId: normalizeOptionalString(search.runId),
  };
}

export function StudyTabsNav({
  activeTab,
  detailSearch,
  studyId,
}: {
  activeTab: (typeof studyTabs)[number]["key"];
  detailSearch: StudyDetailSearch;
  studyId: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">
            Study detail tabs
          </p>
          <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
            Move between Overview, Personas, Runs, Findings, and Report without
            losing your current run filters.
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
              search={detailSearch}
              to={tab.to}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export function StudyStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide",
        status === "draft" && "bg-slate-200 text-slate-700",
        status === "persona_review" && "bg-violet-100 text-violet-800",
        status === "ready" && "bg-sky-100 text-sky-800",
        status === "queued" && "bg-amber-100 text-amber-800",
        status === "running" && "bg-blue-100 text-blue-800",
        status === "replaying" && "bg-indigo-100 text-indigo-800",
        status === "analyzing" && "bg-fuchsia-100 text-fuchsia-800",
        status === "completed" && "bg-emerald-100 text-emerald-800",
        status === "failed" && "bg-rose-100 text-rose-800",
        status === "cancelled" && "bg-zinc-200 text-zinc-700",
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function RunStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide",
        status === "queued" && "bg-amber-100 text-amber-800",
        status === "dispatching" && "bg-orange-100 text-orange-800",
        status === "running" && "bg-blue-100 text-blue-800",
        status === "success" && "bg-emerald-100 text-emerald-800",
        status === "hard_fail" && "bg-rose-100 text-rose-800",
        status === "soft_fail" && "bg-pink-100 text-pink-800",
        status === "gave_up" && "bg-violet-100 text-violet-800",
        status === "timeout" && "bg-yellow-100 text-yellow-800",
        status === "blocked_by_guardrail" && "bg-red-100 text-red-800",
        status === "infra_error" && "bg-slate-300 text-slate-800",
        status === "cancelled" && "bg-zinc-200 text-zinc-700",
      )}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function formatTimestamp(timestamp: number | undefined) {
  if (timestamp === undefined) {
    return "Not available";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export function formatDuration(durationSec: number | undefined) {
  if (durationSec === undefined) {
    return "Not available";
  }

  if (durationSec < 60) {
    return `${durationSec}s`;
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${minutes}m ${seconds}s`;
}

export function buildArtifactHref(key: string) {
  return `/artifacts/${encodeURIComponent(key)}`;
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();
  return normalizedValue.length > 0 ? normalizedValue : undefined;
}

function normalizeOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return undefined;
  }

  const parsedValue = Number(normalizedValue);

  return Number.isFinite(parsedValue) ? parsedValue : undefined;
}
