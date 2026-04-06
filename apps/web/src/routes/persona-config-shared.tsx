import { useState } from "react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import type { VariantReviewData } from "@/components/persona-variant-review-grid";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Re-export formatTimestamp from study-shared so consumers only need one import
export { formatTimestamp } from "@/routes/study-shared";

// ---------------------------------------------------------------------------
// Type aliases
// ---------------------------------------------------------------------------

export type PersonaConfigDoc = Doc<"personaConfigs">;
export type SyntheticUserDoc = Doc<"syntheticUsers">;
export type AxisDefinition = Doc<"axisDefinitions">;
export type PersonaConfigId = Id<"personaConfigs">;
export type TranscriptDoc = Doc<"transcripts">;
export type TranscriptId = Id<"transcripts">;
export type TranscriptSignalDoc = Doc<"transcriptSignals">;

export type ConfigTranscriptAttachment = {
  _id: Id<"configTranscripts">;
  configId: PersonaConfigId;
  transcriptId: TranscriptId;
  createdAt: number;
  transcript: TranscriptDoc;
};

export type ViewerAccess = {
  role: "researcher" | "reviewer" | "admin";
  permissions: {
    canManagePersonaConfigs: boolean;
  };
} | null;

export type AxisFormValue = {
  key: string;
  label: string;
  description: string;
  lowAnchor: string;
  midAnchor: string;
  highAnchor: string;
  weight: string;
};

export type ConfigFormValue = {
  name: string;
  description: string;
  context: string;
  sharedAxes: AxisFormValue[];
};

export type SuggestedAxisState = {
  id: string;
  axis: AxisFormValue;
  isEditing: boolean;
  isSelected: boolean;
};

export type InlineToastState = {
  message: string;
  tone: "error" | "success";
};

export type ExtractionMode = "auto_discover" | "guided";

export type TranscriptEvidenceSnippet = {
  transcriptId: TranscriptId;
  quote: string;
  startChar: number;
  endChar: number;
};

export type ExtractionArchetypeState = {
  id: string;
  name: string;
  summary: string;
  axisValues: Array<{ key: string; value: number }>;
  evidenceSnippets: TranscriptEvidenceSnippet[];
  contributingTranscriptIds: TranscriptId[];
  isSelected: boolean;
  isEditing: boolean;
};

export type ExtractionReviewAxisState = {
  id: string;
  axis: AxisFormValue;
  isEditing: boolean;
  isRemoved: boolean;
};

export type ExtractionStatus = {
  configId: PersonaConfigId;
  mode: ExtractionMode;
  status: "processing" | "completed" | "completed_with_failures" | "failed";
  guidedAxes: PersonaConfigDoc["sharedAxes"];
  proposedAxes: PersonaConfigDoc["sharedAxes"];
  archetypes: Array<{
    name: string;
    summary: string;
    axisValues: Array<{ key: string; value: number }>;
    evidenceSnippets: TranscriptEvidenceSnippet[];
    contributingTranscriptIds: TranscriptId[];
  }>;
  totalTranscripts: number;
  processedTranscriptCount: number;
  currentTranscriptId: TranscriptId | null;
  succeededTranscriptIds: TranscriptId[];
  failedTranscripts: Array<{
    transcriptId: TranscriptId;
    error: string;
  }>;
  errorMessage: string | null;
  startedBy: string;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
  transcriptSignals: TranscriptSignalDoc[];
};

export type SyntheticUserFormValue = {
  name: string;
  summary: string;
  evidenceText: string;
  notes: string;
};

export type ConfirmationState =
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

