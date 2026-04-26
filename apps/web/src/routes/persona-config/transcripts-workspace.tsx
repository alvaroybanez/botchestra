import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PersonaConfigDetailSearch } from "@/router";
import { TranscriptExtractionPanel } from "./extraction-panel";
import { LoadingCard } from "./shared-ui";
import type {
  AxisFormValue,
  ConfigTranscriptAttachment,
  ExtractionArchetypeState,
  ExtractionMode,
  ExtractionReviewAxisState,
  ExtractionStatus,
  PersonaConfigDoc,
  TranscriptId,
} from "./types";
import { formatTimestamp } from "./helpers";

const formatFilterOptions = [
  { value: "txt", label: "TXT" },
  { value: "json", label: "JSON" },
] as const;

const sortOptions = [
  { value: "attached", label: "Recently attached" },
  { value: "filename", label: "Filename A-Z" },
] as const;

type SortKey = (typeof sortOptions)[number]["value"];

const nativeSelectClassName =
  "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

function filterAndSortTranscripts(
  transcripts: ConfigTranscriptAttachment[],
  searchText: string,
  formatFilter: string,
  sortKey: SortKey
): ConfigTranscriptAttachment[] {
  const normalizedSearch = searchText.trim().toLowerCase();

  let filtered = transcripts;

  if (formatFilter) {
    filtered = filtered.filter((ct) => ct.transcript.format === formatFilter);
  }

  if (normalizedSearch) {
    filtered = filtered.filter(
      (ct) =>
        ct.transcript.originalFilename
          .toLowerCase()
          .includes(normalizedSearch) ||
        (ct.transcript.metadata.participantId ?? "")
          .toLowerCase()
          .includes(normalizedSearch)
    );
  }

  const sorted = [...filtered];
  if (sortKey === "attached") {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  } else {
    sorted.sort((a, b) =>
      a.transcript.originalFilename.localeCompare(b.transcript.originalFilename)
    );
  }

  return sorted;
}

