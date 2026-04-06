import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SummaryValue } from "@/components/summary-value";
import {
  type PersonaConfigDoc,
  type SyntheticUserDoc,
  type AxisFormValue,
  type ConfigFormValue,
  type SuggestedAxisState,
  emptyAxis,
  textareaClassName,
  CopyIdRow,
  ExpandChevron,
  LoadingSpinner,
  AxisInput,
  formatTimestamp,
} from "@/routes/persona-config-shared";
import { SuggestedAxisCard } from "@/routes/persona-config-axes-tab";

export type ConfigurationTabContentProps = {
  config: PersonaConfigDoc;
  isDraft: boolean;
  draftForm: ConfigFormValue;
  setDraftForm: (value: ConfigFormValue | ((current: ConfigFormValue) => ConfigFormValue)) => void;
  isSavingDraft: boolean;
  handleSaveDraft: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  canSuggestAxes: boolean;
  isSuggestingAxes: boolean;
  suggestionError: string | null;
  isSuggestionPanelOpen: boolean;
  suggestedAxes: SuggestedAxisState[];
  selectedSuggestionCount: number;
  handleSuggestAxes: () => void;
  handleSuggestionSelectionToggle: (suggestionId: string) => void;
  handleSuggestionEditToggle: (suggestionId: string) => void;
  handleSuggestionAxisChange: (suggestionId: string, nextAxis: AxisFormValue) => void;
  handleDismissSuggestions: () => void;
  handleApplySuggestedAxes: () => void;
  onOpenAxisLibrary: () => void;
  resolvedAxes: PersonaConfigDoc["sharedAxes"];
  expandedAxisIndex: number | null;
  setExpandedAxisIndex: (value: number | null) => void;
  syntheticUserList: SyntheticUserDoc[];
  resolvedStatus: PersonaConfigDoc["status"] | null | undefined;
};

export function ConfigurationTabContent({
  config,
  isDraft,
  draftForm,
  setDraftForm,
  isSavingDraft,
  handleSaveDraft,
  canSuggestAxes,
  isSuggestingAxes,
  suggestionError,
  isSuggestionPanelOpen,
  suggestedAxes,
  selectedSuggestionCount,
  handleSuggestAxes,
  handleSuggestionSelectionToggle,
  handleSuggestionEditToggle,
  handleSuggestionAxisChange,
  handleDismissSuggestions,
  handleApplySuggestedAxes,
  onOpenAxisLibrary,
  resolvedAxes,
  expandedAxisIndex,
  setExpandedAxisIndex,
  syntheticUserList,
  resolvedStatus,
}: ConfigurationTabContentProps) {
  return (
            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
              <div className="space-y-4">
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
                      <SummaryValue label="Name" value={config.name} />
                      <SummaryValue label="Version" value={`v${config.version}`} />
                      <SummaryValue label="Description" value={config.description} />
                      <SummaryValue label="Context" value={config.context} />
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

                  {resolvedAxes.map((axis, index) => {
                    const isOpen = expandedAxisIndex === index;

                    return (
                      <div
                        key={`${axis.key}-${index}`}
                        className="rounded-lg border bg-background"
                      >
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 p-4 text-left"
                          onClick={() =>
                            setExpandedAxisIndex(isOpen ? null : index)
                          }
                        >
                          <ExpandChevron isExpanded={isOpen} />
                          <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                            <p className="font-medium">{axis.label}</p>
                            <p className="text-sm text-muted-foreground">
                              {axis.key} · weight {axis.weight}
                            </p>
                          </div>
                        </button>

                        {isOpen ? (
                          <div className="border-t px-4 pb-4 pt-3">
                            <p className="text-sm leading-6 text-muted-foreground">
                              {axis.description}
                            </p>
                            <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                              <SummaryValue label="Low anchor" value={axis.lowAnchor} />
                              <SummaryValue label="Mid anchor" value={axis.midAnchor} />
                              <SummaryValue label="High anchor" value={axis.highAnchor} />
                            </dl>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
              </div>

              {/* ── Sidebar ── */}
              <div className="space-y-4">
                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-semibold">Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 px-4 pb-4">
                    <SummaryValue label="Status" value={resolvedStatus ?? config.status} />
                    <SummaryValue label="Version" value={`v${config.version}`} />
                    <SummaryValue
                      label="Synthetic users"
                      value={String(syntheticUserList.length)}
                    />
                    <CopyIdRow value={config._id} />
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-4 pb-2">
                    <CardTitle className="text-sm font-semibold">Audit Trail</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-2 px-4 pb-4">
                    <SummaryValue
                      label="Created"
                      value={formatTimestamp(config.createdAt)}
                    />
                    <SummaryValue
                      label="Last updated"
                      value={formatTimestamp(config.updatedAt)}
                    />
                  </CardContent>
                </Card>
              </div>
            </div>
  );
}

export function ConfigFormCard({
  form,
  formPrefix,
  submitLabel,
  title,
  description,
  error,
  disabled,
  onSubmit,
  onChange,
  axisGenerationSlot,
}: {
  form: ConfigFormValue;
  formPrefix: string;
  submitLabel: string;
  title: string | null;
  description: string | null;
  error: string | null;
  disabled: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  onChange: (value: ConfigFormValue) => void;
  axisGenerationSlot?: React.ReactNode;
}) {
  return (
    <form className="space-y-6" onSubmit={onSubmit}>
      {title ? (
        <div className="space-y-1">
          <h3 className="font-heading text-xl tracking-tight">{title}</h3>
          {description ? (
            <p className="text-sm leading-6 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor={`${formPrefix}-name`}>Persona configuration name</Label>
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
              Capture the common dimensions that every persona in this persona configuration
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

        {axisGenerationSlot ?? null}

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

export function AxisEditorCard({
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
  const hasContent = axis.key.trim().length > 0 || axis.label.trim().length > 0;
  const [isExpanded, setIsExpanded] = useState(!hasContent);

  return (
    <div className="rounded-xl border bg-background">
      <div className="flex items-center justify-between gap-3 p-4">
        <button
          type="button"
          className="flex flex-1 items-center gap-3 text-left"
          onClick={() => setIsExpanded((prev) => !prev)}
        >
          <ExpandChevron isExpanded={isExpanded} />
          <div>
            <p className="font-medium">
              {hasContent
                ? (axis.label || axis.key || `Axis ${index + 1}`)
                : `Axis ${index + 1}`}
            </p>
            {hasContent ? (
              <p className="text-sm text-muted-foreground">
                {axis.key || "no key"} · weight {axis.weight}
              </p>
            ) : null}
          </div>
        </button>
        {canRemove ? (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            Remove
          </Button>
        ) : null}
      </div>

      {isExpanded ? (
        <div className="border-t p-4">
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
      ) : null}
    </div>
  );
}
