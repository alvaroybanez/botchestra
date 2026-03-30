import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import type { Doc, Id } from "../../../../convex/_generated/dataModel";
import { api } from "../../../../convex/_generated/api";
import { NotFoundPlaceholder } from "@/routes/placeholders";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TranscriptDoc = Doc<"transcripts">;
type PersonaPackDoc = Doc<"personaPacks">;
type TranscriptId = Id<"transcripts">;

type ViewerAccess = {
  role: "researcher" | "reviewer" | "admin";
  permissions: {
    canManagePersonaPacks: boolean;
  };
} | null;

type TranscriptContent =
  | {
      format: "txt";
      text: string;
    }
  | {
      format: "json";
      turns: Array<{
        speaker: string;
        text: string;
        timestamp?: number;
      }>;
    }
  | null;

type TranscriptMetadataFormState = {
  participantId: string;
  tags: string;
  notes: string;
};

const supportedTranscriptExtensions = new Set(["txt", "json"]);
const transcriptSelectClassName =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const emptyTranscriptMetadataForm = (): TranscriptMetadataFormState => ({
  participantId: "",
  tags: "",
  notes: "",
});

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
    viewerAccess?.permissions.canManagePersonaPacks === true;
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
    return <LoadingCard body="Loading transcript library..." title="Transcripts" />;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Research Library
          </p>
          <h2 className="text-3xl font-semibold tracking-tight">Transcripts</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            Upload raw interview transcripts, review processing status, and
            browse reusable research inputs for persona generation.
          </p>
        </div>

        {canManageTranscripts ? (
          <Button
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            {isUploading ? "Uploading..." : "Upload transcripts"}
          </Button>
        ) : null}
      </div>

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
                    />
                    <SummaryValue
                      label="Tags"
                      value={
                        transcript.metadata.tags.length > 0
                          ? transcript.metadata.tags.join(", ")
                          : "No tags"
                      }
                    />
                    <SummaryValue
                      label="Created"
                      value={formatTimestamp(transcript.createdAt)}
                    />
                    <SummaryValue
                      label="Updated"
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
          ))}
        </div>
      )}
    </section>
  );
}

