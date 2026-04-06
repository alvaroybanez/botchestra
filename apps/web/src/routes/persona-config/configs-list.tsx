import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Doc } from "../../../../../convex/_generated/dataModel";
import { api } from "../../../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AnimatedList } from "@/components/domain/animated-list";
import { EmptyState } from "@/components/domain/empty-state";
import { PageHeader } from "@/components/domain/page-header";
import { ConfigStatusBadge } from "@/components/domain/status-badge";
import { SummaryValue } from "@/components/domain/summary-value";
import type {
  AxisDefinition,
  AxisFormValue,
  ConfigFormValue,
  InlineToastState,
  PersonaConfigDoc,
  SuggestedAxisState,
} from "./types";
import {
  axisFormToPayload,
  axisToFormValue,
  emptyAxis,
  emptyConfigForm,
  formatDuplicateAxisToast,
  formatTimestamp,
  getAxisKeys,
  getErrorMessage,
  getSuggestAxesErrorMessage,
  mergeAxesIntoFormValue,
  textareaClassName,
  validateSelectedAxes,
} from "./helpers";
import { InlineToast, LoadingCard, LoadingSpinner } from "./shared-ui";
import { AxisLibraryImportDialog, SuggestedAxisCard } from "./axis-components";
import { ConfigFormCard } from "./config-form-card";

