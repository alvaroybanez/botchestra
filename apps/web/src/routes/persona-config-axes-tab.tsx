import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SummaryValue } from "@/components/summary-value";
import {
  type AxisDefinition,
  type AxisFormValue,
  type SuggestedAxisState,
  textareaClassName,
  AxisInput,
} from "@/routes/persona-config-shared";

export function SuggestedAxisCard({
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

export function AxisLibraryImportDialog({
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
                      {isDuplicate ? "Already in persona configuration" : "Ready to import"}
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

export function ConfirmationDialog({
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
