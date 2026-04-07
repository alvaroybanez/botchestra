import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import {
  FilterBar,
  FilterSearch,
  FilterSelect,
} from "@/components/domain/filter-bar";
import { PageHeader } from "@/components/domain/page-header";
import { SeverityBadge } from "@/components/domain/status-badge";
import { StateCard } from "@/components/domain/state-card";
import { SummaryValue } from "@/components/domain/summary-value";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEMO_STUDY_ID,
  demoFindings,
  demoStudySummary,
  type DemoFinding,
  type DemoStudySummary,
} from "@/routes/study-demo-data";
import {
  StudyOverviewLinkButton,
  StudyStatusBadge,
  StudyTabsNav,
  emptyStudyDetailSearch,
  formatTimestamp,
  type StudyDetailSearch,
} from "@/routes/study-shared";

const severityOptions = [
  "blocker",
  "major",
  "minor",
  "cosmetic",
] as const;

const outcomeOptions = [
  "queued",
  "dispatching",
  "running",
  "success",
  "hard_fail",
  "soft_fail",
  "gave_up",
  "timeout",
  "blocked_by_guardrail",
  "infra_error",
  "cancelled",
] as const;

type FindingsStudySummary = Pick<
  Doc<"studies">,
  "_id" | "name" | "status" | "runBudget" | "updatedAt"
> | DemoStudySummary;

type FindingsView = DemoFinding & {
  score?: number;
};

export function StudyFindingsPage({
  detailSearch,
  onSearchChange,
  studyId,
}: {
  detailSearch: StudyDetailSearch;
  onSearchChange: (patch: Partial<StudyDetailSearch>) => void;
  studyId: string;
}) {
  if (studyId === DEMO_STUDY_ID) {
    return (
      <ResolvedStudyFindingsPage
        detailSearch={detailSearch}
        findings={demoFindings}
        onSearchChange={onSearchChange}
        study={demoStudySummary}
      />
    );
  }

  const study = useQuery(api.studies.getStudy, {
    studyId: studyId as Id<"studies">,
  });
  const findings = useQuery(api.analysisQueries.listFindings, {
    studyId: studyId as Id<"studies">,
  });

  if (study === undefined || findings === undefined) {
    return (
      <StateCard
        description="Loading analysis findings, filters, and representative evidence..."
        title="Findings"
      />
    );
  }

  if (study === null) {
    return (
      <StateCard
        description="This study could not be found in the current organization."
        title="Study not found"
      />
    );
  }

  return (
    <LiveStudyFindingsContent
      detailSearch={detailSearch}
      findings={findings as FindingsView[]}
      onSearchChange={onSearchChange}
      study={study}
    />
  );
}

function LiveStudyFindingsContent({
  study,
  findings,
  detailSearch,
  onSearchChange,
}: {
  study: FindingsStudySummary;
  findings: FindingsView[];
  detailSearch: StudyDetailSearch;
  onSearchChange: (patch: Partial<StudyDetailSearch>) => void;
}) {
  const artifactKeys = useMemo(
    () =>
      [...new Set(findings.flatMap((finding) => finding.evidence.map((evidence) => evidence.fullResolutionKey)))],
    [findings],
  );
  const resolvedArtifactUrls = useQuery(api.analysisQueries.resolveArtifactUrls, {
    studyId: study._id as Id<"studies">,
    keys: artifactKeys,
  });

  if (resolvedArtifactUrls === undefined) {
    return (
      <StateCard
        description="Resolving evidence artifact URLs for this study..."
        title="Findings"
      />
    );
  }

  return (
    <ResolvedStudyFindingsPage
      detailSearch={detailSearch}
      findings={findings}
      onSearchChange={onSearchChange}
      resolvedArtifactUrls={resolvedArtifactUrls}
      study={study}
    />
  );
}

