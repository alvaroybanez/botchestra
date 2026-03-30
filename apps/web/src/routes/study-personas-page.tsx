import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAction, useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import {
  PersonaVariantReviewGrid,
  type VariantReviewData,
} from "@/components/persona-variant-review-grid";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DEMO_STUDY_ID } from "@/routes/skeleton-pages";
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
              Review accepted variants for this study, filter by synthetic user or
              axis range, and inspect the score distribution before launch.
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <CardTitle>{reviewData.study?.name ?? "Persona review"}</CardTitle>
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
              <SummaryValue
                label="Study status"
                value={reviewData.study?.status ?? "unknown"}
              />
              <SummaryValue
                label="Run budget"
                value={String(reviewData.study?.runBudget ?? 0)}
              />
              <SummaryValue
                label="Last updated"
                value={
                  reviewData.study
                    ? formatTimestamp(reviewData.study.updatedAt)
                    : "Unknown"
                }
              />
            </CardContent>
          </Card>

          {actionError ? (
            <p className="text-sm text-destructive">{actionError}</p>
          ) : null}
          {statusMessage ? (
            <p className="text-sm text-emerald-700">{statusMessage}</p>
          ) : null}

          <PersonaVariantReviewGrid reviewData={reviewData} />
        </div>
      </div>
    </section>
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
