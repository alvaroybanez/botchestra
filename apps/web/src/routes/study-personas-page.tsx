import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import type { VariantReviewData } from "@/components/persona-variant-review-grid";
import { SummaryGrid, SummaryValue } from "@/components/domain/summary-value";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_STUDY_ID } from "@/routes/study-demo-data";
import {
  StudyTabsNav,
  type StudyDetailSearch,
} from "@/routes/study-shared";

const demoReviewData: VariantReviewData = {
  study: {
    _id: DEMO_STUDY_ID,
    name: "Checkout usability benchmark",
    status: "persona_review",
    runBudget: 64,
    updatedAt: new Date("2026-03-25T09:00:00Z").getTime(),
  },
  config: {
    _id: "demo-config",
    name: "Customer Journey Stress Test Config",
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
  syntheticUsers: [
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
      syntheticUserId: "proto-cautious",
      syntheticUserName: "Cautious checkout shopper",
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
      syntheticUserId: "proto-power",
      syntheticUserName: "Goal-driven power user",
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
      syntheticUserId: "proto-cautious",
      syntheticUserName: "Cautious checkout shopper",
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

export function StudyPersonasPage({
  detailSearch,
  studyId,
}: {
  detailSearch: StudyDetailSearch;
  studyId: string;
}) {
  if (studyId === DEMO_STUDY_ID) {
    return <DemoStudyPersonasPage detailSearch={detailSearch} />;
  }

  return (
    <LiveStudyPersonasPage
      detailSearch={detailSearch}
      studyId={studyId as Id<"studies">}
    />
  );
}

function DemoStudyPersonasPage({
  detailSearch,
}: {
  detailSearch: StudyDetailSearch;
}) {
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
      detailSearch={detailSearch}
      isGenerating={isGenerating}
      reviewData={
        demoReviewData as VariantReviewData & {
          study: NonNullable<VariantReviewData["study"]>;
        }
      }
      statusMessage={statusMessage}
      onGenerate={() => void handleGenerate()}
    />
  );
}

function LiveStudyPersonasPage({
  detailSearch,
  studyId,
}: {
  detailSearch: StudyDetailSearch;
  studyId: Id<"studies">;
}) {
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
      detailSearch={detailSearch}
      isGenerating={isGenerating}
      reviewData={
        reviewData as VariantReviewData & {
          study: NonNullable<VariantReviewData["study"]>;
        }
      }
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
  detailSearch,
  onGenerate,
}: {
  reviewData: VariantReviewData & {
    study: NonNullable<VariantReviewData["study"]>;
  };
  isGenerating: boolean;
  statusMessage: string | null;
  actionError: string | null;
  detailSearch: StudyDetailSearch;
  onGenerate: () => void;
}) {
  const rankedVariants = useMemo(
    () =>
      [...reviewData.variants].sort(
        (left, right) => right.coherenceScore - left.coherenceScore,
      ),
    [reviewData.variants],
  );

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
              Review accepted variants for this study with card-level axis value
              distributions and coherence scores before launch.
            </p>
          </div>
        </div>

        <Button asChild variant="outline">
          <Link to="/studies">Back to Studies</Link>
        </Button>
      </div>

      <StudyTabsNav
        activeTab="personas"
        detailSearch={detailSearch}
        studyId={reviewData.study._id}
      />

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>{reviewData.study.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              Config: {reviewData.config.name} · {reviewData.variants.length} accepted
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
        <CardContent>
          <SummaryGrid columns="sm:grid-cols-3">
            <SummaryValue
              label="Study status"
              value={reviewData.study.status}
              variant="bordered"
            />
            <SummaryValue
              label="Run budget"
              value={String(reviewData.study.runBudget)}
              variant="bordered"
            />
            <SummaryValue
              label="Last updated"
              value={formatTimestamp(reviewData.study.updatedAt)}
              variant="bordered"
            />
          </SummaryGrid>
        </CardContent>
      </Card>

      {actionError ? (
        <p className="text-sm text-destructive">{actionError}</p>
      ) : null}
      {statusMessage ? (
        <p className="text-sm text-emerald-700">{statusMessage}</p>
      ) : null}

      {rankedVariants.length === 0 ? (
        <ReviewStateCard
          description="No accepted variants are available for this study yet."
          title="Persona variants"
        />
      ) : (
        <section className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-xl font-semibold tracking-tight">Persona variants</h3>
            <p className="text-sm leading-6 text-muted-foreground">
              Cards are ranked by coherence score and show axis value distributions
              for each accepted persona variant.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {rankedVariants.map((variant, index) => (
              <PersonaVariantCard
                configAxes={reviewData.config.sharedAxes}
                index={index}
                key={variant._id}
                syntheticUsers={reviewData.syntheticUsers}
                variant={variant}
              />
            ))}
          </div>
        </section>
      )}
    </section>
  );
}

function PersonaVariantCard({
  variant,
  syntheticUsers,
  configAxes,
  index,
}: {
  variant: VariantReviewData["variants"][number];
  syntheticUsers: VariantReviewData["syntheticUsers"];
  configAxes: VariantReviewData["config"]["sharedAxes"];
  index: number;
}) {
  const syntheticUserSummary =
    syntheticUsers.find((syntheticUser) => syntheticUser._id === variant.syntheticUserId)
      ?.summary ?? "Synthetic persona variant";

  return (
    <Card data-testid="persona-variant-card">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rank #{index + 1}
            </p>
            <CardTitle>{variant.syntheticUserName}</CardTitle>
            <p className="text-sm text-muted-foreground">{syntheticUserSummary}</p>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3 text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Coherence score
            </p>
            <p className="text-2xl font-semibold">
              {formatScore(variant.coherenceScore)}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <SummaryGrid columns="sm:grid-cols-3">
          <SummaryValue
            label="Coherence score"
            value={formatScore(variant.coherenceScore)}
            variant="bordered"
          />
          <SummaryValue
            label="Distinctness score"
            value={formatScore(variant.distinctnessScore)}
            variant="bordered"
          />
          <SummaryValue
            label="Edge score"
            value={formatScore(variant.edgeScore)}
            variant="bordered"
          />
        </SummaryGrid>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold">Axis value distribution</h4>
          <div className="space-y-3">
            {configAxes.map((axis) => (
              <AxisDistributionRow
                axis={axis}
                key={`${variant._id}-${axis.key}`}
                value={getAxisValue(variant.axisValues, axis.key)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h4 className="text-sm font-semibold">Bio preview</h4>
          <p className="text-sm leading-6 text-muted-foreground">
            {variant.firstPersonBio}
          </p>
        </section>
      </CardContent>
    </Card>
  );
}

function AxisDistributionRow({
  axis,
  value,
}: {
  axis: VariantReviewData["config"]["sharedAxes"][number];
  value: number;
}) {
  const clampedValue = clampAxisValue(value);
  const distributionPercent = ((clampedValue + 1) / 2) * 100;

  return (
    <div className="space-y-2 rounded-lg border bg-background p-3">
      <div className="flex items-center justify-between gap-3 text-sm">
        <p className="font-medium">{axis.label}</p>
        <p className="font-mono text-muted-foreground">
          {formatAxisValue(clampedValue)}
        </p>
      </div>
      <div className="h-2 rounded-full bg-muted">
        <div
          className="h-2 rounded-full bg-primary"
          style={{ width: `${distributionPercent}%` }}
        />
      </div>
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{axis.lowAnchor}</span>
        <span>{axis.highAnchor}</span>
      </div>
    </div>
  );
}

function getAxisValue(
  axisValues: { key: string; value: number }[],
  axisKey: string,
) {
  return axisValues.find((axisValue) => axisValue.key === axisKey)?.value ?? 0;
}

function clampAxisValue(value: number) {
  if (Number.isNaN(value)) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  if (value < -1) {
    return -1;
  }

  return value;
}

function formatAxisValue(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatScore(value: number) {
  return value.toFixed(2);
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

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
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