export type ConfigVariantReviewData = VariantReviewData & {
  selectedStudy: VariantReviewData["study"];
  studies: Array<
    NonNullable<VariantReviewData["study"]> & {
      acceptedVariantCount: number;
    }
  >;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const axisKeyPattern = /^[a-z0-9_]+$/;

export const textareaClassName =
  "min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

// ---------------------------------------------------------------------------
// Factory functions
// ---------------------------------------------------------------------------

export const emptyAxis = (): AxisFormValue => ({
  key: "",
  label: "",
  description: "",
  lowAnchor: "",
  midAnchor: "",
  highAnchor: "",
  weight: "1",
});

export const emptyConfigForm = (): ConfigFormValue => ({
  name: "",
  description: "",
  context: "",
  sharedAxes: [emptyAxis()],
});

export const emptySyntheticUserForm = (): SyntheticUserFormValue => ({
  name: "",
  summary: "",
  evidenceText: "",
  notes: "",
});

// ---------------------------------------------------------------------------
// Conversion / transform helpers
// ---------------------------------------------------------------------------

export function normalizeAxisKey(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

export function axisToFormValue(
  axis:
    | PersonaConfigDoc["sharedAxes"][number]
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

export function configToFormValue(config: PersonaConfigDoc): ConfigFormValue {
  return {
    name: config.name,
    description: config.description,
    context: config.context,
    sharedAxes: config.sharedAxes.map(axisToFormValue),
  };
}

export function axisFormToPayload(axis: AxisFormValue) {
  return {
    key: normalizeAxisKey(axis.key),
    label: axis.label,
    description: axis.description,
    lowAnchor: axis.lowAnchor,
    midAnchor: axis.midAnchor,
    highAnchor: axis.highAnchor,
    weight: Number(axis.weight),
  };
}

export function parseEvidenceSnippets(evidenceText: string) {
  return evidenceText
    .split("\n")
    .map((snippet) => snippet.trim())
    .filter(Boolean);
}

export function getErrorMessage(error: unknown, fallback: string) {
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

export function getSuggestAxesErrorMessage(error: unknown) {
  const errorMessage = getErrorMessage(error, "");

  if (/config description is required/i.test(errorMessage)) {
    return "Add a short description before requesting suggestions.";
  }

  return "We couldn't generate axis suggestions right now. Please try again.";
}

export function getAxisKeys(axes: AxisFormValue[]) {
  return axes
    .map((axis) => normalizeAxisKey(axis.key))
    .filter((axisKey) => axisKey.length > 0);
}

export function normalizeAxisFormValue(axis: AxisFormValue): AxisFormValue {
  return {
    key: normalizeAxisKey(axis.key),
    label: axis.label.trim(),
    description: axis.description.trim(),
    lowAnchor: axis.lowAnchor.trim(),
    midAnchor: axis.midAnchor.trim(),
    highAnchor: axis.highAnchor.trim(),
    weight: axis.weight.trim(),
  };
}

export function validateAxesForExtraction(
  axes: AxisFormValue[],
  emptyMessage: string,
) {
  if (axes.length === 0) {
    return emptyMessage;
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
    return "Each axis needs a snake_case key, label, description, anchors, and a positive weight.";
  }

  return null;
}

export function validateSelectedAxes(axes: AxisFormValue[]) {
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

export function mergeAxesIntoFormValue(
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

export function formatDuplicateAxisToast(duplicateKeys: string[]) {
  if (duplicateKeys.length === 0) {
    return "One or more selected axes could not be added.";
  }

  return `Skipped duplicate axis key${
    duplicateKeys.length === 1 ? "" : "s"
  }: ${duplicateKeys.join(", ")}.`;
}

export function upsertAxisValue(
  currentAxisValues: Array<{ key: string; value: number }>,
  axisKey: string,
  nextValue: number,
) {
  const normalizedValue = Number.isFinite(nextValue) ? nextValue : 0;
  const hasExistingAxisValue = currentAxisValues.some(
    (axisValue) => axisValue.key === axisKey,
  );

  if (!hasExistingAxisValue) {
    return [
      ...currentAxisValues,
      {
        key: axisKey,
        value: normalizedValue,
      },
    ];
  }

  return currentAxisValues.map((axisValue) =>
    axisValue.key === axisKey
      ? {
          ...axisValue,
          value: normalizedValue,
        }
      : axisValue,
  );
}

export function formatAxisValue(
  axisValues: Array<{ key: string; value: number }>,
  axisKey: string,
) {
  const axisValue = axisValues.find((entry) => entry.key === axisKey)?.value;

  return axisValue === undefined ? "0.00" : axisValue.toFixed(2);
}

export function dedupeEvidenceSnippets(snippets: TranscriptEvidenceSnippet[]) {
  const seen = new Set<string>();

  return snippets.filter((snippet) => {
    const key = `${snippet.transcriptId}:${snippet.quote}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

export function formatTranscriptDerivedNotes(
  axisValues: Array<{ key: string; value: number }>,
) {
  if (axisValues.length === 0) {
    return undefined;
  }

  return `Transcript-derived axis values: ${axisValues
    .map((axisValue) => `${axisValue.key}=${axisValue.value.toFixed(2)}`)
    .join(", ")}`;
}

export function formatTranscriptSignalStatus(
  status: TranscriptSignalDoc["status"] | "failed",
) {
  switch (status) {
    case "processing":
      return "Processing";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

// ---------------------------------------------------------------------------
// Small UI components
// ---------------------------------------------------------------------------

export function InlineToast({ toast }: { toast: InlineToastState }) {
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

export function CopyIdRow({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className="flex items-center gap-2 rounded-lg px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:bg-muted"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      <span className="truncate font-mono">{value.slice(0, 12)}...</span>
      <span className="shrink-0">{copied ? "Copied" : "Copy ID"}</span>
    </button>
  );
}

export function ExpandChevron({ isExpanded }: { isExpanded: boolean }) {
  return (
    <svg
      className={cn(
        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
        isExpanded && "rotate-90",
      )}
      fill="none"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M6 4l4 4-4 4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function LoadingSpinner() {
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}

export function AxisInput({
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
