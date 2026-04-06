import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import type { BatchGenerationRunView } from "@/components/persona-generation-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ConfigStatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import {
  type PersonaConfigDoc,
  type PersonaConfigId,
  type SyntheticUserDoc,
  type AxisDefinition,
  type TranscriptDoc,
  type TranscriptId,
  type ConfigTranscriptAttachment,
  type ViewerAccess,
  type ConfigFormValue,
  type SyntheticUserFormValue,
  type ConfirmationState,
  type ConfigVariantReviewData,
  type ExtractionStatus,
  emptyConfigForm,
  emptySyntheticUserForm,
  configToFormValue,
  axisToFormValue,
  axisFormToPayload,
  parseEvidenceSnippets,
  getErrorMessage,
  InlineToast,
} from "@/routes/persona-config-shared";
import {
  useInlineToast,
  useSuggestionState,
  useAxisLibraryImport,
  useExtractionState,
} from "@/routes/persona-config-hooks";
import { ConfigurationTabContent } from "@/routes/persona-config-overview-tab";
import { UsersTabContent } from "@/routes/persona-config-users-tab";
import { TranscriptsTabContent } from "@/routes/persona-config-transcripts-tab";
import { ReviewTabContent } from "@/routes/persona-config-review-tab";
import { AxisLibraryImportDialog, ConfirmationDialog } from "@/routes/persona-config-axes-tab";
import { TranscriptAttachmentDialog } from "@/routes/persona-config-extraction-panel";

