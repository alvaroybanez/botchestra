import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  StudyStatusBadge,
  formatDuration,
  formatTimestamp,
} from "@/routes/study-shared";

const auditEventOptions = [
  "study.launched",
  "study.cancelled",
  "report.published",
  "settings.updated",
  "credential.created",
  "credential.updated",
  "credential.deleted",
] as const;

type DiagnosticsOverview = {
  generatedAt: number;
  liveStudyCounts: Record<string, number>;
  historicalMetrics: {
    dispatchedRuns: number;
    completedRuns: number;
    completedStudies: number;
    totalTokenUsage: number;
    totalBrowserSeconds: number;
    recentInfraErrors: number;
    lastMetricRecordedAt: number | null;
  };
  studyUsage: Array<{
    studyId: string;
    studyName: string;
    status: string;
    runBudget: number;
    updatedAt: number;
    browserSecondsUsed: number;
    tokenUsage: number;
    completedRunCount: number;
    infraErrorCount: number;
    latestInfraErrorCode?: string;
    lastMetricRecordedAt: number | null;
  }>;
  infraErrorCodes: Array<{
    code: string;
    count: number;
  }>;
  recentMetrics: Array<{
    studyId: string;
    studyName: string;
    metricType: string;
    value: number;
    unit: string;
    status?: string;
    errorCode?: string;
    recordedAt: number;
  }>;
};

type AuditEventView = {
  _id: string;
  actorId: string;
  eventType: string;
  createdAt: number;
  studyId?: string;
  resourceType?: string;
  resourceId?: string;
  reason?: string;
};

