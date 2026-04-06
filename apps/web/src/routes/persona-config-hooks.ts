import { useEffect, useState } from "react";
import type {
  PersonaConfigDoc,
  AxisDefinition,
  AxisFormValue,
  ConfigFormValue,
  SuggestedAxisState,
  InlineToastState,
  ExtractionMode,
  ExtractionArchetypeState,
  ExtractionReviewAxisState,
  ExtractionStatus,
  ConfigTranscriptAttachment,
} from "@/routes/persona-config-shared";
import {
  emptyAxis,
  axisToFormValue,
  axisFormToPayload,
  getAxisKeys,
  getSuggestAxesErrorMessage,
  validateSelectedAxes,
  mergeAxesIntoFormValue,
  formatDuplicateAxisToast,
  validateAxesForExtraction,
  normalizeAxisKey,
  dedupeEvidenceSnippets,
  formatTranscriptDerivedNotes,
  getErrorMessage,
} from "@/routes/persona-config-shared";

// ---------------------------------------------------------------------------
// 1. useInlineToast
// ---------------------------------------------------------------------------

export function useInlineToast() {
  const [inlineToast, setInlineToast] = useState<InlineToastState | null>(null);

  useEffect(() => {
    if (inlineToast === null) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setInlineToast(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [inlineToast]);

  return { inlineToast, setInlineToast };
}

// ---------------------------------------------------------------------------
// 2. useSuggestionState
// ---------------------------------------------------------------------------

export function useSuggestionState(
  config: PersonaConfigDoc | null | undefined,
  draftForm: ConfigFormValue,
  forceSuggestAxesError: boolean,
  suggestAxes: (args: {
    name: string;
    context: string;
    description: string;
    existingAxisKeys: string[];
    forceError?: boolean;
  }) => Promise<PersonaConfigDoc["sharedAxes"]>,
  setDraftForm: React.Dispatch<React.SetStateAction<ConfigFormValue>>,
  setInlineToast: React.Dispatch<React.SetStateAction<InlineToastState | null>>,
) {
  const [suggestedAxes, setSuggestedAxes] = useState<SuggestedAxisState[]>([]);
  const [isSuggestionPanelOpen, setIsSuggestionPanelOpen] = useState(false);
  const [isSuggestingAxes, setIsSuggestingAxes] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);

  const canSuggestAxes =
    draftForm.name.trim().length > 0 && draftForm.context.trim().length > 0;
  const selectedSuggestionCount = suggestedAxes.filter(
    (suggestion) => suggestion.isSelected,
  ).length;

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

  return {
    suggestedAxes,
    setSuggestedAxes,
    isSuggestionPanelOpen,
    setIsSuggestionPanelOpen,
    isSuggestingAxes,
    suggestionError,
    setSuggestionError,
    canSuggestAxes,
    selectedSuggestionCount,
    handleSuggestAxes,
    handleSuggestionSelectionToggle,
    handleSuggestionEditToggle,
    handleSuggestionAxisChange,
    handleDismissSuggestions,
    handleApplySuggestedAxes,
  };
}

// ---------------------------------------------------------------------------
// 3. useAxisLibraryImport
// ---------------------------------------------------------------------------

export function useAxisLibraryImport(
  axisDefinitions: AxisDefinition[] | undefined,
  draftForm: ConfigFormValue,
  setDraftForm: React.Dispatch<React.SetStateAction<ConfigFormValue>>,
  setInlineToast: React.Dispatch<React.SetStateAction<InlineToastState | null>>,
) {
  const [isAxisLibraryOpen, setIsAxisLibraryOpen] = useState(false);
  const [selectedLibraryAxisIds, setSelectedLibraryAxisIds] = useState<string[]>(
    [],
  );

  const axisLibraryList = axisDefinitions ?? [];

  function handleLibrarySelectionToggle(axisDefinitionId: string) {
    setSelectedLibraryAxisIds((current) =>
      current.includes(axisDefinitionId)
        ? current.filter((id) => id !== axisDefinitionId)
        : [...current, axisDefinitionId],
    );
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

  return {
    isAxisLibraryOpen,
    setIsAxisLibraryOpen,
    selectedLibraryAxisIds,
    setSelectedLibraryAxisIds,
    axisLibraryList,
    handleLibrarySelectionToggle,
    handleImportAxisDefinitions,
  };
}

// ---------------------------------------------------------------------------
// 4. useExtractionState
// ---------------------------------------------------------------------------

export function useExtractionState(
  config: PersonaConfigDoc | null | undefined,
  configTranscripts: ConfigTranscriptAttachment[] | undefined,
  extractionStatus: ExtractionStatus | null | undefined,
  draftForm: ConfigFormValue,
  setDraftForm: React.Dispatch<React.SetStateAction<ConfigFormValue>>,
  setSaveMessage: React.Dispatch<React.SetStateAction<string | null>>,
  startTranscriptExtraction: (args: {
    configId: PersonaConfigDoc["_id"];
    mode: ExtractionMode;
    guidedAxes?: ReturnType<typeof axisFormToPayload>[];
  }) => Promise<unknown>,
  applyTranscriptDerivedSyntheticUsers: (args: {
    configId: PersonaConfigDoc["_id"];
    input: {
      sharedAxes: ReturnType<typeof axisFormToPayload>[];
      archetypes: Array<{
        name: string;
        summary: string;
        axisValues: Array<{ key: string; value: number }>;
        evidenceSnippets: Array<{ transcriptId: string; quote: string }>;
        contributingTranscriptIds: string[];
        notes: string | undefined;
      }>;
    };
  }) => Promise<unknown>,
) {
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

  // Sync guided extraction axes when config changes
  useEffect(() => {
    if (!config) {
      return;
    }

    setGuidedExtractionAxes(config.sharedAxes.map(axisToFormValue));
  }, [config?._id, config?.updatedAt, config?.status]);

  // Open extraction panel when extractionStatus becomes available
  useEffect(() => {
    if (extractionStatus !== null && extractionStatus !== undefined) {
      setIsExtractionPanelOpen(true);
    }
  }, [extractionStatus?.updatedAt, extractionStatus?.status]);

  // Sync review state from completed extraction results
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

  // Computed values
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
  const extractionStep: "mode" | "guided" | "cost" | "processing" | "failed" | "results" =
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

  return {
    isExtractionPanelOpen,
    setIsExtractionPanelOpen,
    extractionMode,
    setExtractionMode,
    preExtractionStep,
    setPreExtractionStep,
    guidedExtractionAxes,
    setGuidedExtractionAxes,
    reviewArchetypes,
    setReviewArchetypes,
    reviewProposedAxes,
    setReviewProposedAxes,
    extractionError,
    setExtractionError,
    extractionNotice,
    setExtractionNotice,
    isStartingExtraction,
    isApplyingExtractionResults,
    discardingArchetypeId,
    setDiscardingArchetypeId,
    selectedExtractionArchetypeCount,
    activeReviewProposedAxes,
    extractionSharedAxes,
    extractionStep,
    extractionButtonLabel,
    handleOpenExtractionPanel,
    handleSelectExtractionMode,
    handleContinueToExtractionCost,
    handleBackFromExtractionCost,
    handleResetExtractionWizard,
    handleStartExtraction,
    handleGuidedAxisChange,
    handleRemoveGuidedAxis,
    handleToggleReviewArchetypeSelection,
    handleToggleReviewArchetypeEdit,
    handleReviewArchetypeChange,
    handleToggleReviewAxisEdit,
    handleReviewAxisChange,
    handleReviewAxisRemovalToggle,
    handleMergeSelectedArchetypes,
    handleConfirmDiscardArchetype,
    handleApplyTranscriptExtractionResults,
  };
}
