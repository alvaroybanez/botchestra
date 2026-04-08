import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PersonaConfigDetailSearch } from "@/router";
import { ReviewWorkspace } from "./review-workspace";
import type {
  AxisFormValue,
  BatchGenerationRunView,
  ConfigFormValue,
  ConfigTranscriptAttachment,
  ConfigVariantReviewData,
  ConfirmationState,
  ExtractionArchetypeState,
  ExtractionMode,
  ExtractionReviewAxisState,
  ExtractionStatus,
  InlineToastState,
  PersonaConfigDoc,
  PersonaConfigId,
  SuggestedAxisState,
  SyntheticUserDoc,
  SyntheticUserFormValue,
  TranscriptDoc,
  TranscriptId,
  ViewerAccess,
} from "./types";
import {
  axisFormToPayload,
  axisToFormValue,
  configToFormValue,
  dedupeEvidenceSnippets,
  emptyAxis,
  emptyConfigForm,
  emptySyntheticUserForm,
  formatDuplicateAxisToast,
  formatTimestamp,
  formatTranscriptDerivedNotes,
  getAxisKeys,
  getErrorMessage,
  getSuggestAxesErrorMessage,
  mergeAxesIntoFormValue,
  normalizeAxisKey,
  parseEvidenceSnippets,
  selectClassName,
  textareaClassName,
  validateAxesForExtraction,
  validateSelectedAxes,
} from "./helpers";
import {
  ConfirmationDialog,
  InlineToast,
  LoadingCard,
  LoadingSpinner,
  LocalSummaryValue,
} from "./shared-ui";
import {
  AxisLibraryImportDialog,
  SuggestedAxisCard,
} from "./axis-components";
import { ConfigFormCard } from "./config-form-card";
import { TranscriptAttachmentDialog } from "./extraction-panel";
import { ConfigShell } from "./config-shell";
import { GenerationWorkspace } from "./generation-workspace";
import { TranscriptsWorkspace } from "./transcripts-workspace";
import { UsersWorkspace } from "./users-workspace";

