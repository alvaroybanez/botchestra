import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEMO_STUDY_ID } from "@/routes/skeleton-pages";

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

const demoReviewData: VariantReviewData = {
  study: {
    _id: DEMO_STUDY_ID,
    name: "Checkout usability benchmark",
    status: "persona_review",
    runBudget: 64,
    updatedAt: new Date("2026-03-25T09:00:00Z").getTime(),
  },
  pack: {
    _id: "demo-pack",
    name: "Customer Journey Stress Test Pack",
    status: "published",
    sharedAxes: [
      {
        key: "digital_confidence",
        label: "Digital confidence",
        description: "Comfort with unfamiliar digital tasks.",
        lowAnchor: "Needs reassurance",
        midAnchor: "Can continue with light support",
        highAnchor: "Self-directed",
        weight: 1,
      },
      {
        key: "support_needs",
        label: "Support needs",
        description: "How much guidance or escalation the person expects.",
        lowAnchor: "Prefers self-service",
        midAnchor: "Requests help when stuck",
        highAnchor: "Wants a human quickly",
        weight: 1,
      },
    ],
  },
  protoPersonas: [
    {
      _id: "proto-cautious",
      name: "Cautious checkout shopper",
      summary: "Moves carefully and checks totals before submitting.",
    },
    {
      _id: "proto-power",
      name: "Goal-driven power user",
      summary: "Moves fast and expects the flow to stay out of the way.",
    },
  ],
  variants: [
    {
      _id: "variant-cautious-edge",
      protoPersonaId: "proto-cautious",
      protoPersonaName: "Cautious checkout shopper",
      axisValues: [
        { key: "digital_confidence", value: -0.68 },
        { key: "support_needs", value: 0.74 },
      ],
      edgeScore: 0.93,
      coherenceScore: 0.72,
      distinctnessScore: 0.94,
      firstPersonBio:
        "Budget-minded parent who slows down at payment steps, checks totals twice, and looks for fee transparency before deciding whether to continue.",
    },
    {
      _id: "variant-power-balanced",
      protoPersonaId: "proto-power",
      protoPersonaName: "Goal-driven power user",
      axisValues: [
        { key: "digital_confidence", value: 0.82 },
        { key: "support_needs", value: -0.56 },
      ],
      edgeScore: 0.59,
      coherenceScore: 0.96,
      distinctnessScore: 0.62,
      firstPersonBio:
        "Fast-moving repeat buyer who expects autofill, skims familiar screens, and gets impatient when a checkout asks for information that should already be known.",
    },
    {
      _id: "variant-cautious-interior",
      protoPersonaId: "proto-cautious",
      protoPersonaName: "Cautious checkout shopper",
      axisValues: [
        { key: "digital_confidence", value: 0.18 },
        { key: "support_needs", value: 0.33 },
      ],
      edgeScore: 0.77,
      coherenceScore: 0.84,
      distinctnessScore: 0.88,
      firstPersonBio:
        "Methodical shopper who understands checkout basics, still pauses at ambiguous copy, and wants confidence-building cues before sharing payment details.",
    },
  ],
};

type VariantReviewData = {
  study: {
    _id: string;
    name: string;
    status: string;
    runBudget: number;
    updatedAt: number;
  };
  pack: {
    _id: string;
    name: string;
    status: string;
    sharedAxes: {
      key: string;
      label: string;
      description: string;
      lowAnchor: string;
      midAnchor: string;
      highAnchor: string;
      weight: number;
    }[];
  };
  protoPersonas: {
    _id: string;
    name: string;
    summary: string;
  }[];
  variants: {
    _id: string;
    protoPersonaId: string;
    protoPersonaName: string;
    axisValues: { key: string; value: number }[];
    edgeScore: number;
    coherenceScore: number;
    distinctnessScore: number;
    firstPersonBio: string;
  }[];
};

type SortKey = "edgeScore" | "coherenceScore" | "distinctnessScore";
type SortDirection = "asc" | "desc";

export function StudyPersonasPage({ studyId }: { studyId: string }) {
  if (studyId === DEMO_STUDY_ID) {
    return <DemoStudyPersonasPage />;
  }

  return <LiveStudyPersonasPage studyId={studyId as Id<"studies">} />;
}

