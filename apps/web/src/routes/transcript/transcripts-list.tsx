import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnimatedList } from "@/components/domain/animated-list";
import { EmptyState } from "@/components/domain/empty-state";
import { PageHeader } from "@/components/domain/page-header";
import { SummaryValue } from "@/components/domain/summary-value";
import { cn } from "@/lib/utils";
import type { TranscriptDoc, ViewerAccess } from "./types";
import {
  buildOptimisticTranscript,
  formatTimestamp,
  formatTranscriptFilterSummary,
  formatTranscriptStatus,
  getErrorMessage,
  getTranscriptExtension,
  inferContentType,
  statusBadgeVariant,
  supportedTranscriptExtensions,
  transcriptSelectClassName,
} from "./helpers";

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
          transcriptId: TranscriptDoc["_id"];
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
      <section className="space-y-6">
        <PageHeader
          eyebrow="Research Library"
          title="Transcripts"
          description="Loading transcript library..."
        />
      </section>
    );
  }

  const hasFilters = searchText.trim().length > 0 || selectedTag.length > 0 || selectedFormat.length > 0;

  return (
    <section className="space-y-6">
      <PageHeader
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
          ) : undefined
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
        <Card>
          <CardHeader>
            <CardTitle>Browse transcripts</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px_220px]">
            <div className="grid gap-2">
              <Label htmlFor="transcript-search">Search</Label>
              <Input
                id="transcript-search"
                placeholder="Search by filename, participant, tags, or notes"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="transcript-tag-filter">Tag filter</Label>
              <select
                id="transcript-tag-filter"
                className={transcriptSelectClassName}
                value={selectedTag}
                onChange={(event) => setSelectedTag(event.target.value)}
              >
                <option value="">All tags</option>
                {tagOptions.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="transcript-format-filter">Format filter</Label>
              <select
                id="transcript-format-filter"
                className={transcriptSelectClassName}
                value={selectedFormat}
                onChange={(event) =>
                  setSelectedFormat(event.target.value as "" | "txt" | "json")
                }
              >
                <option value="">All formats</option>
                <option value="txt">txt</option>
                <option value="json">json</option>
              </select>
            </div>

            <p className="lg:col-span-3 text-sm text-muted-foreground">
              {filterSummary}
            </p>
          </CardContent>
        </Card>
      ) : null}

      {transcripts.length === 0 ? (
        <EmptyState
          title="No transcripts yet"
          description="Upload your first interview transcript to seed persona discovery, track processing status, and review structured content."
          action={
            canManageTranscripts ? (
              <Button onClick={() => fileInputRef.current?.click()} type="button">
                Upload transcripts
              </Button>
            ) : undefined
          }
        />
      ) : filteredTranscripts.length === 0 ? (
        <EmptyState
          title="No transcripts match your filters"
          description="Try clearing the current search text or removing one of the active filters."
          action={
            hasFilters ? (
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
            ) : undefined
          }
        />
      ) : (
        <AnimatedList
          items={filteredTranscripts}
          keyExtractor={(transcript) => transcript._id}
          renderItem={(transcript) => (
            <TranscriptListCard transcript={transcript} />
          )}
        />
      )}
    </section>
  );
}

function TranscriptListCard({ transcript }: { transcript: TranscriptDoc }) {
  return (
    <Link
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
              variant="inline"
              value={String(transcript.characterCount)}
            />
            <SummaryValue
              label="Tags"
              variant="inline"
              value={
                transcript.metadata.tags.length > 0
                  ? transcript.metadata.tags.join(", ")
                  : "No tags"
              }
            />
            <SummaryValue
              label="Created"
              variant="inline"
              value={formatTimestamp(transcript.createdAt)}
            />
            <SummaryValue
              label="Updated"
              variant="inline"
              value={formatTimestamp(transcript.updatedAt)}
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
  );
}