function ResolvedStudyFindingsPage({
  study,
  findings,
  detailSearch,
  onSearchChange,
  resolvedArtifactUrls = {},
}: {
  study: FindingsStudySummary;
  findings: FindingsView[];
  detailSearch: StudyDetailSearch;
  onSearchChange: (patch: Partial<StudyDetailSearch>) => void;
  resolvedArtifactUrls?: Record<string, string>;
}) {
  const axisRangeIsInvalid =
    detailSearch.axisMin !== undefined &&
    detailSearch.axisMax !== undefined &&
    detailSearch.axisMin > detailSearch.axisMax;

  const filteredFindings = useMemo(
    () =>
      filterFindings(findings, {
        ...detailSearch,
        ...(axisRangeIsInvalid
          ? {
              axisMax: undefined,
              axisMin: undefined,
            }
          : {}),
      }),
    [axisRangeIsInvalid, detailSearch, findings],
  );

  const syntheticUserOptions = useMemo(() => {
    const syntheticUsers = new Map<string, string>();

    for (const finding of findings) {
      for (const syntheticUser of finding.affectedSyntheticUsers) {
        syntheticUsers.set(syntheticUser._id, syntheticUser.name);
      }
    }

    return [...syntheticUsers.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [findings]);

  const axisKeys = useMemo(() => {
    const keys = new Set<string>();

    for (const finding of findings) {
      for (const axisRange of finding.affectedAxisRanges) {
        keys.add(axisRange.key);
      }
    }

    return [...keys].sort((left, right) => left.localeCompare(right));
  }, [findings]);

  const findingsBySeverity = useMemo(() => {
    return severityOptions.reduce<Record<(typeof severityOptions)[number], number>>(
      (accumulator, severity) => ({
        ...accumulator,
        [severity]: filteredFindings.filter((finding) => finding.severity === severity).length,
      }),
      {
        blocker: 0,
        major: 0,
        minor: 0,
        cosmetic: 0,
      },
    );
  }, [filteredFindings]);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Findings Explorer"
        title="Findings"
        badge={<StudyStatusBadge status={study.status} />}
        description="Filter issue clusters by severity, synthetic user, axis range, outcome, and URL prefix. Drill into representative runs and open evidence links for each cluster."
        actions={(
          <>
            <StudyOverviewLinkButton
              detailSearch={detailSearch}
              studyId={study._id}
            />
            <Button asChild variant="outline">
              <Link to="/studies">Back to Studies</Link>
            </Button>
          </>
        )}
      />

      <StudyTabsNav
        activeTab="findings"
        detailSearch={detailSearch}
        studyId={study._id}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <FilterBar
            title="Filter findings"
            columns="lg:grid-cols-2"
            footer={(
              <div className="mt-4 space-y-3 border-t pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-muted-foreground">
                    Showing {filteredFindings.length} of {findings.length} clusters
                  </p>
                  <Button
                    onClick={() =>
                      onSearchChange({
                        ...emptyStudyDetailSearch,
                      })
                    }
                    type="button"
                    variant="outline"
                  >
                    Clear filters
                  </Button>
                </div>

                {axisRangeIsInvalid ? (
                  <p className="text-sm text-destructive">
                    Axis min cannot be greater than axis max.
                  </p>
                ) : null}
              </div>
            )}
          >
            <FilterSelect
              id="finding-severity-filter"
              label="Severity"
              placeholder="All severities"
              value={detailSearch.severity ?? ""}
              options={severityOptions.map((severity) => ({
                label: formatStatusLabel(severity),
                value: severity,
              }))}
              onChange={(value) =>
                onSearchChange({
                  severity: value || undefined,
                })
              }
            />

            <FilterSelect
              id="finding-persona-filter"
              label="Synthetic user"
              placeholder="All synthetic users"
              value={detailSearch.syntheticUserId ?? ""}
              options={syntheticUserOptions.map((persona) => ({
                label: persona.name,
                value: persona.id,
              }))}
              onChange={(value) =>
                onSearchChange({
                  syntheticUserId: value || undefined,
                })
              }
            />

            <FilterSelect
              id="finding-axis-key-filter"
              label="Axis key"
              placeholder="Any axis"
              value={detailSearch.axisKey ?? ""}
              options={axisKeys.map((axisKey) => ({
                label: axisKey,
                value: axisKey,
              }))}
              onChange={(value) =>
                onSearchChange({
                  axisKey: value || undefined,
                })
              }
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FilterSearch
                id="finding-axis-min-filter"
                label="Axis min"
                max="1"
                min="-1"
                placeholder="-1"
                step="0.1"
                type="number"
                value={detailSearch.axisMin?.toString() ?? ""}
                onChange={(value) =>
                  onSearchChange({
                    axisMin: toOptionalNumber(value),
                  })
                }
              />
              <FilterSearch
                id="finding-axis-max-filter"
                label="Axis max"
                max="1"
                min="-1"
                placeholder="1"
                step="0.1"
                type="number"
                value={detailSearch.axisMax?.toString() ?? ""}
                onChange={(value) =>
                  onSearchChange({
                    axisMax: toOptionalNumber(value),
                  })
                }
              />
            </div>

            <FilterSelect
              id="finding-outcome-filter"
              label="Outcome"
              placeholder="All outcomes"
              value={detailSearch.outcome ?? ""}
              options={outcomeOptions.map((outcome) => ({
                label: formatStatusLabel(outcome),
                value: outcome,
              }))}
              onChange={(value) =>
                onSearchChange({
                  outcome: value || undefined,
                })
              }
            />

            <FilterSearch
              id="finding-url-prefix-filter"
              label="URL prefix"
              placeholder="https://example.com/checkout"
              value={detailSearch.urlPrefix ?? ""}
              onChange={(value) =>
                onSearchChange({
                  urlPrefix: value || undefined,
                })
              }
            />
          </FilterBar>

          {findings.length === 0 ? (
            <StateCard
              description="No issue clusters are available yet. Findings will appear after the analysis pipeline completes."
              title="No findings yet"
            />
          ) : filteredFindings.length === 0 ? (
            <StateCard
              description="No findings match the current filter combination. Clear or adjust a filter to broaden the result set."
              title="No matching findings"
            />
          ) : (
            <div className="space-y-4">
              {filteredFindings.map((finding) => (
                <FindingCard
                  key={finding._id}
                  finding={finding}
                  resolvedArtifactUrls={resolvedArtifactUrls}
                  studyId={study._id}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Study snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <SummaryValue label="Study" value={study.name} />
              <SummaryValue label="Run budget" value={String(study.runBudget)} />
              <SummaryValue
                label="Last updated"
                value={formatTimestamp(study.updatedAt)}
              />
              <SummaryValue
                label="Filtered clusters"
                value={formatFindingCount(filteredFindings.length)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Severity mix</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {severityOptions.map((severity) => (
                <SummaryValue
                  key={severity}
                  label={formatStatusLabel(severity)}
                  value={formatFindingCount(findingsBySeverity[severity])}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function FindingCard({
  finding,
  studyId,
  resolvedArtifactUrls,
}: {
  finding: FindingsView;
  studyId: string;
  resolvedArtifactUrls: Record<string, string>;
}) {
  const representativeQuotes = unique(
    finding.representativeRuns
      .map((run) => run.representativeQuote)
      .filter((quote): quote is string => Boolean(quote)),
  );

  return (
    <Card data-testid="finding-card">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={finding.severity} />
              <span className="text-sm text-muted-foreground">
                {finding.affectedRunCount} affected runs ·{" "}
                {Math.round(finding.affectedRunRate * 100)}% affected rate
              </span>
            </div>
            <CardTitle className="text-xl break-words">
              {formatGeneratedText(finding.title)}
            </CardTitle>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {formatGeneratedText(finding.summary)}
            </p>
          </div>

          <div
            className="flex min-w-[260px] flex-row gap-2 sm:min-w-[320px]"
            data-testid="finding-metric-pills"
          >
            <div className="flex-1 rounded-lg border bg-background px-3 py-2 text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Replay confidence
              </p>
              <p className="text-lg font-semibold">
                {Math.round(finding.replayConfidence * 100)}%
              </p>
            </div>
            <div className="flex-1 rounded-lg border bg-background px-3 py-2 text-right">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Impact score
              </p>
              <p className="text-lg font-semibold">
                {formatImpactScore(finding.score)}
              </p>
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-background p-4">
            <dt className="text-sm font-medium text-muted-foreground">
              Affected segments
            </dt>
            <dd className="mt-2">
              {finding.affectedSyntheticUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No affected segments were recorded for this cluster.
                </p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {finding.affectedSyntheticUsers.map((syntheticUser) => (
                    <li
                      className="rounded-full border bg-muted/30 px-3 py-1 text-xs font-medium"
                      key={syntheticUser._id}
                    >
                      {syntheticUser.name}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>

          <div className="rounded-lg border bg-background p-4">
            <dt className="text-sm font-medium text-muted-foreground">
              Axis coverage
            </dt>
            <dd className="mt-2">
              {finding.affectedAxisRanges.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No axis ranges were captured for this cluster.
                </p>
              ) : (
                <ul className="space-y-2">
                  {finding.affectedAxisRanges.map((axisRange) => (
                    <li
                      className="rounded-md border bg-muted/20 px-3 py-2"
                      key={`${finding._id}-${axisRange.key}-${axisRange.min}-${axisRange.max}`}
                    >
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground break-words">
                        {formatStatusLabel(axisRange.key)}
                      </p>
                      <p className="mt-1 text-sm font-medium">
                        {formatAxisValueRange(axisRange)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <SummaryValue
            label="Recommendation"
            value={formatGeneratedText(finding.recommendation)}
          />
          <SummaryValue
            label="Confidence note"
            value={formatGeneratedText(finding.confidenceNote)}
          />
        </div>

        <section className="space-y-3">
          <h3 className="text-base font-semibold">Representative quotes</h3>
          {representativeQuotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No representative quotes were captured for this issue cluster.
            </p>
          ) : (
            <div className="grid gap-3">
              {representativeQuotes.map((quote) => (
                <blockquote
                  className="rounded-lg border bg-background px-4 py-3 text-sm italic text-muted-foreground"
                  key={quote}
                >
                  “{formatGeneratedText(quote)}”
                </blockquote>
              ))}
            </div>
          )}
        </section>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section className="space-y-3">
            <h3 className="text-base font-semibold">Representative runs</h3>
            <div className="space-y-3">
              {finding.representativeRuns.map((run) => (
                <div
                  key={run._id}
                  className="rounded-lg border bg-background p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1">
                      <p className="font-medium">
                        {run.syntheticUserName ?? "Representative run"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {formatStatusLabel(run.status)}
                        {run.finalOutcome ? ` · ${run.finalOutcome}` : ""}
                      </p>
                    </div>

                    <Button asChild size="sm" variant="outline">
                      <Link
                        params={{ studyId }}
                        search={{
                          ...emptyStudyDetailSearch,
                          runId: run._id,
                        }}
                        to="/studies/$studyId/runs"
                      >
                        Open run detail
                      </Link>
                    </Button>
                  </div>

                  <p className="mt-3 text-sm text-muted-foreground">
                    {run.finalUrl ?? "No final URL available"}
                  </p>

                  {run.representativeQuote ? (
                    <blockquote className="mt-3 border-l-2 pl-3 text-sm italic text-muted-foreground">
                      “{formatGeneratedText(run.representativeQuote)}”
                    </blockquote>
                  ) : null}
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-semibold">Evidence links</h3>
            <div className="space-y-3">
              {finding.evidence.map((evidence, index) => (
                <a
                  key={evidence.key}
                  className="flex items-center justify-between rounded-lg border bg-background px-4 py-3 text-sm font-medium text-primary underline-offset-4 hover:underline"
                  href={buildEvidenceHref(
                    evidence.fullResolutionKey,
                    resolvedArtifactUrls,
                  )}
                  rel="noreferrer"
                  target="_blank"
                >
                  <span>Open evidence {index + 1}</span>
                  <span className="text-xs text-muted-foreground">
                    Full resolution
                  </span>
                </a>
              ))}
            </div>
          </section>
        </div>

        <section className="space-y-3">
          <h3 className="text-base font-semibold">Analyst notes</h3>
          {finding.notes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No analyst notes have been recorded for this issue cluster yet.
            </p>
          ) : (
            <div className="space-y-3">
              {finding.notes.map((note) => (
                <div
                  key={note._id}
                  className="rounded-lg border bg-background p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-medium">{note.authorId}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatTimestamp(note.createdAt)}
                    </p>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {note.note}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function filterFindings(findings: FindingsView[], search: StudyDetailSearch) {
  return findings.filter((finding) => {
    if (search.severity && finding.severity !== search.severity) {
      return false;
    }

    if (
      search.syntheticUserId &&
      !finding.affectedSyntheticUsers.some(
        (syntheticUser) => syntheticUser._id === search.syntheticUserId,
      )
    ) {
      return false;
    }

    if (
      search.axisKey &&
      (search.axisMin !== undefined || search.axisMax !== undefined)
    ) {
      const axisMin = search.axisMin ?? -1;
      const axisMax = search.axisMax ?? 1;

      const overlapsAxisRange = finding.affectedAxisRanges.some(
        (axisRange) =>
          axisRange.key === search.axisKey &&
          axisRange.max >= axisMin &&
          axisRange.min <= axisMax,
      );

      if (!overlapsAxisRange) {
        return false;
      }
    }

    if (
      search.outcome &&
      !finding.representativeRuns.some((run) => run.status === search.outcome)
    ) {
      return false;
    }

    if (
      search.urlPrefix &&
      !finding.representativeRuns.some(
        (run) =>
          run.finalUrl !== null &&
          run.finalUrl.startsWith(search.urlPrefix ?? ""),
      )
    ) {
      return false;
    }

    return true;
  });
}

function buildEvidenceHref(
  value: string,
  resolvedArtifactUrls: Record<string, string>,
) {
  return resolvedArtifactUrls[value] ?? (value.startsWith("data:") ? value : "#");
}

function toOptionalNumber(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  const numericValue = Number(trimmedValue);
  return Number.isFinite(numericValue) ? numericValue : undefined;
}

function formatAxisValueRange(
  axisRange: DemoFinding["affectedAxisRanges"][number],
) {
  return `${axisRange.min.toFixed(1)} to ${axisRange.max.toFixed(1)}`;
}

function formatFindingCount(count: number) {
  return `${count} ${count === 1 ? "cluster" : "clusters"}`;
}

function formatImpactScore(value: number | undefined) {
  const score = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return score.toFixed(2);
}

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ");
}

function formatGeneratedText(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b[A-Z0-9_]{18,}\b/g, (token) =>
      token.toLowerCase().replaceAll("_", " "),
    );
}

function unique(values: string[]) {
  return [...new Set(values)];
}
