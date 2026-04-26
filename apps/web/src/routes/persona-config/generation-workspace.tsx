import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { Doc, Id } from "../../../../../convex/_generated/dataModel";
import {
  estimateBatchCost,
  type GridAxis,
  type GridLevelCount,
  validateGenerationConfig,
} from "../../../../../convex/batchGeneration/gridAnchors";
import { MAX_SYNTHETIC_USERS_PER_CONFIG } from "../../../../../convex/personaConfig.constants";
import type { PersonaConfigDetailSearch } from "@/router";
import type {
  BatchGenerationRunView,
  PersonaConfigDoc,
  SyntheticUserDoc,
} from "./types";
import { DEFAULT_PAGE_SIZE, LoadingCard, PaginationFooter } from "./shared-ui";

type SyntheticUserId = Id<"syntheticUsers">;
type SharedAxis = Doc<"personaConfigs">["sharedAxes"][number];

const DEFAULT_LEVEL_COUNT: GridLevelCount = 3;

const sourceTypeOrder: Record<SyntheticUserDoc["sourceType"], number> = {
  generated: 0,
  manual: 1,
  json_import: 2,
  transcript_derived: 3,
};

function formatSourceType(sourceType: SyntheticUserDoc["sourceType"]) {
  switch (sourceType) {
    case "generated":
      return "Generated";
    case "json_import":
      return "Imported";
    case "transcript_derived":
      return "Transcript";
    case "manual":
      return "Manual";
  }
}

function resolveSyntheticUserStatus(syntheticUser: SyntheticUserDoc) {
  if (syntheticUser.sourceType !== "generated") {
    return { label: "Ready", variant: "outline" as const };
  }

  switch (syntheticUser.generationStatus) {
    case "pending_expansion":
      return { label: "Queued", variant: "secondary" as const };
    case "expanding":
      return { label: "Expanding", variant: "secondary" as const };
    case "failed":
      return { label: "Failed", variant: "destructive" as const };
    case "completed":
    default:
      return { label: "Completed", variant: "default" as const };
  }
}

function abbreviateAxisLabel(label: string) {
  if (label.length <= 20) return label;
  const words = label.split(/\s+/);
  if (words.length <= 2) return label.slice(0, 18) + "...";
  return words.map((w) => w[0]?.toUpperCase() ?? "").join("");
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
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

function buildLevelsPerAxis(
  axes: SharedAxis[],
  current?: Record<string, GridLevelCount>
) {
  return Object.fromEntries(
    axes.map((axis) => [axis.key, current?.[axis.key] ?? DEFAULT_LEVEL_COUNT])
  ) as Record<string, GridLevelCount>;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0)
    return error.message;
  return fallback;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function RunProgressZone({ run }: { run: BatchGenerationRunView }) {
  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h3 className="font-medium">Run Progress</h3>
          <p className="text-sm text-muted-foreground">
            {formatRunSummary(run)}
          </p>
        </div>
        <Badge variant={runBadgeVariant(run.status)}>
          {formatRunStatus(run.status)}
        </Badge>
      </div>
      <Progress value={run.progressPercent} />
      <p className="text-sm text-muted-foreground">
        {run.completedCount + run.failedCount}/{run.totalCount} processed
        &middot; {run.remainingCount} remaining
      </p>
    </div>
  );
}