export function PersonaConfigDetailPage({
  configId,
  forceSuggestAxesError = false,
}: {
  configId: string;
  forceSuggestAxesError?: boolean;
}) {
  const typedConfigId = configId as PersonaConfigId;
  const config = useQuery(api.personaConfigs.get, { configId: typedConfigId });
  const syntheticUsers = useQuery(api.personaConfigs.listSyntheticUsers, {
    configId: typedConfigId,
  });
  const axisDefinitions = useQuery((api as any).axisLibrary.listAxisDefinitions, {}) as
    | AxisDefinition[]
    | undefined;
  const transcriptLibrary = useQuery((api as any).transcripts.listTranscripts, {}) as
    | TranscriptDoc[]
    | undefined;
  const configTranscripts = useQuery((api as any).configTranscripts.listConfigTranscripts, {
    configId: typedConfigId,
  }) as ConfigTranscriptAttachment[] | undefined;
  const batchGenerationRun = useQuery(api.batchGeneration.getBatchGenerationRun, {
    configId: typedConfigId,
  }) as BatchGenerationRunView | null | undefined;
  const viewerAccess = useQuery((api as any).rbac.getViewerAccess, {}) as
    | ViewerAccess
    | undefined;
  const extractionStatus = useQuery(
    (api as any).transcriptExtraction.getExtractionStatus,
    viewerAccess?.permissions.canManagePersonaConfigs === true
      ? { configId: typedConfigId }
      : "skip",
  ) as ExtractionStatus | null | undefined;
  const extractionCostEstimate = useQuery(
    (api as any).transcriptExtraction.estimateExtractionCost,
    viewerAccess?.permissions.canManagePersonaConfigs === true &&
      (configTranscripts?.length ?? 0) > 0
      ? {
          transcriptIds: configTranscripts!.map((configTranscript) => configTranscript.transcriptId),
        }
      : "skip",
  ) as
    | {
        totalCharacters: number;
        estimatedTokens: number;
        estimatedCostUsd: number;
      }
    | undefined;
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const configVariantReview = useQuery(
    api.personaVariantReview.getPackVariantReview,
    selectedStudyId === null
      ? { configId: typedConfigId }
      : { configId: typedConfigId, studyId: selectedStudyId as Id<"studies"> },
  ) as ConfigVariantReviewData | null | undefined;
  const startBatchGeneration = useMutation(api.batchGeneration.startBatchGeneration);
  const regenerateSyntheticUser = useMutation(api.batchGeneration.regenerateSyntheticUser);
  const updateDraft = useMutation(api.personaConfigs.updateDraft);
  const createSyntheticUser = useMutation(api.personaConfigs.createSyntheticUser);
  const publishConfig = useMutation(api.personaConfigs.publish);
  const archiveConfig = useMutation(api.personaConfigs.archive);
  const applyTranscriptDerivedSyntheticUsers = useMutation(
    (api as any).personaConfigs.applyTranscriptDerivedSyntheticUsers,
  );
  const suggestAxes = useAction((api as any).axisGeneration.suggestAxes);
  const startTranscriptExtraction = useAction(
    (api as any).transcriptExtraction.startExtraction,
  );
  const attachTranscript = useMutation((api as any).configTranscripts.attachTranscript);
  const detachTranscript = useMutation((api as any).configTranscripts.detachTranscript);
  const [draftForm, setDraftForm] = useState<ConfigFormValue>(emptyConfigForm);
  const [syntheticUserForm, setSyntheticUserForm] =
    useState<SyntheticUserFormValue>(emptySyntheticUserForm);
  const [isProtoFormOpen, setIsProtoFormOpen] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSavingSyntheticUser, setIsSavingSyntheticUser] = useState(false);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [confirmationState, setConfirmationState] =
    useState<ConfirmationState | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<
    PersonaConfigDoc["status"] | null
  >(null);
  const [isTranscriptPickerOpen, setIsTranscriptPickerOpen] = useState(false);
  const [transcriptSearchText, setTranscriptSearchText] = useState("");
  const [selectedTranscriptIds, setSelectedTranscriptIds] = useState<string[]>(
    [],
  );
  const [isAttachingTranscripts, setIsAttachingTranscripts] = useState(false);
  const [detachingTranscriptId, setDetachingTranscriptId] = useState<
    string | null
  >(null);
  const [expandedAxisIndex, setExpandedAxisIndex] = useState<number | null>(null);

  const { inlineToast, setInlineToast } = useInlineToast();

  const suggestion = useSuggestionState(
    config,
    draftForm,
    forceSuggestAxesError,
    suggestAxes as any,
    setDraftForm,
    setInlineToast,
  );

  const axisLibrary = useAxisLibraryImport(
    axisDefinitions,
    draftForm,
    setDraftForm,
    setInlineToast,
  );

  const extraction = useExtractionState(
    config,
    configTranscripts,
    extractionStatus,
    draftForm,
    setDraftForm,
    setSaveMessage,
    startTranscriptExtraction as any,
    applyTranscriptDerivedSyntheticUsers as any,
  );

  useEffect(() => {
    if (!config) {
      return;
    }

    setDraftForm(configToFormValue(config));
    extraction.setGuidedExtractionAxes(config.sharedAxes.map(axisToFormValue));
    setOptimisticStatus(config.status);
  }, [config?._id, config?.updatedAt, config?.status]);

  useEffect(() => {
    suggestion.setSuggestedAxes([]);
    suggestion.setIsSuggestionPanelOpen(false);
    suggestion.setSuggestionError(null);
    axisLibrary.setIsAxisLibraryOpen(false);
    axisLibrary.setSelectedLibraryAxisIds([]);
    setInlineToast(null);
    setIsTranscriptPickerOpen(false);
    setTranscriptSearchText("");
    setSelectedTranscriptIds([]);
    setDetachingTranscriptId(null);
    extraction.setIsExtractionPanelOpen(false);
    extraction.setExtractionMode(null);
    extraction.setPreExtractionStep("mode");
    extraction.setGuidedExtractionAxes([]);
    extraction.setReviewArchetypes([]);
    extraction.setReviewProposedAxes([]);
    extraction.setExtractionError(null);
    extraction.setExtractionNotice(null);
    extraction.setDiscardingArchetypeId(null);
  }, [config?._id]);

  useEffect(() => {
    if (!configVariantReview) {
      return;
    }

    const resolvedStudyId =
      configVariantReview.selectedStudy?._id ?? configVariantReview.study?._id ?? null;

    setSelectedStudyId((current) =>
      current !== null &&
      configVariantReview.studies.some((study) => study._id === current)
        ? current
        : resolvedStudyId,
    );
  }, [configVariantReview]);

  const resolvedStatus = optimisticStatus ?? config?.status;
  const isDraft = resolvedStatus === "draft";
  const syntheticUserList: SyntheticUserDoc[] = syntheticUsers ?? [];
  const hasActiveBatchGenerationRun =
    batchGenerationRun?.status === "pending" || batchGenerationRun?.status === "running";
  const canManageConfigTranscripts =
    viewerAccess?.permissions.canManagePersonaConfigs === true;
  const resolvedAxes: PersonaConfigDoc["sharedAxes"] = useMemo(() => {
    if (!config) {
      return draftForm.sharedAxes.map(axisFormToPayload);
    }

    return isDraft ? draftForm.sharedAxes.map(axisFormToPayload) : config.sharedAxes;
  }, [draftForm.sharedAxes, isDraft, config]);
  const selectedStudySummary =
    configVariantReview?.selectedStudy ?? configVariantReview?.study ?? null;
  const attachedTranscriptIds = new Set(
    (configTranscripts ?? []).map((configTranscript) => String(configTranscript.transcriptId)),
  );
  const attachableTranscripts = (transcriptLibrary ?? []).filter(
    (transcript) => !attachedTranscriptIds.has(String(transcript._id)),
  );
  const filteredAttachableTranscripts = useMemo(() => {
    const normalizedSearch = transcriptSearchText.trim().toLowerCase();

    if (normalizedSearch.length === 0) {
      return attachableTranscripts;
    }

    return attachableTranscripts.filter((transcript) =>
      [
        transcript.originalFilename,
        transcript.metadata.participantId ?? "",
        transcript.metadata.tags.join(" "),
        transcript.metadata.notes ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [attachableTranscripts, transcriptSearchText]);
  const canOpenExtraction =
    isDraft && canManageConfigTranscripts && (configTranscripts?.length ?? 0) > 0;
  const transcriptFilenameById = new Map(
    (configTranscripts ?? []).map((configTranscript) => [
      String(configTranscript.transcriptId),
      configTranscript.transcript.originalFilename,
    ]),
  );

  async function handleSaveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!config) {
      return;
    }

    setActionError(null);
    setSaveMessage(null);
    setIsSavingDraft(true);

    try {
      await updateDraft({
        configId: config._id,
        patch: {
          name: draftForm.name,
          description: draftForm.description,
          context: draftForm.context,
          sharedAxes: draftForm.sharedAxes.map(axisFormToPayload),
        },
      });

      setSaveMessage("Draft changes saved.");
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not update persona configuration."));
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function handleCreateSyntheticUser(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!config) {
      return;
    }

    setActionError(null);
    setSaveMessage(null);
    setIsSavingSyntheticUser(true);

    try {
      await createSyntheticUser({
        configId: config._id,
        syntheticUser: {
          name: syntheticUserForm.name,
          summary: syntheticUserForm.summary,
          axes: config.sharedAxes,
          evidenceSnippets: parseEvidenceSnippets(syntheticUserForm.evidenceText),
          ...(syntheticUserForm.notes.trim()
            ? { notes: syntheticUserForm.notes.trim() }
            : {}),
        },
      });

      setSyntheticUserForm(emptySyntheticUserForm());
      setIsProtoFormOpen(false);
      setSaveMessage("Synthetic user added.");
    } catch (error) {
      setActionError(
        getErrorMessage(error, "Could not create synthetic user."),
      );
    } finally {
      setIsSavingSyntheticUser(false);
    }
  }

  async function handleConfirmAction() {
    if (!config || !confirmationState) {
      return;
    }

    setActionError(null);
    setSaveMessage(null);
    setIsConfirmingAction(true);

    try {
      if (confirmationState.kind === "publish") {
        await publishConfig({ configId: config._id });
        setOptimisticStatus("published");
        setSaveMessage("Persona configuration published.");
      } else {
        await archiveConfig({ configId: config._id });
        setOptimisticStatus("archived");
        setSaveMessage("Persona configuration archived.");
      }

      setConfirmationState(null);
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not update persona configuration status."));
    } finally {
      setIsConfirmingAction(false);
    }
  }

  function handleTranscriptSelectionToggle(transcriptId: string) {
    setSelectedTranscriptIds((current) =>
      current.includes(transcriptId)
        ? current.filter((id) => id !== transcriptId)
        : [...current, transcriptId],
    );
  }

  function handleCloseTranscriptPicker() {
    setIsTranscriptPickerOpen(false);
    setTranscriptSearchText("");
    setSelectedTranscriptIds([]);
  }

  async function handleAttachSelectedTranscripts() {
    if (!config || selectedTranscriptIds.length === 0) {
      return;
    }

    const selectedCount = selectedTranscriptIds.length;
    setActionError(null);
    setSaveMessage(null);
    setIsAttachingTranscripts(true);

    try {
      for (const transcriptId of selectedTranscriptIds) {
        await attachTranscript({
          configId: config._id,
          transcriptId: transcriptId as TranscriptId,
        });
      }

      handleCloseTranscriptPicker();
      setSaveMessage(
        selectedCount === 1
          ? "1 transcript attached to this persona configuration."
          : `${selectedCount} transcripts attached to this persona configuration.`,
      );
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not attach transcripts."));
    } finally {
      setIsAttachingTranscripts(false);
    }
  }

  async function handleDetachTranscript(transcriptId: TranscriptId) {
    if (!config) {
      return;
    }

    setActionError(null);
    setSaveMessage(null);
    setDetachingTranscriptId(String(transcriptId));

    try {
      await detachTranscript({
        configId: config._id,
        transcriptId,
      });
      setSaveMessage("Transcript detached from this persona configuration.");
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not detach transcript."));
    } finally {
      setDetachingTranscriptId(null);
    }
  }

  if (
    config === undefined
    || syntheticUsers === undefined
    || axisDefinitions === undefined
    || transcriptLibrary === undefined
    || configTranscripts === undefined
    || viewerAccess === undefined
  ) {
    return (
      <EmptyState
        title="Persona Configuration"
        description="Loading persona configuration details and synthetic users..."
      />
    );
  }

  if (config === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Persona configuration not found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This persona configuration either does not exist or belongs to another organization.
          </p>
          <Button asChild variant="outline">
            <Link to="/persona-configs">Back to Persona Configurations</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      {inlineToast ? <InlineToast toast={inlineToast} /> : null}
      <section className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
                Persona Library
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-semibold tracking-tight">{config.name}</h2>
                <ConfigStatusBadge status={resolvedStatus ?? config.status} />
              </div>
              <p className="max-w-2xl text-base text-muted-foreground">
                Review persona configuration metadata, shared axes, and synthetic users before publishing. Published persona configurations are frozen and archived persona configurations remain read-only.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/persona-configs">Back to list</Link>
            </Button>
            {isDraft ? (
              <Button
                disabled={syntheticUserList.length === 0 || hasActiveBatchGenerationRun}
                onClick={() =>
                  setConfirmationState({
                    kind: "publish",
                    title: "Publish persona configuration?",
                    description:
                      "Publishing freezes this persona configuration and its synthetic users so studies can rely on a stable definition.",
                    confirmLabel: "Publish persona configuration",
                  })
                }
              >
                Publish
              </Button>
            ) : null}
            {resolvedStatus === "published" ? (
              <Button
                variant="destructive"
                onClick={() =>
                  setConfirmationState({
                    kind: "archive",
                    title: "Archive persona configuration?",
                    description:
                      "Archiving hides this persona configuration from active work while preserving its history for audit and reference.",
                    confirmLabel: "Archive persona configuration",
                  })
                }
              >
                Archive
              </Button>
            ) : null}
          </div>
        </div>

        {actionError ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
            <p className="text-sm font-medium text-destructive">{actionError}</p>
          </div>
        ) : null}
        {saveMessage ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="text-sm font-medium text-emerald-800">{saveMessage}</p>
          </div>
        ) : null}
        {isDraft ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-medium text-amber-900">Draft — not yet published</p>
                <p className="text-sm text-amber-800">
                  {syntheticUserList.length === 0
                    ? "Add at least one synthetic user to make this configuration publishable."
                    : hasActiveBatchGenerationRun
                      ? "Batch generation is in progress. Publishing will be available once it completes."
                      : `${syntheticUserList.length} synthetic user${syntheticUserList.length === 1 ? "" : "s"} configured. Ready to publish.`}
                </p>
              </div>
              {syntheticUserList.length > 0 && !hasActiveBatchGenerationRun ? (
                <Button
                  size="sm"
                  onClick={() =>
                    setConfirmationState({
                      kind: "publish",
                      title: "Publish persona configuration?",
                      description:
                        "Publishing freezes this persona configuration and its synthetic users so studies can rely on a stable definition.",
                      confirmLabel: "Publish persona configuration",
                    })
                  }
                >
                  Publish now
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        <Tabs defaultValue="configuration">
          <TabsList>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="users">
              Synthetic Users
              {syntheticUserList.length > 0 ? (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold tabular-nums text-primary data-[state=active]:bg-primary-foreground/20 data-[state=active]:text-primary-foreground">
                  {syntheticUserList.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="transcripts">
              Transcripts
              {(configTranscripts?.length ?? 0) > 0 ? (
                <span className="ml-1.5 rounded-full bg-primary/10 px-1.5 text-[10px] font-semibold tabular-nums text-primary data-[state=active]:bg-primary-foreground/20 data-[state=active]:text-primary-foreground">
                  {configTranscripts.length}
                </span>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="review">Review</TabsTrigger>
          </TabsList>

          <TabsContent value="configuration">
            <ConfigurationTabContent
              config={config}
              isDraft={isDraft}
              draftForm={draftForm}
              setDraftForm={setDraftForm}
              isSavingDraft={isSavingDraft}
              handleSaveDraft={handleSaveDraft}
              canSuggestAxes={suggestion.canSuggestAxes}
              isSuggestingAxes={suggestion.isSuggestingAxes}
              suggestionError={suggestion.suggestionError}
              isSuggestionPanelOpen={suggestion.isSuggestionPanelOpen}
              suggestedAxes={suggestion.suggestedAxes}
              selectedSuggestionCount={suggestion.selectedSuggestionCount}
              handleSuggestAxes={suggestion.handleSuggestAxes}
              handleSuggestionSelectionToggle={suggestion.handleSuggestionSelectionToggle}
              handleSuggestionEditToggle={suggestion.handleSuggestionEditToggle}
              handleSuggestionAxisChange={suggestion.handleSuggestionAxisChange}
              handleDismissSuggestions={suggestion.handleDismissSuggestions}
              handleApplySuggestedAxes={suggestion.handleApplySuggestedAxes}
              onOpenAxisLibrary={() => {
                axisLibrary.setSelectedLibraryAxisIds([]);
                axisLibrary.setIsAxisLibraryOpen(true);
              }}
              resolvedAxes={resolvedAxes}
              expandedAxisIndex={expandedAxisIndex}
              setExpandedAxisIndex={setExpandedAxisIndex}
              syntheticUserList={syntheticUserList}
              resolvedStatus={resolvedStatus}
            />
          </TabsContent>

          <TabsContent value="users" className="space-y-4">
            <UsersTabContent
              config={config}
              isDraft={isDraft}
              resolvedStatus={resolvedStatus}
              syntheticUserList={syntheticUserList}
              syntheticUserForm={syntheticUserForm}
              setSyntheticUserForm={setSyntheticUserForm}
              isProtoFormOpen={isProtoFormOpen}
              setIsProtoFormOpen={setIsProtoFormOpen}
              isSavingSyntheticUser={isSavingSyntheticUser}
              handleCreateSyntheticUser={handleCreateSyntheticUser}
              batchGenerationRun={batchGenerationRun ?? null}
              viewerAccess={viewerAccess}
              onRegenerateUser={(syntheticUserId) =>
                regenerateSyntheticUser({ syntheticUserId })
              }
              onStartGeneration={(levelsPerAxis) =>
                startBatchGeneration({
                  configId: config._id,
                  levelsPerAxis,
                })
              }
            />
          </TabsContent>

          <TabsContent value="transcripts" className="space-y-4">
            <TranscriptsTabContent
              config={config}
              isDraft={isDraft}
              canManageConfigTranscripts={canManageConfigTranscripts}
              configTranscripts={configTranscripts}
              detachingTranscriptId={detachingTranscriptId}
              handleDetachTranscript={handleDetachTranscript}
              canOpenExtraction={canOpenExtraction}
              extractionButtonLabel={extraction.extractionButtonLabel}
              extractionStatus={extractionStatus}
              handleOpenExtractionPanel={extraction.handleOpenExtractionPanel}
              setIsTranscriptPickerOpen={setIsTranscriptPickerOpen}
              isExtractionPanelOpen={extraction.isExtractionPanelOpen}
              activeReviewProposedAxes={extraction.activeReviewProposedAxes}
              reviewArchetypes={extraction.reviewArchetypes}
              extractionCostEstimate={extractionCostEstimate}
              extractionError={extraction.extractionError}
              extractionMode={extraction.extractionMode}
              extractionNotice={extraction.extractionNotice}
              isApplyingExtractionResults={extraction.isApplyingExtractionResults}
              isStartingExtraction={extraction.isStartingExtraction}
              guidedExtractionAxes={extraction.guidedExtractionAxes}
              extractionStep={extraction.extractionStep}
              transcriptFilenameById={transcriptFilenameById}
              extractionSharedAxes={extraction.extractionSharedAxes}
              selectedExtractionArchetypeCount={extraction.selectedExtractionArchetypeCount}
              transcriptSignals={extractionStatus?.transcriptSignals ?? []}
              discardingArchetypeId={extraction.discardingArchetypeId}
              onAddGuidedAxis={() =>
                extraction.setGuidedExtractionAxes((current: any) => [...current, { key: "", label: "", description: "", lowAnchor: "", midAnchor: "", highAnchor: "", weight: "1" }])
              }
              handleApplyTranscriptExtractionResults={extraction.handleApplyTranscriptExtractionResults}
              setIsExtractionPanelOpen={extraction.setIsExtractionPanelOpen}
              handleConfirmDiscardArchetype={extraction.handleConfirmDiscardArchetype}
              handleBackFromExtractionCost={extraction.handleBackFromExtractionCost}
              handleContinueToExtractionCost={extraction.handleContinueToExtractionCost}
              setDiscardingArchetypeId={extraction.setDiscardingArchetypeId}
              handleGuidedAxisChange={extraction.handleGuidedAxisChange}
              handleMergeSelectedArchetypes={extraction.handleMergeSelectedArchetypes}
              handleSelectExtractionMode={extraction.handleSelectExtractionMode}
              handleReviewAxisChange={extraction.handleReviewAxisChange}
              handleToggleReviewAxisEdit={extraction.handleToggleReviewAxisEdit}
              handleReviewAxisRemovalToggle={extraction.handleReviewAxisRemovalToggle}
              handleRemoveGuidedAxis={extraction.handleRemoveGuidedAxis}
              handleResetExtractionWizard={extraction.handleResetExtractionWizard}
              handleStartExtraction={extraction.handleStartExtraction}
              handleToggleReviewArchetypeEdit={extraction.handleToggleReviewArchetypeEdit}
              handleToggleReviewArchetypeSelection={extraction.handleToggleReviewArchetypeSelection}
              handleReviewArchetypeChange={extraction.handleReviewArchetypeChange}
            />
          </TabsContent>

          <TabsContent value="review" className="space-y-4">
            <ReviewTabContent
              configVariantReview={configVariantReview}
              selectedStudyId={selectedStudyId}
              setSelectedStudyId={setSelectedStudyId}
              selectedStudySummary={selectedStudySummary}
            />
          </TabsContent>
        </Tabs>
      </section>

      <ConfirmationDialog
        confirmLabel={confirmationState?.confirmLabel ?? "Confirm"}
        description={confirmationState?.description ?? ""}
        isOpen={confirmationState !== null}
        isSubmitting={isConfirmingAction}
        title={confirmationState?.title ?? ""}
        onCancel={() => setConfirmationState(null)}
        onConfirm={() => void handleConfirmAction()}
      />
      <AxisLibraryImportDialog
        axisDefinitions={axisLibrary.axisLibraryList}
        existingAxisKeys={new Set(
          draftForm.sharedAxes
            .map((axis) => axis.key.trim().toLowerCase())
            .filter(Boolean),
        )}
        isOpen={axisLibrary.isAxisLibraryOpen}
        isLoading={axisDefinitions === undefined}
        selectedAxisIds={axisLibrary.selectedLibraryAxisIds}
        onCancel={() => {
          axisLibrary.setIsAxisLibraryOpen(false);
          axisLibrary.setSelectedLibraryAxisIds([]);
        }}
        onConfirm={axisLibrary.handleImportAxisDefinitions}
        onToggleSelected={axisLibrary.handleLibrarySelectionToggle}
      />
      <TranscriptAttachmentDialog
        isLoading={transcriptLibrary === undefined}
        isOpen={isTranscriptPickerOpen}
        isSubmitting={isAttachingTranscripts}
        searchText={transcriptSearchText}
        selectedTranscriptIds={selectedTranscriptIds}
        totalTranscriptCount={attachableTranscripts.length}
        transcripts={filteredAttachableTranscripts}
        onCancel={handleCloseTranscriptPicker}
        onConfirm={() => void handleAttachSelectedTranscripts()}
        onSearchChange={setTranscriptSearchText}
        onToggleSelected={handleTranscriptSelectionToggle}
      />
    </>
  );
}
