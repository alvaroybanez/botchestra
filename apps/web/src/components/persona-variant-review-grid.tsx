import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { FilterBar, FilterSearch, FilterSelect, selectClassName } from "@/components/filter-bar";
import { SummaryValue } from "@/components/summary-value";

export type VariantReviewData = {
  study: {
    _id: string;
    name: string;
    status: string;
    runBudget: number;
    updatedAt: number;
  } | null;
  config: {
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
  syntheticUsers: {
    _id: string;
    name: string;
    summary: string;
  }[];
  variants: {
    _id: string;
    syntheticUserId: string;
    syntheticUserName: string;
    axisValues: { key: string; value: number }[];
    edgeScore: number;
    coherenceScore: number;
    distinctnessScore: number;
    firstPersonBio: string;
  }[];
};

type SortKey = "edgeScore" | "coherenceScore" | "distinctnessScore";
type SortDirection = "asc" | "desc";

export function PersonaVariantReviewGrid({
  reviewData,
  emptyMessage = "No accepted variants match the current filters. Adjust the synthetic user or axis range to review a broader slice of the cohort.",
}: {
  reviewData: VariantReviewData;
  emptyMessage?: string;
}) {
  const [selectedSyntheticUserId, setSelectedSyntheticUserId] = useState("all");
  const [selectedAxisKey, setSelectedAxisKey] = useState(
    reviewData.config.sharedAxes[0]?.key ?? "",
  );
  const [minimumAxisValue, setMinimumAxisValue] = useState("");
  const [maximumAxisValue, setMaximumAxisValue] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("edgeScore");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  useEffect(() => {
    setSelectedSyntheticUserId((current) =>
      current === "all" ||
      reviewData.syntheticUsers.some((syntheticUser) => syntheticUser._id === current)
        ? current
        : "all",
    );
    setSelectedAxisKey((current) =>
      reviewData.config.sharedAxes.some((axis) => axis.key === current)
        ? current
        : (reviewData.config.sharedAxes[0]?.key ?? ""),
    );
  }, [reviewData.config._id, reviewData.config.sharedAxes, reviewData.syntheticUsers]);

  const filteredVariants = useMemo(() => {
    const minimum = parseNumericFilter(minimumAxisValue);
    const maximum = parseNumericFilter(maximumAxisValue);

    return [...reviewData.variants]
      .filter((variant) => {
        if (
          selectedSyntheticUserId !== "all" &&
          variant.syntheticUserId !== selectedSyntheticUserId
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
    selectedSyntheticUserId,
    sortDirection,
    sortKey,
  ]);

  function handleSort(nextSortKey: SortKey) {
    setSortDirection((currentDirection) =>
      sortKey === nextSortKey && currentDirection === "desc" ? "asc" : "desc",
    );
    setSortKey(nextSortKey);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <div className="space-y-6">
        <FilterBar
          title="Filter accepted variants"
          columns="lg:grid-cols-4"
        >
          <div className="grid gap-2">
            <Label htmlFor="synthetic-user-filter">Synthetic user filter</Label>
            <select
              aria-label="Synthetic user filter"
              className={selectClassName}
              id="synthetic-user-filter"
              value={selectedSyntheticUserId}
              onChange={(event) => setSelectedSyntheticUserId(event.target.value)}
            >
              <option value="all">All synthetic users</option>
              {reviewData.syntheticUsers.map((syntheticUser) => (
                <option key={syntheticUser._id} value={syntheticUser._id}>
                  {syntheticUser.name}
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
              {reviewData.config.sharedAxes.map((axis) => (
                <option key={axis.key} value={axis.key}>
                  {axis.label}
                </option>
              ))}
            </select>
          </div>

          <FilterSearch
            id="minimum-axis-value"
            label="Minimum axis value"
            placeholder="-1.00"
            type="number"
            min="-1"
            max="1"
            step="0.01"
            value={minimumAxisValue}
            onChange={setMinimumAxisValue}
          />

          <FilterSearch
            id="maximum-axis-value"
            label="Maximum axis value"
            placeholder="1.00"
            type="number"
            min="-1"
            max="1"
            step="0.01"
            value={maximumAxisValue}
            onChange={setMaximumAxisValue}
          />
        </FilterBar>

        <Card>
          <CardHeader>
            <CardTitle>Accepted variants</CardTitle>
          </CardHeader>
          <CardContent>
            {filteredVariants.length === 0 ? (
              <div className="rounded-lg border border-dashed bg-background p-6">
                <p className="text-sm leading-6 text-muted-foreground">
                  {emptyMessage}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <HeaderCell>Synthetic user</HeaderCell>
                      {reviewData.config.sharedAxes.map((axis) => (
                        <HeaderCell key={axis.key}>{axis.label}</HeaderCell>
                      ))}
                      <SortableHeader
                        activeSortKey={sortKey}
                        label="Edge score"
                        sortDirection={sortDirection}
                        sortKey="edgeScore"
                        onSort={handleSort}
                      />
                      <SortableHeader
                        activeSortKey={sortKey}
                        label="Coherence score"
                        sortDirection={sortDirection}
                        sortKey="coherenceScore"
                        onSort={handleSort}
                      />
                      <SortableHeader
                        activeSortKey={sortKey}
                        label="Distinctness score"
                        sortDirection={sortDirection}
                        sortKey="distinctnessScore"
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
                            <p className="font-medium">{variant.syntheticUserName}</p>
                            <p className="text-xs text-muted-foreground">
                              {reviewData.syntheticUsers.find(
                                (syntheticUser) =>
                                  syntheticUser._id === variant.syntheticUserId,
                              )?.summary ?? "Synthetic persona variant"}
                            </p>
                          </div>
                        </BodyCell>
                        {reviewData.config.sharedAxes.map((axis) => (
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
            <p>• Confirm each synthetic user is represented in the accepted set.</p>
            <p>• Spot-check outliers with high edge scores.</p>
            <p>• Compare coherence and distinctness before launching the study.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Selected axis anchors</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {reviewData.config.sharedAxes
              .filter((axis) => axis.key === selectedAxisKey)
              .map((axis) => (
                <div key={axis.key} className="space-y-2 text-sm">
                  <p className="font-medium">{axis.label}</p>
                  <p className="text-muted-foreground">{axis.description}</p>
                  <div className="grid gap-3">
                    <SummaryValue label="Low anchor" value={axis.lowAnchor} variant="bordered" />
                    <SummaryValue label="Mid anchor" value={axis.midAnchor} variant="bordered" />
                    <SummaryValue label="High anchor" value={axis.highAnchor} variant="bordered" />
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      </div>
    </div>
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

function truncateBio(value: string) {
  const normalizedValue = value.trim();

  if (normalizedValue.length <= 120) {
    return normalizedValue;
  }

  return `${normalizedValue.slice(0, 117)}...`;
}

