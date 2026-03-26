import { useMemo, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_STUDY_ID } from "@/routes/skeleton-pages";
import {
  demoFindings,
  demoRuns,
  demoStudyReport,
  demoStudySummary,
  type DemoFinding,
  type DemoStudyReport,
  type DemoStudySummary,
} from "@/routes/study-demo-data";
import {
  StudyStatusBadge,
  StudyTabsNav,
  buildArtifactHref,
  formatTimestamp,
  type StudyDetailSearch,
} from "@/routes/study-shared";

const severityOrder = [
  "blocker",
  "major",
  "minor",
  "cosmetic",
] as const;

type ReportStudySummary = Pick<
  Doc<"studies">,
  "_id" | "name" | "status" | "runBudget" | "updatedAt"
> | DemoStudySummary;

type ReportRecord = Doc<"studyReports"> | DemoStudyReport;

type RunSummary = {
  totalRuns: number;
  queuedCount: number;
  runningCount: number;
  terminalCount: number;
};

export function StudyReportPage({
  detailSearch,
  studyId,
}: {
  detailSearch: StudyDetailSearch;
  studyId: string;
}) {
  if (studyId === DEMO_STUDY_ID) {
    return (
      <DemoStudyReportPage detailSearch={detailSearch} />
    );
  }

  return (
    <LiveStudyReportPage
      detailSearch={detailSearch}
      studyId={studyId}
    />
  );
}

function DemoStudyReportPage({
  detailSearch,
}: {
  detailSearch: StudyDetailSearch;
}) {
  return (
    <ResolvedStudyReportPage
      detailSearch={detailSearch}
      findings={demoFindings}
      report={demoStudyReport}
      runSummary={{
        queuedCount: 0,
        runningCount: 0,
        terminalCount: demoRuns.length,
        totalRuns: demoRuns.length,
      }}
      study={demoStudySummary}
    />
  );
}

function LiveStudyReportPage({
  detailSearch,
  studyId,
}: {
  detailSearch: StudyDetailSearch;
  studyId: string;
}) {
  const study = useQuery(api.studies.getStudy, {
    studyId: studyId as Id<"studies">,
  });
  const report = useQuery(api.analysisQueries.getReport, {
    studyId: studyId as Id<"studies">,
  });
  const findings = useQuery(api.analysisQueries.listFindings, {
    studyId: studyId as Id<"studies">,
  });
  const runSummary = useQuery(api.runs.getRunSummary, {
    studyId: studyId as Id<"studies">,
  });

  if (study === undefined || report === undefined || findings === undefined) {
    return (
      <ReportStateCard
        description="Loading headline metrics, ranked issues, evidence, and analyst notes..."
        title="Study report"
      />
    );
  }

  if (study === null) {
    return (
      <ReportStateCard
        description="This study could not be found in the current organization."
        title="Study not found"
      />
    );
  }

  if (report === null) {
    return (
      <ReportShell
        detailSearch={detailSearch}
        rightColumn={
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
            </CardContent>
          </Card>
        }
        study={study}
      >
        <ReportStateCard
          description="The analysis pipeline has not produced a report for this study yet. Headline metrics and ranked issues will appear here once report generation completes."
          title="Report not ready"
        />
      </ReportShell>
    );
  }

  return (
    <LiveStudyReportContent
      detailSearch={detailSearch}
      findings={findings as DemoFinding[]}
      report={report}
      runSummary={runSummary as RunSummary | undefined}
      study={study}
    />
  );
}

function LiveStudyReportContent({
  detailSearch,
  findings,
  report,
  runSummary,
  study,
}: {
  detailSearch: StudyDetailSearch;
  findings: DemoFinding[];
  report: ReportRecord;
  runSummary: RunSummary | undefined;
  study: ReportStudySummary;
}) {
  const artifactKeys = useMemo(
    () =>
      [
        ...new Set(
          findings.flatMap((finding) =>
            finding.evidence.flatMap((evidence) => [
              evidence.fullResolutionKey,
              evidence.thumbnailKey,
            ]),
          ),
        ),
      ],
    [findings],
  );
  const resolvedArtifactUrls = useQuery(api.analysisQueries.resolveArtifactUrls, {
    studyId: study._id as Id<"studies">,
    keys: artifactKeys,
  });

  if (resolvedArtifactUrls === undefined) {
    return (
      <ReportStateCard
        description="Resolving evidence thumbnails and artifact links..."
        title="Study report"
      />
    );
  }

  return (
    <ResolvedStudyReportPage
      detailSearch={detailSearch}
      findings={findings}
      report={report}
      resolvedArtifactUrls={resolvedArtifactUrls}
      runSummary={runSummary}
      study={study}
    />
  );
}