export function PersonaConfigDetailPage({
  configId,
  detailSearch,
  onSearchChange,
}: {
  configId: string;
  detailSearch: PersonaConfigDetailSearch;
  onSearchChange: (patch: Partial<PersonaConfigDetailSearch>) => void;
}) {
  const forceSuggestAxesError = detailSearch.forceSuggestAxesError ?? false;
  const typedConfigId = configId as PersonaConfigId;
  const config = useQuery(api.personaConfigs.get, { configId: typedConfigId });
  const syntheticUsers = useQuery(api.personaConfigs.listSyntheticUsers, {
    configId: typedConfigId,
  });
  const axisDefinitions = useQuery((api as any).axisLibrary.listAxisDefinitions, {}) as
    | import("./types").AxisDefinition[]
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
  const selectedReviewStudyId = detailSearch.selectedReviewStudyId;
  const configVariantReview = useQuery(
    api.personaVariantReview.getPackVariantReview,
    selectedReviewStudyId === undefined
      ? { configId: typedConfigId }
      : { configId: typedConfigId, studyId: selectedReviewStudyId as Id<"studies"> },
  ) as ConfigVariantReviewData | null | undefined;
  const startBatchGeneration = useMutation(api.batchGeneration.startBatchGeneration);
  const regenerateSyntheticUser = useMutation(api.batchGeneration.regenerateSyntheticUser);
  const updateDraft = useMutation(api.personaConfigs.updateDraft);
  const createSyntheticUser = useMutation(api.personaConfigs.createSyntheticUser);
  const updateSyntheticUserMutation = useMutation(api.personaConfigs.updateSyntheticUser);
  const deleteSyntheticUserMutation = useMutation(api.personaConfigs.deleteSyntheticUser);
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
  const [suggestedAxes, setSuggestedAxes] = useState<SuggestedAxisState[]>([]);
  const [isSuggestionPanelOpen, setIsSuggestionPanelOpen] = useState(false);
  const [isSuggestingAxes, setIsSuggestingAxes] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [isAxisLibraryOpen, setIsAxisLibraryOpen] = useState(false);
  const [selectedLibraryAxisIds, setSelectedLibraryAxisIds] = useState<string[]>(
    [],
  );
  const [inlineToast, setInlineToast] = useState<InlineToastState | null>(null);
  const [isTranscriptPickerOpen, setIsTranscriptPickerOpen] = useState(false);
  const [transcriptSearchText, setTranscriptSearchText] = useState("");
  const [selectedTranscriptIds, setSelectedTranscriptIds] = useState<string[]>(
    [],
  );
  const [isAttachingTranscripts, setIsAttachingTranscripts] = useState(false);
  const [detachingTranscriptId, setDetachingTranscriptId] = useState<
    string | null
  >(null);
  const [isExtractionPanelOpen, setIsExtractionPanelOpen] = useState(false);
  const [extractionMode, setExtractionMode] = useState<ExtractionMode | null>(null);
  const [preExtractionStep, setPreExtractionStep] = useState<"mode" | "guided" | "cost">(
    "mode",
  );
  const [guidedExtractionAxes, setGuidedExtractionAxes] = useState<AxisFormValue[]>(
    [],
  );
  const [reviewArchetypes, setReviewArchetypes] = useState<ExtractionArchetypeState[]>(
    [],
  );
  const [reviewProposedAxes, setReviewProposedAxes] = useState<
    ExtractionReviewAxisState[]
  >([]);
  const [extractionError, setExtractionError] = useState<string | null>(null);
  const [extractionNotice, setExtractionNotice] = useState<string | null>(null);
  const [isStartingExtraction, setIsStartingExtraction] = useState(false);
  const [isApplyingExtractionResults, setIsApplyingExtractionResults] = useState(false);
  const [discardingArchetypeId, setDiscardingArchetypeId] = useState<string | null>(
    null,
  );

  useEffect(() => {
    if (!config) {
      return;
    }

    setDraftForm(configToFormValue(config));
    setGuidedExtractionAxes(config.sharedAxes.map(axisToFormValue));
    setOptimisticStatus(config.status);
  }, [config?._id, config?.updatedAt, config?.status]);

  useEffect(() => {
    setSuggestedAxes([]);
    setIsSuggestionPanelOpen(false);
    setSuggestionError(null);
    setIsAxisLibraryOpen(false);
    setSelectedLibraryAxisIds([]);
    setInlineToast(null);
    setIsTranscriptPickerOpen(false);
    setTranscriptSearchText("");
    setSelectedTranscriptIds([]);
    setDetachingTranscriptId(null);
    setIsExtractionPanelOpen(false);
    setExtractionMode(null);
    setPreExtractionStep("mode");
    setGuidedExtractionAxes([]);
    setReviewArchetypes([]);
    setReviewProposedAxes([]);
    setExtractionError(null);
    setExtractionNotice(null);
    setDiscardingArchetypeId(null);
  }, [config?._id]);

  useEffect(() => {
    if (!configVariantReview) {
      return;
    }

    const resolvedStudyId =
      configVariantReview.selectedStudy?._id ?? configVariantReview.study?._id ?? undefined;

    const isCurrentValid =
      selectedReviewStudyId !== undefined &&
      configVariantReview.studies.some((study) => study._id === selectedReviewStudyId);

    if (!isCurrentValid && resolvedStudyId !== selectedReviewStudyId) {
      onSearchChange({ selectedReviewStudyId: resolvedStudyId });
    }
  }, [configVariantReview, selectedReviewStudyId, onSearchChange]);

  useEffect(() => {
    if (inlineToast === null) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setInlineToast(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [inlineToast]);

  useEffect(() => {
    if (extractionStatus !== null && extractionStatus !== undefined) {
      setIsExtractionPanelOpen(true);
    }
  }, [extractionStatus?.updatedAt, extractionStatus?.status]);

  useEffect(() => {
    if (
      extractionStatus === null ||
      extractionStatus === undefined ||
      (extractionStatus.status !== "completed"
        && extractionStatus.status !== "completed_with_failures")
    ) {
      return;
    }

    setExtractionMode(extractionStatus.mode);
    setPreExtractionStep("cost");
    setGuidedExtractionAxes(
      (extractionStatus.mode === "guided"
        ? extractionStatus.guidedAxes
        : extractionStatus.proposedAxes.length > 0
          ? extractionStatus.proposedAxes
          : config?.sharedAxes ?? []
      ).map(axisToFormValue),
    );
    setReviewProposedAxes(
      extractionStatus.proposedAxes.map((axis, index) => ({
        id: `proposed-axis-${axis.key}-${index}-${extractionStatus.updatedAt}`,
        axis: axisToFormValue(axis),
        isEditing: false,
        isRemoved: false,
      })),
    );
    setReviewArchetypes(
      extractionStatus.archetypes.map((archetype, index) => ({
        id: `archetype-${index}-${extractionStatus.updatedAt}`,
        name: archetype.name,
        summary: archetype.summary,
        axisValues: archetype.axisValues,
        evidenceSnippets: archetype.evidenceSnippets,
        contributingTranscriptIds: archetype.contributingTranscriptIds,
        isEditing: false,
        isSelected: true,
      })),
    );
    setExtractionError(null);
    setExtractionNotice(
      extractionStatus.status === "completed_with_failures"
        ? "Extraction completed with partial results. Review the successful transcripts below."
        : null,
    );
  }, [extractionStatus?.updatedAt, extractionStatus?.status, config?.sharedAxes]);

  const resolvedStatus = optimisticStatus ?? config?.status;
  const isDraft = resolvedStatus === "draft";
  const syntheticUserList: SyntheticUserDoc[] = syntheticUsers ?? [];
  const hasActiveBatchGenerationRun =
    batchGenerationRun?.status === "pending" || batchGenerationRun?.status === "running";
  const canSuggestAxes =
    draftForm.name.trim().length > 0 && draftForm.context.trim().length > 0;
  const selectedSuggestionCount = suggestedAxes.filter(
    (suggestion) => suggestion.isSelected,
  ).length;
  const axisLibraryList = axisDefinitions ?? [];
  const canManageConfigTranscripts =
    viewerAccess?.permissions.canManagePersonaConfigs === true;
  const resolvedAxes: PersonaConfigDoc["sharedAxes"] = useMemo(() => {
    if (!config) {
      return draftForm.sharedAxes.map(axisFormToPayload);
    }

    return isDraft ? draftForm.sharedAxes.map(axisFormToPayload) : config.sharedAxes;
  }, [draftForm.sharedAxes, isDraft, config]);
  const publishedStatusHelp =
    isDraft && hasActiveBatchGenerationRun
      ? "Cannot publish while batch generation is in progress."
      : isDraft && syntheticUsers !== undefined && syntheticUserList.length === 0
      ? "Add at least one synthetic user before publishing this persona configuration."
      : null;
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
  const selectedExtractionArchetypeCount = reviewArchetypes.filter(
    (archetype) => archetype.isSelected,
  ).length;
  const activeReviewProposedAxes = reviewProposedAxes.filter(
    (axis) => !axis.isRemoved,
  );
  const extractionSharedAxes =
    extractionMode === "auto_discover" && activeReviewProposedAxes.length > 0
      ? activeReviewProposedAxes.map((axis) => axis.axis)
      : guidedExtractionAxes;
  const extractionStep =
    extractionStatus?.status === "processing"
      ? "processing"
      : extractionStatus?.status === "failed"
        ? "failed"
        : extractionStatus?.status === "completed"
          || extractionStatus?.status === "completed_with_failures"
          ? "results"
          : preExtractionStep;
  const extractionButtonLabel =
    extractionStatus === null || extractionStatus === undefined
      ? "Extract from Transcripts"
      : extractionStatus.status === "processing"
        ? "Extraction in progress"
        : "Re-run extraction";
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

  async function handleUpdateSyntheticUser(
    syntheticUserId: Id<"syntheticUsers">,
    patch: { name: string; summary: string; evidenceSnippets: string[]; notes: string },
  ) {
    if (!config) return;

    setActionError(null);
    setSaveMessage(null);
    setIsSavingSyntheticUser(true);

    try {
      await updateSyntheticUserMutation({
        syntheticUserId,
        patch: {
          name: patch.name,
          summary: patch.summary,
          evidenceSnippets: patch.evidenceSnippets,
          ...(patch.notes.trim() ? { notes: patch.notes.trim() } : { notes: "" }),
        },
      });
      setSaveMessage("Synthetic user updated.");
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not update synthetic user."));
    } finally {
      setIsSavingSyntheticUser(false);
    }
  }

  function handleRequestDeleteSyntheticUser(
    syntheticUserId: Id<"syntheticUsers">,
    userName: string,
  ) {
    setConfirmationState({
      kind: "delete_synthetic_user",
      syntheticUserId,
      userName,
      title: "Delete synthetic user",
      description: `Are you sure you want to delete "${userName}"? This action cannot be undone.`,
      confirmLabel: "Delete",
    });
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
      } else if (confirmationState.kind === "archive") {
        await archiveConfig({ configId: config._id });
        setOptimisticStatus("archived");
        setSaveMessage("Persona configuration archived.");
      } else if (confirmationState.kind === "delete_synthetic_user") {
        const deletedId = confirmationState.syntheticUserId;
        await deleteSyntheticUserMutation({ syntheticUserId: deletedId });
        setSaveMessage(`Synthetic user "${confirmationState.userName}" deleted.`);
        if (detailSearch.selectedUserId === deletedId) {
          onSearchChange({ selectedUserId: undefined });
        }
      }

      setConfirmationState(null);
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not complete the requested action."));
    } finally {
      setIsConfirmingAction(false);
    }
  }

  async function handleSuggestAxes() {
    if (!canSuggestAxes || isSuggestingAxes) {
      return;
    }

    const trimmedDescription = draftForm.description.trim();

    if (trimmedDescription.length === 0) {
      setSuggestionError("Add a short description before requesting suggestions.");
      return;
    }

    setSuggestionError(null);
    setInlineToast(null);
    setIsSuggestionPanelOpen(false);
    setSuggestedAxes([]);
    setIsSuggestingAxes(true);

    try {
      const suggestions = (await suggestAxes({
        name: draftForm.name.trim(),
        context: draftForm.context.trim(),
        description: trimmedDescription,
        existingAxisKeys: getAxisKeys(draftForm.sharedAxes),
        ...(forceSuggestAxesError ? { forceError: true } : {}),
      })) as PersonaConfigDoc["sharedAxes"];

      setSuggestedAxes(
        suggestions.map((axis, index) => ({
          id: `${axis.key}-${index}-${Date.now()}`,
          axis: axisToFormValue(axis),
          isEditing: false,
          isSelected: true,
        })),
      );
      setIsSuggestionPanelOpen(true);
    } catch (error) {
      setSuggestionError(getSuggestAxesErrorMessage(error));
    } finally {
      setIsSuggestingAxes(false);
    }
  }

  function handleSuggestionSelectionToggle(suggestionId: string) {
    setSuggestedAxes((current) =>
      current.map((suggestion) =>
        suggestion.id === suggestionId
          ? { ...suggestion, isSelected: !suggestion.isSelected }
          : suggestion,
      ),
    );
  }

  function handleSuggestionEditToggle(suggestionId: string) {
    setSuggestedAxes((current) =>
      current.map((suggestion) =>
        suggestion.id === suggestionId
          ? { ...suggestion, isEditing: !suggestion.isEditing }
          : suggestion,
      ),
    );
  }

  function handleSuggestionAxisChange(
    suggestionId: string,
    nextAxis: AxisFormValue,
  ) {
    setSuggestedAxes((current) =>
      current.map((suggestion) =>
        suggestion.id === suggestionId
          ? { ...suggestion, axis: nextAxis }
          : suggestion,
      ),
    );
  }

  function handleDismissSuggestions() {
    setIsSuggestionPanelOpen(false);
    setSuggestedAxes([]);
    setSuggestionError(null);
  }

  function handleApplySuggestedAxes() {
    const selectedSuggestions = suggestedAxes
      .filter((suggestion) => suggestion.isSelected)
      .map((suggestion) => suggestion.axis);
    const validationError = validateSelectedAxes(selectedSuggestions);

    if (validationError !== null) {
      setSuggestionError(validationError);
      return;
    }

    const mergeResult = mergeAxesIntoFormValue(
      draftForm.sharedAxes,
      selectedSuggestions,
    );

    if (mergeResult.addedCount === 0) {
      setInlineToast({
        message: formatDuplicateAxisToast(mergeResult.duplicateKeys),
        tone: "error",
      });
      return;
    }

    setDraftForm((current) => ({
      ...current,
      sharedAxes: mergeResult.nextAxes,
    }));
    setIsSuggestionPanelOpen(false);
    setSuggestedAxes([]);
    setSuggestionError(null);

    if (mergeResult.duplicateKeys.length > 0) {
      setInlineToast({
        message: formatDuplicateAxisToast(mergeResult.duplicateKeys),
        tone: "error",
      });
    }
  }

  function handleLibrarySelectionToggle(axisDefinitionId: string) {
    setSelectedLibraryAxisIds((current) =>
      current.includes(axisDefinitionId)
        ? current.filter((id) => id !== axisDefinitionId)
        : [...current, axisDefinitionId],
    );
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

  function handleImportAxisDefinitions() {
    const selectedAxisDefinitions = axisLibraryList
      .filter((axisDefinition) =>
        selectedLibraryAxisIds.includes(String(axisDefinition._id)),
      )
      .map(axisToFormValue);
    const mergeResult = mergeAxesIntoFormValue(
      draftForm.sharedAxes,
      selectedAxisDefinitions,
    );

    if (mergeResult.addedCount === 0) {
      setInlineToast({
        message: formatDuplicateAxisToast(mergeResult.duplicateKeys),
        tone: "error",
      });
      return;
    }

    setDraftForm((current) => ({
      ...current,
      sharedAxes: mergeResult.nextAxes,
    }));
    setIsAxisLibraryOpen(false);
    setSelectedLibraryAxisIds([]);

    if (mergeResult.duplicateKeys.length > 0) {
      setInlineToast({
        message: formatDuplicateAxisToast(mergeResult.duplicateKeys),
        tone: "error",
      });
    }
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

  function handleOpenExtractionPanel() {
    setIsExtractionPanelOpen(true);
    setExtractionError(null);
    setExtractionNotice(null);

    if (extractionStatus !== null && extractionStatus !== undefined) {
      handleResetExtractionWizard();
      return;
    }

    handleResetExtractionWizard();
  }

  function handleSelectExtractionMode(mode: ExtractionMode) {
    setExtractionMode(mode);
    setPreExtractionStep(mode === "guided" ? "guided" : "cost");
    setExtractionError(null);
    setExtractionNotice(null);
    setGuidedExtractionAxes(
      draftForm.sharedAxes.length > 0 ? draftForm.sharedAxes : [emptyAxis()],
    );
  }

  function handleContinueToExtractionCost() {
    const validationError = validateAxesForExtraction(
      guidedExtractionAxes,
      "Define at least one axis before continuing.",
    );

    if (validationError !== null) {
      setExtractionError(validationError);
      return;
    }

    setPreExtractionStep("cost");
    setExtractionError(null);
  }

  function handleBackFromExtractionCost() {
    setPreExtractionStep(extractionMode === "guided" ? "guided" : "mode");
    setExtractionError(null);
  }

  function handleResetExtractionWizard() {
    setExtractionMode(null);
    setPreExtractionStep("mode");
    setGuidedExtractionAxes(
      draftForm.sharedAxes.length > 0 ? draftForm.sharedAxes : [emptyAxis()],
    );
    setReviewArchetypes([]);
    setReviewProposedAxes([]);
    setExtractionError(null);
    setExtractionNotice(null);
    setDiscardingArchetypeId(null);
  }

  async function handleStartExtraction() {
    if (!config || extractionMode === null || isStartingExtraction) {
      return;
    }

    if (extractionMode === "guided") {
      const validationError = validateAxesForExtraction(
        guidedExtractionAxes,
        "Define at least one axis before continuing.",
      );

      if (validationError !== null) {
        setExtractionError(validationError);
        return;
      }
    }

    setExtractionError(null);
    setExtractionNotice(
      "Transcript extraction started. Progress will continue even if you navigate away.",
    );
    setIsStartingExtraction(true);
    setReviewArchetypes([]);
    setReviewProposedAxes([]);

    void startTranscriptExtraction({
      configId: config._id,
      mode: extractionMode,
      ...(extractionMode === "guided"
        ? { guidedAxes: guidedExtractionAxes.map(axisFormToPayload) }
        : {}),
    })
      .catch((error: unknown) => {
        setExtractionError(getErrorMessage(error, "Could not start transcript extraction."));
        setExtractionNotice(null);
      })
      .finally(() => {
        setIsStartingExtraction(false);
      });
  }

  function handleGuidedAxisChange(index: number, nextAxis: AxisFormValue) {
    setGuidedExtractionAxes((current) =>
      current.map((axis, axisIndex) => (axisIndex === index ? nextAxis : axis)),
    );
  }

  function handleRemoveGuidedAxis(index: number) {
    setGuidedExtractionAxes((current) => current.filter((_axis, axisIndex) => axisIndex !== index));
  }

  function handleToggleReviewArchetypeSelection(archetypeId: string) {
    setReviewArchetypes((current) =>
      current.map((archetype) =>
        archetype.id === archetypeId
          ? { ...archetype, isSelected: !archetype.isSelected }
          : archetype,
      ),
    );
  }

  function handleToggleReviewArchetypeEdit(archetypeId: string) {
    setReviewArchetypes((current) =>
      current.map((archetype) =>
        archetype.id === archetypeId
          ? { ...archetype, isEditing: !archetype.isEditing }
          : archetype,
      ),
    );
  }

  function handleReviewArchetypeChange(
    archetypeId: string,
    patch: Partial<ExtractionArchetypeState>,
  ) {
    setReviewArchetypes((current) =>
      current.map((archetype) =>
        archetype.id === archetypeId
          ? { ...archetype, ...patch }
          : archetype,
      ),
    );
  }

  function handleToggleReviewAxisEdit(axisId: string) {
    setReviewProposedAxes((current) =>
      current.map((axis) =>
        axis.id === axisId ? { ...axis, isEditing: !axis.isEditing } : axis,
      ),
    );
  }

  function handleReviewAxisChange(axisId: string, nextAxis: AxisFormValue) {
    setReviewProposedAxes((current) =>
      current.map((axis) =>
        axis.id === axisId ? { ...axis, axis: nextAxis } : axis,
      ),
    );
  }

  function handleReviewAxisRemovalToggle(axisId: string) {
    setReviewProposedAxes((current) =>
      current.map((axis) =>
        axis.id === axisId ? { ...axis, isRemoved: !axis.isRemoved } : axis,
      ),
    );
  }

  function handleMergeSelectedArchetypes() {
    const selectedArchetypes = reviewArchetypes.filter((archetype) => archetype.isSelected);

    if (selectedArchetypes.length !== 2) {
      setExtractionError("Select exactly two archetypes before merging them.");
      return;
    }

    const firstArchetype = selectedArchetypes[0]!;
    const secondArchetype = selectedArchetypes[1]!;
    const mergedAxisValues = Array.from(
      new Set([
        ...firstArchetype.axisValues.map((axisValue) => axisValue.key),
        ...secondArchetype.axisValues.map((axisValue) => axisValue.key),
      ]),
    ).map((axisKey) => {
      const leftValue =
        firstArchetype.axisValues.find((axisValue) => axisValue.key === axisKey)?.value ?? 0;
      const rightValue =
        secondArchetype.axisValues.find((axisValue) => axisValue.key === axisKey)?.value ?? 0;

      return {
        key: axisKey,
        value: Number(((leftValue + rightValue) / 2).toFixed(2)),
      };
    });
    const mergedEvidence = dedupeEvidenceSnippets([
      ...firstArchetype.evidenceSnippets,
      ...secondArchetype.evidenceSnippets,
    ]);
    const mergedTranscriptIds = Array.from(
      new Set([
        ...firstArchetype.contributingTranscriptIds,
        ...secondArchetype.contributingTranscriptIds,
      ]),
    );
    const mergedArchetype: ExtractionArchetypeState = {
      id: `merged-${Date.now()}`,
      name: `${firstArchetype.name} + ${secondArchetype.name}`,
      summary: `${firstArchetype.summary} ${secondArchetype.summary}`.trim(),
      axisValues: mergedAxisValues,
      evidenceSnippets: mergedEvidence,
      contributingTranscriptIds: mergedTranscriptIds,
      isEditing: false,
      isSelected: true,
    };

    setReviewArchetypes((current) => [
      ...current.filter(
        (archetype) =>
          archetype.id !== firstArchetype.id && archetype.id !== secondArchetype.id,
      ),
      mergedArchetype,
    ]);
    setExtractionError(null);
  }

  function handleConfirmDiscardArchetype() {
    if (discardingArchetypeId === null) {
      return;
    }

    setReviewArchetypes((current) =>
      current.filter((archetype) => archetype.id !== discardingArchetypeId),
    );
    setDiscardingArchetypeId(null);
  }

  async function handleApplyTranscriptExtractionResults() {
    if (!config || selectedExtractionArchetypeCount === 0) {
      return;
    }

    const selectedArchetypes = reviewArchetypes.filter((archetype) => archetype.isSelected);
    const axisValidationError = validateAxesForExtraction(
      extractionSharedAxes,
      "Keep at least one reviewed axis before applying transcript-derived personas.",
    );

    if (axisValidationError !== null) {
      setExtractionError(axisValidationError);
      return;
    }

    setExtractionError(null);
    setExtractionNotice(null);
    setIsApplyingExtractionResults(true);

    try {
      await applyTranscriptDerivedSyntheticUsers({
        configId: config._id,
        input: {
          sharedAxes: extractionSharedAxes.map(axisFormToPayload),
          archetypes: selectedArchetypes.map((archetype) => ({
            name: archetype.name.trim(),
            summary: archetype.summary.trim(),
            axisValues: archetype.axisValues.map((axisValue) => ({
              ...axisValue,
              key: normalizeAxisKey(axisValue.key),
            })),
            evidenceSnippets: archetype.evidenceSnippets.map((snippet) => ({
              transcriptId: snippet.transcriptId,
              quote: snippet.quote.trim(),
            })),
            contributingTranscriptIds: archetype.contributingTranscriptIds,
            notes: formatTranscriptDerivedNotes(archetype.axisValues),
          })),
        },
      });
      setDraftForm((current) => ({
        ...current,
        sharedAxes: extractionSharedAxes,
      }));
      setSaveMessage(
        selectedArchetypes.length === 1
          ? "Applied 1 transcript-derived synthetic user to this persona configuration."
          : `Applied ${selectedArchetypes.length} transcript-derived synthetic users to this persona configuration.`,
      );
    } catch (error) {
      setExtractionError(
        getErrorMessage(error, "Could not apply transcript-derived synthetic users."),
      );
    } finally {
      setIsApplyingExtractionResults(false);
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
      <LoadingCard
        title="Persona Configuration"
        body="Loading persona configuration details and synthetic users..."
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

  const activeTab = detailSearch.tab;

  return (
    <>
      {inlineToast ? <InlineToast toast={inlineToast} /> : null}
      <ConfigShell
        config={config}
        resolvedStatus={resolvedStatus ?? config.status}
        syntheticUserCount={syntheticUserList.length}
        transcriptCount={configTranscripts.length}
        activeTab={activeTab}
        hasActiveBatchRun={hasActiveBatchGenerationRun}
        actionError={actionError}
        saveMessage={saveMessage}
        publishedStatusHelp={publishedStatusHelp}
        onTabChange={onSearchChange}
        onPublish={() =>
          setConfirmationState({
            kind: "publish",
            title: "Publish persona configuration?",
            description:
              "Publishing freezes this persona configuration and its synthetic users so studies can rely on a stable definition.",
            confirmLabel: "Publish persona configuration",
          })
        }
        onArchive={() =>
          setConfirmationState({
            kind: "archive",
            title: "Archive persona configuration?",
            description:
              "Archiving hides this persona configuration from active work while preserving its history for audit and reference.",
            confirmLabel: "Archive persona configuration",
          })
        }
      >
        {activeTab === "overview" ? (
          <OverviewWorkspace
            config={config}
            isDraft={isDraft}
            resolvedStatus={resolvedStatus ?? config.status}
            syntheticUserCount={syntheticUserList.length}
            transcriptCount={configTranscripts.length}
            batchGenerationRun={batchGenerationRun ?? null}
            draftForm={draftForm}
            isSavingDraft={isSavingDraft}
            resolvedAxes={resolvedAxes}
            canSuggestAxes={canSuggestAxes}
            isSuggestingAxes={isSuggestingAxes}
            suggestionError={suggestionError}
            isSuggestionPanelOpen={isSuggestionPanelOpen}
            suggestedAxes={suggestedAxes}
            selectedSuggestionCount={selectedSuggestionCount}
            onSaveDraft={handleSaveDraft}
            onDraftFormChange={setDraftForm}
            onSuggestAxes={() => void handleSuggestAxes()}
            onOpenAxisLibrary={() => {
              setSelectedLibraryAxisIds([]);
              setIsAxisLibraryOpen(true);
            }}
            onSuggestionSelectionToggle={handleSuggestionSelectionToggle}
            onSuggestionEditToggle={handleSuggestionEditToggle}
            onSuggestionAxisChange={handleSuggestionAxisChange}
            onDismissSuggestions={handleDismissSuggestions}
            onApplySuggestedAxes={handleApplySuggestedAxes}
            formatTimestamp={formatTimestamp}
          />
        ) : null}

        {activeTab === "users" ? (
          <UsersWorkspace
            config={config}
            isDraft={isDraft}
            syntheticUserList={syntheticUserList}
            syntheticUserForm={syntheticUserForm}
            isProtoFormOpen={isProtoFormOpen}
            isSavingSyntheticUser={isSavingSyntheticUser}
            selectedUserId={detailSearch.selectedUserId}
            onToggleProtoForm={() => setIsProtoFormOpen((current) => !current)}
            onCreateSyntheticUser={handleCreateSyntheticUser}
            onUpdateSyntheticUser={handleUpdateSyntheticUser}
            onRequestDeleteSyntheticUser={handleRequestDeleteSyntheticUser}
            onSyntheticUserFormChange={setSyntheticUserForm}
            onSearchChange={onSearchChange}
          />
        ) : null}

        {activeTab === "transcripts" ? (
          <TranscriptsWorkspace
            config={config}
            isDraft={isDraft}
            canManageConfigTranscripts={canManageConfigTranscripts}
            configTranscripts={configTranscripts}
            extractionStatus={extractionStatus}
            extractionButtonLabel={extractionButtonLabel}
            canOpenExtraction={canOpenExtraction}
            detachingTranscriptId={detachingTranscriptId}
            isExtractionPanelOpen={isExtractionPanelOpen}
            extractionMode={extractionMode}
            extractionStep={extractionStep}
            extractionError={extractionError}
            extractionNotice={extractionNotice}
            extractionCostEstimate={extractionCostEstimate}
            isStartingExtraction={isStartingExtraction}
            isApplyingExtractionResults={isApplyingExtractionResults}
            guidedExtractionAxes={guidedExtractionAxes}
            reviewArchetypes={reviewArchetypes}
            activeReviewProposedAxes={activeReviewProposedAxes}
            extractionSharedAxes={extractionSharedAxes}
            selectedExtractionArchetypeCount={selectedExtractionArchetypeCount}
            transcriptFilenameById={transcriptFilenameById}
            discardingArchetypeId={discardingArchetypeId}
            selectedTranscriptId={detailSearch.selectedTranscriptId}
            onOpenTranscriptPicker={() => setIsTranscriptPickerOpen(true)}
            onOpenExtractionPanel={handleOpenExtractionPanel}
            onDetachTranscript={handleDetachTranscript}
            onCloseExtractionPanel={() => setIsExtractionPanelOpen(false)}
            onSelectExtractionMode={handleSelectExtractionMode}
            onContinueToExtractionCost={handleContinueToExtractionCost}
            onBackFromExtractionCost={handleBackFromExtractionCost}
            onStartExtraction={handleStartExtraction}
            onResetExtractionWizard={handleResetExtractionWizard}
            onGuidedAxisChange={handleGuidedAxisChange}
            onRemoveGuidedAxis={handleRemoveGuidedAxis}
            onAddGuidedAxis={() =>
              setGuidedExtractionAxes((current) => [...current, emptyAxis()])
            }
            onToggleArchetypeSelected={handleToggleReviewArchetypeSelection}
            onToggleArchetypeEdit={handleToggleReviewArchetypeEdit}
            onUpdateArchetype={handleReviewArchetypeChange}
            onMergeSelectedArchetypes={handleMergeSelectedArchetypes}
            onDiscardArchetype={setDiscardingArchetypeId}
            onConfirmDiscardArchetype={handleConfirmDiscardArchetype}
            onProposedAxisChange={handleReviewAxisChange}
            onProposedAxisToggleEdit={handleToggleReviewAxisEdit}
            onProposedAxisToggleRemoved={handleReviewAxisRemovalToggle}
            onApplyExtractionResults={handleApplyTranscriptExtractionResults}
            onSearchChange={onSearchChange}
          />
        ) : null}

        {activeTab === "generation" ? (
          <GenerationWorkspace
            config={config}
            isDraft={isDraft}
            canManageGeneration={viewerAccess?.permissions.canManagePersonaConfigs === true}
            batchGenerationRun={batchGenerationRun ?? null}
            syntheticUsers={syntheticUserList}
            selectedGenerationUserId={detailSearch.selectedGenerationUserId}
            onRegenerateUser={(syntheticUserId) =>
              regenerateSyntheticUser({ syntheticUserId })
            }
            onStartGeneration={(levelsPerAxis) =>
              startBatchGeneration({
                configId: config._id,
                levelsPerAxis,
              })
            }
            onSearchChange={onSearchChange}
          />
        ) : null}

        {activeTab === "review" ? (
          <ReviewWorkspace
            configVariantReview={configVariantReview}
            selectedVariantId={detailSearch.selectedVariantId}
            selectedReviewStudyId={selectedReviewStudyId}
            onSearchChange={onSearchChange}
          />
        ) : null}
      </ConfigShell>

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
        axisDefinitions={axisLibraryList}
        existingAxisKeys={new Set(getAxisKeys(draftForm.sharedAxes))}
        isOpen={isAxisLibraryOpen}
        isLoading={axisDefinitions === undefined}
        selectedAxisIds={selectedLibraryAxisIds}
        onCancel={() => {
          setIsAxisLibraryOpen(false);
          setSelectedLibraryAxisIds([]);
        }}
        onConfirm={handleImportAxisDefinitions}
        onToggleSelected={handleLibrarySelectionToggle}
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

function generationHealthLabel(
  run: BatchGenerationRunView | null,
): { text: string; tone: "default" | "success" | "warning" | "destructive" } {
  if (run === null) {
    return { text: "No runs", tone: "default" };
  }

  switch (run.status) {
    case "pending":
    case "running":
      return {
        text: `${run.progressPercent}% (${run.completedCount}/${run.totalCount})`,
        tone: "warning",
      };
    case "completed":
      return { text: `${run.completedCount}/${run.totalCount} completed`, tone: "success" };
    case "partially_failed":
      return {
        text: `${run.completedCount} ok, ${run.failedCount} failed`,
        tone: "warning",
      };
    case "failed":
      return { text: "Failed", tone: "destructive" };
  }
}

function generationHealthColor(
  tone: "default" | "success" | "warning" | "destructive",
) {
  switch (tone) {
    case "success":
      return "text-emerald-600";
    case "warning":
      return "text-amber-600";
    case "destructive":
      return "text-destructive";
    default:
      return "text-muted-foreground";
  }
}

function OverviewWorkspace({
  config,
  isDraft,
  resolvedStatus,
  syntheticUserCount,
  transcriptCount,
  batchGenerationRun,
  draftForm,
  isSavingDraft,
  resolvedAxes,
  canSuggestAxes,
  isSuggestingAxes,
  suggestionError,
  isSuggestionPanelOpen,
  suggestedAxes,
  selectedSuggestionCount,
  onSaveDraft,
  onDraftFormChange,
  onSuggestAxes,
  onOpenAxisLibrary,
  onSuggestionSelectionToggle,
  onSuggestionEditToggle,
  onSuggestionAxisChange,
  onDismissSuggestions,
  onApplySuggestedAxes,
  formatTimestamp: formatTs,
}: {
  config: PersonaConfigDoc;
  isDraft: boolean;
  resolvedStatus: PersonaConfigDoc["status"];
  syntheticUserCount: number;
  transcriptCount: number;
  batchGenerationRun: BatchGenerationRunView | null;
  draftForm: ConfigFormValue;
  isSavingDraft: boolean;
  resolvedAxes: PersonaConfigDoc["sharedAxes"];
  canSuggestAxes: boolean;
  isSuggestingAxes: boolean;
  suggestionError: string | null;
  isSuggestionPanelOpen: boolean;
  suggestedAxes: SuggestedAxisState[];
  selectedSuggestionCount: number;
  onSaveDraft: (event: React.FormEvent<HTMLFormElement>) => void;
  onDraftFormChange: (form: ConfigFormValue) => void;
  onSuggestAxes: () => void;
  onOpenAxisLibrary: () => void;
  onSuggestionSelectionToggle: (id: string) => void;
  onSuggestionEditToggle: (id: string) => void;
  onSuggestionAxisChange: (id: string, axis: AxisFormValue) => void;
  onDismissSuggestions: () => void;
  onApplySuggestedAxes: () => void;
  formatTimestamp: (ts: number) => string;
}) {
  const genHealth = generationHealthLabel(batchGenerationRun);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Orientation</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <LocalSummaryValue label="Status" value={resolvedStatus} />
            <LocalSummaryValue label="Version" value={`v${config.version}`} />
            <LocalSummaryValue
              label="Shared axes"
              value={String(resolvedAxes.length)}
            />
            <LocalSummaryValue
              label="Synthetic users"
              value={String(syntheticUserCount)}
            />
            <LocalSummaryValue
              label="Transcripts"
              value={String(transcriptCount)}
            />
            <div className="rounded-lg border bg-background p-4">
              <dt className="text-sm font-medium text-muted-foreground">
                Generation health
              </dt>
              <dd
                className={`mt-1 break-words text-sm font-medium ${generationHealthColor(genHealth.tone)}`}
              >
                {genHealth.text}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {isDraft ? (
        <Card>
          <CardHeader>
            <CardTitle>Metadata &amp; Shared Axes</CardTitle>
          </CardHeader>
          <CardContent>
            <ConfigFormCard
              form={draftForm}
              formPrefix="edit-config"
              submitLabel={isSavingDraft ? "Saving..." : "Save draft changes"}
              title={null}
              description={null}
              error={null}
              disabled={isSavingDraft}
              onSubmit={onSaveDraft}
              onChange={onDraftFormChange}
              axisGenerationSlot={
                <div className="space-y-4 rounded-xl border bg-background p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">Axis generation</p>
                      <p className="text-sm text-muted-foreground">
                        Generate new axes from persona configuration metadata or import reusable
                        ones from the shared library.
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <Button
                        disabled={!canSuggestAxes || isSuggestingAxes}
                        onClick={onSuggestAxes}
                        type="button"
                      >
                        {isSuggestingAxes ? (
                          <span className="inline-flex items-center gap-2">
                            <LoadingSpinner />
                            Suggesting...
                          </span>
                        ) : (
                          "Suggest axes"
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onOpenAxisLibrary}
                      >
                        Browse library
                      </Button>
                    </div>
                  </div>

                  <div aria-live="polite" className="space-y-2">
                    {isSuggestingAxes ? (
                      <p className="text-sm text-muted-foreground" role="status">
                        Generating axis suggestions from the current persona configuration
                        metadata...
                      </p>
                    ) : null}
                    {suggestionError ? (
                      <p className="text-sm text-destructive" role="alert">
                        {suggestionError}
                      </p>
                    ) : null}
                  </div>

                  {isSuggestionPanelOpen ? (
                    <div className="space-y-4 rounded-xl border border-dashed bg-card p-4">
                      <div className="space-y-1">
                        <h4 className="text-lg font-semibold">
                          Review suggested axes
                        </h4>
                        <p className="text-sm text-muted-foreground">
                          Select the axes you want to add, edit any field inline,
                          then apply the selected suggestions.
                        </p>
                      </div>

                      <div className="grid gap-4">
                        {suggestedAxes.map((suggestion, index) => (
                          <SuggestedAxisCard
                            key={suggestion.id}
                            index={index}
                            suggestion={suggestion}
                            onChange={(nextAxis) =>
                              onSuggestionAxisChange(suggestion.id, nextAxis)
                            }
                            onToggleEdit={() =>
                              onSuggestionEditToggle(suggestion.id)
                            }
                            onToggleSelected={() =>
                              onSuggestionSelectionToggle(suggestion.id)
                            }
                          />
                        ))}
                      </div>

                      <div className="flex flex-wrap justify-end gap-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={onDismissSuggestions}
                        >
                          Dismiss
                        </Button>
                        <Button
                          disabled={selectedSuggestionCount === 0}
                          type="button"
                          onClick={onApplySuggestedAxes}
                        >
                          Apply selected
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Metadata</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <LocalSummaryValue label="Name" value={config.name} />
                <LocalSummaryValue label="Version" value={`v${config.version}`} />
                <LocalSummaryValue label="Description" value={config.description} />
                <LocalSummaryValue label="Context" value={config.context} />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Shared Axes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {resolvedAxes.map((axis, index) => (
                <div
                  key={`${axis.key}-${index}`}
                  className="rounded-lg border bg-background p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">{axis.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {axis.key} · weight {axis.weight}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-muted-foreground">
                    {axis.description}
                  </p>
                  <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                    <LocalSummaryValue label="Low anchor" value={axis.lowAnchor} />
                    <LocalSummaryValue label="Mid anchor" value={axis.midAnchor} />
                    <LocalSummaryValue label="High anchor" value={axis.highAnchor} />
                  </dl>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Audit Trail</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <LocalSummaryValue label="Created by" value={config.createdBy} />
          <LocalSummaryValue
            label="Last modified by"
            value={config.updatedBy ?? config.createdBy}
          />
          <LocalSummaryValue
            label="Created at"
            value={formatTs(config.createdAt)}
          />
          <LocalSummaryValue
            label="Last updated"
            value={formatTs(config.updatedAt)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

