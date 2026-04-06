import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type PersonaConfigDoc,
  type ConfigTranscriptAttachment,
  type TranscriptId,
  type ViewerAccess,
  type AxisFormValue,
  type ExtractionMode,
  type ExtractionArchetypeState,
  type ExtractionReviewAxisState,
  type ExtractionStatus,
  type TranscriptSignalDoc,
  formatTimestamp,
} from "@/routes/persona-config-shared";
import { TranscriptExtractionPanel } from "@/routes/persona-config-extraction-panel";

export type TranscriptsTabContentProps = {
  config: PersonaConfigDoc;
  isDraft: boolean;
  canManageConfigTranscripts: boolean;
  configTranscripts: ConfigTranscriptAttachment[];
  detachingTranscriptId: string | null;
  handleDetachTranscript: (transcriptId: TranscriptId) => void;
  canOpenExtraction: boolean;
  extractionButtonLabel: string;
  extractionStatus: ExtractionStatus | null | undefined;
  handleOpenExtractionPanel: () => void;
  setIsTranscriptPickerOpen: (value: boolean) => void;
  // TranscriptExtractionPanel props
  isExtractionPanelOpen: boolean;
  activeReviewProposedAxes: ExtractionReviewAxisState[];
  reviewArchetypes: ExtractionArchetypeState[];
  extractionCostEstimate:
    | {
        totalCharacters: number;
        estimatedTokens: number;
        estimatedCostUsd: number;
      }
    | undefined;
  extractionError: string | null;
  extractionMode: ExtractionMode | null;
  extractionNotice: string | null;
  isApplyingExtractionResults: boolean;
  isStartingExtraction: boolean;
  guidedExtractionAxes: AxisFormValue[];
  extractionStep: "mode" | "guided" | "cost" | "processing" | "failed" | "results";
  transcriptFilenameById: Map<string, string>;
  extractionSharedAxes: AxisFormValue[];
  selectedExtractionArchetypeCount: number;
  transcriptSignals: TranscriptSignalDoc[];
  discardingArchetypeId: string | null;
  onAddGuidedAxis: () => void;
  handleApplyTranscriptExtractionResults: () => void;
  setIsExtractionPanelOpen: (value: boolean) => void;
  handleConfirmDiscardArchetype: () => void;
  handleBackFromExtractionCost: () => void;
  handleContinueToExtractionCost: () => void;
  setDiscardingArchetypeId: (value: string | null) => void;
  handleGuidedAxisChange: (index: number, nextAxis: AxisFormValue) => void;
  handleMergeSelectedArchetypes: () => void;
  handleSelectExtractionMode: (mode: ExtractionMode) => void;
  handleReviewAxisChange: (axisId: string, nextAxis: AxisFormValue) => void;
  handleToggleReviewAxisEdit: (axisId: string) => void;
  handleReviewAxisRemovalToggle: (axisId: string) => void;
  handleRemoveGuidedAxis: (index: number) => void;
  handleResetExtractionWizard: () => void;
  handleStartExtraction: () => void;
  handleToggleReviewArchetypeEdit: (archetypeId: string) => void;
  handleToggleReviewArchetypeSelection: (archetypeId: string) => void;
  handleReviewArchetypeChange: (
    archetypeId: string,
    patch: Partial<ExtractionArchetypeState>,
  ) => void;
};

