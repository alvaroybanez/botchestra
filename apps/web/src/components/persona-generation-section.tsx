import { useEffect, useMemo, useState } from "react";

import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import {
  estimateBatchCost,
  type GridAxis,
  type GridLevelCount,
  validateGenerationConfig,
} from "../../../../convex/batchGeneration/gridAnchors";
import { MAX_SYNTHETIC_USERS_PER_CONFIG } from "../../../../convex/personaConfig.constants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type SharedAxis = Doc<"personaConfigs">["sharedAxes"][number];
type SyntheticUserDoc = Doc<"syntheticUsers">;
type SyntheticUserId = Id<"syntheticUsers">;

export type BatchGenerationRunView = Doc<"batchGenerationRuns"> & {
  remainingCount: number;
  progressPercent: number;
};

type PersonaGenerationSectionProps = {
  axes: SharedAxis[];
  batchGenerationRun: BatchGenerationRunView | null;
  canManageGeneration: boolean;
  configStatus: Doc<"personaConfigs">["status"];
  syntheticUsers: SyntheticUserDoc[];
  onRegenerateUser: (syntheticUserId: SyntheticUserId) => Promise<unknown>;
  onStartGeneration: (
    levelsPerAxis: Record<string, GridLevelCount>,
  ) => Promise<unknown>;
};

const DEFAULT_LEVEL_COUNT: GridLevelCount = 3;
const LEVEL_OPTIONS: GridLevelCount[] = [3, 5, 7];