function TranscriptListRow({
  configTranscript,
  isSelected,
  onSelect,
}: {
  configTranscript: ConfigTranscriptAttachment;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const { transcript } = configTranscript;

  return (
    <div
      aria-selected={isSelected}
      role="option"
      tabIndex={-1}
      className={cn(
        "w-full cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors",
        "hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isSelected
          ? "border-primary/40 bg-accent"
          : "border-transparent bg-background"
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium">
          {transcript.originalFilename}
        </span>
        <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
          {transcript.format}
        </Badge>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {transcript.metadata.participantId
          ? `Participant ${transcript.metadata.participantId}`
          : "No participant ID"}
      </p>
    </div>
  );
}

function TranscriptInspector({
  configTranscript,
  isDraft,
  canManage,
  isDetaching,
  onDetach,
}: {
  configTranscript: ConfigTranscriptAttachment;
  isDraft: boolean;
  canManage: boolean;
  isDetaching: boolean;
  onDetach: (transcriptId: TranscriptId) => void;
}) {
  const { transcript } = configTranscript;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold">
            {transcript.originalFilename}
          </h3>
          <Badge variant="outline" className="shrink-0 uppercase">
            {transcript.format}
          </Badge>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Attached {formatTimestamp(configTranscript.createdAt)}
        </p>
      </div>

      <div>
        <h4 className="text-sm font-medium">Participant</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          {transcript.metadata.participantId ?? "Not specified"}
        </p>
      </div>

      {transcript.metadata.tags.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium">Tags</h4>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {transcript.metadata.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}

      {transcript.metadata.notes ? (
        <div>
          <h4 className="text-sm font-medium">Notes</h4>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {transcript.metadata.notes}
          </p>
        </div>
      ) : null}

      <div>
        <h4 className="text-sm font-medium">Details</h4>
        <dl className="mt-2 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Characters</dt>
            <dd>{transcript.characterCount.toLocaleString()}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Processing</dt>
            <dd className="capitalize">{transcript.processingStatus}</dd>
          </div>
          {transcript.metadata.date ? (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Date</dt>
              <dd>{transcript.metadata.date}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      <div className="flex flex-wrap gap-2 border-t pt-4">
        <Button asChild variant="outline" size="sm">
          <Link
            params={{ transcriptId: transcript._id }}
            to="/transcripts/$transcriptId"
          >
            Open in library
          </Link>
        </Button>
        {isDraft && canManage ? (
          <Button
            variant="outline"
            size="sm"
            disabled={isDetaching}
            onClick={() => onDetach(configTranscript.transcriptId)}
          >
            {isDetaching ? "Detaching..." : "Detach"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

interface TranscriptsWorkspaceProps {
  config: PersonaConfigDoc;
  isDraft: boolean;
  canManageConfigTranscripts: boolean;
  configTranscripts: ConfigTranscriptAttachment[] | undefined;
  extractionStatus: ExtractionStatus | null | undefined;
  extractionButtonLabel: string;
  canOpenExtraction: boolean;
  detachingTranscriptId: string | null;
  isExtractionPanelOpen: boolean;
  extractionMode: ExtractionMode | null;
  extractionStep:
    | "mode"
    | "guided"
    | "cost"
    | "processing"
    | "failed"
    | "results";
  extractionError: string | null;
  extractionNotice: string | null;
  extractionCostEstimate:
    | {
        totalCharacters: number;
        estimatedTokens: number;
        estimatedCostUsd: number;
      }
    | undefined;
  isStartingExtraction: boolean;
  isApplyingExtractionResults: boolean;
  guidedExtractionAxes: AxisFormValue[];
  reviewArchetypes: ExtractionArchetypeState[];
  activeReviewProposedAxes: ExtractionReviewAxisState[];
  extractionSharedAxes: AxisFormValue[];
  selectedExtractionArchetypeCount: number;
  transcriptFilenameById: Map<string, string>;
  discardingArchetypeId: string | null;
  selectedTranscriptId: string | undefined;
  onOpenTranscriptPicker: () => void;
  onOpenExtractionPanel: () => void;
  onDetachTranscript: (transcriptId: TranscriptId) => void;
  onCloseExtractionPanel: () => void;
  onSelectExtractionMode: (mode: ExtractionMode) => void;
  onContinueToExtractionCost: () => void;
  onBackFromExtractionCost: () => void;
  onStartExtraction: () => void;
  onResetExtractionWizard: () => void;
  onGuidedAxisChange: (index: number, axis: AxisFormValue) => void;
  onRemoveGuidedAxis: (index: number) => void;
  onAddGuidedAxis: () => void;
  onToggleArchetypeSelected: (id: string) => void;
  onToggleArchetypeEdit: (id: string) => void;
  onUpdateArchetype: (
    id: string,
    patch: Partial<ExtractionArchetypeState>
  ) => void;
  onMergeSelectedArchetypes: () => void;
  onDiscardArchetype: (id: string | null) => void;
  onConfirmDiscardArchetype: () => void;
  onProposedAxisChange: (id: string, axis: AxisFormValue) => void;
  onProposedAxisToggleEdit: (id: string) => void;
  onProposedAxisToggleRemoved: (id: string) => void;
  onApplyExtractionResults: () => void;
  onSearchChange: (patch: Partial<PersonaConfigDetailSearch>) => void;
}

function TranscriptsWorkspace(props: TranscriptsWorkspaceProps) {
  if (props.configTranscripts === undefined) {
    return (
      <LoadingCard title="Transcripts" body="Loading attached transcripts..." />
    );
  }

  return (
    <TranscriptsWorkspaceInner {...(props as TranscriptsWorkspaceInnerProps)} />
  );
}

type TranscriptsWorkspaceInnerProps = Omit<
  TranscriptsWorkspaceProps,
  "configTranscripts"
> & {
  configTranscripts: ConfigTranscriptAttachment[];
};

function TranscriptsWorkspaceInner({
  config,
  isDraft,
  canManageConfigTranscripts,
  configTranscripts,
  extractionStatus,
  extractionButtonLabel,
  canOpenExtraction,
  detachingTranscriptId,
  isExtractionPanelOpen,
  extractionMode,
  extractionStep,
  extractionError,
  extractionNotice,
  extractionCostEstimate,
  isStartingExtraction,
  isApplyingExtractionResults,
  guidedExtractionAxes,
  reviewArchetypes,
  activeReviewProposedAxes,
  extractionSharedAxes,
  selectedExtractionArchetypeCount,
  transcriptFilenameById,
  discardingArchetypeId,
  selectedTranscriptId,
  onOpenTranscriptPicker,
  onOpenExtractionPanel,
  onDetachTranscript,
  onCloseExtractionPanel,
  onSelectExtractionMode,
  onContinueToExtractionCost,
  onBackFromExtractionCost,
  onStartExtraction,
  onResetExtractionWizard,
  onGuidedAxisChange,
  onRemoveGuidedAxis,
  onAddGuidedAxis,
  onToggleArchetypeSelected,
  onToggleArchetypeEdit,
  onUpdateArchetype,
  onMergeSelectedArchetypes,
  onDiscardArchetype,
  onConfirmDiscardArchetype,
  onProposedAxisChange,
  onProposedAxisToggleEdit,
  onProposedAxisToggleRemoved,
  onApplyExtractionResults,
  onSearchChange,
}: TranscriptsWorkspaceInnerProps) {
  const [searchText, setSearchText] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("attached");

  const filteredTranscripts = useMemo(
    () =>
      filterAndSortTranscripts(
        configTranscripts,
        searchText,
        formatFilter,
        sortKey
      ),
    [configTranscripts, searchText, formatFilter, sortKey]
  );

  const selectedTranscript = useMemo(
    () =>
      filteredTranscripts.find(
        (ct) => String(ct.transcriptId) === selectedTranscriptId
      ) ?? null,
    [filteredTranscripts, selectedTranscriptId]
  );

  useEffect(() => {
    if (filteredTranscripts.length === 0) {
      if (selectedTranscriptId) {
        onSearchChange({ selectedTranscriptId: undefined });
      }
      return;
    }

    const firstTranscript = filteredTranscripts[0];
    if (!selectedTranscript && firstTranscript) {
      onSearchChange({
        selectedTranscriptId: String(firstTranscript.transcriptId),
      });
    }
  }, [
    filteredTranscripts,
    selectedTranscript,
    selectedTranscriptId,
    onSearchChange,
  ]);

  const listRef = useRef<HTMLDivElement>(null);

  const handleListKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (filteredTranscripts.length === 0) return;

      const currentIndex = selectedTranscript
        ? filteredTranscripts.indexOf(selectedTranscript)
        : -1;

      let nextIndex: number | null = null;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        nextIndex =
          currentIndex < filteredTranscripts.length - 1 ? currentIndex + 1 : 0;
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        nextIndex =
          currentIndex > 0 ? currentIndex - 1 : filteredTranscripts.length - 1;
      } else if (event.key === "Home") {
        event.preventDefault();
        nextIndex = 0;
      } else if (event.key === "End") {
        event.preventDefault();
        nextIndex = filteredTranscripts.length - 1;
      }

      if (nextIndex !== null) {
        const nextTranscript = filteredTranscripts[nextIndex];
        if (nextTranscript) {
          onSearchChange({
            selectedTranscriptId: String(nextTranscript.transcriptId),
          });
          const buttons = listRef.current?.querySelectorAll('[role="option"]');
          buttons?.[nextIndex]?.scrollIntoView({ block: "nearest" });
        }
      }
    },
    [filteredTranscripts, selectedTranscript, onSearchChange]
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-4" style={{ minHeight: 480 }}>
        <div className="flex w-72 shrink-0 flex-col rounded-xl border bg-card">
          <div className="space-y-3 border-b p-3">
            <Input
              placeholder="Search transcripts..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              aria-label="Search transcripts"
            />
            <div className="flex gap-2">
              <select
                value={formatFilter}
                onChange={(e) => setFormatFilter(e.target.value)}
                className={cn(nativeSelectClassName, "flex-1")}
                aria-label="Filter by format"
              >
                <option value="">All formats</option>
                {formatFilterOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className={cn(nativeSelectClassName, "flex-1")}
                aria-label="Sort order"
              >
                {sortOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              {isDraft && canManageConfigTranscripts ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={onOpenTranscriptPicker}
                >
                  Attach
                </Button>
              ) : null}
              {canOpenExtraction ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  disabled={extractionStatus?.status === "processing"}
                  onClick={onOpenExtractionPanel}
                >
                  {extractionButtonLabel}
                </Button>
              ) : null}
            </div>
          </div>

          <div
            ref={listRef}
            role="listbox"
            aria-label="Attached transcripts"
            tabIndex={0}
            className="flex-1 space-y-1 overflow-y-auto p-2 focus-visible:outline-none"
            onKeyDown={handleListKeyDown}
          >
            {filteredTranscripts.length === 0 ? (
              <p className="p-3 text-center text-xs text-muted-foreground">
                {configTranscripts.length === 0
                  ? "No transcripts attached yet."
                  : "No transcripts match the current filters."}
              </p>
            ) : (
              filteredTranscripts.map((ct) => (
                <TranscriptListRow
                  key={ct._id}
                  configTranscript={ct}
                  isSelected={String(ct.transcriptId) === selectedTranscriptId}
                  onSelect={() =>
                    onSearchChange({
                      selectedTranscriptId: String(ct.transcriptId),
                    })
                  }
                />
              ))
            )}
          </div>

          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            {filteredTranscripts.length} of {configTranscripts.length}{" "}
            transcripts
          </div>
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto rounded-xl border bg-card p-5">
          {selectedTranscript ? (
            <TranscriptInspector
              configTranscript={selectedTranscript}
              isDraft={isDraft}
              canManage={canManageConfigTranscripts}
              isDetaching={
                detachingTranscriptId ===
                String(selectedTranscript.transcriptId)
              }
              onDetach={onDetachTranscript}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">
                {configTranscripts.length === 0
                  ? "Attach a transcript to get started."
                  : "Select a transcript from the list."}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Permission notices */}
      {!isDraft ? (
        <p className="text-sm text-muted-foreground">
          Transcript attachments become read-only once the persona configuration
          is no longer a draft.
        </p>
      ) : null}
      {!canManageConfigTranscripts ? (
        <p className="text-sm text-muted-foreground">
          Reviewers can inspect attached transcripts but cannot attach or detach
          them.
        </p>
      ) : null}

      {/* Extraction panel */}
      {isDraft && canManageConfigTranscripts ? (
        <TranscriptExtractionPanel
          activeProposedAxes={activeReviewProposedAxes}
          archetypes={reviewArchetypes}
          attachedTranscripts={configTranscripts}
          costEstimate={extractionCostEstimate}
          discardArchetypeId={discardingArchetypeId}
          extractionError={extractionError}
          extractionMode={extractionMode}
          extractionNotice={extractionNotice}
          extractionStatus={extractionStatus}
          guidedAxes={guidedExtractionAxes}
          isApplying={isApplyingExtractionResults}
          isOpen={isExtractionPanelOpen}
          isStarting={isStartingExtraction}
          step={extractionStep}
          transcriptFilenameById={transcriptFilenameById}
          transcriptSignals={extractionStatus?.transcriptSignals ?? []}
          sharedAxes={extractionSharedAxes}
          selectedArchetypeCount={selectedExtractionArchetypeCount}
          onAddGuidedAxis={onAddGuidedAxis}
          onApply={onApplyExtractionResults}
          onBackFromCost={onBackFromExtractionCost}
          onClose={onCloseExtractionPanel}
          onConfirmDiscardArchetype={onConfirmDiscardArchetype}
          onContinueToCost={onContinueToExtractionCost}
          onDiscardArchetype={onDiscardArchetype}
          onGuidedAxisChange={onGuidedAxisChange}
          onMergeSelected={onMergeSelectedArchetypes}
          onModeSelect={onSelectExtractionMode}
          onProposedAxisChange={onProposedAxisChange}
          onProposedAxisToggleEdit={onProposedAxisToggleEdit}
          onProposedAxisToggleRemoved={onProposedAxisToggleRemoved}
          onRemoveGuidedAxis={onRemoveGuidedAxis}
          onResetWizard={onResetExtractionWizard}
          onStartExtraction={onStartExtraction}
          onToggleArchetypeEdit={onToggleArchetypeEdit}
          onToggleArchetypeSelected={onToggleArchetypeSelected}
          onUpdateArchetype={onUpdateArchetype}
        />
      ) : null}
    </div>
  );
}

export { TranscriptsWorkspace };
