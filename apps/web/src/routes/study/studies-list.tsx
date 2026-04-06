import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { Doc } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { AnimatedList } from "@/components/domain/animated-list";
import { EmptyState } from "@/components/domain/empty-state";
import { PageHeader } from "@/components/domain/page-header";
import { StudyStatusBadge } from "@/components/domain/status-badge";
import { SummaryValue } from "@/components/domain/summary-value";
import {
  emptyStudyDetailSearch,
  formatTimestamp,
} from "@/routes/study-shared";

export function StudiesListPage() {
  const studies = useQuery(api.studies.listStudies, {});

  if (studies === undefined) {
    return (
      <section className="space-y-6">
        <PageHeader
          eyebrow="Study Console"
          title="Studies"
          description="Loading studies and run progress..."
        />
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Study Console"
        title="Studies"
        description="Browse every validation study, track orchestration progress, and jump into the overview, personas, runs, findings, and report tabs."
        actions={
          <Button asChild>
            <Link to="/studies/new">Create Study</Link>
          </Button>
        }
      />

      {studies.length === 0 ? (
        <EmptyState
          title="No studies yet"
          description="New workspaces start empty. Create your first study to define the task, persona coverage, and replay criteria for your next validation run."
          action={
            <Button asChild>
              <Link to="/studies/new">Create your first study</Link>
            </Button>
          }
        />
      ) : (
        <AnimatedList
          items={studies}
          keyExtractor={(study: Doc<"studies">) => study._id}
          renderItem={(study: Doc<"studies">) => (
            <StudyListCard study={study} />
          )}
        />
      )}
    </section>
  );
}

function StudyListCard({ study }: { study: Doc<"studies"> }) {
  const runSummary = useQuery(api.runs.getRunSummary, { studyId: study._id });

  const totalRuns = runSummary?.totalRuns ?? 0;
  const terminalCount = runSummary?.terminalCount ?? 0;
  const successCount = runSummary?.outcomeCounts?.success ?? 0;
  const completionPercent =
    totalRuns > 0 ? Math.round((terminalCount / totalRuns) * 100) : 0;
  const successRate =
    terminalCount > 0 ? Math.round((successCount / terminalCount) * 100) : 0;

  return (
    <Link
      className="block rounded-xl border bg-card p-6 shadow-sm transition-colors hover:border-primary hover:bg-muted/30"
      params={{ studyId: study._id }}
      search={emptyStudyDetailSearch}
      to="/studies/$studyId/overview"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold tracking-tight">
              {study.name}
            </h3>
            <StudyStatusBadge status={study.status} />
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {study.description ?? "No description provided yet."}
          </p>
        </div>

        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:min-w-80">
          <SummaryValue
            label="Run progress"
            variant="bordered"
            value={
              runSummary === undefined
                ? "Loading..."
                : `${terminalCount}/${totalRuns} terminal \u00b7 ${runSummary.runningCount} running \u00b7 ${runSummary.queuedCount} queued`
            }
          />
          <SummaryValue
            label="Run budget"
            variant="bordered"
            value={String(study.runBudget ?? 0)}
          />
          <SummaryValue
            label="Completion"
            variant="bordered"
            value={
              runSummary === undefined
                ? "Loading..."
                : `${completionPercent}%`
            }
          />
          <SummaryValue
            label="Success rate"
            variant="bordered"
            value={
              runSummary === undefined
                ? "Loading..."
                : terminalCount > 0
                  ? `${successRate}%`
                  : "N/A"
            }
          />
          <SummaryValue
            label="Environment"
            variant="bordered"
            value={study.taskSpec.environmentLabel}
          />
          <SummaryValue
            label="Last updated"
            variant="bordered"
            value={formatTimestamp(study.updatedAt)}
          />
        </div>
      </div>
    </Link>
  );
}