export function TranscriptsTabContent({
  config,
  isDraft,
  canManageConfigTranscripts,
  configTranscripts,
  detachingTranscriptId,
  handleDetachTranscript,
  canOpenExtraction,
  extractionButtonLabel,
  extractionStatus,
  handleOpenExtractionPanel,
  setIsTranscriptPickerOpen,
  isExtractionPanelOpen,
  activeReviewProposedAxes,
  reviewArchetypes,
  extractionCostEstimate,
  extractionError,
  extractionMode,
  extractionNotice,
  isApplyingExtractionResults,
  isStartingExtraction,
  guidedExtractionAxes,
  extractionStep,
  transcriptFilenameById,
  extractionSharedAxes,
  selectedExtractionArchetypeCount,
  transcriptSignals,
  discardingArchetypeId,
  onAddGuidedAxis,
  handleApplyTranscriptExtractionResults,
  setIsExtractionPanelOpen,
  handleConfirmDiscardArchetype,
  handleBackFromExtractionCost,
  handleContinueToExtractionCost,
  setDiscardingArchetypeId,
  handleGuidedAxisChange,
  handleMergeSelectedArchetypes,
  handleSelectExtractionMode,
  handleReviewAxisChange,
  handleToggleReviewAxisEdit,
  handleReviewAxisRemovalToggle,
  handleRemoveGuidedAxis,
  handleResetExtractionWizard,
  handleStartExtraction,
  handleToggleReviewArchetypeEdit,
  handleToggleReviewArchetypeSelection,
  handleReviewArchetypeChange,
}: TranscriptsTabContentProps) {
  return (
    <div className="space-y-4">
              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <CardTitle>Attached Transcripts</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Transcript research linked to this persona configuration.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {canOpenExtraction ? (
                      <Button
                        disabled={extractionStatus?.status === "processing"}
                        type="button"
                        variant="outline"
                        onClick={handleOpenExtractionPanel}
                      >
                        {extractionButtonLabel}
                      </Button>
                    ) : null}
                    {isDraft && canManageConfigTranscripts ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setIsTranscriptPickerOpen(true)}
                      >
                        Attach transcripts
                      </Button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!isDraft ? (
                    <p className="text-xs text-muted-foreground">
                      Transcript attachments are read-only after publishing.
                    </p>
                  ) : null}
                  {!canManageConfigTranscripts ? (
                    <p className="text-xs text-muted-foreground">
                      Reviewers can inspect but not modify transcript attachments.
                    </p>
                  ) : null}

                  {configTranscripts.length === 0 ? (
                    <div className="rounded-xl border border-dashed bg-background p-6">
                      <p className="text-sm leading-6 text-muted-foreground">
                        No transcripts are attached to this persona configuration yet.
                      </p>
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      {configTranscripts.map((configTranscript) => (
                        <div
                          key={configTranscript._id}
                          className="rounded-xl border bg-background p-4"
                        >
                          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <Link
                                  className="font-medium text-primary underline-offset-4 hover:underline"
                                  params={{
                                    transcriptId: configTranscript.transcript._id,
                                  }}
                                  to="/transcripts/$transcriptId"
                                >
                                  {configTranscript.transcript.originalFilename}
                                </Link>
                                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                                  {configTranscript.transcript.format}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {configTranscript.transcript.metadata.participantId
                                  ? `Participant ${configTranscript.transcript.metadata.participantId}`
                                  : "No participant ID"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                Attached {formatTimestamp(configTranscript.createdAt)}
                              </p>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <Button asChild type="button" variant="outline">
                                <Link
                                  params={{
                                    transcriptId: configTranscript.transcript._id,
                                  }}
                                  to="/transcripts/$transcriptId"
                                >
                                  Open transcript
                                </Link>
                              </Button>
                              {isDraft && canManageConfigTranscripts ? (
                                <Button
                                  disabled={
                                    detachingTranscriptId
                                    === String(configTranscript.transcriptId)
                                  }
                                  type="button"
                                  variant="outline"
                                  onClick={() =>
                                    void handleDetachTranscript(
                                      configTranscript.transcriptId,
                                    )
                                  }
                                >
                                  {detachingTranscriptId
                                  === String(configTranscript.transcriptId)
                                    ? "Detaching..."
                                    : "Detach"}
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {isDraft && canManageConfigTranscripts ? (
                    <TranscriptExtractionPanel
                      activeProposedAxes={activeReviewProposedAxes}
                      archetypes={reviewArchetypes}
                      attachedTranscripts={configTranscripts}
                      costEstimate={extractionCostEstimate}
                      extractionError={extractionError}
                      extractionMode={extractionMode}
                      extractionNotice={extractionNotice}
                      extractionStatus={extractionStatus}
                      isApplying={isApplyingExtractionResults}
                      isOpen={isExtractionPanelOpen}
                      isStarting={isStartingExtraction}
                      guidedAxes={guidedExtractionAxes}
                      step={extractionStep}
                      transcriptFilenameById={transcriptFilenameById}
                      onAddGuidedAxis={onAddGuidedAxis}
                      onApply={handleApplyTranscriptExtractionResults}
                      onClose={() => setIsExtractionPanelOpen(false)}
                      onConfirmDiscardArchetype={handleConfirmDiscardArchetype}
                      onBackFromCost={handleBackFromExtractionCost}
                      onContinueToCost={handleContinueToExtractionCost}
                      onDiscardArchetype={setDiscardingArchetypeId}
                      onGuidedAxisChange={handleGuidedAxisChange}
                      onMergeSelected={handleMergeSelectedArchetypes}
                      onModeSelect={handleSelectExtractionMode}
                      onProposedAxisChange={handleReviewAxisChange}
                      onProposedAxisToggleEdit={handleToggleReviewAxisEdit}
                      onProposedAxisToggleRemoved={handleReviewAxisRemovalToggle}
                      onRemoveGuidedAxis={handleRemoveGuidedAxis}
                      onResetWizard={handleResetExtractionWizard}
                      onStartExtraction={handleStartExtraction}
                      onToggleArchetypeEdit={handleToggleReviewArchetypeEdit}
                      onToggleArchetypeSelected={handleToggleReviewArchetypeSelection}
                      onUpdateArchetype={handleReviewArchetypeChange}
                      selectedArchetypeCount={selectedExtractionArchetypeCount}
                      sharedAxes={extractionSharedAxes}
                      transcriptSignals={transcriptSignals}
                      discardArchetypeId={discardingArchetypeId}
                    />
                  ) : null}
                </CardContent>
              </Card>
    </div>
  );
}
