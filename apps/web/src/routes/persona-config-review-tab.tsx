import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SummaryValue } from "@/components/summary-value";
import { PersonaVariantReviewGrid } from "@/components/persona-variant-review-grid";
import { EmptyState } from "@/components/empty-state";
import { selectClassName } from "@/components/filter-bar";
import { emptyStudyDetailSearch } from "@/routes/study-shared";
import {
  type ConfigVariantReviewData,
  formatTimestamp,
} from "@/routes/persona-config-shared";

export type ReviewTabContentProps = {
  configVariantReview: ConfigVariantReviewData | null | undefined;
  selectedStudyId: string | null;
  setSelectedStudyId: (value: string | null) => void;
  selectedStudySummary: NonNullable<ConfigVariantReviewData["study"]> | null;
};

export function ReviewTabContent({
  configVariantReview,
  selectedStudyId,
  setSelectedStudyId,
  selectedStudySummary,
}: ReviewTabContentProps) {
  return (
    <div className="space-y-4">
              {configVariantReview === undefined ? (
                <EmptyState
                  title="Variant Review"
                  description="Loading linked studies and accepted variants..."
                />
              ) : configVariantReview === null ? (
                <Card>
                  <CardHeader>
                    <CardTitle>Variant review unavailable</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      This persona configuration&apos;s variant review data could not be loaded for the
                      current organization.
                    </p>
                  </CardContent>
                </Card>
              ) : configVariantReview.studies.length === 0 ? (
                <Card>
                  <CardHeader>
                    <CardTitle>No studies linked</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Generate variants from a study that uses this published persona configuration,
                      then return here to review the accepted cohort.
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  <Card>
                    <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-1">
                        <CardTitle>
                          {selectedStudySummary?.name ?? "Select a linked study"}
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {selectedStudySummary
                            ? `${configVariantReview.variants.length} accepted variants available for review.`
                            : "Choose a linked study to review its accepted variants."}
                        </p>
                      </div>

                      <div className="flex flex-col gap-3 sm:min-w-72">
                        <div className="grid gap-2">
                          <Label htmlFor="config-variant-study-filter">
                            Linked study
                          </Label>
                          <select
                            className={selectClassName}
                            id="config-variant-study-filter"
                            value={selectedStudyId ?? ""}
                            onChange={(event) =>
                              setSelectedStudyId(event.target.value || null)
                            }
                          >
                            {configVariantReview.studies.map((study) => (
                              <option key={study._id} value={study._id}>
                                {study.name} ({study.acceptedVariantCount} accepted)
                              </option>
                            ))}
                          </select>
                        </div>

                        {selectedStudySummary ? (
                          <Button asChild variant="outline">
                            <Link
                              params={{ studyId: selectedStudySummary._id }}
                              search={emptyStudyDetailSearch}
                              to="/studies/$studyId/personas"
                            >
                              Open study personas page
                            </Link>
                          </Button>
                        ) : null}
                      </div>
                    </CardHeader>
                    {selectedStudySummary ? (
                      <CardContent className="grid gap-4 sm:grid-cols-3">
                        <SummaryValue
                          label="Study status"
                          value={selectedStudySummary.status}
                        />
                        <SummaryValue
                          label="Run budget"
                          value={String(selectedStudySummary.runBudget)}
                        />
                        <SummaryValue
                          label="Last updated"
                          value={formatTimestamp(selectedStudySummary.updatedAt)}
                        />
                      </CardContent>
                    ) : null}
                  </Card>

                  <PersonaVariantReviewGrid
                    emptyMessage="No accepted variants are available for the selected study yet. Generate variants from the study personas page first."
                    reviewData={configVariantReview}
                  />
                </div>
              )}
    </div>
  );
}
