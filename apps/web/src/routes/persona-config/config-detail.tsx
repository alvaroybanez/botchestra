import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import {
  PersonaGenerationSection,
  type BatchGenerationRunView,
} from "@/components/persona-generation-section";
import {
  PersonaVariantReviewGrid,
  type VariantReviewData,
} from "@/components/persona-variant-review-grid";
import { PageHeader } from "@/components/domain/page-header";
import { ConfigStatusBadge } from "@/components/domain/status-badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyStudyDetailSearch } from "@/routes/study-shared";
import type {
  AxisFormValue,
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
import {
  TranscriptAttachmentDialog,
  TranscriptExtractionPanel,
} from "./extraction-panel";

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
      configVariantReview.selectedStudy?._id ?? configVariantReview.study?._id ?? null;

    setSelectedStudyId((current) =>
      current !== null &&
      configVariantReview.studies.some((study) => study._id === current)
        ? current
        : resolvedStudyId,
    );
  }, [configVariantReview]);

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

  return (
    <>
      {inlineToast ? <InlineToast toast={inlineToast} /> : null}
      <section className="space-y-6">
        <PageHeader
          title={config.name}
          badge={<ConfigStatusBadge status={resolvedStatus ?? config.status} />}
          description="Review persona configuration metadata, shared axes, and synthetic users before publishing. Published persona configurations are frozen and archived persona configurations remain read-only."
          actions={
            <>
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
            </>
          }
        />

        {actionError ? (
          <p className="text-sm text-destructive">{actionError}</p>
        ) : null}
        {saveMessage ? (
          <p className="text-sm text-emerald-700">{saveMessage}</p>
        ) : null}
        {publishedStatusHelp ? (
          <p className="text-sm text-muted-foreground">{publishedStatusHelp}</p>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
              </CardHeader>
              <CardContent>
                {isDraft ? (
                  <ConfigFormCard
                    form={draftForm}
                    formPrefix="edit-config"
                    submitLabel={isSavingDraft ? "Saving..." : "Save draft changes"}
                    title={null}
                    description={null}
                    error={null}
                    disabled={isSavingDraft}
                    onSubmit={handleSaveDraft}
                    onChange={setDraftForm}
                  />
                ) : (
                  <dl className="grid gap-4 sm:grid-cols-2">
                    <LocalSummaryValue label="Name" value={config.name} />
                    <LocalSummaryValue label="Version" value={`v${config.version}`} />
                    <LocalSummaryValue label="Description" value={config.description} />
                    <LocalSummaryValue label="Context" value={config.context} />
                  </dl>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Shared Axes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isDraft ? (
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
                          onClick={() => void handleSuggestAxes()}
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
                          onClick={() => {
                            setSelectedLibraryAxisIds([]);
                            setIsAxisLibraryOpen(true);
                          }}
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
                                handleSuggestionAxisChange(suggestion.id, nextAxis)
                              }
                              onToggleEdit={() =>
                                handleSuggestionEditToggle(suggestion.id)
                              }
                              onToggleSelected={() =>
                                handleSuggestionSelectionToggle(suggestion.id)
                              }
                            />
                          ))}
                        </div>

                        <div className="flex flex-wrap justify-end gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={handleDismissSuggestions}
                          >
                            Dismiss
                          </Button>
                          <Button
                            disabled={selectedSuggestionCount === 0}
                            type="button"
                            onClick={handleApplySuggestedAxes}
                          >
                            Apply selected
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}

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

            <PersonaGenerationSection
              axes={config.sharedAxes}
              batchGenerationRun={batchGenerationRun ?? null}
              canManageGeneration={viewerAccess?.permissions.canManagePersonaConfigs === true}
              configStatus={resolvedStatus ?? config.status}
              syntheticUsers={syntheticUserList}
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

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>Synthetic Users</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Review the persona configuration&apos;s source synthetic users and the evidence
                    used to anchor them.
                  </p>
                </div>
                {isDraft ? (
                  <Button
                    variant="outline"
                    onClick={() => setIsProtoFormOpen((current) => !current)}
                  >
                    {isProtoFormOpen ? "Close form" : "Add synthetic user"}
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {isProtoFormOpen ? (
                  <form
                    className="space-y-4 rounded-xl border bg-background p-4"
                    onSubmit={handleCreateSyntheticUser}
                  >
                    <div className="grid gap-2">
                      <Label htmlFor="create-proto-name">Name</Label>
                      <Input
                        id="create-proto-name"
                        value={syntheticUserForm.name}
                        onChange={(event) =>
                          setSyntheticUserForm((current) => ({
                            ...current,
                            name: event.target.value,
                          }))
                        }
                        required
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="create-proto-summary">Summary</Label>
                      <textarea
                        id="create-proto-summary"
                        className={textareaClassName}
                        value={syntheticUserForm.summary}
                        onChange={(event) =>
                          setSyntheticUserForm((current) => ({
                            ...current,
                            summary: event.target.value,
                          }))
                        }
                        required
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="create-proto-evidence">
                        Evidence snippets
                      </Label>
                      <textarea
                        id="create-proto-evidence"
                        className={textareaClassName}
                        value={syntheticUserForm.evidenceText}
                        onChange={(event) =>
                          setSyntheticUserForm((current) => ({
                            ...current,
                            evidenceText: event.target.value,
                          }))
                        }
                        placeholder="One snippet per line"
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="create-proto-notes">Notes</Label>
                      <textarea
                        id="create-proto-notes"
                        className={textareaClassName}
                        value={syntheticUserForm.notes}
                        onChange={(event) =>
                          setSyntheticUserForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <p className="text-xs leading-5 text-muted-foreground">
                      New synthetic users inherit the current shared axes so you
                      can quickly draft content before publishing.
                    </p>

                    <Button disabled={isSavingSyntheticUser} type="submit">
                      {isSavingSyntheticUser ? "Saving..." : "Save synthetic user"}
                    </Button>
                  </form>
                ) : null}

                {syntheticUserList.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-background p-6">
                    <p className="text-sm leading-6 text-muted-foreground">
                      No synthetic users yet. Add the first synthetic user to make
                      this draft persona configuration publishable.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {syntheticUserList.map((syntheticUser) => (
                      <SyntheticUserCard
                        key={syntheticUser._id}
                        syntheticUser={syntheticUser}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Persona Configuration Summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <LocalSummaryValue label="Persona Configuration ID" value={config._id} />
                <LocalSummaryValue label="Status" value={resolvedStatus ?? config.status} />
                <LocalSummaryValue label="Version" value={`v${config.version}`} />
                <LocalSummaryValue
                  label="Synthetic users"
                  value={String(syntheticUserList.length)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>Attached Transcripts</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Review transcript research linked to this persona configuration and open each
                    transcript in the library.
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
                  <p className="text-sm text-muted-foreground">
                    Transcript attachments become read-only once the persona configuration is no
                    longer a draft.
                  </p>
                ) : null}
                {!canManageConfigTranscripts ? (
                  <p className="text-sm text-muted-foreground">
                    Reviewers can inspect attached transcripts but cannot attach
                    or detach them.
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
                    onAddGuidedAxis={() =>
                      setGuidedExtractionAxes((current) => [...current, emptyAxis()])
                    }
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
                    transcriptSignals={extractionStatus?.transcriptSignals ?? []}
                    discardArchetypeId={discardingArchetypeId}
                  />
                ) : null}
              </CardContent>
            </Card>

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
                  value={formatTimestamp(config.createdAt)}
                />
                <LocalSummaryValue
                  label="Last updated"
                  value={formatTimestamp(config.updatedAt)}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Config access is scoped to the current authenticated
                  organization. Reads and mutations outside your org return no
                  data or fail authorization checks.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        <section className="space-y-4">
          <div className="space-y-2">
            <h3 className="text-2xl font-semibold tracking-tight">
              Variant Review
            </h3>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Review accepted variants generated for studies that use this persona configuration.
              Use the study selector to inspect the latest published persona configuration cohorts.
            </p>
          </div>

          {configVariantReview === undefined ? (
            <LoadingCard
              title="Variant Review"
              body="Loading linked studies and accepted variants..."
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
                <CardTitle>No studies linked to this persona configuration</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Generate variants from a study that uses this published persona configuration,
                  then return here to review the accepted cohort.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
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
                    <LocalSummaryValue
                      label="Study status"
                      value={selectedStudySummary.status}
                    />
                    <LocalSummaryValue
                      label="Run budget"
                      value={String(selectedStudySummary.runBudget)}
                    />
                    <LocalSummaryValue
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
        </section>
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

function SyntheticUserCard({ syntheticUser }: { syntheticUser: SyntheticUserDoc }) {
  const isTranscriptDerived = syntheticUser.sourceType === "transcript_derived";

  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-lg font-semibold">{syntheticUser.name}</h4>
          <p className="text-sm text-muted-foreground">Source: {syntheticUser.sourceType}</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {syntheticUser.axes.length} axes
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {syntheticUser.summary}
      </p>

      {syntheticUser.evidenceSnippets.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Evidence snippets</p>
          <ul className="space-y-2">
            {syntheticUser.evidenceSnippets.map((snippet, index) => (
              <li
                key={`${syntheticUser._id}-${index}`}
              >
                {isTranscriptDerived && syntheticUser.sourceRefs[index] ? (
                  <Link
                    className="block rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                    params={{
                      transcriptId: syntheticUser.sourceRefs[index] as TranscriptId,
                    }}
                    search={{ highlightSnippet: snippet }}
                    to="/transcripts/$transcriptId"
                  >
                    {snippet}
                  </Link>
                ) : (
                  <div className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground">
                    {snippet}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {syntheticUser.notes ? (
        <div className="mt-4">
          <p className="text-sm font-medium">Notes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {syntheticUser.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}
