import type { TranscriptDoc, TranscriptMetadataFormState, TranscriptId } from "./types";
import type { Id } from "../../../../../convex/_generated/dataModel";

export const supportedTranscriptExtensions = new Set(["txt", "json"]);

export const transcriptSelectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export const emptyTranscriptMetadataForm = (): TranscriptMetadataFormState => ({
  participantId: "",
  tags: "",
  notes: "",
});

export function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

export function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
}

export function getTranscriptExtension(filename: string) {
  const lastDot = filename.lastIndexOf(".");

  if (lastDot === -1) {
    return null;
  }

  return filename.slice(lastDot + 1).toLowerCase();
}

export function inferContentType(filename: string) {
  return getTranscriptExtension(filename) === "json"
    ? "application/json"
    : "text/plain";
}

export function statusBadgeVariant(status: TranscriptDoc["processingStatus"]) {
  switch (status) {
    case "processed":
      return "default" as const;
    case "error":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

export function formatTranscriptStatus(status: TranscriptDoc["processingStatus"]) {
  switch (status) {
    case "pending":
      return "Pending";
    case "processing":
      return "Processing";
    case "processed":
      return "Processed";
    case "error":
      return "Error";
    default:
      return status;
  }
}

export function formatTranscriptFilterSummary({
  filteredCount,
  searchText,
  selectedFormat,
  selectedTag,
  totalCount,
}: {
  filteredCount: number;
  searchText: string;
  selectedFormat: "" | "txt" | "json";
  selectedTag: string;
  totalCount: number;
}) {
  const filters: string[] = [];
  const normalizedSearchText = searchText.trim();

  if (selectedTag.length > 0) {
    filters.push(`tag \u201c${selectedTag}\u201d`);
  }

  if (selectedFormat.length > 0) {
    filters.push(`format \u201c${selectedFormat}\u201d`);
  }

  if (normalizedSearchText.length > 0) {
    filters.push(`search \u201c${normalizedSearchText}\u201d`);
  }

  if (filters.length === 0) {
    return `Showing all ${totalCount} transcript${totalCount === 1 ? "" : "s"}.`;
  }

  const formattedFilters =
    filters.length === 1
      ? filters[0]
      : `${filters.slice(0, -1).join(", ")}, and ${filters.at(-1)}`;

  return `Showing ${filteredCount} of ${totalCount} transcript${
    totalCount === 1 ? "" : "s"
  } matching ${formattedFilters}.`;
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    const convexErrorMessage = error.message.match(/ConvexError:\s*([^\n]+)/i)?.[1];

    if (convexErrorMessage) {
      return convexErrorMessage.trim();
    }

    return error.message.trim();
  }

  if (
    typeof error === "object"
    && error !== null
    && "data" in error
    && typeof error.data === "string"
    && error.data.trim().length > 0
  ) {
    return error.data.trim();
  }

  return fallback;
}

export function highlightText(text: string, highlightSnippet: string) {
  const escapedSnippet = highlightSnippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const highlightPattern = new RegExp(escapedSnippet, "gi");
  const matches = [...text.matchAll(highlightPattern)];

  if (matches.length === 0) {
    return [{ text, isMatch: false }];
  }

  const segments: Array<{ text: string; isMatch: boolean }> = [];
  let currentIndex = 0;

  for (const match of matches) {
    const matchIndex = match.index ?? -1;

    if (matchIndex < currentIndex) {
      continue;
    }

    if (matchIndex > currentIndex) {
      segments.push({
        text: text.slice(currentIndex, matchIndex),
        isMatch: false,
      });
    }

    segments.push({
      text: match[0],
      isMatch: true,
    });
    currentIndex = matchIndex + match[0].length;
  }

  if (currentIndex < text.length) {
    segments.push({
      text: text.slice(currentIndex),
      isMatch: false,
    });
  }

  return segments;
}

export function buildOptimisticTranscript(
  transcriptId: TranscriptId,
  originalFilename: string,
): TranscriptDoc {
  const now = Date.now();

  return {
    _creationTime: now,
    _id: transcriptId,
    storageId: `pending-${originalFilename}` as Id<"_storage">,
    originalFilename,
    format: getTranscriptExtension(originalFilename) === "json" ? "json" : "txt",
    metadata: {
      tags: [],
    },
    processingStatus: "pending",
    processingError: undefined,
    characterCount: 0,
    orgId: "",
    createdBy: "",
    createdAt: now,
    updatedAt: now,
  };
}
