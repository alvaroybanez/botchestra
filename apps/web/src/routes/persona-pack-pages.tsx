import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import {
  PersonaVariantReviewGrid,
  type VariantReviewData,
} from "@/components/persona-variant-review-grid";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyStudyDetailSearch } from "@/routes/study-shared";

type PersonaPackDoc = Doc<"personaPacks">;
type ProtoPersonaDoc = Doc<"protoPersonas">;
type AxisDefinition = Doc<"axisDefinitions">;
type PersonaPackId = Id<"personaPacks">;

type AxisFormValue = {
  key: string;
  label: string;
  description: string;
  lowAnchor: string;
  midAnchor: string;
  highAnchor: string;
  weight: string;
};

type PackFormValue = {
  name: string;
  description: string;
  context: string;
  sharedAxes: AxisFormValue[];
};

type SuggestedAxisState = {
  id: string;
  axis: AxisFormValue;
  isEditing: boolean;
  isSelected: boolean;
};

type InlineToastState = {
  message: string;
  tone: "error" | "success";
};

const axisKeyPattern = /^[a-z0-9_]+$/;

type ProtoPersonaFormValue = {
  name: string;
  summary: string;
  evidenceText: string;
  notes: string;
};

type ConfirmationState =
  | {
      kind: "publish";
      title: string;
      description: string;
      confirmLabel: string;
    }
  | {
      kind: "archive";
      title: string;
      description: string;
      confirmLabel: string;
    };

type PackVariantReviewData = VariantReviewData & {
  selectedStudy: VariantReviewData["study"];
  studies: Array<
    NonNullable<VariantReviewData["study"]> & {
      acceptedVariantCount: number;
    }
  >;
};

const emptyAxis = (): AxisFormValue => ({
  key: "",
  label: "",
  description: "",
  lowAnchor: "",
  midAnchor: "",
  highAnchor: "",
  weight: "1",
});

const emptyPackForm = (): PackFormValue => ({
  name: "",
  description: "",
  context: "",
  sharedAxes: [emptyAxis()],
});

const emptyProtoPersonaForm = (): ProtoPersonaFormValue => ({
  name: "",
  summary: "",
  evidenceText: "",
  notes: "",
});

export function PersonaPacksPage() {
  const packs = useQuery(api.personaPacks.list, {});
  const createDraft = useMutation(api.personaPacks.createDraft);
  const importJson = useAction(api.personaPacks.importJson);
  const navigate = useNavigate({ from: "/persona-packs" });
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importJsonText, setImportJsonText] = useState("");
  const [form, setForm] = useState<PackFormValue>(emptyPackForm);

  const packList: PersonaPackDoc[] = packs ?? [];
  const activePackList = packList.filter((pack) => pack.status !== "archived");
  const archivedPackList = packList.filter((pack) => pack.status === "archived");

  async function handleCreatePack(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setIsCreating(true);

    try {
      const packId = await createDraft({
        pack: {
          name: form.name,
          description: form.description,
          context: form.context,
          sharedAxes: form.sharedAxes.map(axisFormToPayload),
        },
      });

      setForm(emptyPackForm());
      setIsCreateFormOpen(false);
      await navigate({
        params: { packId },
        to: "/persona-packs/$packId",
      });
    } catch (error) {
      setCreateError(getErrorMessage(error, "Could not create persona pack."));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleImportPack(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportError(null);
    setIsImporting(true);

    try {
      const packId = await importJson({ json: importJsonText });
      setImportJsonText("");
      setIsImportDialogOpen(false);
      await navigate({
        params: { packId },
        to: "/persona-packs/$packId",
      });
    } catch (error) {
      setImportError(getErrorMessage(error, "Could not import persona pack."));
    } finally {
      setIsImporting(false);
    }
  }

  if (packs === undefined) {
    return <LoadingCard body="Loading persona packs..." title="Persona Packs" />;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Persona Library
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">Persona Packs</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Create, review, and publish reusable persona packs for study setup.
            Draft packs stay editable until you publish them.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setImportError(null);
              setIsImportDialogOpen(true);
            }}
          >
            Import Pack
          </Button>
          <Button onClick={() => setIsCreateFormOpen((current) => !current)}>
            {isCreateFormOpen ? "Close form" : "Create Pack"}
          </Button>
        </div>
      </div>

      {isCreateFormOpen ? (
        <PackFormCard
          form={form}
          formPrefix="create-pack"
          submitLabel={isCreating ? "Creating..." : "Save and open pack"}
          title="Create a persona pack"
          description="Start with pack metadata and at least one shared axis."
          error={createError}
          disabled={isCreating}
          onSubmit={handleCreatePack}
          onChange={setForm}
        />
      ) : null}

      {packList.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No persona packs yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Your persona library is empty. Create your first pack to define
              shared behavioral axes and draft proto-personas for future studies.
            </p>
            <Button onClick={() => setIsCreateFormOpen(true)}>
              Create your first pack
            </Button>
          </CardContent>
        </Card>
      ) : activePackList.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No active persona packs</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              All of your persona packs are archived. Expand the archived section
              below to review them or create a new pack for active work.
            </p>
          </CardContent>
        </Card>
      ) : (
        <PackGrid packs={activePackList} />
      )}

      {archivedPackList.length > 0 ? (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold">
            Archived packs ({archivedPackList.length})
          </summary>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Archived packs stay out of the main library grid but remain available
            for audit trails, exports, and reference.
          </p>
          <div className="mt-4">
            <PackGrid packs={archivedPackList} />
          </div>
        </details>
      ) : null}

      <ImportPackDialog
        error={importError}
        isOpen={isImportDialogOpen}
        isSubmitting={isImporting}
        json={importJsonText}
        onCancel={() => setIsImportDialogOpen(false)}
        onChange={setImportJsonText}
        onSubmit={handleImportPack}
      />
    </section>
  );
}