export function PersonaGenerationSection({
  axes,
  batchGenerationRun,
  canManageGeneration,
  configStatus,
  syntheticUsers,
  onRegenerateUser,
  onStartGeneration,
}: PersonaGenerationSectionProps) {
  const [searchText, setSearchText] = useState("");
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationNotice, setGenerationNotice] = useState<string | null>(null);
  const [isStartingGeneration, setIsStartingGeneration] = useState(false);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [regeneratingUserIds, setRegeneratingUserIds] = useState<
    SyntheticUserId[]
  >([]);
  const [levelsPerAxis, setLevelsPerAxis] = useState<Record<string, GridLevelCount>>(
    () => buildLevelsPerAxis(axes),
  );

  useEffect(() => {
    setLevelsPerAxis((current) => buildLevelsPerAxis(axes, current));
    setSearchText("");
    setGenerationError(null);
    setGenerationNotice(null);
    setIsStartingGeneration(false);
    setIsRetryingFailed(false);
    setRegeneratingUserIds([]);
  }, [axes]);

  const generationAxes: GridAxis[] = useMemo(
    () =>
      axes.map((axis) => ({
        name: axis.key,
        lowAnchor: axis.lowAnchor,
        midAnchor: axis.midAnchor,
        highAnchor: axis.highAnchor,
      })),
    [axes],
  );
  const generationValidation = useMemo(
    () =>
      validateGenerationConfig(
        generationAxes,
        levelsPerAxis,
        MAX_SYNTHETIC_USERS_PER_CONFIG,
      ),
    [generationAxes, levelsPerAxis],
  );
  const costEstimate = generationValidation.valid
    ? estimateBatchCost(generationValidation.totalUsers)
    : null;
  const isDraft = configStatus === "draft";
  const showGenerationControls = isDraft && canManageGeneration;
  const hasActiveRun =
    batchGenerationRun?.status === "pending"
    || batchGenerationRun?.status === "running";
  const generatedUsers = syntheticUsers.filter(
    (syntheticUser) => syntheticUser.sourceType === "generated",
  );
  const failedGeneratedUsers = generatedUsers.filter(
    (syntheticUser) => syntheticUser.generationStatus === "failed",
  );
  const axisLabelByKey = useMemo(
    () =>
      new Map(axes.map((axis) => [axis.key, axis.label])),
    [axes],
  );
  const filteredSyntheticUsers = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    if (normalizedSearch.length === 0) {
      return syntheticUsers;
    }

    return syntheticUsers.filter((syntheticUser) =>
      [
        syntheticUser.name,
        syntheticUser.summary,
        syntheticUser.firstPersonBio ?? "",
        syntheticUser.sourceType,
        syntheticUser.generationStatus ?? "",
        syntheticUser.generationError ?? "",
        syntheticUser.axisValues
          ?.map(
            (axisValue) =>
              `${axisLabelByKey.get(axisValue.key) ?? axisValue.key} ${axisValue.value}`,
          )
          .join(" ") ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [axisLabelByKey, searchText, syntheticUsers]);

  async function handleStartGeneration() {
    if (!showGenerationControls || hasActiveRun || isStartingGeneration) {
      return;
    }

    if (!generationValidation.valid) {
      setGenerationError(generationValidation.error);
      setGenerationNotice(null);
      return;
    }

    setGenerationError(null);
    setGenerationNotice(null);
    setIsStartingGeneration(true);

    try {
      await onStartGeneration(levelsPerAxis);
      setGenerationNotice(
        "Batch generation started. Progress will continue even if you navigate away.",
      );
    } catch (error) {
      setGenerationError(getErrorMessage(error, "Could not start batch generation."));
    } finally {
      setIsStartingGeneration(false);
    }
  }

  async function handleRegenerateUser(syntheticUserId: SyntheticUserId) {
    setGenerationError(null);
    setGenerationNotice(null);
    setRegeneratingUserIds((current) =>
      current.includes(syntheticUserId)
        ? current
        : [...current, syntheticUserId],
    );

    try {
      await onRegenerateUser(syntheticUserId);
      setGenerationNotice("Synthetic user regeneration queued.");
    } catch (error) {
      setGenerationError(
        getErrorMessage(error, "Could not regenerate that synthetic user."),
      );
    } finally {
      setRegeneratingUserIds((current) =>
        current.filter((currentId) => currentId !== syntheticUserId),
      );
    }
  }

  async function handleRetryFailedUsers() {
    if (failedGeneratedUsers.length === 0 || isRetryingFailed || hasActiveRun) {
      return;
    }

    const failedIds = failedGeneratedUsers.map((syntheticUser) => syntheticUser._id);
    setGenerationError(null);
    setGenerationNotice(null);
    setIsRetryingFailed(true);
    setRegeneratingUserIds((current) => [
      ...current,
      ...failedIds.filter((failedId) => !current.includes(failedId)),
    ]);

    try {
      await Promise.all(
        failedIds.map(async (syntheticUserId) => onRegenerateUser(syntheticUserId)),
      );
      setGenerationNotice(
        failedIds.length === 1
          ? "Queued regeneration for 1 failed synthetic user."
          : `Queued regeneration for ${failedIds.length} failed synthetic users.`,
      );
    } catch (error) {
      setGenerationError(
        getErrorMessage(error, "Could not retry the failed synthetic users."),
      );
    } finally {
      setIsRetryingFailed(false);
      setRegeneratingUserIds((current) =>
        current.filter((currentId) => !failedIds.includes(currentId)),
      );
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle>Synthetic User Generation</CardTitle>
          <p className="text-sm text-muted-foreground">
            Configure per-axis granularity, review cost estimates, and inspect generated
            synthetic users before you publish this persona configuration.
          </p>
        </div>
        {showGenerationControls && failedGeneratedUsers.length > 0 ? (
          <Button
            disabled={hasActiveRun || isRetryingFailed}
            onClick={() => void handleRetryFailedUsers()}
            type="button"
            variant="outline"
          >
            {isRetryingFailed ? "Retrying failed..." : "Retry Failed"}
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-6">
        {generationError ? (
          <p className="text-sm text-destructive" role="alert">
            {generationError}
          </p>
        ) : null}
        {generationNotice ? (
          <p className="text-sm text-emerald-700" role="status">
            {generationNotice}
          </p>
        ) : null}

        {showGenerationControls ? (
          <div className="space-y-4 rounded-xl border bg-background p-4">
            <div className="space-y-1">
              <h3 className="font-medium">Generate Synthetic Users</h3>
              <p className="text-sm text-muted-foreground">
                Choose 3, 5, or 7 anchor positions for each shared axis. Generation uses the
                currently saved shared axes on this draft configuration.
              </p>
            </div>

            {axes.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {axes.map((axis) => (
                  <div
                    key={axis.key}
                    className="rounded-lg border bg-card p-4"
                  >
                    <div className="space-y-2">
                      <div>
                        <p className="font-medium">{axis.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {axis.lowAnchor} → {axis.highAnchor}
                        </p>
                      </div>
                      <Select
                        disabled={hasActiveRun}
                        value={String(levelsPerAxis[axis.key] ?? DEFAULT_LEVEL_COUNT)}
                        onValueChange={(value) =>
                          setLevelsPerAxis((current) => ({
                            ...current,
                            [axis.key]: Number(value) as GridLevelCount,
                          }))
                        }
                      >
                        <SelectTrigger
                          aria-label={`${axis.label} levels`}
                          className="w-full"
                        >
                          <SelectValue placeholder="Select granularity" />
                        </SelectTrigger>
                        <SelectContent>
                          {LEVEL_OPTIONS.map((levelCount) => (
                            <SelectItem
                              key={`${axis.key}-${levelCount}`}
                              value={String(levelCount)}
                            >
                              {levelCount} levels
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed bg-card p-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  Add at least one shared axis before you generate synthetic users.
                </p>
              </div>
            )}

            <div className="grid gap-3 rounded-lg border border-dashed bg-card p-4 sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-sm font-medium">Live count preview</p>
                <p className="text-sm text-muted-foreground">
                  {buildGenerationPreviewText(
                    generationValidation.totalUsers,
                    axes.length,
                    levelsPerAxis,
                  )}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">Estimated cost</p>
                {costEstimate ? (
                  <p className="text-sm text-muted-foreground">
                    {formatNumber(costEstimate.estimatedTokens)} tokens ·{" "}
                    {formatCurrency(costEstimate.estimatedCostUsd)}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Resolve the generation warning to see an estimate.
                  </p>
                )}
              </div>
            </div>

            {!generationValidation.valid ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm text-destructive">{generationValidation.error}</p>
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3">
              <Button
                disabled={!generationValidation.valid || hasActiveRun || isStartingGeneration}
                onClick={() => void handleStartGeneration()}
                type="button"
              >
                {isStartingGeneration ? "Starting..." : "Confirm & Generate"}
              </Button>
            </div>
          </div>
        ) : null}

        {batchGenerationRun ? (
          <div className="space-y-4 rounded-xl border bg-background p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h3 className="font-medium">Generation Progress</h3>
                <p className="text-sm text-muted-foreground">
                  {formatRunSummary(batchGenerationRun)}
                </p>
              </div>
              <Badge variant={runBadgeVariant(batchGenerationRun.status)}>
                {formatRunStatus(batchGenerationRun.status)}
              </Badge>
            </div>
            <Progress value={batchGenerationRun.progressPercent} />
            <p className="text-sm text-muted-foreground">
              {batchGenerationRun.completedCount + batchGenerationRun.failedCount}/
              {batchGenerationRun.totalCount} processed · {batchGenerationRun.remainingCount}{" "}
              remaining
            </p>
          </div>
        ) : null}

        {generatedUsers.length === 0 && batchGenerationRun === null ? (
          <div className="rounded-xl border border-dashed bg-background p-6">
            <p className="text-sm leading-6 text-muted-foreground">
              No generated synthetic users yet. Configure per-axis granularity, confirm the
              estimate, and run generation to build a reviewable cohort.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <h3 className="font-medium">Generated Users Grid</h3>
                <p className="text-sm text-muted-foreground">
                  Search across generated, manual, imported, and transcript-derived synthetic
                  users while you review the draft.
                </p>
              </div>
              <Input
                aria-label="Search synthetic users"
                className="sm:max-w-xs"
                placeholder="Search synthetic users"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </div>

            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[140px]">Name</TableHead>
                  <TableHead className="min-w-[180px]">Axis values</TableHead>
                  <TableHead className="min-w-[200px]">Bio preview</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSyntheticUsers.length === 0 ? (
                  <TableRow>
                    <TableCell className="text-muted-foreground" colSpan={6}>
                      No synthetic users match your search.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSyntheticUsers.map((syntheticUser) => {
                    const canRegenerateRow =
                      showGenerationControls
                      && syntheticUser.sourceType === "generated";
                    const isRegenerating = regeneratingUserIds.includes(syntheticUser._id);
                    const status = resolveSyntheticUserStatus(syntheticUser);

                    return (
                      <TableRow key={syntheticUser._id}>
                        <TableCell>
                          <p className="font-medium">{syntheticUser.name}</p>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {renderAxisValueBadges(
                              syntheticUser.axisValues,
                              axisLabelByKey,
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-xs">
                          <p className="line-clamp-2 text-sm text-muted-foreground">
                            {syntheticUser.firstPersonBio ?? syntheticUser.summary}
                          </p>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {formatSourceType(syntheticUser.sourceType)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-2">
                            <Badge variant={status.variant}>{status.label}</Badge>
                            {syntheticUser.generationError ? (
                              <p className="text-xs text-destructive">
                                {syntheticUser.generationError}
                              </p>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          {canRegenerateRow ? (
                            <Button
                              disabled={hasActiveRun || isRegenerating}
                              onClick={() => void handleRegenerateUser(syntheticUser._id)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              {isRegenerating ? "Regenerating..." : "Regenerate"}
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function buildLevelsPerAxis(
  axes: SharedAxis[],
  currentLevelsPerAxis?: Record<string, GridLevelCount>,
) {
  return Object.fromEntries(
    axes.map((axis) => [
      axis.key,
      currentLevelsPerAxis?.[axis.key] ?? DEFAULT_LEVEL_COUNT,
    ]),
  ) as Record<string, GridLevelCount>;
}

function buildGenerationPreviewText(
  totalUsers: number,
  axisCount: number,
  levelsPerAxis: Record<string, GridLevelCount>,
) {
  if (axisCount === 0) {
    return "0 axes x 0 levels = 0 synthetic users";
  }

  const levelCounts = Object.values(levelsPerAxis);
  const uniqueLevelCounts = Array.from(new Set(levelCounts));

  if (uniqueLevelCounts.length <= 1) {
    const levelCount = uniqueLevelCounts[0] ?? DEFAULT_LEVEL_COUNT;
    return `${axisCount} axes x ${levelCount} levels = ${totalUsers} synthetic users`;
  }

  return `${axisCount} axes x mixed levels (${levelCounts.join(" · ")}) = ${totalUsers} synthetic users`;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: Number.isInteger(value) ? 0 : 2,
  }).format(value);
}

function formatRunSummary(run: BatchGenerationRunView) {
  if (run.status === "pending" || run.status === "running") {
    return `${run.completedCount}/${run.totalCount} synthetic users generated`;
  }

  if (run.status === "completed") {
    return `Completed ${run.completedCount}/${run.totalCount} synthetic users.`;
  }

  if (run.status === "failed") {
    return `All ${run.totalCount} synthetic users failed to generate.`;
  }

  return `Generated ${run.completedCount} synthetic users with ${run.failedCount} failures.`;
}

function formatRunStatus(status: BatchGenerationRunView["status"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "running":
      return "Running";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "partially_failed":
      return "Partially Failed";
  }
}

function runBadgeVariant(status: BatchGenerationRunView["status"]) {
  switch (status) {
    case "completed":
      return "default" as const;
    case "pending":
    case "running":
      return "secondary" as const;
    case "failed":
      return "destructive" as const;
    case "partially_failed":
      return "outline" as const;
  }
}

function formatSourceType(sourceType: SyntheticUserDoc["sourceType"]) {
  switch (sourceType) {
    case "generated":
      return "Generated";
    case "json_import":
      return "Imported";
    case "transcript_derived":
      return "Transcript-derived";
    case "manual":
      return "Manual";
  }
}

function renderAxisValueBadges(
  axisValues: SyntheticUserDoc["axisValues"],
  axisLabelByKey: Map<string, string>,
) {
  if (axisValues === undefined || axisValues.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        No axis values
      </span>
    );
  }

  return axisValues.map((axisValue) => {
    const fullLabel = axisLabelByKey.get(axisValue.key) ?? axisValue.key;
    const shortLabel = abbreviateAxisLabel(fullLabel);

    return (
      <Badge
        key={`${axisValue.key}-${axisValue.value}`}
        className="max-w-[160px] truncate"
        title={`${fullLabel}: ${axisValue.value.toFixed(2)}`}
        variant="secondary"
      >
        {shortLabel}: {axisValue.value.toFixed(2)}
      </Badge>
    );
  });
}

function resolveSyntheticUserStatus(syntheticUser: SyntheticUserDoc) {
  if (syntheticUser.sourceType !== "generated") {
    return {
      label: "Ready",
      variant: "outline" as const,
    };
  }

  switch (syntheticUser.generationStatus) {
    case "pending_expansion":
      return {
        label: "Queued",
        variant: "secondary" as const,
      };
    case "expanding":
      return {
        label: "Expanding",
        variant: "secondary" as const,
      };
    case "failed":
      return {
        label: "Failed",
        variant: "destructive" as const,
      };
    case "completed":
    default:
      return {
        label: "Completed",
        variant: "default" as const,
      };
  }
}

function abbreviateAxisLabel(label: string) {
  if (label.length <= 20) {
    return label;
  }

  const words = label.split(/\s+/);

  if (words.length <= 2) {
    return label.slice(0, 18) + "...";
  }

  return words.map((word) => word[0]?.toUpperCase() ?? "").join("");
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return fallbackMessage;
}
