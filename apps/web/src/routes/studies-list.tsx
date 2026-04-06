import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { Doc } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import {
  StudyStatusBadge,
  emptyStudyDetailSearch,
  formatTimestamp,
} from "@/routes/study-shared";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { SummaryValue } from "@/components/summary-value";
import { Button } from "@/components/ui/button";
import { AnimatedList } from "@/components/animated-list";

export function StudiesListPage() {
  const studies = useQuery(api.studies.listStudies, {});

  if (studies === undefined) {
    return (
      <EmptyState
        title="Studies"
        description="Loading studies and run progress..."
      />
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
          renderItem={(study: Doc<"studies">) => <StudyListCard study={study} />}
          className="grid gap-4"
        />
      )}
    </section>
  );
}

function StudyListCard({ study }: { study: Doc<"studies"> }) {
  const runSummary = useQuery(api.runs.getRunSummary, { studyId: study._id });

  return (
    <Link
      className="group block rounded-xl bg-card p-6 shadow-card transition-all hover:shadow-dropdown"
      params={{ studyId: study._id }}
      search={emptyStudyDetailSearch}
      to="/studies/$studyId/overview"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-heading text-xl tracking-tight">{study.name}</h3>
            <StudyStatusBadge status={study.status} />
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {study.description ?? "No description provided yet."}
          </p>
        </div>

        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:min-w-80">
          <SummaryValue
            label="Run progress"
            value={
              runSummary === undefined
                ? "Loading..."
                : `${runSummary.terminalCount}/${runSummary.totalRuns} terminal · ${runSummary.runningCount} running · ${runSummary.queuedCount} queued`
            }
          />
          <SummaryValue
            label="Run budget"
            value={String(study.runBudget ?? 0)}
          />
          <SummaryValue
            label="Environment"
            value={study.taskSpec.environmentLabel}
          />
          <SummaryValue
            label="Last updated"
            value={formatTimestamp(study.updatedAt)}
          />
        </div>
      </div>
    </Link>
  );
}