function ResolvedStudyReportPage({
  study,
  report,
  findings,
  runSummary,
  detailSearch,
  resolvedArtifactUrls = {},
}: {
  study: ReportStudySummary;
  report: ReportRecord;
  findings: DemoFinding[];
  runSummary: RunSummary | undefined;
  detailSearch: StudyDetailSearch;
  resolvedArtifactUrls?: Record<string, string>;
}) {
  const orderedFindings = useMemo(() => {
    const findingsById = new Map(findings.map((finding) => [finding._id, finding]));
    const matched = report.issueClusterIds
      .map((issueId) => findingsById.get(issueId))
      .filter((finding): finding is DemoFinding => finding !== undefined);
    const matchedIds = new Set(matched.map((finding) => finding._id));
    const extras = findings.filter((finding) => !matchedIds.has(finding._id));

    return [...matched, ...extras];
  }, [findings, report.issueClusterIds]);

  const severityMix = useMemo(
    () =>
      severityOrder.reduce<Record<(typeof severityOrder)[number], number>>(
        (accumulator, severity) => ({
          ...accumulator,
          [severity]: orderedFindings.filter((finding) => finding.severity === severity)
            .length,
        }),
        {
          blocker: 0,
          major: 0,
          minor: 0,
          cosmetic: 0,
        },
      ),
    [orderedFindings],
  );

  return (
    <ReportShell
      detailSearch={detailSearch}
      rightColumn={
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Study snapshot</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <SummaryValue label="Study" value={study.name} />
              <SummaryValue
                label="Run progress"
                value={formatRunProgress(runSummary)}
              />
              <SummaryValue
                label="Issue clusters"
                value={formatClusterCount(orderedFindings.length)}
              />
              <SummaryValue
                label="Run budget"
                value={String(study.runBudget)}
              />
              <SummaryValue
                label="Report generated"
                value={formatTimestamp(report.createdAt)}
              />
              <SummaryValue
                label="Last updated"
                value={formatTimestamp(study.updatedAt)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Severity mix</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {severityOrder.map((severity) => (
                <SummaryValue
                  key={severity}
                  label={formatLabel(severity)}
                  value={formatClusterCount(severityMix[severity])}
                />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Limitations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {report.limitations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No report limitations were captured for this study.
                </p>
              ) : (
                <ul className="space-y-2 text-sm leading-6 text-muted-foreground">
                  {report.limitations.map((limitation) => (
                    <li key={limitation} className="rounded-lg border bg-background px-4 py-3">
                      {limitation}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      }
      study={study}
    >
      <Card>
        <CardHeader>
          <CardTitle>Headline metrics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Completion rate"
            value={formatPercent(report.headlineMetrics.completionRate)}
          />
          <MetricCard
            label="Abandonment rate"
            value={formatPercent(report.headlineMetrics.abandonmentRate)}
          />
          <MetricCard
            label="Median steps"
            value={formatNumber(report.headlineMetrics.medianSteps)}
          />
          <MetricCard
            label="Median duration"
            value={`${formatNumber(report.headlineMetrics.medianDurationSec)} sec`}
          />
        </CardContent>
      </Card>

      {orderedFindings.length === 0 ? (
        <ReportStateCard
          description="This study produced no replay-backed issue clusters. Headline metrics and limitations are still available for review."
          title="No ranked issue clusters"
        />
      ) : (
        <div className="space-y-4">
          {orderedFindings.map((finding, index) => (
            <IssueCard
              finding={finding}
              index={index}
              key={finding._id}
              resolvedArtifactUrls={resolvedArtifactUrls}
            />
          ))}
        </div>
      )}
    </ReportShell>
  );
}

function ReportShell({
  study,
  detailSearch,
  children,
  rightColumn,
}: {
  study: ReportStudySummary;
  detailSearch: StudyDetailSearch;
  children: ReactNode;
  rightColumn: ReactNode;
}) {
  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Ranked report
          </p>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold tracking-tight">
                Study report
              </h2>
              <StudyStatusBadge status={study.status} />
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Review the final headline metrics, ranked issue clusters, replay
              evidence, and analyst notes for this study in one place.
            </p>
          </div>
        </div>

        <Button asChild variant="outline">
          <Link to="/studies">Back to Studies</Link>
        </Button>
      </div>

      <StudyTabsNav
        activeTab="report"
        detailSearch={detailSearch}
        studyId={study._id}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-6">{children}</div>
        <div className="space-y-6">{rightColumn}</div>
      </div>
    </section>
  );
}

function IssueCard({
  finding,
  index,
  resolvedArtifactUrls,
}: {
  finding: DemoFinding;
  index: number;
  resolvedArtifactUrls: Record<string, string>;
}) {
  const whereValues = unique(
    finding.representativeRuns
      .map((run) => run.finalUrl)
      .filter((value): value is string => Boolean(value)),
  );
  const quotes = unique(
    finding.representativeRuns
      .map((run) => run.representativeQuote)
      .filter((value): value is string => Boolean(value)),
  );
  const evidence = finding.evidence.length
    ? finding.evidence
    : finding.representativeRuns.flatMap((run) => run.evidence);

  return (
    <Card data-testid="report-issue-card">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-foreground px-3 py-1 text-xs font-semibold uppercase tracking-wide text-background">
                #{index + 1}
              </span>
              <SeverityBadge severity={finding.severity} />
              <span className="text-sm text-muted-foreground">
                {finding.affectedRunCount} affected runs ·{" "}
                {formatPercent(finding.affectedRunRate)}
              </span>
            </div>
            <CardTitle className="text-xl">{finding.title}</CardTitle>
          </div>

          <div className="rounded-lg border bg-background px-4 py-3 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Replay confidence
            </p>
            <p className="text-2xl font-semibold">
              {formatPercent(finding.replayConfidence)}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <SummaryValue label="What broke" value={finding.summary} />
          <SummaryValue
            label="Where"
            value={
              whereValues.length === 0
                ? "No final URL captured"
                : whereValues.join(", ")
            }
          />
          <SummaryValue
            label="Affected segments"
            value={finding.affectedProtoPersonas.map((segment) => segment.name).join(", ")}
          />
          <SummaryValue
            label="Axis coverage"
            value={finding.affectedAxisRanges.map(formatAxisRange).join(", ")}
          />
          <SummaryValue label="Recommendation" value={finding.recommendation} />
          <SummaryValue label="Confidence note" value={finding.confidenceNote} />
        </div>

        <section className="space-y-3">
          <h3 className="text-base font-semibold">Representative quotes</h3>
          {quotes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No representative quotes were captured for this issue cluster.
            </p>
          ) : (
            <div className="grid gap-3">
              {quotes.map((quote) => (
                <blockquote
                  className="rounded-lg border bg-background px-4 py-3 text-sm italic text-muted-foreground"
                  key={quote}
                >
                  “{quote}”
                </blockquote>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-base font-semibold">Evidence thumbnails</h3>
            <p className="text-sm text-muted-foreground">
              Click any thumbnail to open the full-resolution artifact.
            </p>
          </div>
          {evidence.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No evidence artifacts were attached to this issue cluster.
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {evidence.map((item, evidenceIndex) => {
                const href = toArtifactHref(
                  item.fullResolutionKey,
                  resolvedArtifactUrls,
                );
                const imageSrc = toArtifactHref(
                  item.thumbnailKey,
                  resolvedArtifactUrls,
                );

                return (
                  <a
                    className="group overflow-hidden rounded-xl border bg-background transition-colors hover:border-primary"
                    data-testid="report-evidence-link"
                    href={href}
                    key={`${item.key}-${evidenceIndex}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <img
                      alt={`Evidence thumbnail ${evidenceIndex + 1}`}
                      className="aspect-video w-full object-cover"
                      src={imageSrc}
                    />
                    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                      <span className="font-medium">Evidence {evidenceIndex + 1}</span>
                      <span className="text-muted-foreground">
                        View full resolution
                      </span>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
        </section>

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
                  className="rounded-lg border bg-background p-4"
                  key={note._id}
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

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight">{value}</dd>
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium leading-6">{value}</dd>
    </div>
  );
}

function ReportStateCard({
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

function SeverityBadge({ severity }: { severity: DemoFinding["severity"] }) {
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

function formatPercent(value: number) {
  return `${Math.round(sanitizeNumber(value) * 100)}%`;
}

function formatNumber(value: number) {
  const safeValue = sanitizeNumber(value);
  return Number.isInteger(safeValue) ? safeValue.toFixed(0) : safeValue.toFixed(1);
}

function sanitizeNumber(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function formatAxisRange(axisRange: DemoFinding["affectedAxisRanges"][number]) {
  return `${axisRange.key}: ${axisRange.min.toFixed(1)} to ${axisRange.max.toFixed(1)}`;
}

function formatClusterCount(count: number) {
  return `${count} ${count === 1 ? "cluster" : "clusters"}`;
}

function formatRunProgress(runSummary: RunSummary | undefined) {
  if (runSummary === undefined) {
    return "Loading...";
  }

  return `${runSummary.terminalCount}/${runSummary.totalRuns} terminal · ${runSummary.runningCount} running · ${runSummary.queuedCount} queued`;
}

function formatLabel(value: string) {
  return value.replaceAll("_", " ");
}

function toArtifactHref(
  value: string,
  resolvedArtifactUrls: Record<string, string>,
) {
  return resolvedArtifactUrls[value] ?? (value.startsWith("data:") ? value : buildArtifactHref(value));
}

function unique(values: string[]) {
  return [...new Set(values)];
}
