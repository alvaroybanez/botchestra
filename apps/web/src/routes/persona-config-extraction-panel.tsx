import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SummaryValue } from "@/components/summary-value";
import {
  type ConfigTranscriptAttachment,
  type AxisFormValue,
  type ExtractionMode,
  type ExtractionArchetypeState,
  type ExtractionReviewAxisState,
  type ExtractionStatus,
  type TranscriptSignalDoc,
  type TranscriptDoc,
  textareaClassName,
  formatTranscriptSignalStatus,
  formatAxisValue,
  upsertAxisValue,
  LoadingSpinner,
  AxisInput,
} from "@/routes/persona-config-shared";
import { AxisEditorCard } from "@/routes/persona-config-overview-tab";

export function TranscriptExtractionPanel({
  activeProposedAxes,
  archetypes,
  attachedTranscripts,
  costEstimate,
  discardArchetypeId,
  extractionError,
  extractionMode,
  extractionNotice,
  extractionStatus,
  guidedAxes,
  isApplying,
  isOpen,
  isStarting,
  onAddGuidedAxis,
  onApply,
  onBackFromCost,
  onClose,
  onConfirmDiscardArchetype,
  onContinueToCost,
  onDiscardArchetype,
  onGuidedAxisChange,
  onMergeSelected,
  onModeSelect,
  onProposedAxisChange,
  onProposedAxisToggleEdit,
  onProposedAxisToggleRemoved,
  onRemoveGuidedAxis,
  onResetWizard,
  onStartExtraction,
  onToggleArchetypeEdit,
  onToggleArchetypeSelected,
  onUpdateArchetype,
  selectedArchetypeCount,
  sharedAxes,
  step,
  transcriptFilenameById,
  transcriptSignals,
}: {
  activeProposedAxes: ExtractionReviewAxisState[];
  archetypes: ExtractionArchetypeState[];
  attachedTranscripts: ConfigTranscriptAttachment[];
  costEstimate:
    | {
        totalCharacters: number;
        estimatedTokens: number;
        estimatedCostUsd: number;
      }
    | undefined;
  discardArchetypeId: string | null;
  extractionError: string | null;
  extractionMode: ExtractionMode | null;
  extractionNotice: string | null;
  extractionStatus: ExtractionStatus | null | undefined;
  guidedAxes: AxisFormValue[];
  isApplying: boolean;
  isOpen: boolean;
  isStarting: boolean;
  onAddGuidedAxis: () => void;
  onApply: () => void;
  onBackFromCost: () => void;
  onClose: () => void;
  onConfirmDiscardArchetype: () => void;
  onContinueToCost: () => void;
  onDiscardArchetype: (archetypeId: string | null) => void;
  onGuidedAxisChange: (index: number, nextAxis: AxisFormValue) => void;
  onMergeSelected: () => void;
  onModeSelect: (mode: ExtractionMode) => void;
  onProposedAxisChange: (axisId: string, nextAxis: AxisFormValue) => void;
  onProposedAxisToggleEdit: (axisId: string) => void;
  onProposedAxisToggleRemoved: (axisId: string) => void;
  onRemoveGuidedAxis: (index: number) => void;
  onResetWizard: () => void;
  onStartExtraction: () => void;
  onToggleArchetypeEdit: (archetypeId: string) => void;
  onToggleArchetypeSelected: (archetypeId: string) => void;
  onUpdateArchetype: (
    archetypeId: string,
    patch: Partial<ExtractionArchetypeState>,
  ) => void;
  selectedArchetypeCount: number;
  sharedAxes: AxisFormValue[];
  step: "mode" | "guided" | "cost" | "processing" | "failed" | "results";
  transcriptFilenameById: Map<string, string>;
  transcriptSignals: TranscriptSignalDoc[];
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h4 className="text-lg font-semibold">Transcript extraction</h4>
          <p className="text-sm text-muted-foreground">
            Convert attached interview transcripts into draft synthetic users with
            traceable evidence.
          </p>
        </div>

        <Button type="button" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>

      {extractionNotice ? (
        <p className="mt-4 text-sm text-emerald-700" role="status">
          {extractionNotice}
        </p>
      ) : null}
      {extractionError ? (
        <p className="mt-4 text-sm text-destructive" role="alert">
          {extractionError}
        </p>
      ) : null}

      {step === "mode" ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ModeSelectionCard
              description="Let the system propose behavioral axes from transcript themes before clustering archetypes."
              isSelected={extractionMode === "auto_discover"}
              title="Auto-discover"
              onClick={() => onModeSelect("auto_discover")}
            />
            <ModeSelectionCard
              description="Map transcript signals onto explicit axes that you define and review before extraction starts."
              isSelected={extractionMode === "guided"}
              title="Guided"
              onClick={() => onModeSelect("guided")}
            />
          </div>
          <p className="text-sm text-muted-foreground">
            Choose one mode to continue. No transcript processing starts until
            you confirm the cost estimate.
          </p>
        </div>
      ) : null}

      {step === "guided" ? (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <p className="font-medium">Define guided axes</p>
              <p className="text-sm text-muted-foreground">
                Review the persona configuration&apos;s current axes, edit them as needed, and keep
                at least one axis before estimating extraction cost.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={onAddGuidedAxis}>
              Add axis
            </Button>
          </div>

          <div className="grid gap-4">
            {guidedAxes.map((axis, index) => (
              <AxisEditorCard
                key={`guided-axis-${index}`}
                axis={axis}
                canRemove={guidedAxes.length > 1}
                formPrefix="guided-extraction"
                index={index}
                onChange={(nextAxis) => onGuidedAxisChange(index, nextAxis)}
                onRemove={() => onRemoveGuidedAxis(index)}
              />
            ))}
          </div>

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={onContinueToCost}>
              Continue to cost estimate
            </Button>
          </div>
        </div>
      ) : null}

      {step === "cost" ? (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 lg:grid-cols-4">
            <SummaryValue
              label="Mode"
              value={extractionMode === "guided" ? "Guided" : "Auto-discover"}
            />
            <SummaryValue
              label="Transcripts"
              value={String(attachedTranscripts.length)}
            />
            <SummaryValue
              label="Estimated tokens"
              value={
                costEstimate ? costEstimate.estimatedTokens.toLocaleString() : "Loading..."
              }
            />
            <SummaryValue
              label="Estimated cost"
              value={
                costEstimate
                  ? `$${costEstimate.estimatedCostUsd.toFixed(4)}`
                  : "Loading..."
              }
            />
          </div>

          {costEstimate ? (
            <p className="text-sm text-muted-foreground">
              This estimate is based on {costEstimate.totalCharacters.toLocaleString()}{" "}
              transcript characters. Leaving this page before confirming will not
              start extraction.
            </p>
          ) : (
            <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <LoadingSpinner />
              Calculating transcript extraction cost...
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onBackFromCost}>
              Back
            </Button>
            <Button
              disabled={costEstimate === undefined || isStarting}
              type="button"
              onClick={onStartExtraction}
            >
              {isStarting ? "Starting..." : "Confirm & Extract"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "processing" ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border bg-background p-4">
            <div className="flex items-center gap-3">
              <LoadingSpinner />
              <div className="space-y-1">
                <p className="font-medium">
                  Processing {extractionStatus?.processedTranscriptCount ?? 0}/
                  {extractionStatus?.totalTranscripts ?? attachedTranscripts.length} transcripts
                </p>
                <p className="text-sm text-muted-foreground">
                  {extractionStatus?.currentTranscriptId
                    ? `Currently extracting signals from ${
                        transcriptFilenameById.get(String(extractionStatus.currentTranscriptId))
                        ?? extractionStatus.currentTranscriptId
                      }.`
                    : "Preparing the next transcript..."}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {attachedTranscripts.map((attachment) => {
              const transcriptSignal = transcriptSignals.find(
                (signal) => signal.transcriptId === attachment.transcriptId,
              );
              const failedTranscript = extractionStatus?.failedTranscripts.find(
                (failed) => failed.transcriptId === attachment.transcriptId,
              );
              const statusLabel = transcriptSignal?.status
                ? formatTranscriptSignalStatus(transcriptSignal.status)
                : failedTranscript
                  ? "Failed"
                  : extractionStatus?.currentTranscriptId === attachment.transcriptId
                    ? "Processing"
                    : "Pending";

              return (
                <div
                  key={attachment._id}
                  className="flex items-center justify-between rounded-lg border bg-background px-4 py-3"
                >
                  <div className="space-y-1">
                    <p className="font-medium">{attachment.transcript.originalFilename}</p>
                    <p className="text-sm text-muted-foreground">
                      {attachment.transcript.metadata.participantId
                        ? `Participant ${attachment.transcript.metadata.participantId}`
                        : "No participant ID"}
                    </p>
                  </div>
                  <span className="text-sm text-muted-foreground">{statusLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {step === "failed" ? (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
            <p className="font-medium text-destructive">Extraction failed</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {extractionStatus?.errorMessage ?? "Transcript extraction did not complete successfully."}
            </p>
          </div>

          {extractionStatus?.failedTranscripts.length ? (
            <div className="space-y-2">
              {extractionStatus.failedTranscripts.map((failedTranscript) => (
                <div
                  key={failedTranscript.transcriptId}
                  className="rounded-lg border bg-background px-4 py-3 text-sm"
                >
                  <p className="font-medium">
                    {transcriptFilenameById.get(String(failedTranscript.transcriptId))
                      ?? failedTranscript.transcriptId}
                  </p>
                  <p className="text-muted-foreground">{failedTranscript.error}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onResetWizard}>
              Start over
            </Button>
          </div>
        </div>
      ) : null}

      {step === "results" ? (
        <div className="mt-4 space-y-6">
          {extractionStatus?.status === "completed_with_failures" ? (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="font-medium text-amber-900">Partial results available</p>
              <p className="mt-1 text-sm text-amber-900/80">
                {extractionStatus.failedTranscripts.length} transcript
                {extractionStatus.failedTranscripts.length === 1 ? "" : "s"} failed. You can
                still review and apply the successful archetypes below.
              </p>
            </div>
          ) : null}

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-medium">Per-transcript signal review</p>
                <p className="text-sm text-muted-foreground">
                  Expand each transcript to inspect extracted themes, attitudes,
                  pain points, decision patterns, and failure states.
                </p>
              </div>
            </div>

            {attachedTranscripts.map((attachment) => {
              const transcriptSignal = transcriptSignals.find(
                (signal) => signal.transcriptId === attachment.transcriptId,
              );
              const failedTranscript = extractionStatus?.failedTranscripts.find(
                (failed) => failed.transcriptId === attachment.transcriptId,
              );

              return (
                <details
                  key={attachment._id}
                  className="rounded-xl border bg-background p-4"
                >
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-medium">{attachment.transcript.originalFilename}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatTranscriptSignalStatus(
                            transcriptSignal?.status ?? (failedTranscript ? "failed" : "processing"),
                          )}
                        </p>
                      </div>
                    </div>
                  </summary>

                  {failedTranscript ? (
                    <p className="mt-3 text-sm text-destructive">{failedTranscript.error}</p>
                  ) : transcriptSignal?.signals ? (
                    <div className="mt-4 grid gap-4 md:grid-cols-2">
                      <TranscriptSignalList
                        items={transcriptSignal.signals.themes}
                        label="Themes"
                      />
                      <TranscriptSignalList
                        items={transcriptSignal.signals.attitudes}
                        label="Attitudes"
                      />
                      <TranscriptSignalList
                        items={transcriptSignal.signals.painPoints}
                        label="Pain points"
                      />
                      <TranscriptSignalList
                        items={transcriptSignal.signals.decisionPatterns}
                        label="Decision patterns"
                      />
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Transcript signals are still being finalized.
                    </p>
                  )}
                </details>
              );
            })}
          </div>

          {extractionMode === "auto_discover" ? (
            <div className="space-y-4 rounded-xl border bg-background p-4">
              <div className="space-y-1">
                <p className="font-medium">Proposed axes</p>
                <p className="text-sm text-muted-foreground">
                  Accept, edit, or remove auto-discovered axes before applying
                  transcript-derived synthetic users.
                </p>
              </div>

              {activeProposedAxes.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No proposed axes are currently selected.
                </p>
              ) : (
                <div className="grid gap-4">
                  {activeProposedAxes.map((proposedAxis, index) => (
                    <div
                      key={proposedAxis.id}
                      className="rounded-xl border bg-card p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {proposedAxis.axis.label || `Proposed axis ${index + 1}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {proposedAxis.axis.key || "missing_key"} · weight{" "}
                            {proposedAxis.axis.weight || "—"}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => onProposedAxisToggleEdit(proposedAxis.id)}
                          >
                            {proposedAxis.isEditing ? "Hide editor" : "Edit"}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => onProposedAxisToggleRemoved(proposedAxis.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>

                      {proposedAxis.isEditing ? (
                        <div className="mt-4">
                          <AxisEditorCard
                            axis={proposedAxis.axis}
                            canRemove={false}
                            formPrefix={`proposed-axis-${proposedAxis.id}`}
                            index={index}
                            onChange={(nextAxis) =>
                              onProposedAxisChange(proposedAxis.id, nextAxis)
                            }
                            onRemove={() => undefined}
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-medium">Archetype review</p>
                <p className="text-sm text-muted-foreground">
                  {selectedArchetypeCount} archetype
                  {selectedArchetypeCount === 1 ? "" : "s"} selected for apply.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={selectedArchetypeCount !== 2}
                  type="button"
                  variant="outline"
                  onClick={onMergeSelected}
                >
                  Merge selected
                </Button>
                <Button
                  disabled={selectedArchetypeCount === 0 || isApplying}
                  type="button"
                  onClick={onApply}
                >
                  {isApplying ? "Applying..." : "Apply to persona configuration"}
                </Button>
              </div>
            </div>

            <div className="grid gap-4">
              {archetypes.map((archetype) => (
                <div
                  key={archetype.id}
                  className={cn(
                    "rounded-xl border bg-background p-4",
                    archetype.isSelected ? "border-primary/60 ring-1 ring-primary/30" : "",
                  )}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <label
                      className="inline-flex cursor-pointer items-start gap-3"
                      htmlFor={`archetype-toggle-${archetype.id}`}
                    >
                      <input
                        checked={archetype.isSelected}
                        className="mt-1 h-4 w-4 rounded border-input"
                        id={`archetype-toggle-${archetype.id}`}
                        onChange={() => onToggleArchetypeSelected(archetype.id)}
                        type="checkbox"
                      />
                      <div className="space-y-2">
                        <p className="font-medium">{archetype.name}</p>
                        <p className="text-sm text-muted-foreground">{archetype.summary}</p>
                      </div>
                    </label>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onToggleArchetypeEdit(archetype.id)}
                      >
                        {archetype.isEditing ? "Hide editor" : "Edit"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => onDiscardArchetype(archetype.id)}
                      >
                        Discard
                      </Button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Evidence snippets</p>
                        <ul className="space-y-2">
                          {archetype.evidenceSnippets.map((snippet, index) => (
                            <li key={`${archetype.id}-${index}`}>
                              <Link
                                className="block rounded-lg border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                                params={{ transcriptId: snippet.transcriptId }}
                                search={{ highlightSnippet: snippet.quote }}
                                to="/transcripts/$transcriptId"
                              >
                                {snippet.quote}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-2">
                        <p className="text-sm font-medium">Contributing transcripts</p>
                        <div className="flex flex-wrap gap-2">
                          {archetype.contributingTranscriptIds.map((transcriptId) => (
                            <span
                              key={`${archetype.id}-${transcriptId}`}
                              className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground"
                            >
                              {transcriptFilenameById.get(String(transcriptId)) ?? transcriptId}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <p className="text-sm font-medium">Axis values</p>
                      <div className="grid gap-3">
                        {sharedAxes.map((axis) => (
                          <SummaryValue
                            key={`${archetype.id}-${axis.key}`}
                            label={axis.label || axis.key}
                            value={formatAxisValue(archetype.axisValues, axis.key)}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {archetype.isEditing ? (
                    <div className="mt-4 space-y-4 rounded-xl border bg-card p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <AxisInput
                          id={`archetype-name-${archetype.id}`}
                          label="Name"
                          value={archetype.name}
                          onChange={(value) =>
                            onUpdateArchetype(archetype.id, { name: value })
                          }
                        />
                        <div className="grid gap-2">
                          <Label htmlFor={`archetype-summary-${archetype.id}`}>Summary</Label>
                          <textarea
                            id={`archetype-summary-${archetype.id}`}
                            className={textareaClassName}
                            value={archetype.summary}
                            onChange={(event) =>
                              onUpdateArchetype(archetype.id, {
                                summary: event.target.value,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        {sharedAxes.map((axis) => (
                          <div key={`${archetype.id}-edit-${axis.key}`} className="grid gap-2">
                            <Label htmlFor={`${archetype.id}-${axis.key}`}>
                              {axis.label || axis.key}
                            </Label>
                            <Input
                              id={`${archetype.id}-${axis.key}`}
                              max="1"
                              min="-1"
                              step="0.01"
                              type="number"
                              value={
                                archetype.axisValues.find(
                                  (axisValue) => axisValue.key === axis.key,
                                )?.value ?? 0
                              }
                              onChange={(event) =>
                                onUpdateArchetype(archetype.id, {
                                  axisValues: upsertAxisValue(
                                    archetype.axisValues,
                                    axis.key,
                                    Number(event.target.value),
                                  ),
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {discardArchetypeId ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <p className="font-medium text-destructive">Discard this archetype?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Discarded archetypes are removed from the review set and will not
                be included when you apply results to the persona configuration.
              </p>
              <div className="mt-4 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => onDiscardArchetype(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={onConfirmDiscardArchetype}>
                  Confirm discard
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ModeSelectionCard({
  description,
  isSelected,
  title,
  onClick,
}: {
  description: string;
  isSelected: boolean;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "rounded-xl border bg-background p-4 text-left transition-colors",
        isSelected ? "border-primary/60 ring-1 ring-primary/30" : "hover:border-primary/40",
      )}
      type="button"
      onClick={onClick}
    >
      <p className="font-medium">{title}</p>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    </button>
  );
}

export function TranscriptSignalList({
  items,
  label,
}: {
  items: string[];
  label: string;
}) {
  return (
    <div className="space-y-2 rounded-lg border bg-card p-4">
      <p className="text-sm font-medium">{label}</p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None extracted.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={`${label}-${index}`}
              className="rounded-md border bg-background px-3 py-2 text-sm text-muted-foreground"
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TranscriptAttachmentDialog({
  transcripts,
  totalTranscriptCount,
  searchText,
  selectedTranscriptIds,
  isLoading,
  isOpen,
  isSubmitting,
  onCancel,
  onConfirm,
  onSearchChange,
  onToggleSelected,
}: {
  transcripts: TranscriptDoc[];
  totalTranscriptCount: number;
  searchText: string;
  selectedTranscriptIds: string[];
  isLoading: boolean;
  isOpen: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  onSearchChange: (value: string) => void;
  onToggleSelected: (transcriptId: string) => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        aria-modal="true"
        className="w-full max-w-4xl space-y-4 rounded-xl border bg-background p-6 shadow-xl"
        role="dialog"
      >
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Attach transcripts</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            Select one or more transcripts from your organization&apos;s
            transcript library to link them to this draft persona configuration.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="config-attach-transcripts-search">
            Search transcripts
          </Label>
          <Input
            id="config-attach-transcripts-search"
            placeholder="Search by filename, participant, tag, or notes"
            value={searchText}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading transcript library...
          </p>
        ) : totalTranscriptCount === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-6">
            <p className="text-sm leading-6 text-muted-foreground">
              Every transcript in this organization is already attached to this
              persona configuration.
            </p>
          </div>
        ) : transcripts.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-6">
            <p className="text-sm leading-6 text-muted-foreground">
              No transcripts match the current search.
            </p>
          </div>
        ) : (
          <div className="max-h-[26rem] overflow-y-auto rounded-xl border">
            <div className="grid grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-4 border-b bg-muted/40 px-4 py-3 text-sm font-medium">
              <span>Select</span>
              <span>Transcript</span>
              <span>Metadata</span>
              <span>Format</span>
            </div>

            <div className="divide-y">
              {transcripts.map((transcript) => {
                const isSelected = selectedTranscriptIds.includes(
                  String(transcript._id),
                );

                return (
                  <label
                    key={transcript._id}
                    className="grid cursor-pointer grid-cols-[auto_minmax(0,1.2fr)_minmax(0,1fr)_auto] gap-4 px-4 py-3 text-sm"
                    htmlFor={`config-attach-transcript-${transcript._id}`}
                  >
                    <input
                      checked={isSelected}
                      className="mt-1 h-4 w-4 rounded border-input"
                      id={`config-attach-transcript-${transcript._id}`}
                      onChange={() => onToggleSelected(String(transcript._id))}
                      type="checkbox"
                    />
                    <div className="space-y-1">
                      <p className="font-medium">{transcript.originalFilename}</p>
                      <p className="text-xs text-muted-foreground">
                        {transcript.characterCount} characters
                      </p>
                    </div>
                    <div className="space-y-1 text-muted-foreground">
                      <p>
                        {transcript.metadata.participantId
                          ? `Participant ${transcript.metadata.participantId}`
                          : "No participant ID"}
                      </p>
                      <p>
                        {transcript.metadata.tags.length > 0
                          ? transcript.metadata.tags.join(", ")
                          : "No tags"}
                      </p>
                    </div>
                    <div className="text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {transcript.format}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            disabled={selectedTranscriptIds.length === 0 || isLoading}
            type="button"
            onClick={onConfirm}
          >
            {isSubmitting ? "Attaching..." : "Attach selected transcripts"}
          </Button>
        </div>
      </div>
    </div>
  );
}