export function AdminDiagnosticsPage() {
  const [actorIdFilter, setActorIdFilter] = useState("");
  const [studyIdFilter, setStudyIdFilter] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [startAtFilter, setStartAtFilter] = useState("");
  const [endAtFilter, setEndAtFilter] = useState("");

  const overview = useQuery((api as any).observability.getAdminDiagnosticsOverview, {}) as
    | DiagnosticsOverview
    | undefined;

  const auditFilters = useMemo(
    () => ({
      actorId: actorIdFilter.trim() || undefined,
      endAt: parseDateTimeLocal(endAtFilter),
      eventType: eventTypeFilter || undefined,
      limit: 100,
      startAt: parseDateTimeLocal(startAtFilter),
      studyId: studyIdFilter || undefined,
    }),
    [actorIdFilter, endAtFilter, eventTypeFilter, startAtFilter, studyIdFilter],
  );

  const auditEvents = useQuery((api as any).observability.listAuditEvents, auditFilters) as
    | AuditEventView[]
    | undefined;

  if (overview === undefined || auditEvents === undefined) {
    return (
      <DiagnosticsStateCard
        description="Loading live metrics, per-study usage, infra error codes, and audit events..."
        title="Admin diagnostics"
      />
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
          Admin Console
        </p>
        <div className="space-y-2">
          <h2 className="text-3xl font-semibold tracking-tight">Admin diagnostics</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Monitor recent study throughput, browser time, token usage, infra failures,
            and audit history from one admin-only surface.
          </p>
          <p className="text-sm text-muted-foreground">
            Last refreshed {formatTimestamp(overview.generatedAt)}
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Live study health</CardTitle>
            <CardDescription>
              Current status counts across the most recently updated studies in this workspace.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Running studies"
              value={formatNumber(overview.liveStudyCounts.running ?? 0)}
            />
            <MetricCard
              label="Queued studies"
              value={formatNumber(overview.liveStudyCounts.queued ?? 0)}
            />
            <MetricCard
              label="Analyzing studies"
              value={formatNumber(overview.liveStudyCounts.analyzing ?? 0)}
            />
            <MetricCard
              label="Ready studies"
              value={formatNumber(overview.liveStudyCounts.ready ?? 0)}
            />
            <MetricCard
              label="Completed studies"
              value={formatNumber(overview.liveStudyCounts.completed ?? 0)}
            />
            <MetricCard
              label="Active studies"
              value={formatNumber(overview.liveStudyCounts.active ?? 0)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent historical metrics</CardTitle>
            <CardDescription>
              Recent aggregate counts pulled from observability metrics and run completions.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <SummaryValue
              label="Wave dispatched runs"
              value={formatNumber(overview.historicalMetrics.dispatchedRuns)}
            />
            <SummaryValue
              label="Completed runs"
              value={formatNumber(overview.historicalMetrics.completedRuns)}
            />
            <SummaryValue
              label="Completed studies"
              value={formatNumber(overview.historicalMetrics.completedStudies)}
            />
            <SummaryValue
              label="Model token usage"
              value={formatNumber(overview.historicalMetrics.totalTokenUsage)}
            />
            <SummaryValue
              label="Browser time"
              value={formatDuration(overview.historicalMetrics.totalBrowserSeconds)}
            />
            <SummaryValue
              label="Infra errors"
              value={formatNumber(overview.historicalMetrics.recentInfraErrors)}
            />
            <SummaryValue
              label="Latest metric"
              value={formatNullableTimestamp(overview.historicalMetrics.lastMetricRecordedAt)}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
        <Card>
          <CardHeader>
            <CardTitle>Per-study usage</CardTitle>
            <CardDescription>
              Browser time, recorded token usage, and infra failures for recently updated studies.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.studyUsage.length === 0 ? (
              <EmptyState text="No study usage has been recorded yet." />
            ) : (
              overview.studyUsage.map((study) => (
                <div
                  key={study.studyId}
                  className="rounded-lg border bg-background p-4"
                  data-testid="study-usage-row"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-base font-semibold">{study.studyName}</h3>
                        <StudyStatusBadge status={study.status} />
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Run budget {formatNumber(study.runBudget)} · Updated{" "}
                        {formatTimestamp(study.updatedAt)}
                      </p>
                    </div>

                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <SummaryValue
                        label="Browser time"
                        value={formatDuration(study.browserSecondsUsed)}
                      />
                      <SummaryValue
                        label="Token usage"
                        value={formatNumber(study.tokenUsage)}
                      />
                      <SummaryValue
                        label="Completed runs"
                        value={formatNumber(study.completedRunCount)}
                      />
                      <SummaryValue
                        label="Infra errors"
                        value={formatNumber(study.infraErrorCount)}
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-3 text-sm text-muted-foreground">
                    <span>Last metric {formatNullableTimestamp(study.lastMetricRecordedAt)}</span>
                    <span>
                      Latest infra code {study.latestInfraErrorCode ?? "No infra errors recorded"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Infra error codes</CardTitle>
            <CardDescription>
              Standardized worker and callback failures grouped by recent occurrence count.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {overview.infraErrorCodes.length === 0 ? (
              <EmptyState text="No infra errors were recorded in recent metrics." />
            ) : (
              overview.infraErrorCodes.map((errorCode) => (
                <div
                  key={errorCode.code}
                  className="flex items-center justify-between rounded-lg border bg-background px-4 py-3"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{errorCode.code}</p>
                    <p className="text-sm text-muted-foreground">
                      Recent occurrences across completed runs
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
                    {formatNumber(errorCode.count)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent metric activity</CardTitle>
          <CardDescription>
            Latest metric writes with study context, unit, and any attached infra code.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {overview.recentMetrics.length === 0 ? (
            <EmptyState text="No metric events have been recorded yet." />
          ) : (
            overview.recentMetrics.map((metric) => (
              <div
                key={`${metric.studyId}-${metric.metricType}-${metric.recordedAt}`}
                className="rounded-lg border bg-background p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">{metric.studyName}</p>
                    <p className="text-sm text-muted-foreground">
                      {metric.metricType} · {formatNumber(metric.value)} {metric.unit}
                    </p>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {formatTimestamp(metric.recordedAt)}
                  </p>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
                  <span>Status {metric.status ?? "n/a"}</span>
                  <span>Error code {metric.errorCode ?? "n/a"}</span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit trail</CardTitle>
          <CardDescription>
            Filter launches, cancellations, report publications, settings changes, and
            credential events by actor, study, type, or date range.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <FilterField htmlFor="audit-actor-filter" label="Actor">
              <Input
                id="audit-actor-filter"
                onChange={(event) => setActorIdFilter(event.target.value)}
                placeholder="researcher|org-a"
                value={actorIdFilter}
              />
            </FilterField>

            <FilterField htmlFor="audit-study-filter" label="Study">
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                id="audit-study-filter"
                onChange={(event) => setStudyIdFilter(event.target.value)}
                value={studyIdFilter}
              >
                <option value="">All studies</option>
                {overview.studyUsage.map((study) => (
                  <option key={study.studyId} value={study.studyId}>
                    {study.studyName}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField htmlFor="audit-event-type-filter" label="Event type">
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                id="audit-event-type-filter"
                onChange={(event) => setEventTypeFilter(event.target.value)}
                value={eventTypeFilter}
              >
                <option value="">All event types</option>
                {auditEventOptions.map((eventType) => (
                  <option key={eventType} value={eventType}>
                    {eventType}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField htmlFor="audit-start-filter" label="Start">
              <Input
                id="audit-start-filter"
                onChange={(event) => setStartAtFilter(event.target.value)}
                type="datetime-local"
                value={startAtFilter}
              />
            </FilterField>

            <FilterField htmlFor="audit-end-filter" label="End">
              <Input
                id="audit-end-filter"
                onChange={(event) => setEndAtFilter(event.target.value)}
                type="datetime-local"
                value={endAtFilter}
              />
            </FilterField>
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => {
                setActorIdFilter("");
                setStudyIdFilter("");
                setEventTypeFilter("");
                setStartAtFilter("");
                setEndAtFilter("");
              }}
              type="button"
              variant="outline"
            >
              Clear filters
            </Button>
          </div>

          <div className="space-y-3">
            {auditEvents.length === 0 ? (
              <EmptyState text="No audit events match the current filters." />
            ) : (
              auditEvents.map((event) => {
                const studyName =
                  overview.studyUsage.find((study) => study.studyId === event.studyId)?.studyName ??
                  event.studyId;

                return (
                  <div
                    key={event._id}
                    className="rounded-lg border bg-background p-4"
                    data-testid="audit-row"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">{event.eventType}</p>
                        <p className="text-sm text-muted-foreground">
                          Actor {event.actorId} · Study {studyName ?? "n/a"}
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {formatTimestamp(event.createdAt)}
                      </p>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted-foreground">
                      <span>
                        Resource {event.resourceType ?? "n/a"} · {event.resourceId ?? "n/a"}
                      </span>
                      <span>Reason {event.reason ?? "Not provided"}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function DiagnosticsStateCard({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>;
}

function FilterField({
  children,
  htmlFor,
  label,
}: {
  children: ReactNode;
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function formatNullableTimestamp(timestamp: number | null) {
  return timestamp === null ? "Not yet recorded" : formatTimestamp(timestamp);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function parseDateTimeLocal(value: string) {
  if (!value.trim()) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
