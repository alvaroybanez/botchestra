import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { FilterBar, FilterSearch, FilterSelect } from "@/components/filter-bar";
import { PageHeader } from "@/components/page-header";
import { SummaryValue } from "@/components/summary-value";
import { formatTimestamp } from "@/routes/study-shared";

type TranscriptDoc = Doc<"transcripts">;
type TranscriptId = Id<"transcripts">;

type ViewerAccess = {
  role: "researcher" | "reviewer" | "admin";
  permissions: {
    canManagePersonaConfigs: boolean;
  };
} | null;

const supportedTranscriptExtensions = new Set(["txt", "json"]);

export function TranscriptsPage() {
  const transcriptsQuery = useQuery((api as any).transcripts.listTranscripts, {}) as
    | TranscriptDoc[]
    | undefined;
  const viewerAccess = useQuery((api as any).rbac.getViewerAccess, {}) as
    | ViewerAccess
    | undefined;
  const uploadTranscript = useMutation((api as any).transcripts.uploadTranscript);

  const [transcripts, setTranscripts] = useState<TranscriptDoc[]>([]);
  const [searchText, setSearchText] = useState("");
  const [selectedTag, setSelectedTag] = useState("");
  const [selectedFormat, setSelectedFormat] = useState<"" | "txt" | "json">("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (transcriptsQuery !== undefined) {
      setTranscripts(transcriptsQuery);
    }
  }, [transcriptsQuery]);

  const canManageTranscripts =
    viewerAccess?.permissions.canManagePersonaConfigs === true;
  const isLoading = transcriptsQuery === undefined || viewerAccess === undefined;

  const tagOptions = useMemo(
    () =>
      Array.from(
        new Set(transcripts.flatMap((transcript) => transcript.metadata.tags)),
      ).sort((left, right) => left.localeCompare(right)),
    [transcripts],
  );

  const filteredTranscripts = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return transcripts.filter((transcript) => {
      const matchesTag =
        selectedTag.length === 0 || transcript.metadata.tags.includes(selectedTag);
      const matchesFormat =
        selectedFormat.length === 0 || transcript.format === selectedFormat;
      const matchesSearch =
        normalizedSearch.length === 0
        || [
          transcript.originalFilename,
          transcript.metadata.participantId ?? "",
          transcript.metadata.tags.join(" "),
          transcript.metadata.notes ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return matchesTag && matchesFormat && matchesSearch;
    });
  }, [searchText, selectedFormat, selectedTag, transcripts]);

  const filterSummary = useMemo(
    () =>
      formatTranscriptFilterSummary({
        filteredCount: filteredTranscripts.length,
        searchText,
        selectedFormat,
        selectedTag,
        totalCount: transcripts.length,
      }),
    [filteredTranscripts.length, searchText, selectedFormat, selectedTag, transcripts.length],
  );

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);

    if (files.length === 0 || !canManageTranscripts) {
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadNotice(null);
    setIsDragActive(false);

    const validFiles: File[] = [];
    const unsupportedFiles: string[] = [];

    for (const file of files) {
      const extension = getTranscriptExtension(file.name);

      if (extension === null || !supportedTranscriptExtensions.has(extension)) {
        unsupportedFiles.push(file.name);
        continue;
      }

      validFiles.push(file);
    }

    const failedUploads: string[] = [];
    const optimisticTranscripts: TranscriptDoc[] = [];

    for (const file of validFiles) {
      try {
        const uploadUrlResult = await uploadTranscript({
          originalFilename: file.name,
        }) as {
          transcriptId: null;
          uploadUrl: string;
        };
        const uploadResponse = await fetch(uploadUrlResult.uploadUrl, {
          body: file,
          headers: {
            "Content-Type": file.type || inferContentType(file.name),
          },
          method: "POST",
        });

        if (!uploadResponse.ok) {
          throw new Error(`Upload failed with status ${uploadResponse.status}.`);
        }

        const uploadBody = await uploadResponse.json() as { storageId?: string };

        if (typeof uploadBody.storageId !== "string") {
          throw new Error("Upload did not return a storage ID.");
        }

        const created = await uploadTranscript({
          originalFilename: file.name,
          storageId: uploadBody.storageId,
        }) as {
          transcriptId: TranscriptId;
          uploadUrl: null;
        };

        optimisticTranscripts.push(
          buildOptimisticTranscript(created.transcriptId, file.name),
        );
      } catch (error) {
        failedUploads.push(`${file.name}: ${getErrorMessage(error, "Upload failed.")}`);
      }
    }

    if (optimisticTranscripts.length > 0) {
      setTranscripts((current) => [
        ...optimisticTranscripts,
        ...current.filter(
          (transcript) =>
            !optimisticTranscripts.some(
              (optimisticTranscript) => optimisticTranscript._id === transcript._id,
            ),
        ),
      ]);
      setUploadNotice(
        `Uploaded ${optimisticTranscripts.length} transcript${
          optimisticTranscripts.length === 1 ? "" : "s"
        }. Processing will continue in the background.`,
      );
    }

    const errors: string[] = [];

    if (unsupportedFiles.length > 0) {
      errors.push(`Unsupported files were skipped: ${unsupportedFiles.join(", ")}.`);
    }

    if (failedUploads.length > 0) {
      errors.push(`Some uploads failed: ${failedUploads.join(" ")}`);
    }

    if (errors.length > 0) {
      setUploadError(errors.join(" "));
    }

    setIsUploading(false);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  if (isLoading) {
    return (
      <EmptyState
        title="Transcripts"
        description="Loading transcript library..."
      />
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        className="lg:flex-row lg:items-start lg:justify-between"
        eyebrow="Research Library"
        title="Transcripts"
        description="Upload raw interview transcripts, review processing status, and browse reusable research inputs for persona generation."
        actions={
          canManageTranscripts ? (
            <Button
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              type="button"
            >
              {isUploading ? "Uploading..." : "Upload transcripts"}
            </Button>
          ) : null
        }
      />

      {canManageTranscripts ? (
        <Card>
          <CardHeader>
            <CardTitle>Upload transcripts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              ref={fileInputRef}
              id="transcript-upload-input"
              className="hidden"
              accept=".txt,.json"
              multiple
              type="file"
              onChange={(event) => {
                if (event.target.files) {
                  void handleFiles(event.target.files);
                }
              }}
            />

            <label
              id="transcript-upload-zone"
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors",
                isDragActive
                  ? "border-primary bg-primary/5"
                  : "border-border bg-muted/30 hover:bg-muted/50",
              )}
              data-drag-active={isDragActive ? "true" : "false"}
              htmlFor="transcript-upload-input"
              onDragEnter={(event) => {
                event.preventDefault();
                setIsDragActive(true);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                setIsDragActive(false);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDragActive(true);
              }}
              onDrop={(event) => {
                event.preventDefault();
                void handleFiles(event.dataTransfer.files);
              }}
            >
              <div className="space-y-2">
                <p className="text-lg font-semibold">
                  Drag and drop transcript files here
                </p>
                <p className="text-sm text-muted-foreground">
                  Drop multiple <code>.txt</code> or <code>.json</code> files at
                  once, or click to browse.
                </p>
              </div>
            </label>

            {uploadNotice ? (
              <p className="text-sm text-emerald-700" role="status">
                {uploadNotice}
              </p>
            ) : null}
            {uploadError ? (
              <p className="text-sm text-destructive" role="alert">
                {uploadError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {transcripts.length > 0 ? (
        <FilterBar
          title="Browse transcripts"
          columns="lg:grid-cols-[minmax(0,1fr)_220px_220px]"
          footer={
            <p className="text-sm text-muted-foreground">{filterSummary}</p>
          }
        >
          <FilterSearch
            id="transcript-search"
            label="Search"
            placeholder="Search by filename, participant, tags, or notes"
            value={searchText}
            onChange={setSearchText}
          />
          <FilterSelect
            id="transcript-tag-filter"
            label="Tag filter"
            placeholder="All tags"
            value={selectedTag}
            onChange={setSelectedTag}
            options={tagOptions.map((tag) => ({ value: tag, label: tag }))}
          />
          <FilterSelect
            id="transcript-format-filter"
            label="Format filter"
            placeholder="All formats"
            value={selectedFormat}
            onChange={(value) => setSelectedFormat(value as "" | "txt" | "json")}
            options={[
              { value: "txt", label: "txt" },
              { value: "json", label: "json" },
            ]}
          />
        </FilterBar>
      ) : null}

      {transcripts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No transcripts yet</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Upload your first interview transcript to seed persona discovery,
              track processing status, and review structured content.
            </p>
            {canManageTranscripts ? (
              <Button onClick={() => fileInputRef.current?.click()} type="button">
                Upload transcripts
              </Button>
            ) : null}
          </CardContent>
        </Card>
      ) : filteredTranscripts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No transcripts match your filters</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm leading-6 text-muted-foreground">
              Try clearing the current search text or removing one of the active
              filters.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchText("");
                setSelectedTag("");
                setSelectedFormat("");
              }}
            >
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredTranscripts.map((transcript) => (
            <Link
              key={transcript._id}
              params={{ transcriptId: transcript._id }}
              to="/transcripts/$transcriptId"
            >
              <Card className="transition-colors hover:border-primary/60 hover:bg-muted/10">
                <CardContent className="space-y-4 p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <p className="font-medium">{transcript.originalFilename}</p>
                      <p className="text-sm text-muted-foreground">
                        {transcript.metadata.participantId
                          ? `Participant ${transcript.metadata.participantId}`
                          : "No participant ID"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{transcript.format}</Badge>
                      <Badge variant={statusBadgeVariant(transcript.processingStatus)}>
                        {formatTranscriptStatus(transcript.processingStatus)}
                      </Badge>
                    </div>
                  </div>

                  <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SummaryValue
                      label="Characters"
                      value={String(transcript.characterCount)}
                      variant="inline"
                    />
                    <SummaryValue
                      label="Tags"
                      value={
                        transcript.metadata.tags.length > 0
                          ? transcript.metadata.tags.join(", ")
                          : "No tags"
                      }
                      variant="inline"
                    />
                    <SummaryValue
                      label="Created"
                      value={formatTimestamp(transcript.createdAt)}
                      variant="inline"
                    />
                    <SummaryValue
                      label="Updated"
                      value={formatTimestamp(transcript.updatedAt)}
                      variant="inline"
                    />
                  </dl>

                  {transcript.metadata.notes ? (
                    <p className="text-sm leading-6 text-muted-foreground">
                      {transcript.metadata.notes}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function buildOptimisticTranscript(
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

function getTranscriptExtension(filename: string) {
  const lastDot = filename.lastIndexOf(".");

  if (lastDot === -1) {
    return null;
  }

  return filename.slice(lastDot + 1).toLowerCase();
}

function inferContentType(filename: string) {
  return getTranscriptExtension(filename) === "json"
    ? "application/json"
    : "text/plain";
}

function statusBadgeVariant(status: TranscriptDoc["processingStatus"]) {
  switch (status) {
    case "processed":
      return "default" as const;
    case "error":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

function formatTranscriptStatus(status: TranscriptDoc["processingStatus"]) {
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

function formatTranscriptFilterSummary({
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

function getErrorMessage(error: unknown, fallback: string) {
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
