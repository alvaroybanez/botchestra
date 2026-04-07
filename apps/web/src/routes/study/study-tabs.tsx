import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import type { StudyDetailSearch } from "@/routes/study-shared";

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

type StudyTabKey = (typeof studyTabs)[number]["key"];

const tabIndicatorTransition = {
  type: "spring" as const,
  visualDuration: 0.25,
  bounce: 0.15,
};

function StudyTabs({
  activeTab,
  detailSearch,
  studyId,
}: {
  activeTab: StudyTabKey;
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
          {studyTabs.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <Link
                key={tab.key}
                className={cn(
                  "relative rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
                params={{ studyId }}
                search={detailSearch}
                to={tab.to}
              >
                {isActive ? (
                  <motion.span
                    data-testid="study-tabs-active-indicator"
                    layoutId="study-tabs-active-indicator"
                    transition={tabIndicatorTransition}
                    className="absolute inset-0 rounded-md bg-primary"
                  />
                ) : null}
                <span className="relative z-10">{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { StudyTabs, studyTabs };
export type { StudyTabKey };