export function PersonaConfigsPage() {
  const configs = useQuery(api.personaConfigs.list, {});
  const createDraft = useMutation(api.personaConfigs.createDraft);
  const importJson = useAction(api.personaConfigs.importJson);
  const suggestAxes = useAction((api as any).axisGeneration.suggestAxes);
  const axisDefinitions = useQuery((api as any).axisLibrary.listAxisDefinitions, {}) as
    | AxisDefinition[]
    | undefined;
  const navigate = useNavigate({ from: "/persona-configs" });
  const [isCreateFormOpen, setIsCreateFormOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importJsonText, setImportJsonText] = useState("");
  const [form, setForm] = useState<ConfigFormValue>(emptyConfigForm);
  const [suggestedAxes, setSuggestedAxes] = useState<SuggestedAxisState[]>([]);
  const [isSuggestionPanelOpen, setIsSuggestionPanelOpen] = useState(false);
  const [isSuggestingAxes, setIsSuggestingAxes] = useState(false);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const [isAxisLibraryOpen, setIsAxisLibraryOpen] = useState(false);
  const [selectedLibraryAxisIds, setSelectedLibraryAxisIds] = useState<string[]>([]);
  const [inlineToast, setInlineToast] = useState<InlineToastState | null>(null);

  const configList: PersonaConfigDoc[] = configs ?? [];
  const activeConfigList = configList.filter((config) => config.status !== "archived");
  const archivedConfigList = configList.filter((config) => config.status === "archived");
  const canSuggestCreateAxes =
    form.name.trim().length > 0 && form.context.trim().length > 0;
  const selectedCreateSuggestionCount = suggestedAxes.filter(
    (suggestion) => suggestion.isSelected,
  ).length;
  const axisLibraryList = axisDefinitions ?? [];

  useEffect(() => {
    if (inlineToast === null) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setInlineToast(null);
    }, 4000);

    return () => window.clearTimeout(timeout);
  }, [inlineToast]);

  async function handleSuggestCreateAxes() {
    if (!canSuggestCreateAxes || isSuggestingAxes) {
      return;
    }

    const trimmedDescription = form.description.trim();

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
        name: form.name.trim(),
        context: form.context.trim(),
        description: trimmedDescription,
        existingAxisKeys: getAxisKeys(form.sharedAxes),
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

  function handleCreateSuggestionSelectionToggle(suggestionId: string) {
    setSuggestedAxes((current) =>
      current.map((suggestion) =>
        suggestion.id === suggestionId
          ? { ...suggestion, isSelected: !suggestion.isSelected }
          : suggestion,
      ),
    );
  }

  function handleCreateSuggestionEditToggle(suggestionId: string) {
    setSuggestedAxes((current) =>
      current.map((suggestion) =>
        suggestion.id === suggestionId
          ? { ...suggestion, isEditing: !suggestion.isEditing }
          : suggestion,
      ),
    );
  }

  function handleCreateSuggestionAxisChange(
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

  function handleDismissCreateSuggestions() {
    setIsSuggestionPanelOpen(false);
    setSuggestedAxes([]);
    setSuggestionError(null);
  }

  function handleApplyCreateSuggestedAxes() {
    const selectedSuggestions = suggestedAxes
      .filter((suggestion) => suggestion.isSelected)
      .map((suggestion) => suggestion.axis);
    const validationError = validateSelectedAxes(selectedSuggestions);

    if (validationError !== null) {
      setSuggestionError(validationError);
      return;
    }

    const mergeResult = mergeAxesIntoFormValue(
      form.sharedAxes,
      selectedSuggestions,
    );

    if (mergeResult.addedCount === 0) {
      setInlineToast({
        message: formatDuplicateAxisToast(mergeResult.duplicateKeys),
        tone: "error",
      });
      return;
    }

    setForm((current) => ({
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

  function handleCreateLibrarySelectionToggle(axisDefinitionId: string) {
    setSelectedLibraryAxisIds((current) =>
      current.includes(axisDefinitionId)
        ? current.filter((id) => id !== axisDefinitionId)
        : [...current, axisDefinitionId],
    );
  }

  function handleImportCreateAxisDefinitions() {
    const selectedAxisDefinitions = axisLibraryList
      .filter((axisDefinition) =>
        selectedLibraryAxisIds.includes(String(axisDefinition._id)),
      )
      .map(axisToFormValue);
    const mergeResult = mergeAxesIntoFormValue(
      form.sharedAxes,
      selectedAxisDefinitions,
    );

    if (mergeResult.addedCount === 0) {
      setInlineToast({
        message: formatDuplicateAxisToast(mergeResult.duplicateKeys),
        tone: "error",
      });
      return;
    }

    setForm((current) => ({
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

  async function handleCreatePack(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreateError(null);
    setIsCreating(true);

    try {
      const configId = await createDraft({
        config: {
          name: form.name,
          description: form.description,
          context: form.context,
          sharedAxes: form.sharedAxes.map(axisFormToPayload),
        },
      });

      setForm(emptyConfigForm());
      setIsCreateFormOpen(false);
      await navigate({
        params: { configId },
        to: "/persona-configs/$configId",
      });
    } catch (error) {
      setCreateError(getErrorMessage(error, "Could not create persona configuration."));
    } finally {
      setIsCreating(false);
    }
  }

  async function handleImportPack(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setImportError(null);
    setIsImporting(true);

    try {
      const configId = await importJson({ json: importJsonText });
      setImportJsonText("");
      setIsImportDialogOpen(false);
      await navigate({
        params: { configId },
        to: "/persona-configs/$configId",
      });
    } catch (error) {
      setImportError(getErrorMessage(error, "Could not import persona configuration."));
    } finally {
      setIsImporting(false);
    }
  }

  if (configs === undefined) {
    return <LoadingCard body="Loading persona configurations..." title="Persona Configurations" />;
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Persona Library"
        title="Persona Configurations"
        description="Create, review, and publish reusable persona configurations for study setup. Draft persona configurations stay editable until you publish them."
        actions={
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => {
                setImportError(null);
                setIsImportDialogOpen(true);
              }}
            >
              Import Persona Configuration
            </Button>
            <Button onClick={() => setIsCreateFormOpen((current) => !current)}>
              {isCreateFormOpen ? "Close form" : "Create Persona Configuration"}
            </Button>
          </div>
        }
      />

      {isCreateFormOpen ? (
        <ConfigFormCard
          form={form}
          formPrefix="create-config"
          submitLabel={isCreating ? "Creating..." : "Save and open persona configuration"}
          title="Create a persona configuration"
          description="Start with persona configuration metadata and at least one shared axis."
          error={createError}
          disabled={isCreating}
          onSubmit={handleCreatePack}
          onChange={setForm}
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
                    disabled={!canSuggestCreateAxes || isSuggestingAxes}
                    onClick={() => void handleSuggestCreateAxes()}
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
                          handleCreateSuggestionAxisChange(suggestion.id, nextAxis)
                        }
                        onToggleEdit={() =>
                          handleCreateSuggestionEditToggle(suggestion.id)
                        }
                        onToggleSelected={() =>
                          handleCreateSuggestionSelectionToggle(suggestion.id)
                        }
                      />
                    ))}
                  </div>

                  <div className="flex flex-wrap justify-end gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleDismissCreateSuggestions}
                    >
                      Dismiss
                    </Button>
                    <Button
                      disabled={selectedCreateSuggestionCount === 0}
                      type="button"
                      onClick={handleApplyCreateSuggestedAxes}
                    >
                      Apply selected
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          }
        />
      ) : null}

      {configList.length === 0 ? (
        <EmptyState
          title="No persona configurations yet"
          description="Your persona library is empty. Create your first persona configuration to define shared behavioral axes and draft synthetic users for future studies."
          action={
            <Button onClick={() => setIsCreateFormOpen(true)}>
              Create your first persona configuration
            </Button>
          }
        />
      ) : activeConfigList.length === 0 ? (
        <EmptyState
          title="No active persona configurations"
          description="All of your persona configurations are archived. Expand the archived section below to review them or create a new persona configuration for active work."
        />
      ) : (
        <AnimatedList
          items={activeConfigList}
          keyExtractor={(config: PersonaConfigDoc) => config._id}
          renderItem={(config: PersonaConfigDoc) => (
            <ConfigCard config={config} />
          )}
        />
      )}

      {archivedConfigList.length > 0 ? (
        <details className="rounded-xl border bg-card p-4">
          <summary className="cursor-pointer list-none text-sm font-semibold">
            Archived persona configurations ({archivedConfigList.length})
          </summary>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Archived persona configurations stay out of the main library grid but remain available
            for audit trails, exports, and reference.
          </p>
          <div className="mt-4">
            <AnimatedList
              items={archivedConfigList}
              keyExtractor={(config: PersonaConfigDoc) => config._id}
              renderItem={(config: PersonaConfigDoc) => (
                <ConfigCard config={config} />
              )}
            />
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
      <AxisLibraryImportDialog
        axisDefinitions={axisLibraryList}
        existingAxisKeys={new Set(getAxisKeys(form.sharedAxes))}
        isOpen={isAxisLibraryOpen}
        isLoading={axisDefinitions === undefined}
        selectedAxisIds={selectedLibraryAxisIds}
        onCancel={() => {
          setIsAxisLibraryOpen(false);
          setSelectedLibraryAxisIds([]);
        }}
        onConfirm={handleImportCreateAxisDefinitions}
        onToggleSelected={handleCreateLibrarySelectionToggle}
      />
      {inlineToast ? <InlineToast toast={inlineToast} /> : null}
    </section>
  );
}

function ConfigCard({ config }: { config: PersonaConfigDoc }) {
  return (
    <Link
      className="block rounded-xl border bg-card p-6 shadow-sm transition-colors hover:border-primary hover:bg-muted/30"
      params={{ configId: config._id }}
      to="/persona-configs/$configId"
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-xl font-semibold tracking-tight">{config.name}</h3>
            <ConfigStatusBadge status={config.status} />
          </div>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            {config.description}
          </p>
        </div>

        <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:min-w-72">
          <SummaryValue label="Version" variant="bordered" value={`v${config.version}`} />
          <SummaryValue label="Created" variant="bordered" value={formatTimestamp(config.createdAt)} />
          <SummaryValue label="Updated" variant="bordered" value={formatTimestamp(config.updatedAt)} />
          <SummaryValue label="Axes" variant="bordered" value={String(config.sharedAxes.length)} />
        </div>
      </div>
    </Link>
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
          <h3 className="text-xl font-semibold">Import persona configuration JSON</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            Paste a valid exported persona configuration JSON payload to create a new
            draft persona configuration and review its imported synthetic users.
          </p>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="import-config-json">Persona Configuration JSON</Label>
          <textarea
            id="import-config-json"
            className={`${textareaClassName} min-h-64 font-mono`}
            placeholder='{"name":"Imported Persona Configuration","description":"..."}'
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
            {isSubmitting ? "Importing..." : "Import persona configuration"}
          </Button>
        </div>
      </form>
    </div>
  );
}
