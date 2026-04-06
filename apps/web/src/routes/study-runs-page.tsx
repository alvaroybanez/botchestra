import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { motion } from "motion/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SummaryValue, SummaryGrid } from "@/components/summary-value";
import { FilterBar, FilterSelect, FilterSearch } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { DEMO_STUDY_ID } from "@/routes/skeleton-pages";
import {
  demoRunDetailsById,
  demoRuns,
  type DemoRunDetail,
  type DemoRunListItem,
} from "@/routes/study-demo-data";
import {
  RunStatusBadge,
  StudyOverviewLinkButton,
  StudyTabsNav,
  formatDuration,
  formatTimestamp,
  type StudyDetailSearch,
} from "@/routes/study-shared";

const outcomeOptions = [
  "success",
  "hard_fail",
  "soft_fail",
  "gave_up",
  "timeout",
  "blocked_by_guardrail",
  "infra_error",
  "cancelled",
  "queued",
  "dispatching",
  "running",
] as const;

type RunListItem = DemoRunListItem;
type RunDetailData = DemoRunDetail;

export function StudyRunsPage({
  detailSearch,
  onSearchChange,
  studyId,
}: {
  detailSearch: StudyDetailSearch;
  onSearchChange: (patch: Partial<StudyDetailSearch>) => void;
  studyId: string;
}) {
  if (studyId === DEMO_STUDY_ID) {
    const filteredDemoRuns = filterRuns(demoRuns, detailSearch);

    return (
      <ResolvedStudyRunsPage
        allRuns={demoRuns}
        detailSearch={detailSearch}
        filteredRuns={filteredDemoRuns}
        onSearchChange={onSearchChange}
        studyId={studyId}
      />
    );
  }

  const allRuns = useQuery(api.runs.listRuns, {
    studyId: studyId as Id<"studies">,
  });
  const filteredRuns = useQuery(api.runs.listRuns, {
    studyId: studyId as Id<"studies">,
    ...(detailSearch.outcome ? { outcome: detailSearch.outcome as never } : {}),
    ...(detailSearch.syntheticUserId
      ? { syntheticUserId: detailSearch.syntheticUserId as Id<"syntheticUsers"> }
      : {}),
    ...(detailSearch.finalUrlContains
      ? { finalUrlContains: detailSearch.finalUrlContains }
      : {}),
  });

  if (filteredRuns === undefined || allRuns === undefined) {
    return (
      <EmptyState
        description="Loading study runs and filters..."
        title="Runs"
      />
    );
  }

  return (
    <ResolvedStudyRunsPage
      allRuns={allRuns}
      detailSearch={detailSearch}
      filteredRuns={filteredRuns}
      onSearchChange={onSearchChange}
      studyId={studyId}
    />
  );
}

