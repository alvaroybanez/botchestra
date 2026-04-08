import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SummaryValue } from "@/components/domain/summary-value";
import type { PersonaConfigDetailSearch } from "@/router";
import type { ConfigVariantReviewData, VariantReviewData } from "./types";
import { formatTimestamp, selectClassName } from "./helpers";
import { LoadingCard, LocalSummaryValue } from "./shared-ui";
import { emptyStudyDetailSearch } from "@/routes/study-shared";

type SortKey = "edgeScore" | "coherenceScore" | "distinctnessScore";
type SortDirection = "asc" | "desc";

type Variant = VariantReviewData["variants"][number];
type SharedAxis = VariantReviewData["config"]["sharedAxes"][number];

function getAxisValue(
  axisValues: { key: string; value: number }[],
  axisKey: string,
) {
  return axisValues.find((av) => av.key === axisKey)?.value ?? 0;
}

function formatAxisValue(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function formatScore(value: number) {
  return value.toFixed(2);
}

export function ReviewWorkspace({
  configVariantReview,
  selectedVariantId,
  selectedReviewStudyId,
  onSearchChange,
}: {
  configVariantReview: ConfigVariantReviewData | null | undefined;
  selectedVariantId: string | undefined;
  selectedReviewStudyId: string | undefined;
  onSearchChange: (patch: Partial<PersonaConfigDetailSearch>) => void;
}) {
  if (configVariantReview === undefined) {
    return (
      <LoadingCard
        title="Variant Review"
        body="Loading linked studies and accepted variants..."
      />
    );
  }

  if (configVariantReview === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Variant review unavailable</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This persona configuration&apos;s variant review data could not be
            loaded for the current organization.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (configVariantReview.studies.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>
            No studies linked to this persona configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Generate variants from a study that uses this published persona
            configuration, then return here to review the accepted cohort.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ReviewWorkspaceInner
      configVariantReview={configVariantReview}
      selectedVariantId={selectedVariantId}
      selectedReviewStudyId={selectedReviewStudyId}
      onSearchChange={onSearchChange}
    />
  );
}

function ReviewWorkspaceInner({
  configVariantReview,
  selectedVariantId,
  selectedReviewStudyId,
  onSearchChange,
}: {
  configVariantReview: ConfigVariantReviewData;
  selectedVariantId: string | undefined;
  selectedReviewStudyId: string | undefined;
  onSearchChange: (patch: Partial<PersonaConfigDetailSearch>) => void;
}) {
  const [selectedSyntheticUserId, setSelectedSyntheticUserId] =
    useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("edgeScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [minimumAxisValue, setMinimumAxisValue] = useState("");
  const [maximumAxisValue, setMaximumAxisValue] = useState("");
  const [selectedAxisKey, setSelectedAxisKey] = useState(
    configVariantReview.config.sharedAxes[0]?.key ?? "",
  );
  const tableRef = useRef<HTMLTableSectionElement>(null);

  const selectedStudySummary =
    configVariantReview.selectedStudy ?? configVariantReview.study ?? null;

  useEffect(() => {
    setSelectedSyntheticUserId((current) =>
      current === "all" ||
      configVariantReview.syntheticUsers.some((u) => u._id === current)
        ? current
        : "all",
    );
    setSelectedAxisKey((current) =>
      configVariantReview.config.sharedAxes.some((a) => a.key === current)
        ? current
        : (configVariantReview.config.sharedAxes[0]?.key ?? ""),
    );
  }, [
    configVariantReview.config._id,
    configVariantReview.config.sharedAxes,
    configVariantReview.syntheticUsers,
  ]);

  const filteredVariants = useMemo(() => {
    const minimum = parseNumericFilter(minimumAxisValue);
    const maximum = parseNumericFilter(maximumAxisValue);

    return [...configVariantReview.variants]
      .filter((variant) => {
        if (
          selectedSyntheticUserId !== "all" &&
          variant.syntheticUserId !== selectedSyntheticUserId
        ) {
          return false;
        }
        if (!selectedAxisKey) return true;
        const val = getAxisValue(variant.axisValues, selectedAxisKey);
        if (minimum !== null && val < minimum) return false;
        if (maximum !== null && val > maximum) return false;
        return true;
      })
      .sort((a, b) => {
        const mult = sortDirection === "desc" ? -1 : 1;
        return (a[sortKey] - b[sortKey]) * mult;
      });
  }, [
    configVariantReview.variants,
    selectedSyntheticUserId,
    selectedAxisKey,
    minimumAxisValue,
    maximumAxisValue,
    sortKey,
    sortDirection,
  ]);

  const selectedVariant = useMemo(
    () =>
      selectedVariantId
        ? filteredVariants.find((v) => v._id === selectedVariantId) ?? null
        : null,
    [filteredVariants, selectedVariantId],
  );

  // Auto-select first variant when none selected or current selection is filtered out
  useEffect(() => {
    if (filteredVariants.length === 0) {
      if (selectedVariantId) {
        onSearchChange({ selectedVariantId: undefined });
      }
      return;
    }
    if (!selectedVariant && filteredVariants[0]) {
      onSearchChange({ selectedVariantId: filteredVariants[0]._id });
    }
  }, [filteredVariants, selectedVariant, selectedVariantId, onSearchChange]);

  const handleStudyChange = useCallback(
    (studyId: string) => {
      onSearchChange({
        selectedReviewStudyId: studyId || undefined,
        selectedVariantId: undefined,
      });
    },
    [onSearchChange],
  );

  function handleSort(nextSortKey: SortKey) {
    setSortDirection((current) =>
      sortKey === nextSortKey && current === "desc" ? "asc" : "desc",
    );
    setSortKey(nextSortKey);
  }

  const handleRowSelect = useCallback(
    (variantId: string) => {
      onSearchChange({ selectedVariantId: variantId });
    },
    [onSearchChange],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (filteredVariants.length === 0) return;

      const currentIndex = selectedVariantId
        ? filteredVariants.findIndex((v) => v._id === selectedVariantId)
        : -1;

      let nextIndex: number | null = null;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        nextIndex =
          currentIndex < filteredVariants.length - 1 ? currentIndex + 1 : 0;
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nextIndex =
          currentIndex > 0 ? currentIndex - 1 : filteredVariants.length - 1;
      } else if (event.key === "Home") {
        event.preventDefault();
        nextIndex = 0;
      } else if (event.key === "End") {
        event.preventDefault();
        nextIndex = filteredVariants.length - 1;
      }

      if (nextIndex !== null) {
        const nextVariant = filteredVariants[nextIndex];
        if (nextVariant) {
          onSearchChange({ selectedVariantId: nextVariant._id });
          const row = tableRef.current?.querySelector(
            `[data-variant-id="${nextVariant._id}"]`,
          );
          row?.scrollIntoView({ block: "nearest" });
        }
      }
    },
    [filteredVariants, selectedVariantId, onSearchChange],
  );

  return (
    <div className="space-y-4">
      {/* Study selector bar */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="grid min-w-48 gap-1.5">
          <Label htmlFor="review-study-filter">Linked study</Label>
          <select
            className={selectClassName}
            id="review-study-filter"
            value={selectedReviewStudyId ?? ""}
            onChange={(e) => handleStudyChange(e.target.value)}
          >
            {configVariantReview.studies.map((study) => (
              <option key={study._id} value={study._id}>
                {study.name} ({study.acceptedVariantCount} accepted)
              </option>
            ))}
          </select>
        </div>

        {selectedStudySummary ? (
          <>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span>
                Status:{" "}
                <Badge variant="outline">{selectedStudySummary.status}</Badge>
              </span>
              <span>Budget: {selectedStudySummary.runBudget}</span>
              <span>
                Updated: {formatTimestamp(selectedStudySummary.updatedAt)}
              </span>
            </div>
            <Button asChild size="sm" variant="outline" className="ml-auto">
              <Link
                params={{ studyId: selectedStudySummary._id }}
                search={emptyStudyDetailSearch}
                to="/studies/$studyId/personas"
              >
                Open study
              </Link>
            </Button>
          </>
        ) : null}
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="review-user-filter" className="text-xs">
            Synthetic user
          </Label>
          <select
            className={cn(selectClassName, "h-9")}
            id="review-user-filter"
            value={selectedSyntheticUserId}
            onChange={(e) => setSelectedSyntheticUserId(e.target.value)}
          >
            <option value="all">All users</option>
            {configVariantReview.syntheticUsers.map((u) => (
              <option key={u._id} value={u._id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="review-axis-filter" className="text-xs">
            Axis
          </Label>
          <select
            className={cn(selectClassName, "h-9")}
            id="review-axis-filter"
            value={selectedAxisKey}
            onChange={(e) => setSelectedAxisKey(e.target.value)}
          >
            {configVariantReview.config.sharedAxes.map((axis) => (
              <option key={axis.key} value={axis.key}>
                {axis.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="review-min-axis" className="text-xs">
            Min
          </Label>
          <Input
            className="h-9 w-24"
            id="review-min-axis"
            max="1"
            min="-1"
            placeholder="-1.00"
            step="0.01"
            type="number"
            value={minimumAxisValue}
            onChange={(e) => setMinimumAxisValue(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="review-max-axis" className="text-xs">
            Max
          </Label>
          <Input
            className="h-9 w-24"
            id="review-max-axis"
            max="1"
            min="-1"
            placeholder="1.00"
            step="0.01"
            type="number"
            value={maximumAxisValue}
            onChange={(e) => setMaximumAxisValue(e.target.value)}
          />
        </div>
        <p className="ml-auto self-end text-xs text-muted-foreground">
          {filteredVariants.length} of {configVariantReview.variants.length}{" "}
          variants
        </p>
      </div>

      {/* Main split-pane: table + inspector */}
      <div className="flex gap-4" style={{ minHeight: 480 }}>
        {/* Dense table pane */}
        <div className="min-w-0 flex-1 overflow-hidden rounded-xl border bg-card">
          {filteredVariants.length === 0 ? (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-sm text-muted-foreground">
                No accepted variants match the current filters.
              </p>
            </div>
          ) : (
            <div
              className="h-full overflow-auto"
              onKeyDown={handleKeyDown}
            >
              <table
                className="min-w-full border-collapse text-left text-sm"
                role="grid"
                aria-label="Accepted variants"
                tabIndex={0}
              >
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-b">
                    <DenseHeader>User</DenseHeader>
                    {configVariantReview.config.sharedAxes.map((axis) => (
                      <DenseHeader key={axis.key}>
                        {abbreviateAxisLabel(axis.label)}
                      </DenseHeader>
                    ))}
                    <SortableHeader
                      label="Edge"
                      sortKey="edgeScore"
                      activeSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Coher."
                      sortKey="coherenceScore"
                      activeSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                    <SortableHeader
                      label="Dist."
                      sortKey="distinctnessScore"
                      activeSortKey={sortKey}
                      sortDirection={sortDirection}
                      onSort={handleSort}
                    />
                  </tr>
                </thead>
                <tbody ref={tableRef}>
                  {filteredVariants.map((variant) => (
                    <tr
                      key={variant._id}
                      data-variant-id={variant._id}
                      data-testid="variant-row"
                      role="row"
                      aria-selected={variant._id === selectedVariantId}
                      className={cn(
                        "cursor-pointer border-b last:border-b-0 transition-colors",
                        variant._id === selectedVariantId
                          ? "bg-accent"
                          : "hover:bg-muted/50",
                      )}
                      onClick={() => handleRowSelect(variant._id)}
                    >
                      <td className="max-w-[160px] truncate px-3 py-2 font-medium">
                        {variant.syntheticUserName}
                      </td>
                      {configVariantReview.config.sharedAxes.map((axis) => (
                        <td
                          key={`${variant._id}-${axis.key}`}
                          className="px-3 py-2 tabular-nums text-muted-foreground"
                        >
                          {formatAxisValue(
                            getAxisValue(variant.axisValues, axis.key),
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2 tabular-nums">
                        {formatScore(variant.edgeScore)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatScore(variant.coherenceScore)}
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {formatScore(variant.distinctnessScore)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Sticky narrative inspector */}
        <div className="w-80 shrink-0 overflow-y-auto rounded-xl border bg-card p-5">
          {selectedVariant ? (
            <VariantInspector
              variant={selectedVariant}
              sharedAxes={configVariantReview.config.sharedAxes}
              syntheticUsers={configVariantReview.syntheticUsers}
              selectedAxisKey={selectedAxisKey}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-center text-sm text-muted-foreground">
                Select a variant row to inspect its narrative details.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function VariantInspector({
  variant,
  sharedAxes,
  syntheticUsers,
  selectedAxisKey,
}: {
  variant: Variant;
  sharedAxes: SharedAxis[];
  syntheticUsers: VariantReviewData["syntheticUsers"];
  selectedAxisKey: string;
}) {
  const syntheticUser = syntheticUsers.find(
    (u) => u._id === variant.syntheticUserId,
  );
  const selectedAxis = sharedAxes.find((a) => a.key === selectedAxisKey);

  return (
    <div className="space-y-5">
      {/* Identity */}
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{variant.syntheticUserName}</h3>
        {syntheticUser ? (
          <p className="text-xs text-muted-foreground">
            {syntheticUser.summary}
          </p>
        ) : null}
      </div>

      {/* Scores */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Scores
        </h4>
        <div className="grid grid-cols-3 gap-2">
          <ScoreBadge label="Edge" value={variant.edgeScore} />
          <ScoreBadge label="Coher." value={variant.coherenceScore} />
          <ScoreBadge label="Dist." value={variant.distinctnessScore} />
        </div>
      </div>

      {/* Axis values */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Axis values
        </h4>
        <div className="space-y-1.5">
          {sharedAxes.map((axis) => {
            const value = getAxisValue(variant.axisValues, axis.key);
            return (
              <div
                key={axis.key}
                className={cn(
                  "flex items-center justify-between rounded px-2 py-1 text-sm",
                  axis.key === selectedAxisKey && "bg-muted",
                )}
              >
                <span className="truncate text-muted-foreground">
                  {axis.label}
                </span>
                <span className="ml-2 shrink-0 tabular-nums font-medium">
                  {formatAxisValue(value)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected axis anchors */}
      {selectedAxis ? (
        <div className="space-y-2">
          <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {selectedAxis.label} anchors
          </h4>
          <div className="space-y-1.5 text-xs">
            <AnchorRow label="Low" value={selectedAxis.lowAnchor} />
            <AnchorRow label="Mid" value={selectedAxis.midAnchor} />
            <AnchorRow label="High" value={selectedAxis.highAnchor} />
          </div>
        </div>
      ) : null}

      {/* Bio */}
      <div className="space-y-2">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          First-person bio
        </h4>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {variant.firstPersonBio}
        </p>
      </div>
    </div>
  );
}

function ScoreBadge({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border px-2 py-1.5 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums">{formatScore(value)}</p>
    </div>
  );
}

function AnchorRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border px-2 py-1.5">
      <span className="font-medium text-foreground">{label}:</span>{" "}
      <span className="text-muted-foreground">{value}</span>
    </div>
  );
}

function DenseHeader({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </th>
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
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortKey === activeSortKey;
  return (
    <th
      className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      aria-sort={isActive ? (sortDirection === "desc" ? "descending" : "ascending") : "none"}
    >
      <button
        type="button"
        className="font-medium text-foreground hover:text-primary"
        aria-label={isActive ? `${label} (${sortDirection})` : label}
        onClick={() => onSort(sortKey)}
      >
        {label}
        {isActive ? (sortDirection === "desc" ? " \u2193" : " \u2191") : ""}
      </button>
    </th>
  );
}

function abbreviateAxisLabel(label: string) {
  if (label.length <= 12) return label;
  return `${label.slice(0, 10)}...`;
}

function parseNumericFilter(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
