import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { StudyTabs, type StudyTabKey } from "@/routes/study/study-tabs";

export type StudyDetailSearch = {
  outcome: string | undefined;
  personaName: string | undefined;
  syntheticUserId: string | undefined;
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
  personaName: undefined,
  syntheticUserId: undefined,
  finalUrlContains: undefined,
  severity: undefined,
  axisKey: undefined,
  axisMin: undefined,
  axisMax: undefined,
  urlPrefix: undefined,
  runId: undefined,
};

export { studyTabs } from "@/routes/study/study-tabs";

export function validateStudyDetailSearch(search: Record<string, unknown>) {
  return {
    outcome: normalizeOptionalString(search.outcome),
    personaName: normalizeOptionalString(search.personaName),
    syntheticUserId: normalizeOptionalString(search.syntheticUserId),
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
  activeTab: StudyTabKey;
  detailSearch: StudyDetailSearch;
  studyId: string;
}) {
  return (
    <StudyTabs
      activeTab={activeTab}
      detailSearch={detailSearch}
      studyId={studyId}
    />
  );
}

export function StudyOverviewLinkButton({
  detailSearch,
  studyId,
}: {
  detailSearch: StudyDetailSearch;
  studyId: string;
}) {
  return (
    <Button asChild variant="outline">
      <Link
        params={{ studyId }}
        search={detailSearch}
        to="/studies/$studyId/overview"
      >
        Go to Overview
      </Link>
    </Button>
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

export { formatDuration, formatTimestamp } from "@/lib/utils";

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

