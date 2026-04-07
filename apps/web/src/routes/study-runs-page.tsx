import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import {
  FilterBar,
  FilterSearch,
  FilterSelect,
} from "@/components/domain/filter-bar";
import { RunStatusBadge } from "@/components/domain/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEMO_STUDY_ID,
  demoRunDetailsById,
  demoRuns,
  type DemoRunDetail,
  type DemoRunListItem,
} from "@/routes/study-demo-data";
import {
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
        detailSearch={detailSearch}
        filteredRuns={filteredDemoRuns}
        onSearchChange={onSearchChange}
        studyId={studyId}
      />
    );
  }

  const runsForSelectedOutcome = useQuery(api.runs.listRuns, {
    studyId: studyId as Id<"studies">,
    ...(detailSearch.outcome ? { outcome: detailSearch.outcome as never } : {}),
  });

  if (runsForSelectedOutcome === undefined) {
    return (
      <StateCard
        body="Loading study runs and filters..."
        title="Runs"
      />
    );
  }

  const filteredRuns = filterRuns(runsForSelectedOutcome, detailSearch);

  return (
    <ResolvedStudyRunsPage
      detailSearch={detailSearch}
      filteredRuns={filteredRuns}
      onSearchChange={onSearchChange}
      studyId={studyId}
    />
  );
}

function ResolvedStudyRunsPage({
  filteredRuns,
  detailSearch,
  onSearchChange,
  studyId,
}: {
  filteredRuns: RunListItem[] | DemoRunListItem[];
  detailSearch: StudyDetailSearch;
  onSearchChange: (patch: Partial<StudyDetailSearch>) => void;
  studyId: string;
}) {
  const selectedRunId = getSelectedRunId(filteredRuns, detailSearch.runId);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Run inspection
          </p>
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight">Runs</h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Filter runs by outcome and persona name, then inspect the selected
              run&apos;s persona summary, milestones, self-report, and artifact
              links.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <StudyOverviewLinkButton
            detailSearch={detailSearch}
            studyId={studyId}
          />
          <Button asChild variant="outline">
            <Link to="/studies">Back to Studies</Link>
          </Button>
        </div>
      </div>

      <StudyTabsNav
        activeTab="runs"
        detailSearch={detailSearch}
        studyId={studyId}
      />

      <FilterBar
        title="Filter runs"
        columns="md:grid-cols-[220px_minmax(0,1fr)]"
        footer={(
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Showing {filteredRuns.length} run{filteredRuns.length === 1 ? "" : "s"}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                onSearchChange({
                  outcome: undefined,
                  personaName: undefined,
                })
              }
            >
              Clear filters
            </Button>
          </div>
        )}
      >
        <FilterSelect
          id="run-outcome-filter"
          label="Outcome"
          placeholder="All outcomes"
          value={detailSearch.outcome ?? ""}
          options={outcomeOptions.map((status) => ({
            label: status.replaceAll("_", " "),
            value: status,
          }))}
          onChange={(value) =>
            onSearchChange({
              outcome: value || undefined,
            })
          }
        />
        <FilterSearch
          id="run-persona-name-filter"
          label="Persona name search"
          placeholder="Search persona names"
          value={detailSearch.personaName ?? ""}
          onChange={(value) =>
            onSearchChange({
              personaName: value || undefined,
            })
          }
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
              filteredRuns.map((run) => (
                <button
                  key={run._id}
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
                    <RunStatusBadge status={run.status} />
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
                </button>
              ))
            )}
          </CardContent>
        </Card>

        {selectedRunId ? (
          <RunDetail runId={selectedRunId} />
        ) : (
          <StateCard
            body="Select a run to inspect persona details, milestones, self-report answers, and artifacts."
            title="Run detail"
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
    return <StateCard body="Loading run detail..." title="Run detail" />;
  }

  if (runDetail === null) {
    return (
      <StateCard
        body="The selected run could not be found."
        title="Run detail"
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
                  <dl className="mt-3 grid gap-3 sm:grid-cols-2">
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
                  </dl>
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
  if (
    requestedRunId &&
    filteredRuns.some((run) => run._id === requestedRunId)
  ) {
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
  runs: readonly DemoRunListItem[] | readonly RunListItem[],
  detailSearch: StudyDetailSearch,
) {
  const normalizedPersonaName = detailSearch.personaName?.trim().toLowerCase();

  return runs.filter((run) => {
    if (
      detailSearch.outcome !== undefined &&
      run.status !== detailSearch.outcome
    ) {
      return false;
    }

    if (
      normalizedPersonaName !== undefined &&
      normalizedPersonaName.length > 0 &&
      !run.syntheticUserName.toLowerCase().includes(normalizedPersonaName)
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

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function StateCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

const runClassName =
  "w-full rounded-xl border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary hover:bg-muted/30";

const selectedRunClassName =
  "w-full rounded-xl border border-primary bg-primary/5 p-4 text-left shadow-sm";