function UserStatusTableZone({
  syntheticUsers,
  axes,
  showAllSources,
  showGenerationControls,
  hasActiveRun,
  failedGeneratedCount,
  isRetryingFailed,
  regeneratingUserIds,
  onToggleSources,
  onRegenerateUser,
  onRetryFailed,
  selectedUserId,
  onSelectUser,
}: {
  syntheticUsers: SyntheticUserDoc[];
  axes: SharedAxis[];
  showAllSources: boolean;
  showGenerationControls: boolean;
  hasActiveRun: boolean;
  failedGeneratedCount: number;
  isRetryingFailed: boolean;
  regeneratingUserIds: SyntheticUserId[];
  onToggleSources: () => void;
  onRegenerateUser: (id: SyntheticUserId) => void;
  onRetryFailed: () => void;
  selectedUserId: string | undefined;
  onSelectUser: (id: string) => void;
}) {
  const [searchText, setSearchText] = useState("");
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [currentPage, setCurrentPage] = useState(0);

  const axisLabelByKey = useMemo(
    () => new Map(axes.map((a) => [a.key, a.label])),
    [axes]
  );

  const visibleUsers = useMemo(() => {
    let users = syntheticUsers;
    if (!showAllSources) {
      users = users.filter((u) => u.sourceType === "generated");
    }
    // generated-first ordering
    users = [...users].sort(
      (a, b) =>
        sourceTypeOrder[a.sourceType] - sourceTypeOrder[b.sourceType] ||
        a.name.localeCompare(b.name)
    );

    const normalizedSearch = searchText.trim().toLowerCase();
    if (normalizedSearch) {
      users = users.filter(
        (u) =>
          u.name.toLowerCase().includes(normalizedSearch) ||
          (u.summary ?? "").toLowerCase().includes(normalizedSearch) ||
          (u.firstPersonBio ?? "").toLowerCase().includes(normalizedSearch)
      );
    }

    return users;
  }, [syntheticUsers, showAllSources, searchText]);

  const pageCount = Math.max(1, Math.ceil(visibleUsers.length / pageSize));

  // Clamp current page when filters or page size shrink the result set.
  useEffect(() => {
    if (currentPage >= pageCount) {
      setCurrentPage(Math.max(0, pageCount - 1));
    }
  }, [pageCount, currentPage]);

  const pagedUsers = useMemo(
    () =>
      visibleUsers.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
    [visibleUsers, currentPage, pageSize]
  );

  const tableRef = useRef<HTMLTableElement>(null);

  const handleTableKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (visibleUsers.length === 0) return;
      const currentIndex = visibleUsers.findIndex(
        (u) => u._id === selectedUserId
      );
      let nextIndex: number | null = null;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        nextIndex =
          currentIndex < visibleUsers.length - 1 ? currentIndex + 1 : 0;
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nextIndex =
          currentIndex > 0 ? currentIndex - 1 : visibleUsers.length - 1;
      } else if (event.key === "Home") {
        event.preventDefault();
        nextIndex = 0;
      } else if (event.key === "End") {
        event.preventDefault();
        nextIndex = visibleUsers.length - 1;
      }

      if (nextIndex !== null) {
        const nextUser = visibleUsers[nextIndex];
        if (nextUser) {
          onSelectUser(nextUser._id);
          const targetPage = Math.floor(nextIndex / pageSize);
          if (targetPage !== currentPage) {
            setCurrentPage(targetPage);
          }
          const localIndex = nextIndex - targetPage * pageSize;
          // Scroll on next tick so the row is rendered after page change.
          window.requestAnimationFrame(() => {
            const rows =
              tableRef.current?.querySelectorAll("tr[data-user-row]");
            rows?.[localIndex]?.scrollIntoView({ block: "nearest" });
          });
        }
      }
    },
    [visibleUsers, selectedUserId, onSelectUser, pageSize, currentPage]
  );

  const generatedCount = syntheticUsers.filter(
    (u) => u.sourceType === "generated"
  ).length;
  const totalCount = syntheticUsers.length;

  return (
    <div className="space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h3 className="font-medium">User Status</h3>
          <p className="text-sm text-muted-foreground">
            {showAllSources
              ? `${totalCount} total users (${generatedCount} generated)`
              : `${generatedCount} generated users`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {showGenerationControls && failedGeneratedCount > 0 ? (
            <Button
              disabled={hasActiveRun || isRetryingFailed}
              onClick={onRetryFailed}
              size="sm"
              type="button"
              variant="outline"
            >
              {isRetryingFailed
                ? "Retrying failed..."
                : `Retry ${failedGeneratedCount} failed`}
            </Button>
          ) : null}
          <Input
            aria-label="Search users"
            className="w-48"
            placeholder="Search..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleSources}
            aria-pressed={showAllSources}
          >
            {showAllSources ? "Generated only" : "Show all sources"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto" onKeyDown={handleTableKeyDown}>
        <Table ref={tableRef} tabIndex={0} role="grid">
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
            {visibleUsers.length === 0 ? (
              <TableRow>
                <TableCell className="text-muted-foreground" colSpan={6}>
                  {syntheticUsers.length === 0
                    ? "No synthetic users yet. Configure per-axis granularity and run generation."
                    : "No users match your search."}
                </TableCell>
              </TableRow>
            ) : (
              pagedUsers.map((user) => {
                const canRegenerate =
                  showGenerationControls && user.sourceType === "generated";
                const isRegenerating = regeneratingUserIds.includes(user._id);
                const status = resolveSyntheticUserStatus(user);
                const isSelected = user._id === selectedUserId;

                return (
                  <TableRow
                    key={user._id}
                    data-user-row
                    className={cn(
                      "cursor-pointer transition-colors",
                      isSelected && "bg-accent"
                    )}
                    onClick={() => onSelectUser(user._id)}
                  >
                    <TableCell>
                      <p className="font-medium">{user.name}</p>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.axisValues && user.axisValues.length > 0 ? (
                          user.axisValues.map((av) => {
                            const fullLabel =
                              axisLabelByKey.get(av.key) ?? av.key;
                            const shortLabel = abbreviateAxisLabel(fullLabel);
                            return (
                              <Badge
                                key={`${av.key}-${av.value}`}
                                className="max-w-[160px] truncate"
                                title={`${fullLabel}: ${av.value.toFixed(2)}`}
                                variant="secondary"
                              >
                                {shortLabel}: {av.value.toFixed(2)}
                              </Badge>
                            );
                          })
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            No axis values
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-xs">
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {user.firstPersonBio ?? user.summary}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {formatSourceType(user.sourceType)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Badge variant={status.variant}>{status.label}</Badge>
                        {user.generationError ? (
                          <p className="text-xs text-destructive">
                            {user.generationError}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {canRegenerate ? (
                        <Button
                          disabled={hasActiveRun || isRegenerating}
                          onClick={(e) => {
                            e.stopPropagation();
                            onRegenerateUser(user._id);
                          }}
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

      <PaginationFooter
        pageSize={pageSize}
        currentPage={currentPage}
        pageCount={pageCount}
        filteredCount={visibleUsers.length}
        totalCount={totalCount}
        itemLabel="users"
        onPageChange={setCurrentPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main workspace
// ---------------------------------------------------------------------------

interface GenerationWorkspaceProps {
  config: PersonaConfigDoc;
  isDraft: boolean;
  canManageGeneration: boolean;
  batchGenerationRun: BatchGenerationRunView | null;
  syntheticUsers: SyntheticUserDoc[] | undefined;
  selectedGenerationUserId: string | undefined;
  onRegenerateUser: (syntheticUserId: SyntheticUserId) => Promise<unknown>;
  onStartGeneration: (
    levelsPerAxis: Record<string, GridLevelCount>
  ) => Promise<unknown>;
  onSearchChange: (patch: Partial<PersonaConfigDetailSearch>) => void;
}

function GenerationWorkspace(props: GenerationWorkspaceProps) {
  if (props.syntheticUsers === undefined) {
    return (
      <LoadingCard
        title="Generation"
        body="Loading synthetic users for generation..."
      />
    );
  }

  return (
    <GenerationWorkspaceInner {...(props as GenerationWorkspaceInnerProps)} />
  );
}

type GenerationWorkspaceInnerProps = Omit<
  GenerationWorkspaceProps,
  "syntheticUsers"
> & {
  syntheticUsers: SyntheticUserDoc[];
};

function GenerationWorkspaceInner({
  config,
  isDraft,
  canManageGeneration,
  batchGenerationRun,
  syntheticUsers,
  selectedGenerationUserId,
  onRegenerateUser,
  onStartGeneration,
  onSearchChange,
}: GenerationWorkspaceInnerProps) {
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationNotice, setGenerationNotice] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [regeneratingUserIds, setRegeneratingUserIds] = useState<
    SyntheticUserId[]
  >([]);
  const [showAllSources, setShowAllSources] = useState(false);
  const [levelsPerAxis, setLevelsPerAxis] = useState<
    Record<string, GridLevelCount>
  >(() => buildLevelsPerAxis(config.sharedAxes));

  const axes = config.sharedAxes;

  useEffect(() => {
    setLevelsPerAxis((prev) => buildLevelsPerAxis(axes, prev));
    setGenerationError(null);
    setGenerationNotice(null);
    setIsStarting(false);
    setIsRetryingFailed(false);
    setRegeneratingUserIds([]);
  }, [axes]);

  const showControls = isDraft && canManageGeneration;
  const hasActiveRun =
    batchGenerationRun?.status === "pending" ||
    batchGenerationRun?.status === "running";

  const generationAxes: GridAxis[] = useMemo(
    () =>
      axes.map((a) => ({
        name: a.key,
        lowAnchor: a.lowAnchor,
        midAnchor: a.midAnchor,
        highAnchor: a.highAnchor,
      })),
    [axes]
  );

  const generationValidation = useMemo(
    () =>
      validateGenerationConfig(
        generationAxes,
        levelsPerAxis,
        MAX_SYNTHETIC_USERS_PER_CONFIG
      ),
    [generationAxes, levelsPerAxis]
  );

  const costEstimate = generationValidation.valid
    ? estimateBatchCost(generationValidation.totalUsers)
    : null;

  const failedGeneratedUsers = useMemo(
    () =>
      syntheticUsers.filter(
        (u) => u.sourceType === "generated" && u.generationStatus === "failed"
      ),
    [syntheticUsers]
  );

  // Auto-select first generated user when no selection exists
  useEffect(() => {
    const generated = syntheticUsers.filter(
      (u) => u.sourceType === "generated"
    );
    if (generated.length === 0) return;
    const current = syntheticUsers.find(
      (u) => u._id === selectedGenerationUserId
    );
    if (!current && generated[0]) {
      onSearchChange({ selectedGenerationUserId: generated[0]._id });
    }
  }, [syntheticUsers, selectedGenerationUserId, onSearchChange]);

  async function handleStart() {
    if (!showControls || hasActiveRun || isStarting) return;
    if (!generationValidation.valid) {
      setGenerationError(
        "error" in generationValidation
          ? generationValidation.error
          : "Invalid configuration"
      );
      setGenerationNotice(null);
      return;
    }

    setGenerationError(null);
    setGenerationNotice(null);
    setIsStarting(true);
    try {
      await onStartGeneration(levelsPerAxis);
      setGenerationNotice(
        "Batch generation started. Progress will continue even if you navigate away."
      );
    } catch (err) {
      setGenerationError(
        getErrorMessage(err, "Could not start batch generation.")
      );
    } finally {
      setIsStarting(false);
    }
  }

  async function handleRegenerateUser(id: SyntheticUserId) {
    setGenerationError(null);
    setGenerationNotice(null);
    setRegeneratingUserIds((cur) => (cur.includes(id) ? cur : [...cur, id]));
    try {
      await onRegenerateUser(id);
      setGenerationNotice("Synthetic user regeneration queued.");
    } catch (err) {
      setGenerationError(
        getErrorMessage(err, "Could not regenerate that synthetic user.")
      );
    } finally {
      setRegeneratingUserIds((cur) => cur.filter((x) => x !== id));
    }
  }

  async function handleRetryFailed() {
    if (failedGeneratedUsers.length === 0 || isRetryingFailed || hasActiveRun)
      return;

    const failedIds = failedGeneratedUsers.map((u) => u._id);
    setGenerationError(null);
    setGenerationNotice(null);
    setIsRetryingFailed(true);
    setRegeneratingUserIds((cur) => [
      ...cur,
      ...failedIds.filter((id) => !cur.includes(id)),
    ]);

    try {
      const results = await Promise.allSettled(
        failedIds.map((id) => onRegenerateUser(id))
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failures = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected"
      );

      if (failures.length === 0) {
        setGenerationNotice(
          succeeded === 1
            ? "Queued regeneration for 1 failed synthetic user."
            : `Queued regeneration for ${succeeded} failed synthetic users.`
        );
      } else if (succeeded === 0) {
        const firstReason = failures[0]?.reason;
        setGenerationError(
          getErrorMessage(
            firstReason,
            `All ${failures.length} retry attempts failed.`
          )
        );
      } else {
        setGenerationNotice(
          `Queued regeneration for ${succeeded} of ${failedIds.length} synthetic users.`
        );
        const firstReason = failures[0]?.reason;
        setGenerationError(
          getErrorMessage(
            firstReason,
            `${failures.length} of ${failedIds.length} retry attempts failed.`
          )
        );
      }
    } finally {
      setIsRetryingFailed(false);
      setRegeneratingUserIds((cur) =>
        cur.filter((id) => !failedIds.includes(id))
      );
    }
  }

  const progressZone = batchGenerationRun ? (
    <RunProgressZone run={batchGenerationRun} />
  ) : null;

  const tableZone = (
    <UserStatusTableZone
      syntheticUsers={syntheticUsers}
      axes={axes}
      showAllSources={showAllSources}
      showGenerationControls={showControls}
      hasActiveRun={hasActiveRun}
      failedGeneratedCount={failedGeneratedUsers.length}
      isRetryingFailed={isRetryingFailed}
      regeneratingUserIds={regeneratingUserIds}
      onToggleSources={() => setShowAllSources((prev) => !prev)}
      onRegenerateUser={(id) => void handleRegenerateUser(id)}
      onRetryFailed={() => void handleRetryFailed()}
      selectedUserId={selectedGenerationUserId}
      onSelectUser={(id) => onSearchChange({ selectedGenerationUserId: id })}
    />
  );

  return (
    <div className="space-y-4">
      {showControls ? (
        <div className="flex items-center gap-4 rounded-xl border bg-card px-5 py-3">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">{axes.length}</span>
            <span className="text-muted-foreground">axes</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">
              {generationValidation.totalUsers}
            </span>
            <span className="text-muted-foreground">users</span>
          </div>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2 text-sm">
            {costEstimate ? (
              <>
                <span className="font-medium">
                  {formatCurrency(costEstimate.estimatedCostUsd)}
                </span>
                <span className="text-muted-foreground">est. cost</span>
              </>
            ) : (
              <span className="text-muted-foreground">No estimate</span>
            )}
          </div>
          {generationError ? (
            <>
              <div className="h-4 w-px bg-border" />
              <p className="text-sm text-destructive">{generationError}</p>
            </>
          ) : null}
          {generationNotice ? (
            <>
              <div className="h-4 w-px bg-border" />
              <p className="text-sm text-emerald-700">{generationNotice}</p>
            </>
          ) : null}
          <div className="ml-auto">
            <Button
              disabled={
                !generationValidation.valid || hasActiveRun || isStarting
              }
              onClick={() => void handleStart()}
              size="sm"
              type="button"
            >
              {isStarting ? "Starting..." : "Generate"}
            </Button>
          </div>
        </div>
      ) : (
        <>
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
        </>
      )}
      {progressZone}
      {tableZone}
    </div>
  );
}

export { GenerationWorkspace };