function ResolvedStudyRunsPage({
  allRuns,
  filteredRuns,
  detailSearch,
  onSearchChange,
  studyId,
}: {
  allRuns: RunListItem[] | DemoRunListItem[];
  filteredRuns: RunListItem[] | DemoRunListItem[];
  detailSearch: StudyDetailSearch;
  onSearchChange: (patch: Partial<StudyDetailSearch>) => void;
  studyId: string;
}) {
  const personaOptions = useMemo(() => {
    const personaMap = new Map<string, string>();

    for (const run of allRuns) {
      if (!personaMap.has(run.syntheticUserId)) {
        personaMap.set(run.syntheticUserId, run.syntheticUserName);
      }
    }

    return [...personaMap.entries()].map(([id, name]) => ({ id, name }));
  }, [allRuns]);

  const selectedRunId = getSelectedRunId(filteredRuns, detailSearch.runId);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Run inspection"
        title="Runs"
        description="Filter runs by outcome, persona, or URL, then inspect the selected run's persona summary, milestone timeline, self-report, and artifact links."
        actions={
          <>
            <StudyOverviewLinkButton
              detailSearch={detailSearch}
              studyId={studyId}
            />
            <Button asChild variant="outline">
              <Link to="/studies">Back to Studies</Link>
            </Button>
          </>
        }
      />

      <StudyTabsNav
        activeTab="runs"
        detailSearch={detailSearch}
        studyId={studyId}
      />

      <FilterBar title="Filter runs" columns="lg:grid-cols-4">
        <FilterSelect
          id="run-outcome-filter"
          label="Outcome"
          placeholder="All outcomes"
          value={detailSearch.outcome ?? ""}
          options={outcomeOptions.map((status) => ({
            value: status,
            label: status.replaceAll("_", " "),
          }))}
          onChange={(value) => onSearchChange({ outcome: value || undefined })}
        />
        <FilterSelect
          id="run-persona-filter"
          label="Persona"
          placeholder="All synthetic users"
          value={detailSearch.syntheticUserId ?? ""}
          options={personaOptions.map((persona) => ({
            value: persona.id,
            label: persona.name,
          }))}
          onChange={(value) =>
            onSearchChange({ syntheticUserId: value || undefined })
          }
        />
        <FilterSearch
          id="run-url-filter"
          label="URL contains"
          placeholder="checkout/address"
          value={detailSearch.finalUrlContains ?? ""}
          onChange={(value) =>
            onSearchChange({ finalUrlContains: value || undefined })
          }
          className="lg:col-span-2"
        />
      </FilterBar>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Filtered runs ({filteredRuns.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {filteredRuns.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background p-6">
                <p className="text-sm leading-6 text-muted-foreground">
                  No runs match the current filters. Clear or change a filter to
                  review a different set of runs.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredRuns.map((run, index) => (
                  <motion.button
                    key={run._id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.04, type: "spring", visualDuration: 0.25, bounce: 0.1 }}
                    className={
                      run._id === selectedRunId
                        ? selectedRunClassName
                        : runClassName
                    }
                    type="button"
                    onClick={() => onSearchChange({ runId: run._id })}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1 text-left">
                        <p className="font-medium">{run.syntheticUserName}</p>
                        <p className="text-xs text-muted-foreground">
                          {run.firstPersonBio}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {(run.status === "running" || run.status === "dispatching") && (
                          <span className="relative flex size-2">
                            <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex size-2 rounded-full bg-blue-500" />
                          </span>
                        )}
                        <RunStatusBadge status={run.status} />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 text-left sm:grid-cols-2">
                      <SummaryValue
                        label="Final URL"
                        value={run.finalUrl ?? "Not available"}
                      />
                      <SummaryValue
                        label="Duration"
                        value={formatDuration(run.durationSec)}
                      />
                      <SummaryValue
                        label="Steps"
                        value={String(run.stepCount ?? 0)}
                      />
                      <SummaryValue
                        label="Outcome"
                        value={run.finalOutcome ?? run.status}
                      />
                    </div>
                  </motion.button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {selectedRunId ? (
          <RunDetail runId={selectedRunId} />
        ) : (
          <EmptyState
            title="Run detail"
            description="Select a run to inspect persona details, milestones, self-report answers, and artifacts."
          />
        )}
      </div>
    </section>
  );
}

function RunDetail({ runId }: { runId: string }) {
  if (runId in demoRunDetailsById) {
    return <ResolvedRunDetail runDetail={demoRunDetailsById[runId]!} />;
  }

  const runDetail = useQuery(api.runs.getRun, {
    runId: runId as Id<"runs">,
  });

  if (runDetail === undefined) {
    return (
      <EmptyState title="Run detail" description="Loading run detail..." />
    );
  }

  if (runDetail === null) {
    return (
      <EmptyState
        title="Run detail"
        description="The selected run could not be found."
      />
    );
  }

  return <ResolvedRunDetail runDetail={runDetail as RunDetailData} />;
}

function ResolvedRunDetail({
  runDetail,
}: {
  runDetail: RunDetailData;
}) {
  const { milestones, personaVariant, syntheticUser, run } = runDetail;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle>Run detail</CardTitle>
          <RunStatusBadge status={run.status} />
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">Persona summary</h3>
            <p className="text-sm text-muted-foreground">{syntheticUser.name}</p>
          </div>
          <p className="rounded-lg border bg-background p-4 text-sm leading-6 text-muted-foreground">
            {personaVariant.firstPersonBio}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {personaVariant.axisValues.map((axisValue) => (
              <SummaryValue
                key={`${personaVariant._id}-${axisValue.key}`}
                label={axisValue.key}
                value={String(axisValue.value)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Milestone timeline</h3>
          {milestones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No milestones have been captured for this run yet.
            </p>
          ) : (
            <div className="space-y-4">
              {milestones.map((milestone) => (
                <div
                  key={milestone._id}
                  className="rounded-lg border bg-background p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-medium">
                      Step {milestone.stepIndex}: {milestone.title}
                    </p>
                    <span className="text-xs text-muted-foreground">
                      {formatTimestamp(milestone.timestamp)}
                    </span>
                  </div>
                  <SummaryGrid columns="sm:grid-cols-2" className="mt-3">
                    <SummaryValue label="URL" value={milestone.url} />
                    <SummaryValue label="Action" value={milestone.actionType} />
                    <SummaryValue
                      label="Rationale"
                      value={milestone.rationaleShort}
                    />
                    <SummaryValue
                      label="Screenshot"
                      value={milestone.screenshotKey ?? "Not available"}
                    />
                  </SummaryGrid>
                  {milestone.screenshotKey ? (
                    <a
                      className="mt-3 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
                      href={resolveArtifactHref(
                        (milestone as typeof milestone & {
                          screenshotUrl?: string | null;
                        }).screenshotUrl,
                        milestone.screenshotKey,
                      )}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Open screenshot link
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Self-report</h3>
          {run.selfReport ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <SummaryValue
                label="Perceived success"
                value={String(run.selfReport.perceivedSuccess)}
              />
              <SummaryValue
                label="Hardest part"
                value={run.selfReport.hardestPart ?? "Not provided"}
              />
              <SummaryValue
                label="Confusion"
                value={run.selfReport.confusion ?? "Not provided"}
              />
              <SummaryValue
                label="Confidence"
                value={
                  run.selfReport.confidence !== undefined
                    ? String(run.selfReport.confidence)
                    : "Not provided"
                }
              />
              <SummaryValue
                label="Suggested change"
                value={run.selfReport.suggestedChange ?? "Not provided"}
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No self-report answers have been captured for this run.
            </p>
          )}
        </section>

        <section className="space-y-4">
          <h3 className="text-lg font-semibold">Artifact links</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryValue
              label="Artifact manifest"
              value={run.artifactManifestKey ?? "Not available"}
            />
            <SummaryValue
              label="Summary"
              value={run.summaryKey ?? "Not available"}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            {run.artifactManifestKey ? (
              <ArtifactLink
                href={resolveArtifactHref(
                  (run as typeof run & { artifactManifestUrl?: string | null })
                    .artifactManifestUrl,
                  run.artifactManifestKey,
                )}
                label="Open artifact manifest"
              />
            ) : null}
            {run.summaryKey ? (
              <ArtifactLink
                href={resolveArtifactHref(
                  (run as typeof run & { summaryUrl?: string | null }).summaryUrl,
                  run.summaryKey,
                )}
                label="Open run summary"
              />
            ) : null}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function getSelectedRunId(
  filteredRuns: readonly { _id: string }[],
  requestedRunId: string | undefined,
) {
  if (requestedRunId) {
    return requestedRunId;
  }

  return filteredRuns[0]?._id ?? null;
}

function resolveArtifactHref(
  resolvedUrl: string | null | undefined,
  fallbackKey: string | undefined,
) {
  if (resolvedUrl) {
    return resolvedUrl;
  }

  if (fallbackKey?.startsWith("data:")) {
    return fallbackKey;
  }

  return "#";
}

function filterRuns(
  runs: readonly DemoRunListItem[],
  detailSearch: StudyDetailSearch,
) {
  return runs.filter((run) => {
    if (
      detailSearch.outcome !== undefined &&
      run.status !== detailSearch.outcome
    ) {
      return false;
    }

    if (
      detailSearch.syntheticUserId !== undefined &&
      run.syntheticUserId !== detailSearch.syntheticUserId
    ) {
      return false;
    }

    if (
      detailSearch.finalUrlContains !== undefined &&
      !(run.finalUrl?.includes(detailSearch.finalUrlContains) ?? false)
    ) {
      return false;
    }

    return true;
  });
}

function ArtifactLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      className="inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {label}
    </a>
  );
}

const runClassName =
  "w-full rounded-xl bg-card p-4 text-left shadow-card transition-colors hover:border-primary hover:bg-muted/30";

const selectedRunClassName =
  "w-full rounded-xl border border-primary bg-primary/5 p-4 text-left shadow-card";
