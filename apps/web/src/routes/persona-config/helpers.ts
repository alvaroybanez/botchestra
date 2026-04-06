import type {
  AxisDefinition,
  AxisFormValue,
  ConfigFormValue,
  PersonaConfigDoc,
  SyntheticUserFormValue,
  TranscriptEvidenceSnippet,
  TranscriptSignalDoc,
} from "./types";

export const axisKeyPattern = /^[a-z0-9_]+$/;

export const textareaClassName =
  "min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export const selectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

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

export function configToFormValue(config: PersonaConfigDoc): ConfigFormValue {
  return {
    name: config.name,
    description: config.description,
    context: config.context,
    sharedAxes: config.sharedAxes.map(axisToFormValue),
  };
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

export function normalizeAxisKey(value: string) {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/_{2,}/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
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

export function getAxisKeys(axes: AxisFormValue[]) {
  return axes
    .map((axis) => normalizeAxisKey(axis.key))
    .filter((axisKey) => axisKey.length > 0);
}

export function validateSelectedAxes(axes: AxisFormValue[]) {
  if (axes.length === 0) {
    return "Select at least one suggested axis before applying it.";
  }

  const invalidAxis = axes.map(normalizeAxisFormValue).find((axis) => {
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
      !axisKeyPattern.test(axis.key) || !Number.isFinite(weight) || weight <= 0
    );
  });

  if (invalidAxis) {
    return "Each selected axis needs a snake_case key, label, description, anchors, and a positive weight before it can be applied.";
  }

  return null;
}

export function validateAxesForExtraction(
  axes: AxisFormValue[],
  emptyMessage: string,
) {
  if (axes.length === 0) {
    return emptyMessage;
  }

  const invalidAxis = axes.map(normalizeAxisFormValue).find((axis) => {
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
      !axisKeyPattern.test(axis.key) || !Number.isFinite(weight) || weight <= 0
    );
  });

  if (invalidAxis) {
    return "Each axis needs a snake_case key, label, description, anchors, and a positive weight.";
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

export function parseEvidenceSnippets(evidenceText: string) {
  return evidenceText
    .split("\n")
    .map((snippet) => snippet.trim())
    .filter(Boolean);
}

export function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
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
