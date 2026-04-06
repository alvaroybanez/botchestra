import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import {
  StudyStatusBadge,
  RunStatusBadge,
} from "@/components/status-badge";
import { cn } from "@/lib/utils";

export { StudyStatusBadge, RunStatusBadge };

export type StudyDetailSearch = {
  outcome: string | undefined;
  syntheticUserId: string | undefined;
  finalUrlContains: string | undefined;
  severity: string | undefined;
  axisKey: string | undefined;
  axisMin: number | undefined;
  axisMax: number | undefined;
  urlPrefix: string | undefined;
  runId: string | undefined;
};

export type StudyReportSearch = StudyDetailSearch & {
  shared: boolean;
};

export const emptyStudyDetailSearch: StudyDetailSearch = {
  outcome: undefined,
  syntheticUserId: undefined,
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

export function validateStudyReportSearch(
  search: Record<string, unknown>,
): StudyReportSearch {
  return {
    ...validateStudyDetailSearch(search),
    shared: normalizeSharedFlag(search.shared),
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
    <div className="rounded-xl border bg-card p-6 shadow-card">
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
                "relative rounded-md px-3 py-2 font-label text-xs transition-colors",
                activeTab === tab.key
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
              params={{ studyId }}
              search={detailSearch}
              to={tab.to}
            >
              {activeTab === tab.key && (
                <motion.span
                  layoutId="study-tab-indicator"
                  className="absolute inset-0 rounded-md bg-primary shadow-card"
                  transition={{ type: "spring", visualDuration: 0.25, bounce: 0.15 }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
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

function normalizeSharedFlag(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}