function DemoStudyPersonasPage() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  async function handleGenerate() {
    setStatusMessage(null);
    setIsGenerating(true);

    try {
      await new Promise((resolve) => {
        setTimeout(resolve, 900);
      });
      setStatusMessage(
        "Demo refresh complete. 3 accepted variants remain ready for review.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <VariantReviewContent
      actionError={null}
      isGenerating={isGenerating}
      reviewData={demoReviewData}
      statusMessage={statusMessage}
      onGenerate={() => void handleGenerate()}
    />
  );
}

function LiveStudyPersonasPage({ studyId }: { studyId: Id<"studies"> }) {
  const reviewData = useQuery(api.personaVariantReview.getStudyVariantReview, {
    studyId,
  });
  const generateVariants = useAction(
    api.personaVariantGeneration.generateVariantsForStudy,
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleGenerate() {
    setActionError(null);
    setStatusMessage(null);
    setIsGenerating(true);

    try {
      const summary = await generateVariants({ studyId });
      setStatusMessage(
        `Generated ${summary.acceptedCount} accepted variants (${summary.rejectedCount} rejected, ${summary.retryCount} retries).`,
      );
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not generate variants."));
    } finally {
      setIsGenerating(false);
    }
  }

  if (reviewData === undefined) {
    return (
      <ReviewStateCard
        description="Loading accepted variants and review controls..."
        title="Persona Variant Review"
      />
    );
  }

  if (reviewData === null) {
    return (
      <ReviewStateCard
        description="This study could not be found in your organization."
        title="Study not found"
      />
    );
  }

  return (
    <VariantReviewContent
      actionError={actionError}
      isGenerating={isGenerating}
      reviewData={reviewData as VariantReviewData}
      statusMessage={statusMessage}
      onGenerate={() => void handleGenerate()}
    />
  );
}

function VariantReviewContent({
  reviewData,
  isGenerating,
  statusMessage,
  actionError,
  onGenerate,
}: {
  reviewData: VariantReviewData;
  isGenerating: boolean;
  statusMessage: string | null;
  actionError: string | null;
  onGenerate: () => void;
}) {
  const [selectedProtoPersonaId, setSelectedProtoPersonaId] = useState("all");
  const [selectedAxisKey, setSelectedAxisKey] = useState(
    reviewData.pack.sharedAxes[0]?.key ?? "",
  );
  const [minimumAxisValue, setMinimumAxisValue] = useState("");
  const [maximumAxisValue, setMaximumAxisValue] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("edgeScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  function handleSort(nextSortKey: SortKey) {
    setSortDirection((currentDirection) =>
      sortKey === nextSortKey && currentDirection === "desc" ? "asc" : "desc",
    );
    setSortKey(nextSortKey);
  }

  useEffect(() => {
    setSelectedProtoPersonaId((current) =>
      current === "all" ||
      reviewData.protoPersonas.some((protoPersona) => protoPersona._id === current)
        ? current
        : "all",
    );
    setSelectedAxisKey((current) =>
      reviewData.pack.sharedAxes.some((axis) => axis.key === current)
        ? current
        : (reviewData.pack.sharedAxes[0]?.key ?? ""),
    );
  }, [reviewData.pack._id, reviewData.pack.sharedAxes, reviewData.protoPersonas]);

  const filteredVariants = useMemo(() => {
    const minimum = parseNumericFilter(minimumAxisValue);
    const maximum = parseNumericFilter(maximumAxisValue);

    return [...reviewData.variants]
      .filter((variant) => {
        if (
          selectedProtoPersonaId !== "all" &&
          variant.protoPersonaId !== selectedProtoPersonaId
        ) {
          return false;
        }

        if (!selectedAxisKey) {
          return true;
        }

        const axisValue = getAxisValue(variant.axisValues, selectedAxisKey);

        if (minimum !== null && axisValue < minimum) {
          return false;
        }

        if (maximum !== null && axisValue > maximum) {
          return false;
        }

        return true;
      })
      .sort((left, right) => {
        const directionMultiplier = sortDirection === "desc" ? -1 : 1;
        return (left[sortKey] - right[sortKey]) * directionMultiplier;
      });
  }, [
    maximumAxisValue,
    minimumAxisValue,
    reviewData.variants,
    selectedAxisKey,
    selectedProtoPersonaId,
    sortDirection,
    sortKey,
  ]);

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Variant Review
          </p>
          <div className="space-y-2">
            <h2 className="text-3xl font-semibold tracking-tight">
              Persona Variant Review
            </h2>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Review accepted variants for this study, filter by proto-persona or
              axis range, and inspect the score distribution before launch.
            </p>
          </div>
        </div>

        <Button asChild variant="outline">
          <Link to="/studies">Back to Studies</Link>
        </Button>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              Study detail tabs
            </p>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Move between Overview, Personas, Runs, Findings, and Report for this
              study without leaving the workspace.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {studyTabs.map((tab) => (
              <Link
                key={tab.key}
                className={
                  tab.key === "personas"
                    ? "rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                    : "rounded-md bg-muted px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                }
                params={{ studyId: reviewData.study._id }}
                to={tab.to}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle>{reviewData.study.name}</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Pack: {reviewData.pack.name} · {reviewData.variants.length} accepted
                  variants visible
                </p>
              </div>

              <div className="flex flex-col items-start gap-2">
                <Button disabled={isGenerating} onClick={onGenerate}>
                  {isGenerating ? "Generating variants..." : "Generate variants"}
                </Button>
                {isGenerating ? (
                  <p className="text-sm text-muted-foreground" role="status">
                    Generating variants...
                  </p>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <SummaryValue label="Study status" value={reviewData.study.status} />
              <SummaryValue
                label="Run budget"
                value={String(reviewData.study.runBudget)}
              />
              <SummaryValue
                label="Last updated"
                value={formatTimestamp(reviewData.study.updatedAt)}
              />
            </CardContent>
          </Card>

          {actionError ? (
            <p className="text-sm text-destructive">{actionError}</p>
          ) : null}
          {statusMessage ? (
            <p className="text-sm text-emerald-700">{statusMessage}</p>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Filter accepted variants</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-4">
              <div className="grid gap-2">
                <Label htmlFor="proto-persona-filter">Proto-persona filter</Label>
                <select
                  aria-label="Proto-persona filter"
                  className={selectClassName}
                  id="proto-persona-filter"
                  value={selectedProtoPersonaId}
                  onChange={(event) => setSelectedProtoPersonaId(event.target.value)}
                >
                  <option value="all">All proto-personas</option>
                  {reviewData.protoPersonas.map((protoPersona) => (
                    <option key={protoPersona._id} value={protoPersona._id}>
                      {protoPersona.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="axis-filter">Axis filter</Label>
                <select
                  aria-label="Axis filter"
                  className={selectClassName}
                  id="axis-filter"
                  value={selectedAxisKey}
                  onChange={(event) => setSelectedAxisKey(event.target.value)}
                >
                  {reviewData.pack.sharedAxes.map((axis) => (
                    <option key={axis.key} value={axis.key}>
                      {axis.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="minimum-axis-value">Minimum axis value</Label>
                <Input
                  aria-label="Minimum axis value"
                  id="minimum-axis-value"
                  max="1"
                  min="-1"
                  placeholder="-1.00"
                  step="0.01"
                  type="number"
                  value={minimumAxisValue}
                  onChange={(event) => setMinimumAxisValue(event.target.value)}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="maximum-axis-value">Maximum axis value</Label>
                <Input
                  aria-label="Maximum axis value"
                  id="maximum-axis-value"
                  max="1"
                  min="-1"
                  placeholder="1.00"
                  step="0.01"
                  type="number"
                  value={maximumAxisValue}
                  onChange={(event) => setMaximumAxisValue(event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Accepted variants</CardTitle>
            </CardHeader>
            <CardContent>
              {filteredVariants.length === 0 ? (
                <div className="rounded-lg border border-dashed bg-background p-6">
                  <p className="text-sm leading-6 text-muted-foreground">
                    No accepted variants match the current filters. Adjust the
                    proto-persona or axis range to review a broader slice of the
                    cohort.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b">
                        <HeaderCell>Proto-persona</HeaderCell>
                        {reviewData.pack.sharedAxes.map((axis) => (
                          <HeaderCell key={axis.key}>{axis.label}</HeaderCell>
                        ))}
                        <SortableHeader
                          label="Edge score"
                          sortDirection={sortDirection}
                          sortKey="edgeScore"
                          activeSortKey={sortKey}
                          onSort={handleSort}
                        />
                        <SortableHeader
                          label="Coherence score"
                          sortDirection={sortDirection}
                          sortKey="coherenceScore"
                          activeSortKey={sortKey}
                          onSort={handleSort}
                        />
                        <SortableHeader
                          label="Distinctness score"
                          sortDirection={sortDirection}
                          sortKey="distinctnessScore"
                          activeSortKey={sortKey}
                          onSort={handleSort}
                        />
                        <HeaderCell>Bio preview</HeaderCell>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredVariants.map((variant) => (
                        <tr
                          key={variant._id}
                          className="border-b align-top last:border-b-0"
                          data-testid="variant-row"
                        >
                          <BodyCell>
                            <div className="space-y-1">
                              <p className="font-medium">{variant.protoPersonaName}</p>
                              <p className="text-xs text-muted-foreground">
                                {reviewData.protoPersonas.find(
                                  (protoPersona) =>
                                    protoPersona._id === variant.protoPersonaId,
                                )?.summary ?? "Synthetic persona variant"}
                              </p>
                            </div>
                          </BodyCell>
                          {reviewData.pack.sharedAxes.map((axis) => (
                            <BodyCell key={`${variant._id}-${axis.key}`}>
                              {formatAxisValue(
                                getAxisValue(variant.axisValues, axis.key),
                              )}
                            </BodyCell>
                          ))}
                          <BodyCell>{formatScore(variant.edgeScore)}</BodyCell>
                          <BodyCell>{formatScore(variant.coherenceScore)}</BodyCell>
                          <BodyCell>{formatScore(variant.distinctnessScore)}</BodyCell>
                          <BodyCell className="max-w-md text-muted-foreground">
                            {truncateBio(variant.firstPersonBio)}
                          </BodyCell>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Review checklist</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>• Confirm each proto-persona is represented in the accepted set.</p>
              <p>• Spot-check outliers with high edge scores.</p>
              <p>• Compare coherence and distinctness before launching the study.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Selected axis anchors</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {reviewData.pack.sharedAxes
                .filter((axis) => axis.key === selectedAxisKey)
                .map((axis) => (
                  <div key={axis.key} className="space-y-2 text-sm">
                    <p className="font-medium">{axis.label}</p>
                    <p className="text-muted-foreground">{axis.description}</p>
                    <div className="grid gap-3">
                      <SummaryValue label="Low anchor" value={axis.lowAnchor} />
                      <SummaryValue label="Mid anchor" value={axis.midAnchor} />
                      <SummaryValue label="High anchor" value={axis.highAnchor} />
                    </div>
                  </div>
                ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeSortKey,
  sortDirection,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeSortKey: SortKey;
  sortDirection: SortDirection;
  onSort: (sortKey: SortKey) => void;
}) {
  return (
    <HeaderCell>
      <button
        aria-label={
          activeSortKey === sortKey
            ? `${label} (${sortDirection})`
            : label
        }
        className="font-medium text-foreground hover:text-primary"
        type="button"
        onClick={() => onSort(sortKey)}
      >
        {label}
      </button>
    </HeaderCell>
  );
}

function HeaderCell({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <th className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </th>
  );
}

function BodyCell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <td className={`px-4 py-4 ${className}`}>{children}</td>;
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function ReviewStateCard({
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

function getAxisValue(
  axisValues: { key: string; value: number }[],
  axisKey: string,
) {
  return axisValues.find((axisValue) => axisValue.key === axisKey)?.value ?? 0;
}

function parseNumericFilter(value: string) {
  if (!value.trim()) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function formatAxisValue(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatScore(value: number) {
  return value.toFixed(2);
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function truncateBio(value: string) {
  const normalizedValue = value.trim();

  if (normalizedValue.length <= 120) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, 117)}...`;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "string"
  ) {
    return error.data;
  }

  return fallback;
}

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