export function TranscriptDetailPage({
  transcriptId,
  highlightSnippet = "",
}: {
  transcriptId: string;
  highlightSnippet?: string;
}) {
  const navigate = useNavigate();
  const normalizedTranscriptId = useQuery((api as any).transcripts.normalizeTranscriptId, {
    transcriptId,
  }) as TranscriptId | null | undefined;
  const transcriptQuery = useQuery(
    (api as any).transcripts.getTranscript,
    normalizedTranscriptId ? { transcriptId: normalizedTranscriptId } : "skip",
  ) as TranscriptDoc | null | undefined;
  const viewerAccess = useQuery((api as any).rbac.getViewerAccess, {}) as
    | ViewerAccess
    | undefined;
  const packs = useQuery(api.personaPacks.list, {}) as PersonaPackDoc[] | undefined;
  const transcriptPacks = useQuery(
    (api as any).packTranscripts.listTranscriptPacks,
    normalizedTranscriptId ? { transcriptId: normalizedTranscriptId } : "skip",
  ) as
    | Array<{
        packId: Id<"personaPacks">;
        pack: PersonaPackDoc;
      }>
    | undefined;
  const getTranscriptContent = useAction((api as any).transcripts.getTranscriptContent);
  const updateTranscriptMetadata = useMutation((api as any).transcripts.updateTranscriptMetadata);
  const deleteTranscript = useMutation((api as any).transcripts.deleteTranscript);
  const attachTranscript = useMutation((api as any).packTranscripts.attachTranscript);
  const detachTranscript = useMutation((api as any).packTranscripts.detachTranscript);

  const [transcript, setTranscript] = useState<TranscriptDoc | null>(null);
  const [content, setContent] = useState<TranscriptContent>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [metadataForm, setMetadataForm] = useState<TranscriptMetadataFormState>(
    emptyTranscriptMetadataForm(),
  );
  const [isAttachDialogOpen, setIsAttachDialogOpen] = useState(false);
  const [packSearchText, setPackSearchText] = useState("");
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);
  const [isSavingMetadata, setIsSavingMetadata] = useState(false);
  const [isAttaching, setIsAttaching] = useState(false);
  const [detachingPackId, setDetachingPackId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const [pageNotice, setPageNotice] = useState<string | null>(null);

  useEffect(() => {
    if (normalizedTranscriptId === null) {
      setTranscript(null);
      return;
    }

    if (transcriptQuery !== undefined) {
      setTranscript(transcriptQuery);
    }
  }, [normalizedTranscriptId, transcriptQuery]);

  useEffect(() => {
    if (transcript === null) {
      setMetadataForm(emptyTranscriptMetadataForm());
      return;
    }

    setMetadataForm({
      participantId: transcript.metadata.participantId ?? "",
      tags: transcript.metadata.tags.join(", "),
      notes: transcript.metadata.notes ?? "",
    });
  }, [transcript?._id, transcript?.updatedAt]);

  useEffect(() => {
    if (transcript === null) {
      setContent(null);
      setContentError(null);
      return;
    }

    const transcriptId = transcript._id;
    let cancelled = false;

    async function loadTranscriptContent() {
      setIsContentLoading(true);
      setContentError(null);

      try {
        const nextContent = await getTranscriptContent({
          transcriptId,
        }) as TranscriptContent;

        if (!cancelled) {
          setContent(nextContent);
        }
      } catch (error) {
        if (!cancelled) {
          setContent(null);
          setContentError(
            getErrorMessage(error, "Could not load transcript content."),
          );
        }
      } finally {
        if (!cancelled) {
          setIsContentLoading(false);
        }
      }
    }

    void loadTranscriptContent();

    return () => {
      cancelled = true;
    };
  }, [getTranscriptContent, transcript?._id]);

  useEffect(() => {
    if (highlightSnippet.trim().length === 0 || isContentLoading) {
      return;
    }

    const timeout = window.setTimeout(() => {
      document
        .querySelector<HTMLElement>("[data-highlighted-snippet='true']")
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 50);

    return () => window.clearTimeout(timeout);
  }, [content, highlightSnippet, isContentLoading]);

  const canManageTranscripts =
    viewerAccess?.permissions.canManagePersonaPacks === true;
  const isLoading =
    normalizedTranscriptId === undefined
    || viewerAccess === undefined
    || packs === undefined
    || (normalizedTranscriptId !== null && transcriptQuery === undefined)
    || (normalizedTranscriptId !== null && transcriptPacks === undefined);
  const attachedPackIds = new Set(
    (transcriptPacks ?? []).map((packTranscript) => String(packTranscript.packId)),
  );
  const attachablePacks = (packs ?? []).filter(
    (pack) =>
      pack.status === "draft" && !attachedPackIds.has(String(pack._id)),
  );
  const filteredAttachablePacks = useMemo(() => {
    const normalizedSearch = packSearchText.trim().toLowerCase();

    if (normalizedSearch.length === 0) {
      return attachablePacks;
    }

    return attachablePacks.filter((pack) =>
      [pack.name, pack.description, pack.context]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch),
    );
  }, [attachablePacks, packSearchText]);

  async function handleSaveMetadata(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (transcript === null) {
      return;
    }

    setIsSavingMetadata(true);
    setPageError(null);
    setPageNotice(null);

    try {
      await updateTranscriptMetadata({
        metadata: {
          ...(metadataForm.participantId.trim().length > 0
            ? { participantId: metadataForm.participantId.trim() }
            : {}),
          tags: parseTags(metadataForm.tags),
          ...(metadataForm.notes.trim().length > 0
            ? { notes: metadataForm.notes.trim() }
            : {}),
        },
        transcriptId: transcript._id,
      });

      setTranscript((current) =>
        current === null
          ? current
          : {
              ...current,
              metadata: {
                ...current.metadata,
                ...(metadataForm.participantId.trim().length > 0
                  ? { participantId: metadataForm.participantId.trim() }
                  : {}),
                ...(metadataForm.participantId.trim().length === 0
                  ? { participantId: undefined }
                  : {}),
                tags: parseTags(metadataForm.tags),
                ...(metadataForm.notes.trim().length > 0
                  ? { notes: metadataForm.notes.trim() }
                  : {}),
                ...(metadataForm.notes.trim().length === 0
                  ? { notes: undefined }
                  : {}),
              },
              updatedAt: Date.now(),
            },
      );
      setPageNotice("Transcript metadata saved.");
    } catch (error) {
      setPageError(getErrorMessage(error, "Could not save transcript metadata."));
    } finally {
      setIsSavingMetadata(false);
    }
  }

  function resetAttachDialog() {
    setIsAttachDialogOpen(false);
    setPackSearchText("");
    setSelectedPackIds([]);
  }

  function handlePackSelectionToggle(packId: string) {
    setSelectedPackIds((current) =>
      current.includes(packId)
        ? current.filter((id) => id !== packId)
        : [...current, packId],
    );
  }

  async function handleAttachToPacks() {
    if (transcript === null || selectedPackIds.length === 0) {
      return;
    }

    const selectedCount = selectedPackIds.length;
    setIsAttaching(true);
    setPageError(null);
    setPageNotice(null);

    try {
      for (const packId of selectedPackIds) {
        await attachTranscript({
          packId: packId as Id<"personaPacks">,
          transcriptId: transcript._id,
        });
      }

      resetAttachDialog();
      setPageNotice(
        selectedCount === 1
          ? "Transcript attached to 1 draft pack."
          : `Transcript attached to ${selectedCount} draft packs.`,
      );
    } catch (error) {
      setPageError(getErrorMessage(error, "Could not attach transcript to pack."));
    } finally {
      setIsAttaching(false);
    }
  }

  async function handleDetachFromPack(packId: Id<"personaPacks">) {
    if (transcript === null) {
      return;
    }

    setDetachingPackId(String(packId));
    setPageError(null);
    setPageNotice(null);

    try {
      await detachTranscript({
        packId,
        transcriptId: transcript._id,
      });
      setPageNotice("Transcript detached from pack.");
    } catch (error) {
      setPageError(getErrorMessage(error, "Could not detach transcript from pack."));
    } finally {
      setDetachingPackId(null);
    }
  }

  async function handleDeleteTranscript() {
    if (transcript === null) {
      return;
    }

    setIsDeleting(true);
    setPageError(null);

    try {
      await deleteTranscript({ transcriptId: transcript._id });
      setDeleteDialogOpen(false);
      await navigate({ to: "/transcripts" });
    } catch (error) {
      setPageError(getErrorMessage(error, "Could not delete transcript."));
    } finally {
      setIsDeleting(false);
    }
  }

  if (isLoading) {
    return <LoadingCard body="Loading transcript detail..." title="Transcript" />;
  }

  if (normalizedTranscriptId === null || transcript === null) {
    return <NotFoundPlaceholder />;
  }

  return (
    <>
      <section className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-3xl font-semibold tracking-tight">
                {transcript.originalFilename}
              </h2>
              <Badge variant="secondary">{transcript.format}</Badge>
              <Badge variant={statusBadgeVariant(transcript.processingStatus)}>
                {formatTranscriptStatus(transcript.processingStatus)}
              </Badge>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Review transcript content, update metadata, and connect the
              transcript to draft persona packs.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button asChild type="button" variant="outline">
              <Link to="/transcripts">Back to transcripts</Link>
            </Button>
            {canManageTranscripts ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
              >
                Delete transcript
              </Button>
            ) : null}
          </div>
        </div>

        {pageNotice ? (
          <p className="text-sm text-emerald-700" role="status">
            {pageNotice}
          </p>
        ) : null}
        {pageError ? (
          <p className="text-sm text-destructive" role="alert">
            {pageError}
          </p>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Transcript content</CardTitle>
              </CardHeader>
              <CardContent>
                {isContentLoading ? (
                  <p className="text-sm text-muted-foreground">
                    Loading transcript content...
                  </p>
                ) : contentError ? (
                  <p className="text-sm text-destructive">{contentError}</p>
                ) : content?.format === "txt" ? (
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl border bg-muted/20 p-4 text-sm leading-6">
                    <HighlightedTranscriptText
                      highlightSnippet={highlightSnippet}
                      text={content.text}
                    />
                  </pre>
                ) : content?.format === "json" ? (
                  <div className="grid gap-3">
                    {content.turns.map((turn, index) => (
                      <div
                        key={`${turn.speaker}-${index}`}
                        className="rounded-xl border bg-background p-4"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{turn.speaker}</p>
                          {turn.timestamp !== undefined ? (
                            <Badge variant="outline">{turn.timestamp}s</Badge>
                          ) : null}
                        </div>
                        <div className="mt-2 text-sm leading-6 text-muted-foreground">
                          <HighlightedTranscriptText
                            highlightSnippet={highlightSnippet}
                            text={turn.text}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Content is not available yet.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {canManageTranscripts ? (
                  <form className="space-y-4" onSubmit={handleSaveMetadata}>
                    <div className="grid gap-2">
                      <Label htmlFor="transcript-participant-id">
                        Participant ID
                      </Label>
                      <Input
                        id="transcript-participant-id"
                        value={metadataForm.participantId}
                        onChange={(event) =>
                          setMetadataForm((current) => ({
                            ...current,
                            participantId: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="transcript-tags">Tags</Label>
                      <Input
                        id="transcript-tags"
                        placeholder="checkout, onboarding"
                        value={metadataForm.tags}
                        onChange={(event) =>
                          setMetadataForm((current) => ({
                            ...current,
                            tags: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <div className="grid gap-2">
                      <Label htmlFor="transcript-notes">Notes</Label>
                      <Textarea
                        id="transcript-notes"
                        value={metadataForm.notes}
                        onChange={(event) =>
                          setMetadataForm((current) => ({
                            ...current,
                            notes: event.target.value,
                          }))
                        }
                      />
                    </div>

                    <Button disabled={isSavingMetadata} type="submit">
                      {isSavingMetadata ? "Saving..." : "Save metadata"}
                    </Button>
                  </form>
                ) : (
                  <dl className="grid gap-4">
                    <SummaryValue
                      label="Participant ID"
                      value={transcript.metadata.participantId ?? "Not set"}
                    />
                    <SummaryValue
                      label="Tags"
                      value={
                        transcript.metadata.tags.length > 0
                          ? transcript.metadata.tags.join(", ")
                          : "No tags"
                      }
                    />
                    <SummaryValue
                      label="Notes"
                      value={transcript.metadata.notes ?? "No notes"}
                    />
                  </dl>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle>Linked Packs</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Review every persona pack this transcript is attached to and
                    open each pack detail view.
                  </p>
                </div>
                {canManageTranscripts ? (
                  <Button
                    disabled={attachablePacks.length === 0}
                    type="button"
                    variant="outline"
                    onClick={() => setIsAttachDialogOpen(true)}
                  >
                    Attach to pack
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {canManageTranscripts ? (
                  attachablePacks.length === 0 ? (
                    <p className="text-sm leading-6 text-muted-foreground">
                      No additional draft packs are available to attach right now.
                    </p>
                  ) : null
                ) : (
                  <p className="text-sm leading-6 text-muted-foreground">
                    Reviewers can view linked packs but cannot attach or detach
                    transcript relationships.
                  </p>
                )}

                {transcriptPacks?.length === 0 ? (
                  <div className="rounded-xl border border-dashed bg-background p-6">
                    <p className="text-sm leading-6 text-muted-foreground">
                      This transcript is not linked to any packs yet.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {(transcriptPacks ?? []).map((packTranscript) => (
                      <div
                        key={`${packTranscript.packId}`}
                        className="rounded-xl border bg-background p-4"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                className="font-medium text-primary underline-offset-4 hover:underline"
                                params={{ packId: packTranscript.pack._id }}
                                to="/persona-packs/$packId"
                              >
                                {packTranscript.pack.name}
                              </Link>
                              <PackStatusBadge status={packTranscript.pack.status} />
                            </div>
                            <p className="text-sm leading-6 text-muted-foreground">
                              {packTranscript.pack.context}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <Button asChild type="button" variant="outline">
                              <Link
                                params={{ packId: packTranscript.pack._id }}
                                to="/persona-packs/$packId"
                              >
                                Open pack
                              </Link>
                            </Button>
                            {canManageTranscripts
                            && packTranscript.pack.status === "draft" ? (
                              <Button
                                disabled={
                                  detachingPackId
                                  === String(packTranscript.packId)
                                }
                                type="button"
                                variant="outline"
                                onClick={() =>
                                  void handleDetachFromPack(
                                    packTranscript.packId,
                                  )
                                }
                              >
                                {detachingPackId === String(packTranscript.packId)
                                  ? "Detaching..."
                                  : "Detach"}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Transcript summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                <SummaryValue label="Character count" value={String(transcript.characterCount)} />
                <SummaryValue label="Created" value={formatTimestamp(transcript.createdAt)} />
                <SummaryValue label="Updated" value={formatTimestamp(transcript.updatedAt)} />
                {transcript.processingError ? (
                  <SummaryValue
                    label="Processing error"
                    value={transcript.processingError}
                  />
                ) : null}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <Dialog
        open={isAttachDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            resetAttachDialog();
            return;
          }

          setIsAttachDialogOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Attach to pack</DialogTitle>
            <DialogDescription>
              Select one or more draft packs from your organization to link with
              this transcript.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="transcript-attach-pack-search">
                Search draft packs
              </Label>
              <Input
                id="transcript-attach-pack-search"
                placeholder="Search by pack name, description, or context"
                value={packSearchText}
                onChange={(event) => setPackSearchText(event.target.value)}
              />
            </div>

            {attachablePacks.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 p-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  No draft packs are currently available to attach.
                </p>
              </div>
            ) : filteredAttachablePacks.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-muted/20 p-4">
                <p className="text-sm leading-6 text-muted-foreground">
                  No draft packs match the current search.
                </p>
              </div>
            ) : (
              <div className="max-h-[24rem] overflow-y-auto rounded-xl border">
                <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-4 border-b bg-muted/40 px-4 py-3 text-sm font-medium">
                  <span>Select</span>
                  <span>Pack</span>
                  <span>Status</span>
                </div>

                <div className="divide-y">
                  {filteredAttachablePacks.map((pack) => {
                    const isSelected = selectedPackIds.includes(String(pack._id));

                    return (
                      <label
                        key={pack._id}
                        className="grid cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] gap-4 px-4 py-3 text-sm"
                        htmlFor={`transcript-attach-pack-${pack._id}`}
                      >
                        <input
                          checked={isSelected}
                          className="mt-1 h-4 w-4 rounded border-input"
                          id={`transcript-attach-pack-${pack._id}`}
                          onChange={() => handlePackSelectionToggle(String(pack._id))}
                          type="checkbox"
                        />
                        <div className="space-y-1">
                          <p className="font-medium">{pack.name}</p>
                          <p className="text-muted-foreground">
                            {pack.context}
                          </p>
                        </div>
                        <div className="text-right">
                          <PackStatusBadge status={pack.status} />
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={resetAttachDialog}>
              Cancel
            </Button>
            <Button
              disabled={selectedPackIds.length === 0 || isAttaching}
              type="button"
              onClick={() => void handleAttachToPacks()}
            >
              {isAttaching ? "Attaching..." : "Attach selected packs"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete transcript?</DialogTitle>
            <DialogDescription>
              This permanently removes the transcript record, its uploaded file,
              and any draft-pack attachments.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="font-medium">{transcript.originalFilename}</p>
            <p className="text-sm text-muted-foreground">
              This action cannot be undone.
            </p>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={isDeleting}
              type="button"
              variant="destructive"
              onClick={() => void handleDeleteTranscript()}
            >
              {isDeleting ? "Deleting..." : "Confirm delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function LoadingCard({ body, title }: { body: string; title: string }) {
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

function HighlightedTranscriptText({
  highlightSnippet,
  text,
}: {
  highlightSnippet: string;
  text: string;
}) {
  const normalizedSnippet = highlightSnippet.trim();

  if (normalizedSnippet.length === 0) {
    return <>{text}</>;
  }

  const segments = highlightText(text, normalizedSnippet);

  return (
    <>
      {segments.map((segment, index) =>
        segment.isMatch ? (
          <mark
            key={`${segment.text}-${index}`}
            className="rounded bg-amber-200 px-0.5 text-foreground"
            data-highlighted-snippet="true"
          >
            {segment.text}
          </mark>
        ) : (
          <span key={`${segment.text}-${index}`}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function PackStatusBadge({ status }: { status: PersonaPackDoc["status"] }) {
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
    <div className="space-y-1">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="text-sm leading-6">{value}</p>
    </div>
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

function formatTimestamp(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
}

function parseTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  );
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
    filters.push(`tag “${selectedTag}”`);
  }

  if (selectedFormat.length > 0) {
    filters.push(`format “${selectedFormat}”`);
  }

  if (normalizedSearchText.length > 0) {
    filters.push(`search “${normalizedSearchText}”`);
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

function highlightText(text: string, highlightSnippet: string) {
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