export function PersonaPackDetailPage({ packId }: { packId: string }) {
  const typedPackId = packId as PersonaPackId;
  const pack = useQuery(api.personaPacks.get, { packId: typedPackId });
  const protoPersonas = useQuery(api.personaPacks.listProtoPersonas, {
    packId: typedPackId,
  });
  const axisDefinitions = useQuery((api as any).axisLibrary.listAxisDefinitions, {}) as
    | AxisDefinition[]
    | undefined;
  const [selectedStudyId, setSelectedStudyId] = useState<string | null>(null);
  const packVariantReview = useQuery(
    api.personaVariantReview.getPackVariantReview,
    selectedStudyId === null
      ? { packId: typedPackId }
      : { packId: typedPackId, studyId: selectedStudyId as Id<"studies"> },
  ) as PackVariantReviewData | null | undefined;
  const updateDraft = useMutation(api.personaPacks.updateDraft);
  const createProtoPersona = useMutation(api.personaPacks.createProtoPersona);
  const publishPack = useMutation(api.personaPacks.publish);
  const archivePack = useMutation(api.personaPacks.archive);
  const suggestAxes = useAction((api as any).axisGeneration.suggestAxes);
  const [draftForm, setDraftForm] = useState<PackFormValue>(emptyPackForm);
  const [protoPersonaForm, setProtoPersonaForm] =
    useState<ProtoPersonaFormValue>(emptyProtoPersonaForm);
  const [isProtoFormOpen, setIsProtoFormOpen] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [isSavingProtoPersona, setIsSavingProtoPersona] = useState(false);
  const [isConfirmingAction, setIsConfirmingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [confirmationState, setConfirmationState] =
    useState<ConfirmationState | null>(null);
  const [optimisticStatus, setOptimisticStatus] = useState<
    PersonaPackDoc["status"] | null
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

  useEffect(() => {
    if (!pack) {
      return;
    }

    setDraftForm(packToFormValue(pack));
    setOptimisticStatus(pack.status);
  }, [pack?._id, pack?.updatedAt, pack?.status]);

  useEffect(() => {
    setSuggestedAxes([]);
    setIsSuggestionPanelOpen(false);
    setSuggestionError(null);
    setIsAxisLibraryOpen(false);
    setSelectedLibraryAxisIds([]);
    setInlineToast(null);
  }, [pack?._id]);

  useEffect(() => {
    if (!packVariantReview) {
      return;
    }

    const resolvedStudyId =
      packVariantReview.selectedStudy?._id ?? packVariantReview.study?._id ?? null;

    setSelectedStudyId((current) =>
      current !== null &&
      packVariantReview.studies.some((study) => study._id === current)
        ? current
        : resolvedStudyId,
    );
  }, [packVariantReview]);

  useEffect(() => {
    if (inlineToast === null) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setInlineToast(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [inlineToast]);

  const resolvedStatus = optimisticStatus ?? pack?.status;
  const isDraft = resolvedStatus === "draft";
  const protoPersonaList: ProtoPersonaDoc[] = protoPersonas ?? [];
  const canSuggestAxes =
    draftForm.name.trim().length > 0 && draftForm.context.trim().length > 0;
  const selectedSuggestionCount = suggestedAxes.filter(
    (suggestion) => suggestion.isSelected,
  ).length;
  const axisLibraryList = axisDefinitions ?? [];
  const resolvedAxes: PersonaPackDoc["sharedAxes"] = useMemo(() => {
    if (!pack) {
      return draftForm.sharedAxes.map(axisFormToPayload);
    }

    return isDraft ? draftForm.sharedAxes.map(axisFormToPayload) : pack.sharedAxes;
  }, [draftForm.sharedAxes, isDraft, pack]);
  const publishedStatusHelp =
    isDraft && protoPersonas !== undefined && protoPersonaList.length === 0
      ? "Add at least one proto-persona before publishing this pack."
      : null;
  const selectedStudySummary =
    packVariantReview?.selectedStudy ?? packVariantReview?.study ?? null;

  async function handleSaveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!pack) {
      return;
    }

    setActionError(null);
    setSaveMessage(null);
    setIsSavingDraft(true);

    try {
      await updateDraft({
        packId: pack._id,
        patch: {
          name: draftForm.name,
          description: draftForm.description,
          context: draftForm.context,
          sharedAxes: draftForm.sharedAxes.map(axisFormToPayload),
        },
      });

      setSaveMessage("Draft changes saved.");
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not update persona pack."));
    } finally {
      setIsSavingDraft(false);
    }
  }

  async function handleCreateProtoPersona(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!pack) {
      return;
    }

    setActionError(null);
    setSaveMessage(null);
    setIsSavingProtoPersona(true);

    try {
      await createProtoPersona({
        packId: pack._id,
        protoPersona: {
          name: protoPersonaForm.name,
          summary: protoPersonaForm.summary,
          axes: pack.sharedAxes,
          evidenceSnippets: parseEvidenceSnippets(protoPersonaForm.evidenceText),
          ...(protoPersonaForm.notes.trim()
            ? { notes: protoPersonaForm.notes.trim() }
            : {}),
        },
      });

      setProtoPersonaForm(emptyProtoPersonaForm());
      setIsProtoFormOpen(false);
      setSaveMessage("Proto-persona added.");
    } catch (error) {
      setActionError(
        getErrorMessage(error, "Could not create proto-persona."),
      );
    } finally {
      setIsSavingProtoPersona(false);
    }
  }

  async function handleConfirmAction() {
    if (!pack || !confirmationState) {
      return;
    }

    setActionError(null);
    setSaveMessage(null);
    setIsConfirmingAction(true);

    try {
      if (confirmationState.kind === "publish") {
        await publishPack({ packId: pack._id });
        setOptimisticStatus("published");
        setSaveMessage("Pack published.");
      } else {
        await archivePack({ packId: pack._id });
        setOptimisticStatus("archived");
        setSaveMessage("Pack archived.");
      }

      setConfirmationState(null);
    } catch (error) {
      setActionError(getErrorMessage(error, "Could not update pack status."));
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
      })) as PersonaPackDoc["sharedAxes"];

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

  if (pack === undefined || protoPersonas === undefined) {
    return (
      <LoadingCard
        title="Persona Pack"
        body="Loading pack details and proto-personas..."
      />
    );
  }

  if (pack === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Persona pack not found</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            This pack either does not exist or belongs to another organization.
          </p>
          <Button asChild variant="outline">
            <Link to="/persona-packs">Back to Persona Packs</Link>
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
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold tracking-tight">{pack.name}</h2>
              <StatusBadge status={resolvedStatus ?? pack.status} />
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Review pack metadata, shared axes, and proto-personas before
              publishing. Published packs are frozen and archived packs remain
              read-only.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/persona-packs">Back to list</Link>
            </Button>
            {isDraft ? (
              <Button
                disabled={protoPersonaList.length === 0}
                onClick={() =>
                  setConfirmationState({
                    kind: "publish",
                    title: "Publish persona pack?",
                    description:
                      "Publishing freezes this pack and its proto-personas so studies can rely on a stable definition.",
                    confirmLabel: "Publish pack",
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
                    title: "Archive persona pack?",
                    description:
                      "Archiving hides this pack from active work while preserving its history for audit and reference.",
                    confirmLabel: "Archive pack",
                  })
                }
              >
                Archive
              </Button>
            ) : null}
          </div>
        </div>

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
                  <PackFormCard
                    form={draftForm}
                    formPrefix="edit-pack"
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
                    <SummaryValue label="Name" value={pack.name} />
                    <SummaryValue label="Version" value={`v${pack.version}`} />
                    <SummaryValue label="Description" value={pack.description} />
                    <SummaryValue label="Context" value={pack.context} />
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
                          Generate new axes from pack metadata or import reusable
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
                          Generating axis suggestions from the current pack
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
                      <SummaryValue label="Low anchor" value={axis.lowAnchor} />
                      <SummaryValue label="Mid anchor" value={axis.midAnchor} />
                      <SummaryValue label="High anchor" value={axis.highAnchor} />
                    </dl>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>Proto-Personas</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Review the pack&apos;s source proto-personas and the evidence
                    used to anchor them.
                  </p>
                </div>
                {isDraft ? (
                  <Button
                    variant="outline"
                    onClick={() => setIsProtoFormOpen((current) => !current)}
                  >
                    {isProtoFormOpen ? "Close form" : "Add proto-persona"}
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {isProtoFormOpen ? (
                  <form
                    className="space-y-4 rounded-xl border bg-background p-4"
                    onSubmit={handleCreateProtoPersona}
                  >
                    <div className="grid gap-2">
                      <Label htmlFor="create-proto-name">Name</Label>
                      <Input
                        id="create-proto-name"
                        value={protoPersonaForm.name}
                        onChange={(event) =>
                          setProtoPersonaForm((current) => ({
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
                        value={protoPersonaForm.summary}
                        onChange={(event) =>
                          setProtoPersonaForm((current) => ({
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
                        value={protoPersonaForm.evidenceText}
                        onChange={(event) =>
                          setProtoPersonaForm((current) => ({
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
                        value={protoPersonaForm.notes}
                        onChange={(event) =>
                          setProtoPersonaForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <p className="text-xs leading-5 text-muted-foreground">
                      New proto-personas inherit the current shared axes so you
                      can quickly draft content before publishing.
                    </p>

                    <Button disabled={isSavingProtoPersona} type="submit">
                      {isSavingProtoPersona ? "Saving..." : "Save proto-persona"}
                    </Button>
                  </form>
                ) : null}

                {protoPersonaList.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-background p-6">
                    <p className="text-sm leading-6 text-muted-foreground">
                      No proto-personas yet. Add the first proto-persona to make
                      this draft pack publishable.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {protoPersonaList.map((protoPersona) => (
                      <ProtoPersonaCard
                        key={protoPersona._id}
                        protoPersona={protoPersona}
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
                <CardTitle>Pack Summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <SummaryValue label="Pack ID" value={pack._id} />
                <SummaryValue label="Status" value={resolvedStatus ?? pack.status} />
                <SummaryValue label="Version" value={`v${pack.version}`} />
                <SummaryValue
                  label="Proto-personas"
                  value={String(protoPersonaList.length)}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Audit Trail</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <SummaryValue label="Created by" value={pack.createdBy} />
                <SummaryValue
                  label="Last modified by"
                  value={pack.updatedBy ?? pack.createdBy}
                />
                <SummaryValue
                  label="Created at"
                  value={formatTimestamp(pack.createdAt)}
                />
                <SummaryValue
                  label="Last updated"
                  value={formatTimestamp(pack.updatedAt)}
                />
                <p className="text-xs leading-5 text-muted-foreground">
                  Pack access is scoped to the current authenticated
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
              Review accepted variants generated for studies that use this pack.
              Use the study selector to inspect the latest published-pack cohorts.
            </p>
          </div>

          {packVariantReview === undefined ? (
            <LoadingCard
              title="Variant Review"
              body="Loading linked studies and accepted variants..."
            />
          ) : packVariantReview === null ? (
            <Card>
              <CardHeader>
                <CardTitle>Variant review unavailable</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This pack&apos;s variant review data could not be loaded for the
                  current organization.
                </p>
              </CardContent>
            </Card>
          ) : packVariantReview.studies.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>No studies linked to this pack</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Generate variants from a study that uses this published pack,
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
                        ? `${packVariantReview.variants.length} accepted variants available for review.`
                        : "Choose a linked study to review its accepted variants."}
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:min-w-72">
                    <div className="grid gap-2">
                      <Label htmlFor="pack-variant-study-filter">
                        Linked study
                      </Label>
                      <select
                        className={selectClassName}
                        id="pack-variant-study-filter"
                        value={selectedStudyId ?? ""}
                        onChange={(event) =>
                          setSelectedStudyId(event.target.value || null)
                        }
                      >
                        {packVariantReview.studies.map((study) => (
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
                    <SummaryValue
                      label="Study status"
                      value={selectedStudySummary.status}
                    />
                    <SummaryValue
                      label="Run budget"
                      value={String(selectedStudySummary.runBudget)}
                    />
                    <SummaryValue
                      label="Last updated"
                      value={formatTimestamp(selectedStudySummary.updatedAt)}
                    />
                  </CardContent>
                ) : null}
              </Card>

              <PersonaVariantReviewGrid
                emptyMessage="No accepted variants are available for the selected study yet. Generate variants from the study personas page first."
                reviewData={packVariantReview}
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
    </>
  );
}

function SuggestedAxisCard({
  suggestion,
  index,
  onChange,
  onToggleEdit,
  onToggleSelected,
}: {
  suggestion: SuggestedAxisState;
  index: number;
  onChange: (value: AxisFormValue) => void;
  onToggleEdit: () => void;
  onToggleSelected: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-background p-4 transition-colors",
        suggestion.isSelected
          ? "border-primary/60 ring-1 ring-primary/30"
          : "border-border",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <label
            className="inline-flex cursor-pointer items-start gap-3"
            htmlFor={`suggested-axis-toggle-${suggestion.id}`}
          >
            <input
              checked={suggestion.isSelected}
              className="mt-1 h-4 w-4 rounded border-input"
              id={`suggested-axis-toggle-${suggestion.id}`}
              onChange={onToggleSelected}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onToggleSelected();
                }
              }}
              type="checkbox"
            />
            <div>
              <p className="font-medium">
                {suggestion.axis.label || `Suggestion ${index + 1}`}
              </p>
              <p className="text-sm text-muted-foreground">
                {suggestion.axis.key || "missing_key"} · weight{" "}
                {suggestion.axis.weight || "—"}
              </p>
            </div>
          </label>
          <p className="text-sm leading-6 text-muted-foreground">
            {suggestion.axis.description}
          </p>
        </div>

        <Button type="button" variant="outline" onClick={onToggleEdit}>
          {suggestion.isEditing ? "Hide editor" : "Edit axis"}
        </Button>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <SummaryValue label="Low anchor" value={suggestion.axis.lowAnchor || "—"} />
        <SummaryValue label="Mid anchor" value={suggestion.axis.midAnchor || "—"} />
        <SummaryValue
          label="High anchor"
          value={suggestion.axis.highAnchor || "—"}
        />
      </dl>

      {suggestion.isEditing ? (
        <div
          className="mt-4 rounded-xl border bg-card p-4"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <AxisInput
              id={`suggested-axis-${suggestion.id}-key`}
              label="Key"
              value={suggestion.axis.key}
              onChange={(value) => onChange({ ...suggestion.axis, key: value })}
            />
            <AxisInput
              id={`suggested-axis-${suggestion.id}-label`}
              label="Label"
              value={suggestion.axis.label}
              onChange={(value) => onChange({ ...suggestion.axis, label: value })}
            />
            <AxisInput
              id={`suggested-axis-${suggestion.id}-low`}
              label="Low anchor"
              value={suggestion.axis.lowAnchor}
              onChange={(value) =>
                onChange({ ...suggestion.axis, lowAnchor: value })
              }
            />
            <AxisInput
              id={`suggested-axis-${suggestion.id}-mid`}
              label="Mid anchor"
              value={suggestion.axis.midAnchor}
              onChange={(value) =>
                onChange({ ...suggestion.axis, midAnchor: value })
              }
            />
            <AxisInput
              id={`suggested-axis-${suggestion.id}-high`}
              label="High anchor"
              value={suggestion.axis.highAnchor}
              onChange={(value) =>
                onChange({ ...suggestion.axis, highAnchor: value })
              }
            />
            <div className="grid gap-2">
              <Label htmlFor={`suggested-axis-${suggestion.id}-weight`}>
                Weight
              </Label>
              <Input
                id={`suggested-axis-${suggestion.id}-weight`}
                min="0.01"
                step="0.01"
                type="number"
                value={suggestion.axis.weight}
                onChange={(event) =>
                  onChange({ ...suggestion.axis, weight: event.target.value })
                }
              />
            </div>
          </div>

          <div className="mt-4 grid gap-2">
            <Label htmlFor={`suggested-axis-${suggestion.id}-description`}>
              Description
            </Label>
            <textarea
              id={`suggested-axis-${suggestion.id}-description`}
              className={textareaClassName}
              value={suggestion.axis.description}
              onChange={(event) =>
                onChange({ ...suggestion.axis, description: event.target.value })
              }
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PackFormCard({
  form,
  formPrefix,
  submitLabel,
  title,
  description,
  error,
  disabled,
  onSubmit,
  onChange,
}: {
  form: PackFormValue;
  formPrefix: string;
  submitLabel: string;
  title: string | null;
  description: string | null;
  error: string | null;
  disabled: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  onChange: (value: PackFormValue) => void;
}) {
  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      {title ? (
        <div className="space-y-1">
          <h3 className="text-xl font-semibold tracking-tight">{title}</h3>
          {description ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${formPrefix}-name`}>Pack name</Label>
          <Input
            id={`${formPrefix}-name`}
            value={form.name}
            onChange={(event) =>
              onChange({
                ...form,
                name: event.target.value,
              })
            }
            required
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor={`${formPrefix}-context`}>Context</Label>
          <Input
            id={`${formPrefix}-context`}
            value={form.context}
            onChange={(event) =>
              onChange({
                ...form,
                context: event.target.value,
              })
            }
            required
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${formPrefix}-description`}>Description</Label>
        <textarea
          id={`${formPrefix}-description`}
          className={textareaClassName}
          value={form.description}
          onChange={(event) =>
            onChange({
              ...form,
              description: event.target.value,
            })
          }
          required
        />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Shared axes</h3>
            <p className="text-sm text-muted-foreground">
              Capture the common dimensions that every persona in this pack
              should share.
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={() =>
              onChange({
                ...form,
                sharedAxes: [...form.sharedAxes, emptyAxis()],
              })
            }
          >
            Add axis
          </Button>
        </div>

        <div className="grid gap-4">
          {form.sharedAxes.map((axis, index) => (
            <AxisEditorCard
              key={`${formPrefix}-axis-${index}`}
              axis={axis}
              canRemove={form.sharedAxes.length > 1}
              formPrefix={formPrefix}
              index={index}
              onChange={(nextAxis) =>
                onChange({
                  ...form,
                  sharedAxes: form.sharedAxes.map((item, itemIndex) =>
                    itemIndex === index ? nextAxis : item,
                  ),
                })
              }
              onRemove={() =>
                onChange({
                  ...form,
                  sharedAxes: form.sharedAxes.filter(
                    (_axis, axisIndex) => axisIndex !== index,
                  ),
                })
              }
            />
          ))}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Button disabled={disabled} type="submit">
        {submitLabel}
      </Button>
    </form>
  );
}

function AxisEditorCard({
  axis,
  canRemove,
  formPrefix,
  index,
  onChange,
  onRemove,
}: {
  axis: AxisFormValue;
  canRemove: boolean;
  formPrefix: string;
  index: number;
  onChange: (value: AxisFormValue) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h4 className="font-medium">Axis {index + 1}</h4>
        {canRemove ? (
          <Button type="button" variant="ghost" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <AxisInput
          id={`${formPrefix}-axis-${index}-key`}
          label="Key"
          value={axis.key}
          onChange={(value) => onChange({ ...axis, key: value })}
        />
        <AxisInput
          id={`${formPrefix}-axis-${index}-label`}
          label="Label"
          value={axis.label}
          onChange={(value) => onChange({ ...axis, label: value })}
        />
        <AxisInput
          id={`${formPrefix}-axis-${index}-low`}
          label="Low anchor"
          value={axis.lowAnchor}
          onChange={(value) => onChange({ ...axis, lowAnchor: value })}
        />
        <AxisInput
          id={`${formPrefix}-axis-${index}-mid`}
          label="Mid anchor"
          value={axis.midAnchor}
          onChange={(value) => onChange({ ...axis, midAnchor: value })}
        />
        <AxisInput
          id={`${formPrefix}-axis-${index}-high`}
          label="High anchor"
          value={axis.highAnchor}
          onChange={(value) => onChange({ ...axis, highAnchor: value })}
        />
        <div className="grid gap-2">
          <Label htmlFor={`${formPrefix}-axis-${index}-weight`}>Weight</Label>
          <Input
            id={`${formPrefix}-axis-${index}-weight`}
            type="number"
            min="0.01"
            step="0.01"
            value={axis.weight}
            onChange={(event) =>
              onChange({ ...axis, weight: event.target.value })
            }
            required
          />
        </div>
      </div>

      <div className="mt-4 grid gap-2">
        <Label htmlFor={`${formPrefix}-axis-${index}-description`}>
          Description
        </Label>
        <textarea
          id={`${formPrefix}-axis-${index}-description`}
          className={textareaClassName}
          value={axis.description}
          onChange={(event) =>
            onChange({ ...axis, description: event.target.value })
          }
          required
        />
      </div>
    </div>
  );
}

function AxisInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
    </div>
  );
}

function ProtoPersonaCard({ protoPersona }: { protoPersona: ProtoPersonaDoc }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h4 className="text-lg font-semibold">{protoPersona.name}</h4>
          <p className="text-sm text-muted-foreground">Source: {protoPersona.sourceType}</p>
        </div>
        <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
          {protoPersona.axes.length} axes
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        {protoPersona.summary}
      </p>

      {protoPersona.evidenceSnippets.length > 0 ? (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Evidence snippets</p>
          <ul className="space-y-2">
            {protoPersona.evidenceSnippets.map((snippet, index) => (
              <li
                key={`${protoPersona._id}-${index}`}
                className="rounded-md border bg-card px-3 py-2 text-sm text-muted-foreground"
              >
                {snippet}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {protoPersona.notes ? (
        <div className="mt-4">
          <p className="text-sm font-medium">Notes</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {protoPersona.notes}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function ImportPackDialog({
  isOpen,
  isSubmitting,
  json,
  error,
  onChange,
  onCancel,
  onSubmit,
}: {
  isOpen: boolean;
  isSubmitting: boolean;
  json: string;
  error: string | null;
  onChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form
        aria-modal="true"
        className="w-full max-w-2xl space-y-4 rounded-xl border bg-background p-6 shadow-xl"
        role="dialog"
        onSubmit={onSubmit}
      >
        <div className="space-y-2">
          <h3 className="text-xl font-semibold">Import persona pack JSON</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            Paste a valid exported persona pack JSON payload to create a new
            draft pack and review its imported proto-personas.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="import-pack-json">Pack JSON</Label>
          <textarea
            id="import-pack-json"
            className={`${textareaClassName} min-h-64 font-mono`}
            placeholder='{"name":"Imported Pack","description":"..."}'
            required
            value={json}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={isSubmitting} type="submit">
            {isSubmitting ? "Importing..." : "Import pack"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function ConfirmationDialog({
  title,
  description,
  confirmLabel,
  isOpen,
  isSubmitting,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  isOpen: boolean;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        aria-modal="true"
        className="w-full max-w-md rounded-xl border bg-background p-6 shadow-xl"
        role="dialog"
      >
        <div className="space-y-3">
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            {description}
          </p>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={isSubmitting} onClick={onConfirm}>
            {isSubmitting ? "Working..." : confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AxisLibraryImportDialog({
  axisDefinitions,
  existingAxisKeys,
  isLoading,
  isOpen,
  selectedAxisIds,
  onCancel,
  onConfirm,
  onToggleSelected,
}: {
  axisDefinitions: AxisDefinition[];
  existingAxisKeys: Set<string>;
  isLoading: boolean;
  isOpen: boolean;
  selectedAxisIds: string[];
  onCancel: () => void;
  onConfirm: () => void;
  onToggleSelected: (axisDefinitionId: string) => void;
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
          <h3 className="text-xl font-semibold">Browse axis library</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            Import one or more reusable axes from your organization&apos;s shared
            library.
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading axis library...
          </p>
        ) : axisDefinitions.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-card p-6">
            <p className="text-sm leading-6 text-muted-foreground">
              No axis definitions are available in the library yet.
            </p>
          </div>
        ) : (
          <div className="max-h-[26rem] overflow-y-auto rounded-xl border">
            <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 border-b bg-muted/40 px-4 py-3 text-sm font-medium">
              <span>Select</span>
              <span>Key</span>
              <span>Label &amp; description</span>
              <span>Status</span>
            </div>

            <div className="divide-y">
              {axisDefinitions.map((axisDefinition) => {
                const isSelected = selectedAxisIds.includes(
                  String(axisDefinition._id),
                );
                const isDuplicate = existingAxisKeys.has(axisDefinition.key);

                return (
                  <label
                    key={axisDefinition._id}
                    className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)_auto] gap-4 px-4 py-3 text-sm"
                    htmlFor={`axis-library-${axisDefinition._id}`}
                  >
                    <input
                      checked={isSelected}
                      className="mt-1 h-4 w-4 rounded border-input"
                      id={`axis-library-${axisDefinition._id}`}
                      onChange={() =>
                        onToggleSelected(String(axisDefinition._id))
                      }
                      type="checkbox"
                    />
                    <div className="space-y-1">
                      <p className="font-medium">{axisDefinition.key}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="font-medium">{axisDefinition.label}</p>
                      <p className="text-muted-foreground">
                        {axisDefinition.description}
                      </p>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      {isDuplicate ? "Already in pack" : "Ready to import"}
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
            disabled={selectedAxisIds.length === 0 || isLoading}
            type="button"
            onClick={onConfirm}
          >
            Import selected
          </Button>
        </div>
      </div>
    </div>
  );
}

function InlineToast({ toast }: { toast: InlineToastState }) {
  return (
    <div className="fixed right-4 top-4 z-[60] max-w-sm">
      <div
        className={cn(
          "rounded-lg border px-4 py-3 text-sm shadow-lg",
          toast.tone === "error"
            ? "border-destructive/30 bg-destructive text-destructive-foreground"
            : "border-emerald-300 bg-emerald-600 text-white",
        )}
        role="alert"
      >
        {toast.message}
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

function LoadingCard({ title, body }: { title: string; body: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{body}</p>
      </CardContent>
    </Card>
  );
}

function PackGrid({ packs }: { packs: PersonaPackDoc[] }) {
  return (
    <div className="grid gap-4">
      {packs.map((pack) => (
        <Link
          key={pack._id}
          className="block rounded-xl border bg-card p-6 shadow-sm transition-colors hover:border-primary hover:bg-muted/30"
          params={{ packId: pack._id }}
          to="/persona-packs/$packId"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-xl font-semibold tracking-tight">{pack.name}</h3>
                <StatusBadge status={pack.status} />
              </div>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                {pack.description}
              </p>
            </div>

            <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:min-w-72">
              <SummaryValue label="Version" value={`v${pack.version}`} />
              <SummaryValue label="Created" value={formatTimestamp(pack.createdAt)} />
              <SummaryValue label="Updated" value={formatTimestamp(pack.updatedAt)} />
              <SummaryValue label="Axes" value={String(pack.sharedAxes.length)} />
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: PersonaPackDoc["status"] }) {
  return (
    <span
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium uppercase tracking-wide",
        status === "draft"
          ? "bg-amber-100 text-amber-800"
          : status === "published"
            ? "bg-emerald-100 text-emerald-800"
            : "bg-slate-200 text-slate-700",
      )}
    >
      {status}
    </span>
  );
}

function SummaryValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-4">
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
    </div>
  );
}

function packToFormValue(pack: PersonaPackDoc): PackFormValue {
  return {
    name: pack.name,
    description: pack.description,
    context: pack.context,
    sharedAxes: pack.sharedAxes.map(axisToFormValue),
  };
}

function axisToFormValue(
  axis:
    | PersonaPackDoc["sharedAxes"][number]
    | Pick<
        AxisDefinition,
        | "key"
        | "label"
        | "description"
        | "lowAnchor"
        | "midAnchor"
        | "highAnchor"
        | "weight"
      >,
): AxisFormValue {
  return {
    key: axis.key,
    label: axis.label,
    description: axis.description,
    lowAnchor: axis.lowAnchor,
    midAnchor: axis.midAnchor,
    highAnchor: axis.highAnchor,
    weight: String(axis.weight),
  };
}

function axisFormToPayload(axis: AxisFormValue) {
  return {
    key: axis.key,
    label: axis.label,
    description: axis.description,
    lowAnchor: axis.lowAnchor,
    midAnchor: axis.midAnchor,
    highAnchor: axis.highAnchor,
    weight: Number(axis.weight),
  };
}

function parseEvidenceSnippets(evidenceText: string) {
  return evidenceText
    .split("\n")
    .map((snippet) => snippet.trim())
    .filter(Boolean);
}

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "data" in error &&
    typeof error.data === "string"
  ) {
    return error.data;
  }

  return fallback;
}

function getSuggestAxesErrorMessage(error: unknown) {
  const errorMessage = getErrorMessage(error, "");

  if (/pack description is required/i.test(errorMessage)) {
    return "Add a short description before requesting suggestions.";
  }

  return "We couldn't generate axis suggestions right now. Please try again.";
}

function getAxisKeys(axes: AxisFormValue[]) {
  return axes
    .map((axis) => axis.key.trim())
    .filter((axisKey) => axisKey.length > 0);
}

function normalizeAxisFormValue(axis: AxisFormValue): AxisFormValue {
  return {
    key: axis.key.trim(),
    label: axis.label.trim(),
    description: axis.description.trim(),
    lowAnchor: axis.lowAnchor.trim(),
    midAnchor: axis.midAnchor.trim(),
    highAnchor: axis.highAnchor.trim(),
    weight: axis.weight.trim(),
  };
}

function validateSelectedAxes(axes: AxisFormValue[]) {
  if (axes.length === 0) {
    return "Select at least one suggested axis before applying it.";
  }

  const invalidAxis = axes
    .map(normalizeAxisFormValue)
    .find((axis) => {
      if (
        [
          axis.key,
          axis.label,
          axis.description,
          axis.lowAnchor,
          axis.midAnchor,
          axis.highAnchor,
        ].some((value) => value.length === 0)
      ) {
        return true;
      }

      const weight = Number(axis.weight);
      return (
        !axisKeyPattern.test(axis.key) ||
        !Number.isFinite(weight) ||
        weight <= 0
      );
    });

  if (invalidAxis) {
    return "Each selected axis needs a snake_case key, label, description, anchors, and a positive weight before it can be applied.";
  }

  return null;
}

function mergeAxesIntoFormValue(
  existingAxes: AxisFormValue[],
  nextAxes: AxisFormValue[],
) {
  const mergedAxes = [...existingAxes];
  const seenKeys = new Set(getAxisKeys(existingAxes));
  const duplicateKeys = new Set<string>();

  for (const axis of nextAxes.map(normalizeAxisFormValue)) {
    if (seenKeys.has(axis.key)) {
      duplicateKeys.add(axis.key);
      continue;
    }

    seenKeys.add(axis.key);
    mergedAxes.push(axis);
  }

  return {
    addedCount: mergedAxes.length - existingAxes.length,
    duplicateKeys: [...duplicateKeys],
    nextAxes: mergedAxes,
  };
}

function formatDuplicateAxisToast(duplicateKeys: string[]) {
  if (duplicateKeys.length === 0) {
    return "One or more selected axes could not be added.";
  }

  return `Skipped duplicate axis key${
    duplicateKeys.length === 1 ? "" : "s"
  }: ${duplicateKeys.join(", ")}.`;
}

const textareaClassName =
  "min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
