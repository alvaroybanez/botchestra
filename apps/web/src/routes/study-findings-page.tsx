import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_STUDY_ID } from "@/routes/skeleton-pages";
import {
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
      <FindingsStateCard
        description="Loading analysis findings, filters, and representative evidence..."
        title="Findings"
      />
    );
  }

  if (study === null) {
    return (
      <FindingsStateCard
        description="This study could not be found in the current organization."
        title="Study not found"
      />
    );
  }

  return (
    <LiveStudyFindingsContent
      detailSearch={detailSearch}
      findings={findings as DemoFinding[]}
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
  findings: DemoFinding[];
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
      <FindingsStateCard
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
  findings: DemoFinding[];
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

  const protoPersonaOptions = useMemo(() => {
    const protoPersonas = new Map<string, string>();

    for (const finding of findings) {
      for (const protoPersona of finding.affectedProtoPersonas) {
        protoPersonas.set(protoPersona._id, protoPersona.name);
      }
    }

    return [...protoPersonas.entries()]
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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Findings Explorer
          </p>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold tracking-tight">Findings</h2>
              <StudyStatusBadge status={study.status} />
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Filter issue clusters by severity, proto-persona, axis range,
              outcome, and URL prefix. Drill into representative runs and open
              evidence links for each cluster.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <StudyOverviewLinkButton
            detailSearch={detailSearch}
            studyId={study._id}
          />
          <Button asChild variant="outline">
            <Link to="/studies">Back to Studies</Link>
          </Button>
        </div>
      </div>

      <StudyTabsNav
        activeTab="findings"
        detailSearch={detailSearch}
        studyId={study._id}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Filter findings</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="finding-severity-filter">Severity</Label>
                <select
                  aria-label="Severity filter"
                  className={selectClassName}
                  id="finding-severity-filter"
                  value={detailSearch.severity ?? ""}
                  onChange={(event) =>
                    onSearchChange({
                      severity: event.target.value || undefined,
                    })
                  }
                >
                  <option value="">All severities</option>
                  {severityOptions.map((severity) => (
                    <option key={severity} value={severity}>
                      {formatStatusLabel(severity)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="finding-persona-filter">Proto-persona</Label>
                <select
                  aria-label="Proto-persona filter"
                  className={selectClassName}
                  id="finding-persona-filter"
                  value={detailSearch.protoPersonaId ?? ""}
                  onChange={(event) =>
                    onSearchChange({
                      protoPersonaId: event.target.value || undefined,
                    })
                  }
                >
                  <option value="">All proto-personas</option>
                  {protoPersonaOptions.map((persona) => (
                    <option key={persona.id} value={persona.id}>
                      {persona.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="finding-axis-key-filter">Axis key</Label>
                <select
                  aria-label="Axis key filter"
                  className={selectClassName}
                  id="finding-axis-key-filter"
                  value={detailSearch.axisKey ?? ""}
                  onChange={(event) =>
                    onSearchChange({
                      axisKey: event.target.value || undefined,
                    })
                  }
                >
                  <option value="">Any axis</option>
                  {axisKeys.map((axisKey) => (
                    <option key={axisKey} value={axisKey}>
                      {axisKey}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="finding-axis-min-filter">Axis min</Label>
                  <Input
                    aria-label="Axis min filter"
                    id="finding-axis-min-filter"
                    max="1"
                    min="-1"
                    placeholder="-1"
                    step="0.1"
                    type="number"
                    value={detailSearch.axisMin ?? ""}
                    onChange={(event) =>
                      onSearchChange({
                        axisMin: toOptionalNumber(event.target.value),
                      })
                    }
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="finding-axis-max-filter">Axis max</Label>
                  <Input
                    aria-label="Axis max filter"
                    id="finding-axis-max-filter"
                    max="1"
                    min="-1"
                    placeholder="1"
                    step="0.1"
                    type="number"
                    value={detailSearch.axisMax ?? ""}
                    onChange={(event) =>
                      onSearchChange({
                        axisMax: toOptionalNumber(event.target.value),
                      })
                    }
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="finding-outcome-filter">Outcome</Label>
                <select
                  aria-label="Outcome filter"
                  className={selectClassName}
                  id="finding-outcome-filter"
                  value={detailSearch.outcome ?? ""}
                  onChange={(event) =>
                    onSearchChange({
                      outcome: event.target.value || undefined,
                    })
                  }
                >
                  <option value="">All outcomes</option>
                  {outcomeOptions.map((outcome) => (
                    <option key={outcome} value={outcome}>
                      {formatStatusLabel(outcome)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="finding-url-prefix-filter">URL prefix</Label>
                <Input
                  aria-label="URL prefix filter"
                  id="finding-url-prefix-filter"
                  placeholder="https://example.com/checkout"
                  value={detailSearch.urlPrefix ?? ""}
                  onChange={(event) =>
                    onSearchChange({
                      urlPrefix: event.target.value || undefined,
                    })
                  }
                />
              </div>
            </CardContent>
            <CardContent className="pt-0">
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
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
                <p className="mt-3 text-sm text-destructive">
                  Axis min cannot be greater than axis max.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {findings.length === 0 ? (
            <FindingsStateCard
              description="No issue clusters are available yet. Findings will appear after the analysis pipeline completes."
              title="No findings yet"
            />
          ) : filteredFindings.length === 0 ? (
            <FindingsStateCard
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
  finding: DemoFinding;
  studyId: string;
  resolvedArtifactUrls: Record<string, string>;
}) {
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
            <CardTitle className="text-xl">{finding.title}</CardTitle>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              {finding.summary}
            </p>
          </div>

          <div className="rounded-lg border bg-background px-3 py-2 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Replay confidence
            </p>
            <p className="text-lg font-semibold">
              {Math.round(finding.replayConfidence * 100)}%
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <SummaryValue
            label="Affected segments"
            value={finding.affectedProtoPersonas.map((protoPersona) => protoPersona.name).join(", ")}
          />
          <SummaryValue
            label="Axis coverage"
            value={finding.affectedAxisRanges.map(formatAxisRange).join(", ")}
          />
          <SummaryValue
            label="Recommendation"
            value={finding.recommendation}
          />
          <SummaryValue
            label="Confidence note"
            value={finding.confidenceNote}
          />
        </div>

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
                        {run.protoPersonaName ?? "Representative run"}
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
                      “{run.representativeQuote}”
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

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function SeverityBadge({
  severity,
}: {
  severity: DemoFinding["severity"];
}) {
  return (
    <span
      className={[
        "rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide",
        severity === "blocker" ? "bg-rose-100 text-rose-800" : "",
        severity === "major" ? "bg-amber-100 text-amber-800" : "",
        severity === "minor" ? "bg-sky-100 text-sky-800" : "",
        severity === "cosmetic" ? "bg-slate-200 text-slate-700" : "",
      ].join(" ")}
    >
      {severity}
    </span>
  );
}

function FindingsStateCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function filterFindings(findings: DemoFinding[], search: StudyDetailSearch) {
  return findings.filter((finding) => {
    if (search.severity && finding.severity !== search.severity) {
      return false;
    }

    if (
      search.protoPersonaId &&
      !finding.affectedProtoPersonas.some(
        (protoPersona) => protoPersona._id === search.protoPersonaId,
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

function formatAxisRange(axisRange: DemoFinding["affectedAxisRanges"][number]) {
  return `${axisRange.key}: ${axisRange.min.toFixed(1)} to ${axisRange.max.toFixed(1)}`;
}

function formatFindingCount(count: number) {
  return `${count} ${count === 1 ? "cluster" : "clusters"}`;
}

function formatStatusLabel(value: string) {
  return value.replaceAll("_", " ");
}

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
